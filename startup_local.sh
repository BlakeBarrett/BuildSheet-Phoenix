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
# The container listens on port 8080 and uses the same `env.sh` entrypoint
# defined in the repository.

set -euo pipefail

IMAGE_NAME="buildsheet-local"
CONTAINER_NAME="buildsheet-local-run"
HOST_PORT=8080
CONTAINER_PORT=8080

MARKETING_CONTAINER_NAME="buildsheet-marketing-run"
MARKETING_HOST_PORT=8081

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

echo "✅ container started, visit http://localhost:${HOST_PORT}/"

# --- Marketing website ---
docker rm -f "$MARKETING_CONTAINER_NAME" 2>/dev/null || true

echo "▶ launching marketing site on port ${MARKETING_HOST_PORT}..."
docker run -d \
  --name "$MARKETING_CONTAINER_NAME" \
  -p "${MARKETING_HOST_PORT}:${MARKETING_HOST_PORT}" \
  -v "$(pwd)/website:/srv/website:ro" \
  "$IMAGE_NAME" \
  serve /srv/website -l "${MARKETING_HOST_PORT}" --no-clipboard

# update "Live Demo" link so it points to the running app
echo "▶ patching marketing site live demo link → http://localhost:${HOST_PORT}/"
sed -i "s|http://localhost:[0-9]*\"|http://localhost:${HOST_PORT}\"|g" website/index.html

echo "✅ marketing site started, visit http://localhost:${MARKETING_HOST_PORT}/"
