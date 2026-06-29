# SocialProof

Capstone Project for 5-Day AI Agents: Intensive Vibe Coding Course With Google

A multi-agent OSINT scanner that shows you what attackers can already see
about your email address — and gives you a prioritized action list.

Built on Google's Agent Development Kit (ADK) and Gemini, with a TanStack
Start (React) frontend.

## Layout

```
SocialProof/
├── backend/        # Python ADK service (FastAPI + Gemini + OSINT tools)
└── frontend/       # React UI (Vite + TanStack Start)
```

Each side has its own README with detailed setup. The short version is
below; for the full step-by-step run guide see [`RUN.md`](./RUN.md).

## Quick start

You need:

- **Python ≥ 3.11** and [uv](https://docs.astral.sh/uv/getting-started/installation/)
- **Node.js ≥ 20** and `npm`
- A **Google AI Studio API key** ([get one](https://aistudio.google.com/apikey))
- A free **IntelligenceX API key** ([get one](https://intelx.io/account?tab=developer))

Set the backend keys in `backend/app/.env`:

```bash
GOOGLE_API_KEY=<your-gemini-key>
INTELX_API_KEY=<your-intelx-key>
```

Optional: add `GITHUB_TOKEN=<your-token>` to raise GitHub's commit-search
rate limit from 60/hr to 5000/hr.

**Terminal 1** — start the ADK backend on `:8080`:

```bash
cd backend
uv tool install google-agents-cli   # one-time
agents-cli install
uv run uvicorn app.server:app --reload --port 8080
```

**Terminal 2** — start the React UI on `:5173`:

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173> and run a scan.

## Architecture

```
React UI ──HTTP/SSE──▶ FastAPI ──▶ ADK Runner
                                     │
                                     ├─ seed_agent              (validate + normalize email)
                                     ├─ recon_phase   (parallel, 5 sources)
                                     │   ├─ breach_agent          → XposedOrNot
                                     │   ├─ github_email_agent    → GitHub commit search
                                     │   ├─ gravatar_agent        → Gravatar profile
                                     │   ├─ paste_agent           → IntelligenceX paste/leak/darknet
                                     │   └─ account_enum_agent    → user-scanner (~95 services)
                                     ├─ identity_agent             (aggregate candidate usernames)
                                     ├─ pivot_phase   (loop, max 2 iter)
                                     │   ├─ username_enum_agent   → user-scanner usernames (~95, parallel)
                                     │   ├─ profile_pivot_agent   → GitHub profile lookup (parallel)
                                     │   ├─ identity_agent         (re-aggregate)
                                     │   ├─ handle_discovery_agent → Gemini prose-mining (LLM)
                                     │   ├─ identity_agent         (re-aggregate)
                                     │   └─ pivot_guard            (exit when no fresh handles)
                                     ├─ analyst_agent              (deterministic risk score)
                                     └─ narrator_agent             (markdown executive summary, LLM)
```

Only the narrator and handle-discovery agents use Gemini. Everything else
is deterministic — the risk score is computed by Python code from
structured findings, so it's fully reproducible and the LLM can't
hallucinate it.

The account enumeration backend uses [user-scanner](https://github.com/kaifcodec/user-scanner)
(MIT, PyPI), which probes ~95 public services per scan via password-reset
/ signup-flow side channels — no API keys required.

## See also

- [`RUN.md`](./RUN.md) — step-by-step run guide and troubleshooting
- [`backend/README.md`](./backend/README.md) — backend setup, ADK details, deploy notes
- `/score` page in the running app — public-facing scoring breakdown
- `/about` and `/methodology` pages — what we do and don't do, agent graph
