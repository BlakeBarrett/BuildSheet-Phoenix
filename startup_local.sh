#!/usr/bin/env bash
#
# startup_local.sh — build the Docker image and start a container for
# local development.  It will first attempt to load variables from a
# `.env` file if one exists, then fall back to values exported in your
# shell.  You can also set them on the command line.
#
# Examples:
#    AI_KEY=xxx ./startup_local.sh
#    ./startup_local.sh        # uses values from .env if populated
#
# A single container serves both the marketing site (at /) and the
# React app (at /app/) via nginx on port 8080.

set -euo pipefail

IMAGE_NAME="buildsheet-local"
CONTAINER_NAME="buildsheet-local-run"
HOST_PORT=8080
CONTAINER_PORT=8080

# load .env variables if file is present (export them for use below)
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a
  . .env
  set +a
fi

# allow overrides from environment (after loading .env)
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
SEARCH_API_KEY="${SEARCH_API_KEY:-}"

# Require critical variables
if [ -z "$VITE_FIREBASE_PROJECT_ID" ]; then
  echo "⚠️  WARNING: VITE_FIREBASE_PROJECT_ID is not set. Firestore sync will fail."
fi

# Require AI_KEY only for local startup
if [ -z "$AI_KEY" ]; then
  cat <<'USAGE' >&2
Usage: AI_KEY=yourkey ./startup_local.sh

At least AI_KEY must be set.
Export it, add it to .env, or provide it on the command line.
USAGE
  exit 1
fi

# ensure a container runtime is available
if ! docker info >/dev/null 2>&1; then
  echo "▶ docker cannot connect to the local daemon."
  if command -v systemctl >/dev/null 2>&1 && command -v podman >/dev/null 2>&1; then
    echo "▶ attempting to start Podman user socket..."
    systemctl --user start podman.socket || true
    sleep 1
  fi
  if ! docker info >/dev/null 2>&1; then
    cat <<'ERROR' >&2
ERROR: Docker daemon is not available.
Start Docker or Podman first, then rerun this script.
On systems using Podman, run:
  systemctl --user start podman.socket
ERROR
    exit 1
  fi
fi

# build the image 
# Use the localhost/ prefix so Podman resolves the image name consistently at run time
echo "▶ building docker image ${IMAGE_NAME}..."
docker build --no-cache --load -t "localhost/$IMAGE_NAME" .

# remove any old container with the same name
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

# Handle Google Cloud Credentials for Firestore/Vertex access
CRED_OPTS=""
# Check for explicit service account key first
if [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ] && [ -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
  CRED_FILENAME=$(basename "$GOOGLE_APPLICATION_CREDENTIALS")
  ABS_CRED_PATH=$(realpath "$GOOGLE_APPLICATION_CREDENTIALS")
  CRED_OPTS="-v $ABS_CRED_PATH:/etc/secrets/$CRED_FILENAME:ro -e GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/$CRED_FILENAME"
  echo "▶ Mounting Google Cloud credentials from $ABS_CRED_PATH"
else
  # Fallback to Application Default Credentials (ADC)
  # Try common locations across Linux and macOS
  ADC_PATHS=(
    "$HOME/.config/gcloud/application_default_credentials.json"
    "$HOME/Library/Application Support/gcloud/application_default_credentials.json"
  )
  
  for p in "${ADC_PATHS[@]}"; do
    if [ -f "$p" ]; then
      ABS_ADC_PATH=$(realpath "$p")
      CRED_OPTS="-v $ABS_ADC_PATH:/etc/secrets/adc.json:ro -e GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/adc.json"
      echo "▶ Mounting local Application Default Credentials (ADC) from $ABS_ADC_PATH"
      break
    fi
  done
fi

# run the container
echo "▶ launching container ${CONTAINER_NAME} on port ${HOST_PORT}..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  $CRED_OPTS \
  -e "AI_KEY=${AI_KEY}" \
  -e "AI_PROVIDER=${AI_PROVIDER}" \
  -e "AI_BASE_URL=${AI_BASE_URL}" \
  -e "AI_IMAGE_BASE_URL=${AI_IMAGE_BASE_URL}" \
  -e "AI_DISPLAY_NAME=${AI_DISPLAY_NAME}" \
  -e "AI_MODEL_FAST=${AI_MODEL_FAST}" \
  -e "AI_MODEL_SMART=${AI_MODEL_SMART}" \
  -e "AI_MODEL_STRUCTURED=${AI_MODEL_STRUCTURED}" \
  -e "AI_MODEL_IMAGE=${AI_MODEL_IMAGE}" \
  -e "AI_MODEL_AUDIO=${AI_MODEL_AUDIO}" \
  -e "SEARCH_API_KEY=${SEARCH_API_KEY}" \
  -e "VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}" \
  -e "VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}" \
  -e "VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}" \
  -e "VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}" \
  -e "VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}" \
  -e "VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}" \
  -e "VITE_FIREBASE_MEASUREMENT_ID=${VITE_FIREBASE_MEASUREMENT_ID}" \
  -e "VITE_RECAPTCHA_SITE_KEY=${VITE_RECAPTCHA_SITE_KEY}" \
  -e "VITE_STRIPE_PRO_MONTHLY_PRICE_ID=${VITE_STRIPE_PRO_MONTHLY_PRICE_ID}" \
  -e "VITE_STRIPE_PRO_ANNUAL_PRICE_ID=${VITE_STRIPE_PRO_ANNUAL_PRICE_ID}" \
  -e "LOCAL_ARCHITECT_URL=${LOCAL_ARCHITECT_URL}" \
  -e "LOCAL_ARCHITECT_MODEL=${LOCAL_ARCHITECT_MODEL}" \
  "localhost/$IMAGE_NAME"

echo "✅ container started"
echo "   Marketing site: http://localhost:${HOST_PORT}/"
echo "   Live Demo app:  http://localhost:${HOST_PORT}/app/"
echo "   API health:     http://localhost:${HOST_PORT}/api/v1/health"
