# How to run SocialProof

Two processes: **backend** (Python ADK + FastAPI) on port `8080`,
**frontend** (Vite + React) on port `5173`.

---

## First-time setup (do once)

### 1. Install system tools

```bash
# uv (Python package manager) — pick one
brew install uv
# or:  curl -LsSf https://astral.sh/uv/install.sh | sh

# agents-cli (Google ADK CLI)
uv tool install google-agents-cli

# Node.js ≥ 20 and npm — pick one
brew install node
# or download from https://nodejs.org
```

Verify:

```bash
uv --version
agents-cli --version
node --version
npm --version
```

### 2. Get API keys

You need two free API keys:

- **Google AI Studio (Gemini)** — <https://aistudio.google.com/apikey>
- **IntelligenceX** — sign up at <https://intelx.io/signup> then visit
  <https://intelx.io/account?tab=developer>

### 3. Set the keys in `backend/app/.env`

Create the file if it doesn't exist:

```bash
cd SocialProof/backend/app
cat > .env <<'EOF'
GOOGLE_API_KEY=<paste-your-gemini-key>
INTELX_API_KEY=<paste-your-intelx-key>
EOF
```

> Optional: add `GITHUB_TOKEN=<your-token>` to raise GitHub commit-search
> rate limit from 60/hr to 5000/hr.

### 4. Install project dependencies

```bash
# Backend
cd SocialProof/backend
agents-cli install

# Frontend
cd ../frontend
npm install
```

---

## Every time you run

Two terminals, run side-by-side.

### Terminal 1 — backend

```bash
cd backend && uv run uvicorn app.server:app --reload --port 8080
```

Wait until you see `Uvicorn running on http://127.0.0.1:8080`.

### Terminal 2 — frontend

```bash
cd frontend && npm run dev
```

Wait until you see `Local: http://localhost:5173/`.

### Open the app

<http://localhost:5173>

---

## Sanity check commands

Backend alone:

```bash
# Health
curl http://localhost:8080/api/health

# One-shot scan via curl (streams SSE frames)
curl -N -X POST http://localhost:8080/api/scan \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com"}'
```

Built-in ADK playground (no React UI, just a chat box):

```bash
cd SocialProof/backend
agents-cli playground
```

---

## If something breaks

**Port 8080 or 5173 already in use:**

```bash
lsof -ti:8080 | xargs kill   # backend
lsof -ti:5173 | xargs kill   # frontend
```

**Backend can't find the API key:** check that `backend/app/.env` exists
and has `GOOGLE_API_KEY=` and `INTELX_API_KEY=` lines with real values
(not placeholders).

**Gemini returns 429 RESOURCE_EXHAUSTED:** free tier quota of 20 requests
per day per model is exhausted. The narrator has a fallback ladder
across 8 models, so this is rare — but if it happens, wait 1 hour or
swap in a paid key.

**Force a fresh scan instead of using the daily cache:** check the
"Force scan" box on the landing page before clicking "Run scan".

**Cache directory:** scans are cached at
`SocialProof/backend/recent-scans/<sha256(email)>.<YYYY-MM-DD>.json`.
Delete files there to invalidate the cache manually.
