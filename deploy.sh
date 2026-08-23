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

# load env variables if file is present (default .env.prod; override with ENV_FILE)
ENV_FILE="${ENV_FILE:-.env.prod}"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1091
  set -a
  source "$ENV_FILE"
  set +a
  echo "📦 Loading env from $ENV_FILE"
else
  echo "⚠️  Warning: $ENV_FILE not found — using exported/shell env vars."
fi

# API keys and Firebase config — set these as env vars or they'll be read from the current env
AI_KEY="${AI_KEY:-}"
AI_PROVIDER="${AI_PROVIDER:-}"
AI_BASE_URL="${AI_BASE_URL:-}"
AI_IMAGE_BASE_URL="${AI_IMAGE_BASE_URL:-}"
AI_DISPLAY_NAME="${AI_DISPLAY_NAME:-}"
AI_MODEL_FAST="${AI_MODEL_FAST:-}"
AI_MODEL_SMART="${AI_MODEL_SMART:-}"
AI_MODEL_STRUCTURED="${AI_MODEL_STRUCTURED:-}"
AI_MODEL_IMAGE="${AI_MODEL_IMAGE:-}"
AI_MODEL_AUDIO="${AI_MODEL_AUDIO:-}"
SEARCH_API_KEY="${SEARCH_API_KEY:-}"
ADMIN_UIDS="${ADMIN_UIDS:-}"
GOOGLE_SEARCH_CACHE_TTL_MS="${GOOGLE_SEARCH_CACHE_TTL_MS:-}"
GOOGLE_SEARCH_VALIDATE_URLS="${GOOGLE_SEARCH_VALIDATE_URLS:-}"
URL_VALIDATION_TIMEOUT_MS="${URL_VALIDATION_TIMEOUT_MS:-}"
URL_VALIDATION_CACHE_TTL_MS="${URL_VALIDATION_CACHE_TTL_MS:-}"
# Legacy backward-compat aliases
API_KEY="${API_KEY:-}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
VITE_FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY:-}"
VITE_FIREBASE_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN:-}"
VITE_FIREBASE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID:-}"
VITE_FIREBASE_STORAGE_BUCKET="${VITE_FIREBASE_STORAGE_BUCKET:-}"
VITE_FIREBASE_MESSAGING_SENDER_ID="${VITE_FIREBASE_MESSAGING_SENDER_ID:-}"
VITE_FIREBASE_APP_ID="${VITE_FIREBASE_APP_ID:-}"
VITE_FIREBASE_MEASUREMENT_ID="${VITE_FIREBASE_MEASUREMENT_ID:-}"
VITE_RECAPTCHA_SITE_KEY="${VITE_RECAPTCHA_SITE_KEY:-}"
VITE_STRIPE_PRO_MONTHLY_PRICE_ID="${VITE_STRIPE_PRO_MONTHLY_PRICE_ID:-}"
VITE_STRIPE_PRO_ANNUAL_PRICE_ID="${VITE_STRIPE_PRO_ANNUAL_PRICE_ID:-}"
LOCAL_ARCHITECT_URL="${LOCAL_ARCHITECT_URL:-}"
LOCAL_ARCHITECT_MODEL="${LOCAL_ARCHITECT_MODEL:-}"

# ── Parse arguments ──────────────────────────────────────────────────────────
SKIP_TESTS=false
while [[ $# -gt 0 ]]; do
  case $1 in
    --project)    PROJECT_ID="$2"; shift 2 ;;
    --region)     REGION="$2"; shift 2 ;;
    --ai-key)     AI_KEY="$2"; shift 2 ;;
    --api-key)    API_KEY="$2"; shift 2 ;;   # legacy alias
    --gemini-key) GEMINI_API_KEY="$2"; shift 2 ;;  # legacy alias
    --skip-tests) SKIP_TESTS=true; shift ;;
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

# Accept AI_KEY as the primary credential; fall back to legacy API_KEY / GEMINI_API_KEY
EFFECTIVE_KEY="${AI_KEY:-${API_KEY:-${GEMINI_API_KEY:-}}}"

echo "══════════════════════════════════════════════════════════════"
echo "  Deploying '$SERVICE_NAME' to Cloud Run"
echo "  Project:  $PROJECT_ID"
echo "  Region:   $REGION"
echo "  AI_KEY:   ${EFFECTIVE_KEY:0:8}... (${#EFFECTIVE_KEY} chars)"
echo "  Provider: ${AI_PROVIDER:-cloud (default)}"
echo "══════════════════════════════════════════════════════════════"
echo ""

# Validate at least one key is set
if [ -z "$EFFECTIVE_KEY" ]; then
  echo "❌ No AI key found. Set AI_KEY, API_KEY, or GEMINI_API_KEY."
  echo "   Export it, add it to .env, or pass via --ai-key flag."
  exit 1
fi

# Propagate to legacy vars so env.sh receives all three
AI_KEY="${AI_KEY:-$EFFECTIVE_KEY}"
API_KEY="${API_KEY:-$EFFECTIVE_KEY}"
GEMINI_API_KEY="${GEMINI_API_KEY:-$EFFECTIVE_KEY}"

# Use a unique tag per deploy so Cloud Run always creates a new revision.
# :latest alone causes Cloud Run to skip revision creation if config is unchanged.
IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:${IMAGE_TAG}"
LATEST_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest"

# ── Step 0: Run Tests ────────────────────────────────────────────────────────
if [ "$SKIP_TESTS" = true ]; then
  echo "⏭️  Step 0: Skipping tests (--skip-tests)."
else
  echo "🔧 Step 0: Running tests..."
  if [ -f "./run_all_tests.sh" ]; then
    ./run_all_tests.sh
  else
    npx playwright test
  fi
  echo "   ✅ Tests passed."
fi
echo ""

# ── Step 1: Detect Container Engine ──────────────────────────────────────────
if command -v podman &>/dev/null; then
  DOCKER_BIN="podman"
elif command -v docker &>/dev/null; then
  DOCKER_BIN="docker"
else
  echo "❌ Neither docker nor podman found."
  exit 1
fi
echo "🔧 Using container engine: $DOCKER_BIN"

# ── Step 2: Ensure Artifact Registry repo exists ─────────────────────────────
echo "🔧 Step 2: Ensuring Artifact Registry repo '${REPO_NAME}' exists..."
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

# ── Step 3: Configure Docker auth for Artifact Registry ─────────────────────
echo "🔧 Step 3: Configuring Docker authentication..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
echo "   ✅ Auth configured."
echo ""

# ── Step 4: Build the Docker image ──────────────────────────────────────────
echo "🔧 Step 4: Building image (tag: ${IMAGE_TAG})..."
$DOCKER_BIN build --network=host -t "$IMAGE_URI" -t "$LATEST_URI" .
echo "   ✅ Image built: $IMAGE_URI"
echo ""

# ── Step 5: Push to Artifact Registry ────────────────────────────────────────
echo "🔧 Step 5: Pushing image to Artifact Registry..."
$DOCKER_BIN push "$IMAGE_URI"
$DOCKER_BIN push "$LATEST_URI"
echo "   ✅ Image pushed: $IMAGE_URI"
echo ""

# ── Step 6: Deploy to Cloud Run via service.yaml ───────────────────────────
# envsubst fills ${VAR} placeholders in service.yaml with values from the
# current environment (sourced from .env above). This avoids the fragile
# comma-separated --set-env-vars approach which breaks on values with commas.
echo "🔧 Step 6: Deploying to Cloud Run..."

if ! command -v envsubst &>/dev/null; then
  echo "❌ envsubst not found. Install gettext: brew install gettext / apt install gettext"
  exit 1
fi

export IMAGE_URI AI_KEY AI_PROVIDER AI_BASE_URL AI_IMAGE_BASE_URL AI_DISPLAY_NAME \
       AI_MODEL_FAST AI_MODEL_SMART AI_MODEL_STRUCTURED AI_MODEL_IMAGE AI_MODEL_AUDIO \
       SEARCH_API_KEY SEARXNG_BASE_URL FIRECRAWL_BASE_URL FIRECRAWL_API_KEY \
       ADMIN_UIDS \
       GOOGLE_SEARCH_ENABLED GOOGLE_SEARCH_DAILY_QUOTA GOOGLE_SEARCH_CACHE_TTL_MS \
       GOOGLE_SEARCH_VALIDATE_URLS URL_VALIDATION_TIMEOUT_MS URL_VALIDATION_CACHE_TTL_MS \
       VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID \
       VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID \
       VITE_FIREBASE_APP_ID VITE_FIREBASE_MEASUREMENT_ID \
       VITE_RECAPTCHA_SITE_KEY VITE_STRIPE_PRO_MONTHLY_PRICE_ID \
       VITE_STRIPE_PRO_ANNUAL_PRICE_ID REGION

envsubst < service.yaml | gcloud run services replace - \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --quiet

# Ensure unauthenticated (public) access is set — replace only manages config,
# not IAM bindings.
gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --member=allUsers \
  --role=roles/run.invoker \
  --quiet 2>/dev/null || true

echo "   ✅ Deployed via service.yaml."
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
echo ""

# ── Tag the deployed commit with deployment metadata ──────────────────────────
echo "🏷️  Creating deployment tag..."

DEPLOY_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
FULL_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
SHORT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

DEPLOY_TAG="deploy-${BRANCH_NAME}-${SHORT_SHA}"

# Create lightweight tag body with deployment info
DEPLOY_BODY="Branch: ${BRANCH_NAME}
Commit: ${FULL_SHA}
Short:  ${SHORT_SHA}
Image:  ${IMAGE_URI}
URL:    ${SERVICE_URL}
Region: ${REGION}
Project: ${PROJECT_ID}
Time:   ${DEPLOY_TIMESTAMP}"

# Create or update the annotated tag
git tag -d "$DEPLOY_TAG" 2>/dev/null || true
git tag -a "$DEPLOY_TAG" -m "$DEPLOY_BODY"
echo "   ✅ Tag created: $DEPLOY_TAG"

# Push the tag to origin
git push origin "$DEPLOY_TAG" --force 2>/dev/null && \
  echo "   ✅ Tag pushed to origin." || \
  echo "   ⚠️  Tag not pushed to origin (you can push manually):" && \
  echo "     git push origin $DEPLOY_TAG --force"
