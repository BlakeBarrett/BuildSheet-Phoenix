#!/usr/bin/env bash
#
# startup_local.sh — build the Docker image and start a container for
# local development.  It will first attempt to load variables from a
# `.env` file if one exists, then fall back to values exported in your
# shell.  You can also set them on the command line.
#
# Examples:
#    API_KEY=xxx GEMINI_API_KEY=yyy ./startup_local.sh
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
API_KEY="${API_KEY:-}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"

if [ -z "$API_KEY" ] || [ -z "$GEMINI_API_KEY" ]; then
  cat <<'USAGE' >&2
Usage: API_KEY=yourkey GEMINI_API_KEY=yourkey ./startup_local.sh

Both variables are required; export them or provide them on the
command line.  You can also set them in your shell before running the
script.
USAGE
  exit 1
fi

# build the image (DOCKER_BUILDKIT=0 avoids stale buildx container cache)
echo "▶ building docker image ${IMAGE_NAME}..."
DOCKER_BUILDKIT=0 docker build --no-cache -t "$IMAGE_NAME" .

# remove any old container with the same name
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

# run the container
echo "▶ launching container ${CONTAINER_NAME} on port ${HOST_PORT}..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  -e "API_KEY=${API_KEY}" \
  -e "GEMINI_API_KEY=${GEMINI_API_KEY}" \
  "$IMAGE_NAME"

echo "✅ container started"
echo "   Marketing site: http://localhost:${HOST_PORT}/"
echo "   Live Demo app:  http://localhost:${HOST_PORT}/app/"
