"""Phase 5 — narrator agent.

Generates a 3-5 sentence markdown executive summary from the deterministic
state already in the session.

Engineering decisions:

1. Implemented as a BaseAgent that calls the genai client directly rather
   than an LlmAgent. This is the only place the project uses an LLM, and
   the work is purely text generation from fully-formed structured data —
   we don't need ADK's tool-calling machinery here, and bypassing it lets
   us implement a model fallback ladder cleanly.

2. **Model fallback ladder.** Gemini's free tier has per-model daily quota.
   When 2.5-flash returns 429, 2.5-flash-lite typically still has budget.
   We try each model in order on 429/503 and surface the first success.
   This protects against the most common transient failure modes without
   any upstream changes.

3. The prompt forbids inventing data. Tone is enforced via instruction. The
   risk score the UI renders comes from the deterministic correlate_risk
   step — even if this agent fails entirely, the user-facing report is
   still complete (the server emits a `warning` frame in that case).
"""

from __future__ import annotations

import logging
import re
from collections.abc import AsyncGenerator

from google.adk.agents.base_agent import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.genai import types

from ._llm_ladder import generate_with_ladder

logger = logging.getLogger(__name__)


_PROMPT = """You are the SocialProof narrator. The user just scanned their \
own email and wants a brief, professional read on what was found.

Investigation results (already final — do NOT recompute):
- Email: {email}
- Risk score: {risk_score}/100 ({severity})
- Breach count: {breach_count}
- Top exposed data classes (in order of sensitivity): {data_classes}
- Top breach names: {top_breach_names}
- Paste-site / leak / darknet appearances (unique, after dedup): {paste_hit_count}
- Account registrations across public services (via user-scanner): {account_registration_count}
- Top services where this email is registered: {top_account_services}
- Candidate usernames discovered: {usernames}
- Confirmed public accounts: {confirmed_accounts}
- Confirmed platform names: {confirmed_platform_names}
- GitHub profile real name: {github_real_name}
- GitHub profile location: {github_location}
- Top recommendation: {top_recommendation}
- Has anything to narrate (for attacker walkthrough): {has_attack_material}

Write the executive summary in markdown using EXACTLY the section headers \
below, in this order. Each section is one sentence, two at most (except \
"The attacker's path" which can be 2-3 sentences).

CRITICAL DATA-FIDELITY RULES — read carefully, these are not optional:
  1. Use ONLY the values listed above. Never invent numbers, breach \
names, usernames, real names, locations, services, or recommendations.
  2. If a field reads "None", "(none)", "False", or "0": treat that as \
"the user has no such data" and DO NOT mention it. Do not substitute a \
placeholder, do not infer one, do not include a hypothetical.
  3. Usernames you may reference: ONLY those in "Candidate usernames \
discovered" and "Confirmed platform names". Any other handle is \
hallucinated — do not include it.
  4. Real name: reference it ONLY if "GitHub profile real name" is a \
specific non-null value above. Do not invent a first name to make a \
sentence sound personal.
  5. Service / platform names: reference ONLY those in "Top breach \
names", "Top services where this email is registered", or "Confirmed \
platform names". Do not name a service that isn't in those lists.

A response that mentions a name, handle, or service NOT present in the \
fields above will be discarded and the user will see no summary. Stick \
to the data.

ALWAYS include these two sections:

**Risk:** The risk score and severity, plus the single biggest driver \
(breaches, paste hits, public identity exposure, etc.).

**Do this first:** What the top recommendation is and why it matters.

CONDITIONALLY include each of these — ONLY if the underlying count or \
value is non-empty. SKIP the entire section if its data is zero, "(none)", \
"None", or False:

**Breaches:** ONLY if Breach count > 0. State the count and name the top \
exposed data classes. Do NOT include if breach count is 0.

**Paste / leak appearances:** ONLY if "Paste-site appearances" > 0. State \
the count and that they were found via IntelligenceX. Do NOT include if 0.

**Account footprint:** ONLY if "Account registrations" >= 5. State the \
count of services where this email is registered and name 2-3 of the \
top services as concrete examples. Frame it as attack surface — more \
registrations means more phishing pretexts and more places one breach \
can hurt. Do NOT include if registrations < 5.

**Public identity:** ONLY if any of these is true — Confirmed public \
accounts > 0, GitHub real name is not None, GitHub location is not None, \
OR Candidate usernames is not "(none)". State which platforms were \
confirmed and whether a real name or location was found. Do NOT include \
if everything is empty.

**The attacker's path:** ONLY if "Has anything to narrate" is True. Write \
2-3 sentences in THIRD PERSON describing what an attacker could do with \
this footprint. Use phrases like "An attacker could…" or "An attacker \
would…" — never "I" or "your". Reference SPECIFIC FACTS from the data \
above ONLY — actual breach names from "Top breach names", actual handles \
from "Candidate usernames discovered", actual platforms from "Confirmed \
platform names", actual real name only if "GitHub profile real name" is \
non-null.

Tone guidance (DO NOT copy these sentences — they use <PLACEHOLDER> tokens, \
not real data; reading a placeholder verbatim is a fidelity violation):
"An attacker holding the password from the <ACTUAL_BREACH_NAME> dump \
could try it against <ACTUAL_CONFIRMED_PLATFORM> under the handle \
<ACTUAL_USERNAME_FROM_LIST>, and the public profile data would write \
a targeted phishing email for them."
"With the email appearing in <ACTUAL_PASTE_COUNT> paste-site dumps and \
the handle <ACTUAL_USERNAME_FROM_LIST> active on \
<ACTUAL_CONFIRMED_PLATFORM>, an attacker could pivot from leaked \
credentials to a credible spear-phishing pretext."

When you write the section, every <PLACEHOLDER> must be substituted with \
a real value from the data above. Do not include placeholders or any \
made-up values in your output.

Do NOT include this section if there are zero breaches AND zero paste \
hits AND zero confirmed accounts.

Format rules:
- Each section header MUST be the bolded label exactly as shown, followed \
by a colon and a space.
- Section bodies are flowing prose — no nested bullet lists.
- Separate sections with one blank line.
- No emoji, no marketing language, no "your digital footprint" filler.
- Maximum ~200 words total across all sections combined.
"""


def _build_prompt(state: dict) -> str:
    risk = state.get("risk_assessment") or {}
    breach = state.get("breach_result") or {}
    paste = state.get("paste_result") or {}
    account_enum = state.get("account_enum_result") or {}
    github_profile = (state.get("github_result") or {}).get("profile") or {}
    candidates = state.get("candidate_usernames") or []
    enum_results = state.get("enum_results") or []

    # Confirmed platform names, flattened across all per-username enum runs.
    # Used to give the attacker walkthrough concrete things to pivot to.
    confirmed_platforms: list[str] = []
    for r in enum_results:
        for plat in r.get("platforms") or []:
            if plat.get("exists"):
                confirmed_platforms.append(plat.get("platform", ""))
    # Dedup while preserving order of first appearance.
    seen: set[str] = set()
    confirmed_platforms = [
        p for p in confirmed_platforms if p and not (p in seen or seen.add(p))
    ]
    confirmed = len(confirmed_platforms)

    top_breach_names = [b.get("name") for b in (breach.get("breaches") or [])[:3]]
    top_breach_names = [n for n in top_breach_names if n]

    remediations = risk.get("remediations") or []
    top = remediations[0]["title"] if remediations else "(none)"
    data_classes = (breach.get("exposed_data_classes") or [])[:5]
    # Use risk_assessment's deduped paste count — that's what drove the score.
    deduped_paste_hits = risk.get("paste_hit_count") or paste.get("hit_count", 0)

    # user-scanner account registrations — surface count plus top few
    # service names so the narrator has concrete pretext material for
    # the attacker walkthrough.
    account_count = account_enum.get("found_count") or 0
    top_account_services = [
        a.get("site_name")
        for a in (account_enum.get("accounts") or [])[:5]
        if a.get("site_name")
    ]

    has_attack_material = (
        breach.get("breach_count", 0) > 0
        or deduped_paste_hits > 0
        or confirmed > 0
        or account_count >= 5
    )
    return _PROMPT.format(
        email=state.get("email") or "",
        risk_score=risk.get("risk_score", "?"),
        severity=risk.get("severity", "?"),
        breach_count=breach.get("breach_count", 0),
        data_classes=", ".join(data_classes) or "(none)",
        top_breach_names=", ".join(top_breach_names) or "(none)",
        paste_hit_count=deduped_paste_hits,
        account_registration_count=account_count,
        top_account_services=", ".join(top_account_services) or "(none)",
        usernames=", ".join(candidates) or "(none)",
        confirmed_accounts=confirmed,
        confirmed_platform_names=", ".join(confirmed_platforms) or "(none)",
        github_real_name=github_profile.get("name") or "None",
        github_location=github_profile.get("location") or "None",
        top_recommendation=top,
        has_attack_material=has_attack_material,
    )


# Tokens we expect to find in legitimate narrator output even when they
# don't appear in state. These are common English words or domain terms
# the LLM uses to compose prose — flagging them as hallucinations would
# fire on every clean response.
_ALLOWED_PROSE_WORDS = frozenset(
    {
        # Section headers + common nouns
        "Risk", "Breaches", "Paste", "Leak", "Account", "Public", "Identity",
        "Footprint", "Critical", "High", "Moderate", "Low", "GitHub", "GitLab",
        "Twitter", "LinkedIn", "Facebook", "Reddit", "Discord", "Instagram",
        "Email", "Username", "Password", "Phone", "Name", "Address",
        # Frequently-used prose verbs/adjectives at sentence starts
        "Your", "Their", "This", "These", "Those", "Since", "Knowing",
        "Even", "Both", "With", "Without", "Including", "Across",
        # Common breach-data class names (already capitalized in source)
        "Passwords", "Names", "Usernames", "Phones", "Geographic", "Locations",
        "Dates", "IP", "IDs", "Gender", "Genders",
        # Tooling / phrases mentioned by the prompt itself
        "IntelligenceX", "Gemini", "SocialProof", "OSINT",
        # Pronouns / model-of-attacker references
        "I", "My", "We", "They", "He", "She",
    }
)

# Tokens that look like discord-style or generic handle placeholders.
# An LLM emitting any of these is hallucinating handle-shaped values.
_HALLUCINATED_HANDLE_PATTERNS = (
    re.compile(r"\buser[_-]?\d+\b", re.IGNORECASE),
    re.compile(r"\buser[_-]?(alpha|beta|gamma|x|y|z)\b", re.IGNORECASE),
    re.compile(r"\b<[A-Z_]+>\b"),  # leaked <PLACEHOLDER> tokens from the prompt
)

# Common first names the LLM tends to confabulate. Not exhaustive — the
# real defense is "names not present in state are rejected", but having
# a denylist catches the most common offenders even when they slip
# past the state-membership check on prose-like sentences.
_COMMON_CONFABULATED_NAMES = frozenset(
    {
        "jane", "john", "alex", "alice", "bob", "carol", "david", "emily",
        "sarah", "mike", "michael", "chris", "jennifer", "robert", "linda",
    }
)


def _build_allowed_token_set(state: dict) -> set[str]:
    """Collect every concrete identifier the narrator is allowed to use.

    Anything outside this set that's handle-shaped or name-shaped is
    treated as hallucinated and triggers rejection.
    """
    allowed: set[str] = set()

    # Candidate + confirmed usernames.
    for u in state.get("candidate_usernames") or []:
        if u:
            allowed.add(u.lower())

    for r in state.get("enum_results") or []:
        for plat in r.get("platforms") or []:
            if plat.get("exists"):
                if name := plat.get("platform"):
                    allowed.add(name.lower())
                if name := plat.get("username"):
                    allowed.add(name.lower())

    # Account-enum service names.
    for a in (state.get("account_enum_result") or {}).get("accounts") or []:
        if name := a.get("site_name"):
            allowed.add(name.lower())

    # Breach names + exposed data classes.
    breach = state.get("breach_result") or {}
    for b in breach.get("breaches") or []:
        if name := b.get("name"):
            allowed.add(name.lower())
    for c in breach.get("exposed_data_classes") or []:
        allowed.add(c.lower())

    # GitHub profile fields (real name + location).
    gh_profile = (state.get("github_result") or {}).get("profile") or {}
    if gh_profile.get("name"):
        for word in str(gh_profile["name"]).split():
            allowed.add(word.lower())
    if gh_profile.get("location"):
        for word in str(gh_profile["location"]).split():
            allowed.add(word.lower())

    # Gravatar fields.
    grav = state.get("gravatar_result") or {}
    if grav.get("display_name"):
        for word in str(grav["display_name"]).split():
            allowed.add(word.lower())
    if grav.get("location"):
        for word in str(grav["location"]).split():
            allowed.add(word.lower())

    # Pivoted GitHub profiles (other identities discovered during pivot).
    for p in state.get("pivot_profiles") or []:
        prof = p.get("profile") or {}
        if name := prof.get("login"):
            allowed.add(name.lower())
        if name := prof.get("name"):
            for word in str(name).split():
                allowed.add(word.lower())

    return allowed


def _validate_section(text: str, allowed: set[str]) -> str | None:
    """Return rejection reason if `text` contains hallucinated tokens.

    Three-layer check:
      1. Hard denylist of placeholder patterns and obvious confabulations.
      2. Backtick-quoted handles that aren't in the allowed set.
      3. Capitalized first-name-shaped tokens from a common-confabulation
         denylist when they aren't in the allowed set.

    Returns None if the section is clean.
    """
    for pat in _HALLUCINATED_HANDLE_PATTERNS:
        if m := pat.search(text):
            return f"hallucinated placeholder token: {m.group(0)!r}"

    for m in re.finditer(r"`([a-zA-Z][\w.\-]{2,29})`", text):
        token = m.group(1).lower()
        if token not in allowed:
            return f"hallucinated handle in backticks: {m.group(0)!r}"

    for m in re.finditer(r"\b([A-Z][a-z]{2,15})\b", text):
        word = m.group(1).lower()
        if word in _COMMON_CONFABULATED_NAMES and word not in allowed:
            return f"hallucinated proper name: {m.group(1)!r}"

    return None


# Section header pattern from the prompt. Each section starts with a
# bolded label (`**Risk:**`, `**Breaches:**`, etc.) followed by prose.
# We split on these to validate per-section so one bad section doesn't
# kill the whole summary.
_SECTION_SPLIT_RE = re.compile(r"(?=^\*\*[A-Za-z][A-Za-z'\- /]{2,40}:\*\*)", re.MULTILINE)


def _filter_narrator_output(text: str, state: dict) -> tuple[str, list[str]]:
    """Split the narrator's text into sections, validate each, drop the
    bad ones, return (salvaged_text, [list of rejection reasons]).

    Salvage strategy:
      - If the whole text has no section headers, treat it as one block
        and validate the whole thing.
      - Otherwise validate each section independently. Clean sections
        survive; sections that trip the validator are dropped silently.
      - If at least one clean section survives, return the joined text.
      - If every section is bad, return ("", [reasons]) and the caller
        will raise so the warning frame fires.
    """
    allowed = _build_allowed_token_set(state)

    # Split into chunks. The lookahead-based split keeps the **Header:**
    # marker attached to the section that owns it. The first chunk is
    # any preamble (usually empty/whitespace).
    chunks = _SECTION_SPLIT_RE.split(text.strip())
    chunks = [c.strip() for c in chunks if c and c.strip()]

    # No section headers found — fall back to whole-text validation.
    if not chunks or not any(c.startswith("**") for c in chunks):
        rejection = _validate_section(text, allowed)
        if rejection is not None:
            return "", [rejection]
        return text, []

    kept: list[str] = []
    rejections: list[str] = []
    for chunk in chunks:
        if not chunk.startswith("**"):
            # Preamble or trailing prose without a header — keep if clean.
            r = _validate_section(chunk, allowed)
            if r is None:
                kept.append(chunk)
            else:
                rejections.append(f"(preamble) {r}")
            continue
        r = _validate_section(chunk, allowed)
        if r is None:
            kept.append(chunk)
        else:
            # Identify the offending section by its header for the log.
            header = chunk.split(":**", 1)[0] + ":**"
            rejections.append(f"{header} {r}")

    return "\n\n".join(kept), rejections


class NarratorAgent(BaseAgent):
    """Generate the executive summary with a model fallback ladder."""

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        state = dict(ctx.session.state)
        prompt = _build_prompt(state)
        # Re-raises if every model fails — server converts that into a
        # `warning` frame so the user still gets the deterministic report.
        text = await generate_with_ladder(prompt, label="narrator")

        # Output guardrail. Each section validated independently so a
        # single bad section (most often the attacker's path, which is
        # the most creative and hallucination-prone) gets dropped
        # silently rather than tanking the whole summary. If everything
        # tripped the validator, raise — server emits the warning frame
        # and the deterministic report still renders.
        salvaged, rejections = _filter_narrator_output(text, state)
        for r in rejections:
            logger.warning("narrator: dropped section (%s)", r)
        if not salvaged:
            raise RuntimeError(
                f"narrator output failed validation: {rejections or 'empty'}"
            )

        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(role="model", parts=[types.Part(text=salvaged)]),
        )


narrator_agent = NarratorAgent(
    name="narrator_agent",
    description=(
        "Writes the 3-5 sentence executive summary. Uses a model fallback "
        "ladder so transient quota issues don't kill the user-facing report."
    ),
)
