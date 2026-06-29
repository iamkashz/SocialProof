"""Top-level SocialProof orchestrator.

The root is a SequentialAgent that runs five phases in order. The user's
email is captured into session state up-front via a BaseAgent seed step so
every downstream agent reads it from a single canonical location.
"""

from __future__ import annotations

import re
from collections.abc import AsyncGenerator

from google.adk.agents import SequentialAgent
from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.genai import types

from .analyst import analyst_agent
from .identity import make_identity_agent
from .narrator import narrator_agent
from .pivot import pivot_phase
from .recon import recon_phase

# Email validation: defense-in-depth at the input boundary.
#
# 1. Length cap matches RFC 5321 (max 254 chars including @ and TLD).
# 2. Character allowlist on the local part: ASCII alphanumerics, dot, dash,
#    underscore, plus. Rejects quoted local parts (`"weird name"@x.com`),
#    Unicode homoglyphs, control characters, and shell metacharacters
#    (`;'"&|<>()[]{}*?$\\` and friends) in one shot.
# 3. Domain part: similar allowlist plus at least one dot.
#
# Note on injection risk: the email never reaches a shell command, raw SQL,
# or unescaped HTML. It's passed to httpx (which URL-encodes), to JSON
# bodies for the model (encoded by json.dumps), and hashed before touching
# the filesystem. So this layer is a belt over the existing suspenders —
# closes the door before the downstream encoders ever see funny input.
_EMAIL_MAX_LEN = 254
_EMAIL_RE = re.compile(
    r"^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$"
)

# Helpful rejection messages — vague to the user, specific in logs.
_REJECTION_MESSAGE = (
    "I need a single, plain email address to investigate. "
    "Please send just the address (e.g. user@example.com) — "
    "no quotes, no other text, no special characters."
)


def _validate_email(raw: str) -> str | None:
    """Return the normalized email if valid, else None.

    Whitespace stripped, then the entire address is lowercased.

    RFC 5321 technically allows case-sensitive local parts, but every
    provider this tool queries (Gmail, GitHub, IntelX, XposedOrNot,
    Gravatar) treats addresses as case-insensitive. Lowercasing here means
    `User@Gmail.com` and `user@gmail.com` map to the same scan — same
    cache key, same external API calls — so a stray capital letter never
    burns a fresh round of tokens + HTTP traffic.

    On any failure return None — the caller emits the rejection event.
    """
    if not raw:
        return None
    candidate = raw.strip()
    if len(candidate) == 0 or len(candidate) > _EMAIL_MAX_LEN:
        return None
    # Reject any embedded control or whitespace chars (newlines hiding a
    # second line, tabs, NULs, etc.). Catches `foo@bar.com\nignore previous`.
    if any(ord(c) < 0x20 or ord(c) == 0x7f for c in candidate):
        return None
    # Reject anything outside printable ASCII at the boundary; allowlist
    # in the regex below would catch this too, but failing fast is
    # cheaper than backtracking the full regex.
    if not candidate.isascii():
        return None
    if "@" not in candidate:
        return None
    # Lowercase the entire address (see docstring). Email comparison
    # downstream is case-insensitive for every API we hit.
    normalized = candidate.lower()
    if not _EMAIL_RE.match(normalized):
        return None
    return normalized


class SeedAgent(BaseAgent):
    """Validate the email input and seed state['email']."""

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        content = ctx.user_content
        text = ""
        if content and content.parts:
            text = "".join(p.text or "" for p in content.parts).strip()

        normalized = _validate_email(text)
        if normalized is None:
            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[types.Part(text=_REJECTION_MESSAGE)],
                ),
                actions=EventActions(escalate=True),
            )
            return

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="model",
                parts=[types.Part(text=f"Investigating {normalized} …")],
            ),
            actions=EventActions(state_delta={"email": normalized}),
        )


seed_agent = SeedAgent(
    name="seed_agent",
    description="Validates the email input and seeds state['email'].",
)


root_agent = SequentialAgent(
    name="socialproof_root",
    description=(
        "SocialProof OSINT investigator. Runs recon (parallel), identity "
        "aggregation, a bounded username pivot loop, deterministic risk "
        "scoring, and an executive narrator."
    ),
    sub_agents=[
        seed_agent,
        recon_phase,
        make_identity_agent(name="post_recon_identity_agent"),
        pivot_phase,
        analyst_agent,
        narrator_agent,
    ],
)
