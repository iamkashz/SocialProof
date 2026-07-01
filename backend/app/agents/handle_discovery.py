"""LLM-driven handle discovery inside the pivot loop.

Reads prose fields (breach descriptions, github commit messages, bios,
gravatar aboutMe) for usernames that the regex-based identity
aggregator can't catch — e.g. handles mentioned in a bio or commit
message body.

Safety rails:
  - Output is constrained to a JSON list; anything else is dropped.
  - Returned handles are sanitized (alphanumeric + `._-`, length 3-30)
    and matched against a tool-name blocklist to catch common false
    positives.
  - Capped at 3 handles per call so a hallucinating model can't flood
    the pivot loop.
  - Known candidates are excluded from the prompt so the model can
    only surface *new* handles.
  - Failure is non-fatal: an empty result is returned instead of
    raising, since discovery is bonus signal over the deterministic
    aggregator.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from collections.abc import AsyncGenerator

from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.genai import types

from ._llm_ladder import generate_with_ladder

logger = logging.getLogger(__name__)

_MAX_NEW = 3
_MIN_LEN = 3
_MAX_LEN = 30
_HANDLE_RE = re.compile(r"^[A-Za-z0-9._-]+$")


_PROMPT = """You are a handle-extraction assistant for an OSINT \
self-scan. The user is investigating their OWN digital footprint. Your \
job is to find usernames / handles / aliases that belong to THE SAME \
PERSON as the email and known handles below — and NOTHING ELSE.

INVESTIGATION TARGET
- Target email: {email}
- Known handles already confirmed to belong to the target: {known}

SNIPPETS — text from the target's own profiles and commits
{snippets}

YOUR TASK
For each snippet, decide whether it contains a handle that is BOTH:
  (a) NOT already in the known list, AND
  (b) Clearly belongs to the SAME PERSON as the target email/known handles.

A handle "clearly belongs to the same person" only when at least one of:
  - The snippet is FROM the target's own bio/aboutMe AND uses 1st-person \
language ("my X account is @foo", "also as @foo", "find me at foo").
  - The snippet is FROM a git commit AND the handle appears in a git \
co-author / signed-off-by line that names the same person.
  - The snippet is a profile field (twitter_username, linked account) \
that the target themselves filled in.

REJECT (do not include) anything that is:
  - A username belonging to a different person mentioned in the text \
(e.g. someone the target follows, retweets, contributes alongside).
  - A name of a tool, CLI, library, package, framework, brand, file \
extension, or version string (e.g. "acme-cli", "react", "v1.0", "npm").
  - A username from a breach description (those are threat actors or \
journalists, not the target).
  - Something that just LOOKS like a username but has no evidence \
linking it to this person.
  - Generic words like "admin", "user", "test", "main", "dev".
  - A repo, organization, or company name.

OUTPUT FORMAT
Return ONLY a JSON array of objects, each shaped:
  {{"handle": "<the bare handle>", "evidence": "<one short sentence \
quoting or paraphrasing why this handle belongs to the target>"}}

Constraints:
- Each handle: ASCII alphanumeric + dot/underscore/dash, length 3-30.
- No @ or # prefix. No quotes inside the handle.
- Maximum 3 entries.
- If you cannot find a handle that meets ALL the rules above with \
high confidence, return [] — empty is the correct answer when in doubt.

Output exactly one JSON array.
"""


def _build_snippets(state: dict) -> str:
    """Collect prose-bearing fields that PLAUSIBLY contain the target's
    own handles.

    Sources DELIBERATELY EXCLUDED:
      - Breach descriptions. These describe the breach event (often by
        XposedOrNot's editorial team or naming the threat actor). They
        almost never mention the target's own handles — handles in
        them belong to attackers/journalists. Past iterations of this
        agent surfaced threat-actor aliases as "the user's handle".
      - Pivoted GitHub profile bios. Those bios belong to OTHER people
        whose profiles we fetched during the pivot loop — by definition
        not the target.

    Sources kept:
      - The TARGET's GitHub profile bio (their own self-description).
      - The TARGET's GitHub commit messages (signed-off-by / co-authored
        lines may include the target's handle).
      - The TARGET's Gravatar aboutMe (their own self-description).
    """
    chunks: list[str] = []

    gh = state.get("github_result") or {}

    # Target's GitHub profile bio (self-authored).
    profile = gh.get("profile") or {}
    if profile.get("bio"):
        chunks.append(f"[target_github_bio] {profile['bio']}")

    # Target's GitHub commit messages. Limit message length so a huge
    # commit body can't blow the prompt.
    for c in gh.get("recent_commits") or []:
        msg = (c.get("message") or "").strip()
        if msg:
            chunks.append(f"[target_commit:{c.get('repo','?')}] {msg[:400]}")

    # Target's Gravatar aboutMe (self-authored).
    grav = state.get("gravatar_result") or {}
    if grav.get("about_me"):
        chunks.append(f"[target_gravatar_bio] {grav['about_me']}")

    # Cap the prompt size: 20 snippets is plenty even for chatty users.
    return "\n".join(chunks[:20]) or "(no prose fields available)"


# Words that look username-shaped but are almost certainly NOT a person's
# handle. If the model returns one of these, drop it regardless of the
# evidence it provided — the cost of including a false positive (pivot
# probes a wrong identity, identity_resolver lists it as a known handle)
# is higher than the cost of dropping a true positive.
_TOOL_BLOCKLIST = frozenset(
    {
        # CLIs / tools commonly mistaken for usernames
        "npm", "pip", "uv", "git", "make", "cargo", "yarn", "bun", "deno",
        "docker", "kubectl", "helm", "ansible", "terraform",
        # Common library / framework names
        "react", "vue", "angular", "svelte", "next", "remix", "nuxt",
        "express", "fastapi", "flask", "django", "rails", "spring",
        "numpy", "pandas", "scipy", "torch", "tensorflow", "keras",
        # Generic
        "admin", "user", "test", "main", "dev", "prod", "staging", "demo",
        "root", "guest", "public", "private", "default",
        "todo", "todos", "readme", "license", "config",
        # Common file/version tokens
        "v1.0", "v2.0", "latest", "stable", "beta", "alpha",
    }
)


def _looks_like_tool_context(handle: str, evidence: str) -> bool:
    """Heuristic: if the model's own evidence mentions tool/lib/CLI words
    next to the handle, treat it as a false positive.

    This is a backstop — when the prompt's rules are followed, this check
    should rarely fire. It only catches the case where the model
    confidently returns a handle but justifies it with text that exposes
    the false positive (e.g. evidence: "this is the CLI used in the
    commit").
    """
    if not evidence:
        return False
    lo = evidence.lower()
    bad_neighbors = (
        " cli ", " library ", " package ", " framework ", " tool ",
        " plugin ", " sdk ", " runtime ", " compiler ", " interpreter ",
        " repository ", " repo ", " brand ", " company ", " org ",
        " trade app ", " app ",
    )
    return any(n in f" {lo} " for n in bad_neighbors)


def _sanitize(raw: object, known: set[str]) -> list[str]:
    """Filter raw model output into a clean list of new handle strings.

    Accepts EITHER:
      - The new-shape list of objects: [{"handle": "...", "evidence": "..."}]
      - The legacy list of bare strings (in case a model ignores the new schema).
    """
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if isinstance(item, dict):
            handle = item.get("handle")
            evidence = item.get("evidence") or ""
            if not isinstance(handle, str):
                continue
        elif isinstance(item, str):
            handle = item
            evidence = ""
        else:
            continue

        candidate = handle.strip().lstrip("@#").rstrip(".,;:")
        if len(candidate) < _MIN_LEN or len(candidate) > _MAX_LEN:
            continue
        if not _HANDLE_RE.match(candidate):
            continue
        lower = candidate.lower()
        if lower in known or lower in seen:
            continue
        # Hard blocklist of tool/library/generic words.
        if lower in _TOOL_BLOCKLIST:
            logger.info("handle_discovery: dropping %r (blocklisted)", candidate)
            continue
        # Soft heuristic: evidence text outs itself as a false positive.
        if _looks_like_tool_context(candidate, evidence):
            logger.info(
                "handle_discovery: dropping %r (evidence reads as tool context: %r)",
                candidate,
                evidence[:80],
            )
            continue
        seen.add(lower)
        out.append(candidate)
        if len(out) >= _MAX_NEW:
            break
    return out


def _parse_json_array(text: str) -> object:
    """Forgiving JSON parser — models sometimes wrap in ```json fences."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # strip the first fence and any language tag
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to find the first [...] block
        m = re.search(r"\[[\s\S]*\]", cleaned)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return None


class HandleDiscoveryAgent(BaseAgent):
    """Mine prose fields for usernames the deterministic aggregator misses.

    Emits synthetic function_call/function_response events so the UI
    renders an agent card consistent with the rest of the pivot loop.
    """

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        state = dict(ctx.session.state)
        known = {u.lower() for u in (state.get("candidate_usernames") or [])}
        snippets = _build_snippets(state)
        call_id = f"discovery-{uuid.uuid4()}"

        # Skip the LLM call entirely if there's nothing to mine. The pivot
        # loop already runs identity_agent each iteration, so contributing
        # nothing here is fine.
        if snippets == "(no prose fields available)" or not snippets.strip():
            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="model",
                    parts=[
                        types.Part(
                            function_call=types.FunctionCall(
                                id=call_id,
                                name="handle_discovery",
                                args={"snippets": 0, "known_handles": len(known)},
                            )
                        )
                    ],
                ),
            )
            yield Event(
                invocation_id=ctx.invocation_id,
                author=self.name,
                content=types.Content(
                    role="user",
                    parts=[
                        types.Part(
                            function_response=types.FunctionResponse(
                                id=call_id,
                                name="handle_discovery",
                                response={
                                    "new_handles": [],
                                    "reason": "no prose fields to analyze",
                                },
                            )
                        )
                    ],
                ),
            )
            return

        prompt = _PROMPT.format(
            email=state.get("email") or "(unknown)",
            known=", ".join(sorted(known)) or "(none)",
            snippets=snippets,
        )

        # Emit the tool_call up front so the UI shows the card immediately.
        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="model",
                parts=[
                    types.Part(
                        function_call=types.FunctionCall(
                            id=call_id,
                            name="handle_discovery",
                            args={
                                "snippets": len(snippets.splitlines()),
                                "known_handles": len(known),
                            },
                        )
                    )
                ],
            ),
        )

        # Run the LLM. Failure here is non-fatal — we surface an empty
        # result so the pivot loop continues normally.
        new_handles: list[str] = []
        error: str | None = None
        try:
            text = await generate_with_ladder(
                prompt,
                label="handle_discovery",
                response_mime_type="application/json",
            )
            parsed = _parse_json_array(text)
            new_handles = _sanitize(parsed, known)
        except Exception as exc:
            logger.warning("handle_discovery: failed, continuing with empty result: %s", exc)
            error = str(exc)[:120]

        # Merge into candidate_usernames so the next identity / enum /
        # pivot iteration picks them up.
        candidates = list(state.get("candidate_usernames") or [])
        candidates.extend(h for h in new_handles if h.lower() not in known)

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(
                role="user",
                parts=[
                    types.Part(
                        function_response=types.FunctionResponse(
                            id=call_id,
                            name="handle_discovery",
                            response={
                                "new_handles": new_handles,
                                "known_handles": len(known),
                                "error": error,
                            },
                        )
                    )
                ],
            ),
            actions=EventActions(state_delta={"candidate_usernames": candidates}),
        )


handle_discovery_agent = HandleDiscoveryAgent(
    name="handle_discovery_agent",
    description=(
        "LLM-driven handle extraction from prose fields in recon outputs. "
        "Surfaces usernames the deterministic identity aggregator missed. "
        "Capped at 3 new handles per call; failures are non-fatal."
    ),
)
