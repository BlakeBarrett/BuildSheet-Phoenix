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
AI_DISPLAY_NAME="${AI_DISPLAY_NAME:-}"
AI_MODEL_FAST="${AI_MODEL_FAST:-}"
AI_MODEL_SMART="${AI_MODEL_SMART:-}"
AI_MODEL_STRUCTURED="${AI_MODEL_STRUCTURED:-}"
AI_MODEL_IMAGE="${AI_MODEL_IMAGE:-}"
AI_MODEL_AUDIO="${AI_MODEL_AUDIO:-}"
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
LOCAL_ARCHITECT_URL="${LOCAL_ARCHITECT_URL:-}"
LOCAL_ARCHITECT_MODEL="${LOCAL_ARCHITECT_MODEL:-}"
SEARCH_API_KEY="${SEARCH_API_KEY:-}"

# Accept AI_KEY as the primary credential; fall back to legacy API_KEY / GEMINI_API_KEY
EFFECTIVE_KEY="${AI_KEY:-${API_KEY:-${GEMINI_API_KEY:-}}}"
if [ -z "$EFFECTIVE_KEY" ]; then
  cat <<'USAGE' >&2
Usage: AI_KEY=yourkey ./startup_local.sh

At least one of AI_KEY, API_KEY, or GEMINI_API_KEY must be set.
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
echo "▶ building docker image ${IMAGE_NAME}..."
docker build --no-cache -t "$IMAGE_NAME" .

# remove any old container with the same name
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

# run the container
echo "▶ launching container ${CONTAINER_NAME} on port ${HOST_PORT}..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  -e "AI_KEY=${AI_KEY}" \
  -e "AI_PROVIDER=${AI_PROVIDER}" \
  -e "AI_BASE_URL=${AI_BASE_URL}" \
  -e "AI_DISPLAY_NAME=${AI_DISPLAY_NAME}" \
  -e "AI_MODEL_FAST=${AI_MODEL_FAST}" \
  -e "AI_MODEL_SMART=${AI_MODEL_SMART}" \
  -e "AI_MODEL_STRUCTURED=${AI_MODEL_STRUCTURED}" \
  -e "AI_MODEL_IMAGE=${AI_MODEL_IMAGE}" \
  -e "AI_MODEL_AUDIO=${AI_MODEL_AUDIO}" \
  -e "API_KEY=${API_KEY}" \
  -e "GEMINI_API_KEY=${GEMINI_API_KEY}" \
  -e "SEARCH_API_KEY=${SEARCH_API_KEY}" \
  -e "VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY}" \
  -e "VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN}" \
  -e "VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID}" \
  -e "VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET}" \
  -e "VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID}" \
  -e "VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}" \
  -e "VITE_FIREBASE_MEASUREMENT_ID=${VITE_FIREBASE_MEASUREMENT_ID}" \
  -e "LOCAL_ARCHITECT_URL=${LOCAL_ARCHITECT_URL}" \
  -e "LOCAL_ARCHITECT_MODEL=${LOCAL_ARCHITECT_MODEL}" \
  "$IMAGE_NAME"

echo "✅ container started"
echo "   Marketing site: http://localhost:${HOST_PORT}/"
echo "   Live Demo app:  http://localhost:${HOST_PORT}/app/"
