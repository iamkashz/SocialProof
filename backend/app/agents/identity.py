"""Phase 2 — identity aggregator (deterministic, no LLM).

Reads recon outputs from session state, extracts every candidate username
(github logins, gravatar preferred_username, breach mentions, twitter
handles from the github profile, blog URLs that obviously contain a
username segment), normalizes them, and writes a deduplicated list to
state['candidate_usernames'].

Implemented as a BaseAgent subclass instead of an LlmAgent because:
  - The work is pure string manipulation — an LLM here is wasted tokens
    and a non-determinism risk (could hallucinate usernames).
  - Username candidates need consistent normalization so downstream eval
    cases are reproducible.
"""

from __future__ import annotations

import re
from collections.abc import AsyncGenerator, Iterable
from urllib.parse import urlparse

from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.genai import types

_USERNAME_RE = re.compile(r"[^a-zA-Z0-9_.\-]")
_BLOG_HOST_USERNAME = re.compile(
    r"^(?:www\.)?(?:github|gitlab|twitter|x|medium|dev\.to|twitch|reddit)\.com",
    re.IGNORECASE,
)


def _clean(candidate: str | None) -> str | None:
    if not candidate:
        return None
    cleaned = _USERNAME_RE.sub("", candidate).strip(".-_")
    # Drop anything implausibly short — false positive risk outweighs recall.
    if len(cleaned) < 3:
        return None
    return cleaned.lower()


def _from_blog_url(url: str | None) -> str | None:
    if not url:
        return None
    parsed = urlparse(url if "://" in url else f"https://{url}")
    if not _BLOG_HOST_USERNAME.match(parsed.netloc):
        return None
    parts = [p for p in parsed.path.split("/") if p]
    if not parts:
        return None
    handle = parts[0].lstrip("@")
    return _clean(handle)


def _candidates(state: dict) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []

    def add(*values: Iterable[str | None] | str | None) -> None:
        for v in values:
            if isinstance(v, (list, tuple, set)):
                for item in v:
                    add(item)
                continue
            cleaned = _clean(v)
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                out.append(cleaned)

    # Email local-part is a low-confidence but valuable lead. Many users
    # reuse it as their handle across platforms (e.g. jsmith@gmail.com →
    # jsmith on PyPI). Username enum will weed out the false positives.
    email = state.get("email") or ""
    if "@" in email:
        add(email.split("@", 1)[0])

    github = state.get("github_result") or {}
    add(*(github.get("usernames") or []))
    profile = github.get("profile") or {}
    add(profile.get("login"))
    add(profile.get("twitter_username"))
    add(_from_blog_url(profile.get("blog")))

    gravatar = state.get("gravatar_result") or {}
    add(gravatar.get("preferred_username"))
    add(gravatar.get("display_name"))
    for acct in gravatar.get("accounts") or []:
        add(_from_blog_url(acct.get("url")))

    return out


class IdentityAgent(BaseAgent):
    """Deterministically aggregate discovered usernames into session state.

    Merges the regex-extracted candidates with anything an upstream agent
    already wrote to `state['candidate_usernames']`. This matters when the
    LLM `handle_discovery_agent` adds names from prose fields between two
    IdentityAgent invocations — a plain replace would erase them.
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        state = ctx.session.state
        regex_candidates = _candidates(dict(state))
        previous: list[str] = list(state.get("candidate_usernames") or [])

        # Merge while preserving first-seen order; previous entries (including
        # anything injected by handle_discovery) win their original slot.
        seen: set[str] = set()
        candidates: list[str] = []
        for u in previous + regex_candidates:
            cleaned = _clean(u)
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                candidates.append(cleaned)

        already_enumerated: list[str] = list(state.get("enumerated_usernames") or [])
        fresh = [u for u in candidates if u not in already_enumerated]

        message = (
            f"Identity aggregator: {len(candidates)} candidate username(s) "
            f"({len(fresh)} new this round): {', '.join(fresh) or '—'}"
        )

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(role="model", parts=[types.Part(text=message)]),
            actions=EventActions(
                state_delta={
                    "candidate_usernames": candidates,
                    "fresh_usernames": fresh,
                }
            ),
        )


def make_identity_agent(name: str = "identity_agent") -> IdentityAgent:
    """Build a fresh IdentityAgent instance.

    ADK requires each agent to have exactly one parent in the tree, so we
    can't share a single instance between the root sequence and the inner
    pivot loop — both paths get their own.
    """
    return IdentityAgent(
        name=name,
        description=(
            "Collects candidate usernames from breach, GitHub, and Gravatar "
            "results. Writes state['candidate_usernames']."
        ),
    )
