"""Phase 4 — analyst agent.

Reads everything the recon + pivot phases collected from session state,
calls the deterministic correlate_risk scorer, and writes the result to
state['risk_assessment'].

Implemented as a BaseAgent (not an LlmAgent) for two reasons:
  1. The scoring inputs come from a known schema in state — there's nothing
     for an LLM to reason about.
  2. Eliminating LLM involvement here means the risk score is reproducible
     across runs, which the eval suite (TODO) will rely on.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import AsyncGenerator

from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.genai import types

from app.osint import correlate_risk

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slug(s: str | None) -> str:
    if not s:
        return ""
    return _SLUG_RE.sub("", s.lower())


def _count_unique_paste_hits(breaches: list[dict], hits: list[dict]) -> int:
    """Count paste hits that don't obviously overlap with a known breach.

    Both sources index the same dumps frequently — XposedOrNot lists the
    "Adobe" breach and IntelX has "adobe.com_users.zip" in its paste bucket.
    Double-counting these would inflate the risk score whenever a popular
    breach indexed both places.

    Matching is intentionally crude: slug each breach name (lowercased,
    alphanumeric only) and check substring containment against the slugged
    paste title. False negatives are fine (we conservatively under-dedup);
    false positives just lower the score, which is the safer direction
    when the two sources actually have the same data.
    """
    if not hits:
        return 0
    breach_slugs = [_slug(b.get("name")) for b in breaches if b.get("name")]
    breach_slugs = [s for s in breach_slugs if len(s) >= 4]
    unique = 0
    for hit in hits:
        title_slug = _slug(hit.get("title"))
        if any(bs in title_slug for bs in breach_slugs):
            continue
        unique += 1
    return unique


def _build_inputs(state: dict) -> dict:
    breach = state.get("breach_result") or {}
    github = state.get("github_result") or {}
    gravatar = state.get("gravatar_result") or {}
    paste = state.get("paste_result") or {}
    account_enum = state.get("account_enum_result") or {}
    pivot_profiles = state.get("pivot_profiles") or []
    enum_results = state.get("enum_results") or []
    candidates = state.get("candidate_usernames") or []

    profiles = []
    if github.get("profile"):
        profiles.append(github["profile"])
    profiles.extend(p.get("profile") for p in pivot_profiles if p.get("profile"))

    real_name_exposed = any(p.get("name") for p in profiles) or bool(
        gravatar.get("display_name")
    )
    location_exposed = any(p.get("location") for p in profiles) or bool(
        gravatar.get("location")
    )

    public_accounts_found = sum(
        sum(1 for plat in (r.get("platforms") or []) if plat.get("exists"))
        for r in enum_results
    )

    raw_paste_hits = paste.get("hit_count") or 0
    unique_paste_hits = _count_unique_paste_hits(
        breach.get("breaches") or [], paste.get("hits") or []
    )
    overlapping_paste_hits = raw_paste_hits - unique_paste_hits
    redacted_paste_hits = paste.get("redacted_hit_count") or 0

    account_registration_count = account_enum.get("found_count") or 0

    return {
        "summary": (
            f"{breach.get('breach_count', 0)} breaches; "
            f"{raw_paste_hits} paste/leak hit(s) ({unique_paste_hits} unique, "
            f"{overlapping_paste_hits} overlap with breach data); "
            f"{redacted_paste_hits} additional leak corpus hit(s); "
            f"{len(candidates)} candidate username(s); "
            f"{public_accounts_found} confirmed public account(s); "
            f"{account_registration_count} account registration(s) via "
            f"user-scanner; "
            f"{len(profiles)} GitHub profile(s) resolved."
        ),
        "breach_count": breach.get("breach_count", 0),
        "exposed_data_classes": list(breach.get("exposed_data_classes") or []),
        "public_accounts_found": public_accounts_found,
        "real_name_exposed": real_name_exposed,
        "location_exposed": location_exposed,
        "linked_usernames": list(candidates),
        # Score only the unique paste hits — overlap with breach data was
        # already counted in `breach_count`.
        "paste_hit_count": unique_paste_hits,
        # Redacted hits flow through as a separate signal (counts only,
        # content not visible — see correlate.py Category 2).
        "paste_hit_count_redacted": redacted_paste_hits,
        "account_registration_count": account_registration_count,
    }


class AnalystAgent(BaseAgent):
    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        state = ctx.session.state
        email = state.get("email") or ""
        inputs = _build_inputs(dict(state))

        call_id = f"correlate-{uuid.uuid4()}"
        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="model",
                parts=[
                    types.Part(
                        function_call=types.FunctionCall(
                            id=call_id,
                            name="correlate_risk",
                            args={"email": email, **inputs},
                        )
                    )
                ],
            ),
        )

        assessment = correlate_risk(email=email, **inputs)

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="user",
                parts=[
                    types.Part(
                        function_response=types.FunctionResponse(
                            id=call_id, name="correlate_risk", response=assessment
                        )
                    )
                ],
            ),
            actions=EventActions(state_delta={"risk_assessment": assessment}),
        )


analyst_agent = AnalystAgent(
    name="analyst_agent",
    description=(
        "Aggregates recon and pivot findings, then computes the deterministic "
        "risk score and prioritized remediations."
    ),
)
