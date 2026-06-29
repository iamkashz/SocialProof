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
"The attacker's path" which can be 2-3 sentences). Use ONLY the values \
above — never invent numbers, breach names, usernames, or recommendations.

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
2-3 sentences in FIRST PERSON as if you are an attacker walking through \
what you'd do with this footprint. Reference specific facts from above — \
breach names, the user's handle, confirmed platforms, real name if known. \
Be concrete and unsettling but factual. Examples of tone (NOT to copy \
verbatim, just to calibrate):
"I already have your password from the LinkedIn dump. I'll try it on \
Twitch and PyPI under the handle iamkashz. Your real name and location \
are on your GitHub profile, so a targeted phishing email writes itself."
"I have your email in 3 paste-site dumps. Your handle wavewright is \
active on Twitch — I'll spear-phish from there."
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


class NarratorAgent(BaseAgent):
    """Generate the executive summary with a model fallback ladder."""

    async def _run_async_impl(
        self, ctx: InvocationContext
    ) -> AsyncGenerator[Event, None]:
        prompt = _build_prompt(dict(ctx.session.state))
        # Re-raises if every model fails — server converts that into a
        # `warning` frame so the user still gets the deterministic report.
        text = await generate_with_ladder(prompt, label="narrator")
        yield Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            content=types.Content(role="model", parts=[types.Part(text=text)]),
        )


narrator_agent = NarratorAgent(
    name="narrator_agent",
    description=(
        "Writes the 3-5 sentence executive summary. Uses a model fallback "
        "ladder so transient quota issues don't kill the user-facing report."
    ),
)
