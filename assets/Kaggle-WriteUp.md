> Submitted as Capstone Project for 5-Day AI Agents: Intensive Vibe Coding Course With Google (June 15–19, 2026)

![SocialProof Image](https://www.googleapis.com/download/storage/v1/b/kaggle-user-content/o/inbox%2F34071984%2F3f4186e8842ed0dbf8fdef8e1f988b72%2Fsocialproof-git.png?generation=1783192659628995&alt=media)

## Why SocialProof?

If someone knows your email address, they can already start attacking you. Public breaches, paste-site dumps, GitHub commit history, Gravatar profiles, and account-existence probes across hundreds of services will tell them — for free — which platforms you use, which passwords have leaked, what real name and location you've attached to public profiles, and which credentials are circulating in attacker communities.

Individual defenders have no equivalent tool. HaveIBeenPwned answers one narrow question. Manual OSINT takes a long time and assumes domain knowledge most users don't have. Data-broker-removal services are opaque and paid. Meanwhile the attacker's workflow is increasingly automated and cheap.

**SocialProof is the defender's version of that workflow.** Point it at an email you own. Get back — in about two minutes — a single risk score, an attacker-perspective walkthrough, and a prioritized action list. It shows you what an attacker sees, ranks it, and tells you what to do first.

## What a run looks like

The scanner produces four things, in this order:

1. **A single risk score** (0–100) with a severity band: Low, Moderate, High, or Critical.
2. **An executive summary** — a five-section markdown report an attacker could write about the target, referencing only findings the tool actually surfaced.
3. **A prioritized action list** — every recommendation tagged Critical / Important / Recommended / Hygiene.
4. **An audit trail** — every agent that ran, every finding it produced, expandable to raw JSON. Nothing is hidden; every claim in the report can be verified.

Everything above the audit trail is generated from a fixed schema in session state. "

## Architecture

Six specialized agents in a five-phase pipeline. Recon fans out. A bounded pivot loop chases newly-discovered handles. A deterministic scorer produces the number. An LLM narrator writes the summary — after which its output is validated.

![Methodology diagram](https://www.googleapis.com/download/storage/v1/b/kaggle-user-content/o/inbox%2F34071984%2Fb0c3d10f8654b391e5c342f88f931c87%2F3-methodology.png?generation=1783194171829424&alt=media)

**Only two agents call an LLM.** Everything else is deterministic Python.

Key design decisions the composition of ADK primitives forced:

- **Recon is deterministic, not LLM-driven.** All five recon agents are `BaseAgent` subclasses, not `LlmAgent`. An LLM here would be an expensive function dispatcher with no reasoning to do. To keep the UI's tool-timeline visualization coherent, each agent synthesizes `function_call` + `function_response` events into the ADK stream — same UX as an `LlmAgent`-driven tool call, no LLM cost.
- **The pivot loop is bounded.** `LoopAgent` with `max_iterations=2`. Inside, `pivot_guard` escalates (breaks the loop) when no fresh usernames were discovered in the previous iteration. Per-iteration fan-out is clamped by a `_MAX_PIVOTS_PER_ROUND` constant, so a hallucinating handle-discovery agent can't explode the work into hundreds of probes.
- **Parallelism where it matters.** The pivot loop's per-username probes use `asyncio.as_completed`, so the slowest single probe (not their sum) dominates wall-clock time. Take away `ParallelAgent` and total scan latency roughly doubles.
- **One LLM fallback ladder for two agents.** Both the narrator and the handle-discovery agent route through `generate_with_ladder()`, a small wrapper that walks a preferred → fallback list of Gemini models on 429 / 503 / UNAVAILABLE. Model changes happen in one place, neither agent has to know about quota state.


## The two hard design decisions

Two decisions do most of the heavy lifting on making the report trustworthy.

### 1. The score is a pure Python function

Language models drift between runs. They anchor on irrelevant context. They hallucinate. For a security report — where the number determines what action a user takes — that's disqualifying. So the score is not written by an LLM; it's computed.

Four sub-scores, each capped at 25, summing to 0–100:

| Category | Signals |
|---|---|
| **Credential Exposure** | Breach count (log-scaled, capped 15) + password bonus (+7) + data-class breadth (log, capped 8) |
| **Leak Presence** | Visible paste hits (log, capped 18) + counted redacted-corpus hits (log, capped 10) |
| **Identity Correlation** | Real name (+5) + location (+4) + interaction bonus when both (+4) + linked usernames (log, capped 12) |
| **Attack Surface** | Public accounts + service registrations, primary/secondary decomposition (capped 18 + 7) |

Logarithmic diminishing returns stop repeat signals from dominating. A **floor rule** forces at least Moderate (25) whenever a password was exposed — a leaked password is credential-stuffable immediately, regardless of how private the rest of the profile is. Reaching Critical (70+) requires exposure in more than one category, so no single dimension can dominate the top of the scale. Same input, same output — every run. Fully auditable.

![Score page with the four-category breakdown](https://www.googleapis.com/download/storage/v1/b/kaggle-user-content/o/inbox%2F34071984%2F691f1cbd999239a671f75cc244b1366d%2FScreenshot%202026-07-04%20at%202.27.33PM.png?generation=1783193271683994&alt=media)

### 2. The narrator's summary is validated section-by-section

The one place an LLM does speak to the user is the executive summary — and it's the place where a hallucination costs the most credibility. Invent a username or a real name in that summary and the whole report loses trust.

The defense doesn't trust the system prompt. Instead, output is validated *after* generation. The five-section markdown summary gets split on `**Header:**` markers, each section is checked against an allowed-tokens set built from the actual scan state, and any section that references a handle, name, or service not present in state is **dropped silently**. Surviving sections are joined and shipped. If every section fails, the server emits a `warning` frame and the deterministic report renders on its own — the scan is never fully broken by an LLM failure.

Three classes of failure the validator catches:

1. **Hard-denied placeholder tokens** (`user123`, `<PLACEHOLDER>`, `<ACTUAL_HANDLE>`) — regex denylist.
2. **Backtick-quoted handles absent from state** — the narrator writes `` `mysteryhandle` `` but no `mysteryhandle` exists in the scan's discovered accounts.
3. **Common confabulated first names absent from state** — Jane, John, Alex, etc. If the narrator invents a first name and there's no real name in state, that section fails.

Between these two decisions, the number is reproducible and the summary can never leak invented information. That's the reliability contract offered to the user.


## Evaluation — 25 automated fixtures

Two pytest suites in `backend/tests/eval/`:

| Suite | Cases | What it proves |
|---|---|---|
| Scoring reproducibility | 15 | `correlate_risk` matches expected score + severity across every band, category cap, and the floor rule |
| Narrator output guardrail | 10 | `_filter_narrator_output` catches placeholder tokens, backtick-quoted invented handles, and confabulated first names — while letting legitimate output through |

Runs in ~1.7 seconds. Catches regressions in the two pieces of the system that can't afford to drift. When the scoring formula was retuned from v1 to v2 mid-project, the eval suite immediately surfaced which fixture rows shifted — instant confidence that only the intended cases moved.

Example catch: the placeholder-token regex was initially written as `\b<[A-Z_]+>\b`. Word-boundary anchors don't fire adjacent to `<`, so the pattern silently missed tokens embedded in text. The eval fixture `hallucinated_leaked_placeholder_syntax` failed on first run, and the bug never shipped.

![terminal running `uv run pytest tests/eval/` showing 25 passed in 1.7s](https://www.googleapis.com/download/storage/v1/b/kaggle-user-content/o/inbox%2F34071984%2F25ae1b6c1a28147cd96bb384619d3b49%2F5-eval-terminal.png?generation=1783193338703290&alt=media)

## Security & privacy

The tool works on public data, but the app itself is still a defensive surface:

- **Double-layer input validation.** Email is validated at the HTTP boundary *and* again in the seed agent. Allowlist regex, length cap, control-char rejection — explicitly catches `\nignore previous`–style patterns embedded in the email field.
- **Rate limiting.** `POST /api/scan` is limited to 5/min and 30/hour per IP via slowapi. Protects the free-tier API budgets that back the OSINT sources.
- **Security response headers.** `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` disabling camera / mic / geolocation.
- **Email out of URLs.** Scan URLs contain only an opaque session id. The email is held in tab-scoped `sessionStorage` so it doesn't leak via `Referer` headers, browser history, or shared screenshots.
- **IntelligenceX metadata only.** Records are listed but never downloaded, even when the endpoint would allow it.

## Limitations

- Fresh scan latency is ~2 minutes (user-scanner probes 100+ services on both email and username sides).
- No user authentication or scan-history persistence — each session is standalone by design.
- The score is a *measure of exposure*, not a *prediction of attack*. A 60/100 who has already rotated passwords faces less real risk than the number implies.

## Future scope

- **Expose SocialProof as an MCP server** so any MCP-aware client (Claude Desktop, Cursor, another agent) can call the scanner as a single capability.
- **Scheduled rescans + email alerts** — opt in to rescan saved emails on a schedule and notify the user when the risk profile changes.
- **Per-finding confidence levels** — high / medium / low flags on each agent result (e.g. HackerNews handle matches get low confidence due to handle collision rates, breach hits get high confidence).
- **Custom domain reputation** for business emails: WHOIS / RDAP age, MX records, SPF/DMARC posture, disposable-domain detection.
- **Paid-tier integrations**: HIBP Pro, EmailRep.io.

## Try it yourself

**Stack**: Python 3.11 + Google ADK + Gemini on the backend; FastAPI + SSE for streaming; React 19 + TanStack Start + Tailwind on the frontend. Data sources: XposedOrNot, IntelligenceX free tier, GitHub REST, Gravatar, [user-scanner](https://github.com/kaifcodec/user-scanner) (MIT, PyPI). MIT licensed end-to-end.

**Setup**: two-terminal local run. Backend on `:8080` (`uv run uvicorn app.server:app --reload --port 8080`), frontend on `:5173` (`npm run dev`). Requires a free Gemini API key and a free IntelligenceX API key. Full instructions in [`README.md`](https://github.com/iamkashz/SocialProof/blob/main/README.md) and [`RUN.md`](https://github.com/iamkashz/SocialProof/blob/main/RUN.md).

**Repository**: <https://github.com/iamkashz/SocialProof>

---

Built by Kashif Memon.