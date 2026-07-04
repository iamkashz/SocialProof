# How to run SocialProof

- [Local development](#local-development)
- [Cloud Run deployment](#cloud-run-deployment)
- [Teardown](#teardown)

---

## Local development

### 1. Install tools

```bash
brew install uv node
uv tool install google-agents-cli
```

### 2. Get API keys

- Gemini — <https://aistudio.google.com/apikey>
- IntelligenceX — <https://intelx.io/account?tab=developer>

### 3. Configure environment

```bash
cd backend/app
cp .env.example .env
$EDITOR .env   # set GOOGLE_API_KEY and INTELX_API_KEY
```

### 4. Install dependencies

```bash
cd backend && agents-cli install
cd ../frontend && npm install
```

### 5. Run

Terminal 1:

```bash
cd backend && uv run uvicorn app.server:app --reload --port 8080
```

Terminal 2:

```bash
cd frontend && npm run dev
```

Open <http://localhost:5173>.

### Commands

```bash
# Health
curl http://localhost:8080/api/health

# Fresh scan (bypass cache)
# Check the "Force scan" box on the landing page.

# Clear cache
rm backend/recent-scans/*.json

# Kill a stuck port
lsof -ti:8080 | xargs kill
lsof -ti:5173 | xargs kill
```

---

## Cloud Run deployment

### 1. Install gcloud

<https://cloud.google.com/sdk/docs/install-sdk>

```bash
gcloud auth login
```

### 2. Create project

```bash
gcloud projects create socialproof-live --name="SocialProof"
gcloud config set project socialproof-live
```

### 3. Link billing

```bash
gcloud billing accounts list
gcloud billing projects link socialproof-live \
  --billing-account=XXXXXX-XXXXXX-XXXXXX
```

### 4. Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
```

### 5. Store secrets

```bash
printf %s "YOUR_GEMINI_KEY" | gcloud secrets create GOOGLE_API_KEY --data-file=-
printf %s "YOUR_INTELX_KEY" | gcloud secrets create INTELX_API_KEY --data-file=-
```

### 6. Grant access to secrets

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 7. Deploy backend

```bash
cd backend

gcloud run deploy socialproof-api \
  --source . \
  --region us-east1 \
  --allow-unauthenticated \
  --update-secrets=GOOGLE_API_KEY=GOOGLE_API_KEY:latest,INTELX_API_KEY=INTELX_API_KEY:latest \
  --memory 1Gi --cpu 2 \
  --concurrency 5 \
  --timeout 300s \
  --min-instances 0 --max-instances 2
```

Copy the printed **Service URL** — you'll pass it to the frontend deploy.

Verify:

```bash
curl <BACKEND_URL>/api/health
# {"status":"ok","agent":"socialproof_root"}
```

### 8. Deploy frontend

Replace `<BACKEND_URL>` with the URL from step 7.

```bash
cd ../frontend

gcloud run deploy socialproof-web \
  --source . \
  --region us-east1 \
  --allow-unauthenticated \
  --set-env-vars=ADK_API_URL=<BACKEND_URL> \
  --memory 512Mi --cpu 1 \
  --concurrency 20 \
  --timeout 300s \
  --min-instances 0 --max-instances 2
```

Open the printed **Service URL** in a browser. Run a scan.

### 9. Redeploy after code changes

```bash
# From backend/
gcloud run deploy socialproof-api --source .

# From frontend/
gcloud run deploy socialproof-web --source .
```

### 10. Logs

```bash
gcloud run services logs read socialproof-api --region us-east1
gcloud run services logs read socialproof-web --region us-east1
```

---

## Teardown

Pick a level.

### Level 1 — Take offline (reversible)

```bash
gcloud run services update socialproof-api --region us-east1 --max-instances=0
gcloud run services update socialproof-web --region us-east1 --max-instances=0
```

Bring back:

```bash
gcloud run services update socialproof-api --region us-east1 --max-instances=2
gcloud run services update socialproof-web --region us-east1 --max-instances=2
```

### Level 2 — Delete services + secrets

```bash
gcloud run services delete socialproof-api --region us-east1 --quiet
gcloud run services delete socialproof-web --region us-east1 --quiet

gcloud artifacts repositories delete cloud-run-source-deploy \
  --location us-east1 --quiet

gcloud secrets delete GOOGLE_API_KEY --quiet
gcloud secrets delete INTELX_API_KEY --quiet
```

### Level 3 — Delete the project

```bash
gcloud projects delete socialproof-live
```

Rotate the Gemini and IntelX keys at the source after any level ≥ 2.
