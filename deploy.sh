#!/usr/bin/env bash
#
# deploy.sh — Build, push, and deploy to Google Cloud Run using YOUR Docker image.
#
# Usage:
#   ./deploy.sh                          # uses defaults from this script
#   ./deploy.sh --project my-project     # override project
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - Docker or Podman available
#
set -euo pipefail

# ── Configuration (edit these) ───────────────────────────────────────────────
PROJECT_ID=""           # Will be auto-detected from gcloud if empty
REGION="us-west1"
SERVICE_NAME="buildsheet"
REPO_NAME="buildsheet"  # Artifact Registry repository name
IMAGE_NAME="buildsheet"

# load .env variables if file is present
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
fi

# API keys and Firebase config — set these as env vars or they'll be read from the current env
API_KEY="${API_KEY:-}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
VITE_FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY:-}"
VITE_FIREBASE_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN:-}"
VITE_FIREBASE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID:-}"
VITE_FIREBASE_STORAGE_BUCKET="${VITE_FIREBASE_STORAGE_BUCKET:-}"
VITE_FIREBASE_MESSAGING_SENDER_ID="${VITE_FIREBASE_MESSAGING_SENDER_ID:-}"
VITE_FIREBASE_APP_ID="${VITE_FIREBASE_APP_ID:-}"
VITE_FIREBASE_MEASUREMENT_ID="${VITE_FIREBASE_MEASUREMENT_ID:-}"
VITE_STRIPE_PRO_MONTHLY_PRICE_ID="${VITE_STRIPE_PRO_MONTHLY_PRICE_ID:-}"
VITE_STRIPE_PRO_ANNUAL_PRICE_ID="${VITE_STRIPE_PRO_ANNUAL_PRICE_ID:-}"

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --project)  PROJECT_ID="$2"; shift 2 ;;
    --region)   REGION="$2"; shift 2 ;;
    --api-key)  API_KEY="$2"; shift 2 ;;
    --gemini-key) GEMINI_API_KEY="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Auto-detect project if not specified ─────────────────────────────────────
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(gcloud config get-value project 2>/dev/null || true)
  if [ -z "$PROJECT_ID" ]; then
    echo "❌ No GCP project configured. Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
  fi
fi

echo "══════════════════════════════════════════════════════════════"
echo "  Deploying '$SERVICE_NAME' to Cloud Run"
echo "  Project:  $PROJECT_ID"
echo "  Region:   $REGION"
echo "  API_KEY:  ${API_KEY:0:8}... (${#API_KEY} chars)"
echo "  GEMINI:   ${GEMINI_API_KEY:0:8}... (${#GEMINI_API_KEY} chars)"
echo "══════════════════════════════════════════════════════════════"
echo ""

# Validate keys are set
if [ -z "$API_KEY" ] || [ -z "$GEMINI_API_KEY" ]; then
  echo "❌ API_KEY and GEMINI_API_KEY must be set."
  echo "   Export them or pass via --api-key / --gemini-key flags."
  exit 1
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest"

# ── Step 1: Ensure Artifact Registry repo exists ─────────────────────────────
echo "🔧 Step 1: Ensuring Artifact Registry repo '${REPO_NAME}' exists..."
gcloud artifacts repositories describe "$REPO_NAME" \
  --location="$REGION" \
  --project="$PROJECT_ID" >/dev/null 2>&1 || \
gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID" \
  --description="BuildSheet container images"
echo "   ✅ Repository ready."
echo ""

# ── Step 2: Configure Docker auth for Artifact Registry ─────────────────────
echo "🔧 Step 2: Configuring Docker authentication..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
echo "   ✅ Auth configured."
echo ""

# ── Step 3: Build the Docker image ──────────────────────────────────────────
echo "🔧 Step 3: Building Docker image..."
docker build --load -t "$IMAGE_URI" .
echo "   ✅ Image built: $IMAGE_URI"
echo ""

# ── Step 4: Push to Artifact Registry ────────────────────────────────────────
echo "🔧 Step 4: Pushing image to Artifact Registry..."
docker push "$IMAGE_URI"
echo "   ✅ Image pushed."
echo ""

# ── Step 5: Remove stale GCS FUSE volume mounts from AI Studio ───────────────
# The AI Studio applet-proxy mounts a GCS bucket over /app/dist (read-only),
# which overwrites our Vite build and blocks env.sh from writing env-config.js.
# We must remove this to use our own Docker image.
echo "🔧 Step 5: Removing stale AI Studio volume mounts..."
gcloud run services update "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --clear-volumes \
  --clear-volume-mounts \
  --quiet 2>/dev/null || true
echo "   ✅ Volume mounts cleared."
echo ""

# ── Step 6: Deploy to Cloud Run ─────────────────────────────────────────────
echo "🔧 Step 6: Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image="$IMAGE_URI" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --platform=managed \
  --port=8080 \
  --allow-unauthenticated \
  --set-env-vars="API_KEY=${API_KEY},GEMINI_API_KEY=${GEMINI_API_KEY},VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY},VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN},VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID},VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET},VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID},VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID},VITE_FIREBASE_MEASUREMENT_ID=${VITE_FIREBASE_MEASUREMENT_ID},VITE_STRIPE_PRO_MONTHLY_PRICE_ID=${VITE_STRIPE_PRO_MONTHLY_PRICE_ID},VITE_STRIPE_PRO_ANNUAL_PRICE_ID=${VITE_STRIPE_PRO_ANNUAL_PRICE_ID}" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --concurrency=80 \
  --timeout=300
echo ""

# ── Done ─────────────────────────────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format='value(status.url)')

echo "══════════════════════════════════════════════════════════════"
echo "  ✅ Deployment complete!"
echo "  URL: $SERVICE_URL"
echo "══════════════════════════════════════════════════════════════"
