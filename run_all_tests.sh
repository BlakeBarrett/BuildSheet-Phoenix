#!/bin/bash
#
# run_all_tests.sh — run the Playwright end-to-end suite against a local
# build, the same way CI's "E2E (Docker + Playwright)" job does: build the
# Docker image, start a throwaway container on :8080, wait for it to report
# healthy, run the tests, then always tear the container down.
#
# playwright.config.ts intentionally has no `webServer` entry (the container
# serves everything, and CI starts it out-of-band) — so this script exists to
# provide that server locally. If you already have the app running on :8080
# (e.g. via ./startup_local.sh), this script reuses it instead of starting a
# second container.
set -eo pipefail

IMAGE_NAME="buildsheet-test"
CONTAINER_NAME="buildsheet-run-all-tests"
HOST_PORT=8080
HEALTH_URL="http://localhost:${HOST_PORT}/api/v1/health"
STARTED_CONTAINER=false

cleanup() {
  if [ "$STARTED_CONTAINER" = true ]; then
    echo "▶ stopping ${CONTAINER_NAME}..."
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  echo "▶ reusing app already running at http://localhost:${HOST_PORT}/"
else
  if ! docker info >/dev/null 2>&1; then
    echo "ERROR: nothing is listening on :${HOST_PORT} and Docker is not available to start it." >&2
    echo "Start Docker (or run ./startup_local.sh yourself), then rerun this script." >&2
    exit 1
  fi

  echo "▶ building docker image ${IMAGE_NAME}..."
  docker build --load -t "$IMAGE_NAME" .

  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

  echo "▶ starting throwaway container ${CONTAINER_NAME} on port ${HOST_PORT}..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    -p "${HOST_PORT}:8080" \
    -e AI_KEY=test-dummy-key \
    -e AI_PROVIDER=openai-compat \
    -e VITE_FIREBASE_PROJECT_ID=test-dummy \
    "$IMAGE_NAME" >/dev/null
  STARTED_CONTAINER=true

  echo "▶ waiting for ${HEALTH_URL} to report healthy..."
  healthy=false
  for _ in $(seq 1 30); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      healthy=true
      break
    fi
    sleep 3
  done
  if [ "$healthy" != true ]; then
    echo "::error::Container did not become healthy in time" >&2
    docker logs "$CONTAINER_NAME" 2>&1 | tail -50 >&2
    exit 1
  fi
fi

echo "Running all tests..."
npx playwright test 2>&1 | grep -v '^\[WebServer\]'
echo "Tests completed successfully."
