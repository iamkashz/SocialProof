# How to run SocialProof

Two ways to run this project:

- **[Local development](#local-development)** — two terminals, hot reload,
  React dev server. What you use when working on the code.
- **[Cloud Run deployment](#cloud-run-deployment)** — two Cloud Run services
  (frontend SSR + FastAPI backend), single public URL for the frontend.
  What the live demo at
  <https://socialproof-web-1010516973639.us-east1.run.app> uses. Includes a
  **[teardown section](#pausing-or-tearing-down-the-deployment)** for when
  you're done grading and want to stop the demo from serving traffic.

---

## Local development

Backend on port `8080`, frontend on port `5173`. Vite proxies `/api/*` to
the backend, so from the browser's perspective it's one origin.

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
- **IntelligenceX** — sign up at <https://intelx.io/signup>, then visit
  <https://intelx.io/account?tab=developer>

### 3. Configure `backend/app/.env`

```bash
cd SocialProof/backend/app
cp .env.example .env
$EDITOR .env   # paste GOOGLE_API_KEY and INTELX_API_KEY
```

Optional: also uncomment `GITHUB_TOKEN` in `.env` to raise GitHub's
commit-search rate limit from 60/hr to 5000/hr.

### 4. Install project dependencies

```bash
# Backend
cd SocialProof/backend
agents-cli install

# Frontend
cd ../frontend
npm install
```

### 5. Run

Two terminals side-by-side.

**Terminal 1 — backend:**

```bash
cd backend && uv run uvicorn app.server:app --reload --port 8080
```

Wait until you see `Uvicorn running on http://127.0.0.1:8080`.

**Terminal 2 — frontend:**

```bash
cd frontend && npm run dev
```

Wait until you see `Local: http://localhost:5173/`.

**Open the app**: <http://localhost:5173>

### Sanity checks

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

### Troubleshooting

**Port 8080 or 5173 already in use:**

```bash
lsof -ti:8080 | xargs kill   # backend
lsof -ti:5173 | xargs kill   # frontend
```

**Backend can't find the API key:** check that `backend/app/.env` exists
and has `GOOGLE_API_KEY=` and `INTELX_API_KEY=` lines with real values.

**Gemini returns 429 RESOURCE_EXHAUSTED:** free-tier quota of 20 requests
per day per model is exhausted. The narrator has a fallback ladder across
8 models, so this is rare — but if it happens, wait 1 hour or swap in a
paid key.

**Force a fresh scan instead of using the daily cache:** check the
"Force scan" box on the landing page before clicking "Run scan".

**Cache directory:** scans are cached at
`SocialProof/backend/recent-scans/<sha256(email)>.<YYYY-MM-DD>.json`.
Delete files there to invalidate the cache manually.

---

## Cloud Run deployment

The live demo runs on **two Cloud Run services** in the same GCP project:

| Service | Runtime | Purpose |
|---|---|---|
| `socialproof-api` | Python 3.12 (FastAPI) | The agent graph + `/api/scan` SSE endpoint |
| `socialproof-web` | Node.js 22 (TanStack Start SSR) | The React frontend, proxies `/api/*` to `socialproof-api` |

Judges hit only the frontend URL; it proxies API calls to the backend
internally. Both services scale to zero when idle (~$0 cost at rest).

### 1. Prerequisites

- A Google Cloud account with billing enabled. The free tier + $300
  starter credit covers the entire deployment.
- The `gcloud` CLI installed and authenticated:
  ```bash
  # macOS: https://cloud.google.com/sdk/docs/install-sdk
  gcloud auth login
  ```

### 2. Create a GCP project

```bash
gcloud projects create socialproof-live --name="SocialProof"
gcloud config set project socialproof-live
```

### 3. Link a billing account

```bash
# Find your billing account ID
gcloud billing accounts list

# Link it (replace with the ID from the previous command)
gcloud billing projects link socialproof-live \
  --billing-account=XXXXXX-XXXXXX-XXXXXX
```

### 4. Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
```

Takes ~30 seconds.

### 5. Store API keys in Secret Manager

**Never paste secrets into `gcloud run deploy --set-env-vars=`** — the
plaintext would end up in terminal history and Cloud Build logs. Use
Secret Manager, which encrypts at rest, gates access via IAM, and
injects the value only at container start.

```bash
# Google AI Studio (Gemini) key
printf %s "YOUR_GEMINI_KEY" | \
  gcloud secrets create GOOGLE_API_KEY --data-file=-

# IntelligenceX key
printf %s "YOUR_INTELX_KEY" | \
  gcloud secrets create INTELX_API_KEY --data-file=-

# Optional: GitHub token for higher rate limits
printf %s "YOUR_GITHUB_TOKEN" | \
  gcloud secrets create GITHUB_TOKEN --data-file=-
```

> `printf %s` avoids the trailing-newline pitfall of `echo -n` on
> different shells. A trailing newline baked into an API key breaks
> authentication silently.

### 6. Grant Cloud Run access to the secrets

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/secretmanager.secretAccessor"
```

Verify:

```bash
gcloud secrets list
# Should list GOOGLE_API_KEY, INTELX_API_KEY (and GITHUB_TOKEN if added)
```

### 7. Deploy the backend service

```bash
cd SocialProof/backend

gcloud run deploy socialproof-api \
  --source . \
  --region us-east1 \
  --allow-unauthenticated \
  --update-secrets=GOOGLE_API_KEY=GOOGLE_API_KEY:latest,INTELX_API_KEY=INTELX_API_KEY:latest \
  --memory 1Gi \
  --cpu 2 \
  --timeout 300s \
  --min-instances 0 \
  --max-instances 5
```

First build takes 3–5 minutes (Cloud Build compiles the container).
Subsequent builds are cached.

On success, note the **Service URL** printed at the end. It looks like:

```
Service URL: https://socialproof-api-XXXXXXXXXX.us-east1.run.app
```

You will paste this URL into the frontend deploy in step 8.

**Verify the backend is alive:**

```bash
curl https://socialproof-api-XXXXXXXXXX.us-east1.run.app/api/health
# Expected: {"status":"ok","agent":"socialproof_root"}
```

### 8. Deploy the frontend service

Replace `<BACKEND_URL>` with the backend URL from step 7.

```bash
cd ../frontend

gcloud run deploy socialproof-web \
  --source . \
  --region us-east1 \
  --allow-unauthenticated \
  --set-env-vars=ADK_API_URL=<BACKEND_URL> \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300s \
  --min-instances 0 \
  --max-instances 5
```

Frontend build takes ~5 minutes (npm install + Vite build + Docker
image build).

On success:

```
Service URL: https://socialproof-web-XXXXXXXXXX.us-east1.run.app
```

**This is the public URL to share with users / judges.**

### 9. Verify end-to-end

Open the frontend URL in a browser:

- Landing page renders with styles + fonts.
- Click "Run scan" against any email.
- Timeline streams in over ~2 minutes.
- Report renders correctly.

You can also sanity-check the API proxy path:

```bash
curl https://socialproof-web-XXXXXXXXXX.us-east1.run.app/api/health
# Same {"status":"ok",...} as before — proves the frontend is proxying
# to the backend correctly.
```

### 10. Ongoing operations

**Redeploy after code changes:**

```bash
# From backend/
gcloud run deploy socialproof-api --source .

# From frontend/
gcloud run deploy socialproof-web --source . \
  --set-env-vars=ADK_API_URL=<BACKEND_URL>
```

`gcloud run` remembers most flags from the previous deploy of the same
service, so subsequent commands can be much shorter.

**View logs:**

```bash
gcloud run services logs read socialproof-api --region us-east1
gcloud run services logs read socialproof-web --region us-east1
```

### Pausing or tearing down the deployment

Three levels of shutdown, from mildest to most permanent. Pick based on
whether you might want to bring the demo back.

#### Level 1 — Idle only (already active, costs $0 while nobody visits)

Both services are already deployed with `--min-instances 0`, so they run
zero containers when idle. Idle cost is genuinely **$0.00/day**. Nothing
to do here — this is the default state.

The only ongoing risk is that visitors to the public URL will run scans
against your API quotas (Gemini, IntelX, GitHub). If that becomes an
issue after the writeup goes public, go to level 2.

#### Level 2 — Make the URL unreachable, keep the config

Sets `max-instances` to 0. Any incoming request returns a `503` because
Cloud Run has nothing to route to. Config, secrets, and container images
stay in place — you can bring the service back in 30 seconds by setting
`max-instances` back to `2`.

```bash
# Take both services offline
gcloud run services update socialproof-api \
  --region us-east1 --max-instances=0

gcloud run services update socialproof-web \
  --region us-east1 --max-instances=0

# ...bring them back later
gcloud run services update socialproof-api \
  --region us-east1 --max-instances=2

gcloud run services update socialproof-web \
  --region us-east1 --max-instances=2
```

Use this when grading is over but you might want to demo the tool later.

#### Level 3 — Delete everything, permanent

Full teardown. All Cloud Run services, container images, and secrets
go away. GCP holds the project for a 30-day recovery window; after that,
it's actually gone.

```bash
# Delete the Cloud Run services
gcloud run services delete socialproof-api --region us-east1 --quiet
gcloud run services delete socialproof-web --region us-east1 --quiet

# Delete the container image storage (Artifact Registry)
gcloud artifacts repositories delete cloud-run-source-deploy \
  --location us-east1 --quiet

# Delete the API-key secrets
gcloud secrets delete GOOGLE_API_KEY --quiet
gcloud secrets delete INTELX_API_KEY --quiet
# If you set up GITHUB_TOKEN, also:
# gcloud secrets delete GITHUB_TOKEN --quiet

# Nuclear option: delete the entire GCP project (reversible for 30 days)
# gcloud projects delete socialproof-live
```

After this, rotate your Gemini and IntelX API keys locally as a
belt-and-suspenders move — the secrets have been deleted from GCP, but
the actual keys still work at the source until you rotate them.

### Cloud Run architecture notes

**Why two services?**

TanStack Start is a full-SSR framework — it needs Node.js at runtime to
render pages. FastAPI runs Python. Rather than duct-taping both into one
multi-process container (an anti-pattern for Cloud Run), each runtime
gets its own service. The frontend proxies `/api/*` requests to the
backend so the browser only ever sees one origin.

**Cache directory in production**

Cloud Run's container filesystem is read-only outside of `/tmp`. The
backend reads `RECENT_SCANS_DIR=/tmp/recent-scans` from an env var set
in the Dockerfile, so scans are still cached — just within one instance's
lifetime (they don't survive a container restart or a scale-up to a
second instance). Fresh, honest, and OK for the demo.

**Rate limiting behind a proxy**

Cloud Run's front-end proxy hides the real client IP behind
`X-Forwarded-For`. `server.py`'s custom `_client_ip()` helper reads this
header first, falls back to the transport-layer address. Locally there's
no XFF header, so the same code works in both environments.

**Cost profile**

- Backend cold-start: ~5s (container boot + `uv sync` + agent load).
- Frontend cold-start: ~2s (Node startup).
- Steady state (scale-to-zero when idle): ~$0/month.
- Judge running 20 scans: ~$0.01 in compute, well within the $300
  free-tier credit.
