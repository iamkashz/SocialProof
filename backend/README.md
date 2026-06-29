# SocialProof — Backend

Python ADK service for SocialProof, a multi-agent OSINT scanner built on
Google's Agent Development Kit (ADK) and Gemini.

The user submits an email address; six specialized agents fan out through
breach analytics, GitHub commit history, Gravatar profiles, paste-site /
leak archives, and username enumeration across seven public platforms,
then a deterministic risk scorer produces a 0-100 score with prioritized
recommendations.

The React UI in [`../frontend`](../frontend) talks to this service over SSE.

## Project structure

```
backend/
├── app/
│   ├── agent.py                # Root ADK Agent + Gemini model + tool registration
│   ├── server.py               # FastAPI app exposing POST /api/scan (SSE stream)
│   ├── cache.py                # Daily file-cache (recent-scans/) — saves API quota
│   ├── fast_api_app.py         # Scaffolded ADK web app (uses Cloud Logging — for deploy)
│   ├── agents/                 # Orchestration tree
│   │   ├── root.py             # SequentialAgent → recon → identity → pivot → analyst → narrator
│   │   ├── recon.py            # ParallelAgent: breach + github + gravatar + paste
│   │   ├── paste.py            # IntelligenceX paste/leak/darknet
│   │   ├── identity.py         # Aggregate candidate usernames from recon
│   │   ├── pivot.py            # LoopAgent: username_enum + profile pivot, bounded
│   │   ├── analyst.py          # Deterministic risk scoring (no LLM)
│   │   └── narrator.py         # 5-section markdown summary with attacker walkthrough
│   ├── osint/                  # Source-specific lookups
│   │   ├── breaches.py         # XposedOrNot breach-analytics
│   │   ├── github.py           # GitHub commit search + user profile
│   │   ├── gravatar.py         # Gravatar profile JSON
│   │   ├── intelx.py           # IntelligenceX paste-site search (metadata only)
│   │   ├── username.py         # 7-platform enumeration (async, per-platform predicates)
│   │   └── correlate.py        # Deterministic risk score + recommendations
│   └── app_utils/              # Telemetry + typing helpers (deploy only)
├── scripts/smoke_test.py       # End-to-end SSE smoke test
└── tests/                      # Unit, integration, load tests (scaffolded)
```

## Requirements

- **Python ≥ 3.11**
- **uv** — package manager: <https://docs.astral.sh/uv/getting-started/installation/>
- **agents-cli** — `uv tool install google-agents-cli`
- **Google AI Studio API key** — <https://aistudio.google.com/apikey>
- **IntelligenceX API key** — <https://intelx.io/account?tab=developer> (free tier OK)

Set the keys in `app/.env`:

```bash
GOOGLE_API_KEY=<your-gemini-key>
INTELX_API_KEY=<your-intelx-key>
```

Optional: `GITHUB_TOKEN` in the environment raises GitHub's commit-search
rate limit from 60/hr to 5000/hr.

## Running locally

Install dependencies once:

```bash
agents-cli install
```

Start the FastAPI server (used by the React UI):

```bash
uv run uvicorn app.server:app --reload --port 8080
```

Then in another terminal, start the React UI:

```bash
cd ../frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api/scan` to
the FastAPI service on `:8080`.

## Caching

Each successful scan is saved to `recent-scans/<sha256(email)>.<YYYY-MM-DD>.json`.
A second scan of the same email on the same day replays from disk in
~50ms instead of hitting Gemini and the upstream OSINT APIs. The cache
directory is gitignored.

To force a fresh scan, send `force_fresh: true` in the request body, or
tick the "Force scan" checkbox in the UI.

## Quick sanity checks

ADK playground (chat with the agent in a browser, no React UI):

```bash
agents-cli playground
```

One-shot CLI call:

```bash
agents-cli run "Scan test@example.com"
```

End-to-end SSE smoke test (spawns FastAPI in-process):

```bash
uv run python scripts/smoke_test.py test@example.com
```

## Deploy (optional)

The project was scaffolded as a prototype (`deployment_target = none`).
To add deployment support later:

```bash
agents-cli scaffold enhance . --deployment-target agent_runtime  # or cloud_run / gke
agents-cli deploy
```
