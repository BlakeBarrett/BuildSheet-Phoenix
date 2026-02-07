#!/usr/bin/env bash
#
# test-docker-env.sh
#
# Builds the Docker image, runs it with test API keys, and validates
# that the runtime-injected keys appear in the served web app.
#
set -euo pipefail

IMAGE_NAME="buildsheet-env-test"
CONTAINER_NAME="buildsheet-env-test-run"
HOST_PORT=8089
CONTAINER_PORT=8080

# Unique test keys (long enough to pass AIManager.isValidKey validation >10 chars)
TEST_API_KEY="TEST_API_KEY_abc123xyz789_CANARY"
TEST_GEMINI_KEY="TEST_GEMINI_KEY_def456uvw012_CANARY"

PASS=0
FAIL=0
TESTS_RUN=0

pass() {
  TESTS_RUN=$((TESTS_RUN + 1))
  PASS=$((PASS + 1))
  echo "  ✅ PASS: $1"
}

fail() {
  TESTS_RUN=$((TESTS_RUN + 1))
  FAIL=$((FAIL + 1))
  echo "  ❌ FAIL: $1"
  if [ -n "${2:-}" ]; then
    echo "          $2"
  fi
}

cleanup() {
  echo ""
  echo "🧹 Cleaning up..."
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
}
trap cleanup EXIT

# ── Step 1: Build the Docker image ──────────────────────────────────────────
echo "══════════════════════════════════════════════════════════════"
echo "  Step 1: Building Docker image '$IMAGE_NAME'..."
echo "══════════════════════════════════════════════════════════════"
docker build -t "$IMAGE_NAME" . 2>&1 | tail -5
echo ""

# ── Step 2: Run the container with test env vars ────────────────────────────
echo "══════════════════════════════════════════════════════════════"
echo "  Step 2: Starting container with test env vars..."
echo "══════════════════════════════════════════════════════════════"
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER_NAME" \
  -p "${HOST_PORT}:${CONTAINER_PORT}" \
  -e "API_KEY=${TEST_API_KEY}" \
  -e "GEMINI_API_KEY=${TEST_GEMINI_KEY}" \
  "$IMAGE_NAME"

# Wait for the container to be ready
echo "  Waiting for container to be ready..."
MAX_RETRIES=30
for i in $(seq 1 $MAX_RETRIES); do
  if curl -sf "http://localhost:${HOST_PORT}/" >/dev/null 2>&1; then
    echo "  Container is ready after ${i}s."
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "  ❌ Container failed to start within ${MAX_RETRIES}s"
    echo "  Container logs:"
    docker logs "$CONTAINER_NAME" 2>&1 | tail -20
    exit 1
  fi
  sleep 1
done
echo ""

# ── Step 3: Run the tests ───────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════════════"
echo "  Step 3: Running validation tests..."
echo "══════════════════════════════════════════════════════════════"

# --- Test 3a: env-config.js is served and contains the test API_KEY ---
ENV_CONFIG=$(curl -sf "http://localhost:${HOST_PORT}/env-config.js" 2>&1) || ENV_CONFIG=""

if [ -z "$ENV_CONFIG" ]; then
  fail "env-config.js is not served at /env-config.js"
else
  pass "env-config.js is served at /env-config.js"

  if echo "$ENV_CONFIG" | grep -q "$TEST_API_KEY"; then
    pass "env-config.js contains test API_KEY ($TEST_API_KEY)"
  else
    fail "env-config.js does NOT contain test API_KEY" "Got: $ENV_CONFIG"
  fi

  if echo "$ENV_CONFIG" | grep -q "$TEST_GEMINI_KEY"; then
    pass "env-config.js contains test GEMINI_API_KEY ($TEST_GEMINI_KEY)"
  else
    fail "env-config.js does NOT contain test GEMINI_API_KEY" "Got: $ENV_CONFIG"
  fi
fi

# --- Test 3b: index.html references env-config.js ---
INDEX_HTML=$(curl -sf "http://localhost:${HOST_PORT}/" 2>&1) || INDEX_HTML=""

if [ -z "$INDEX_HTML" ]; then
  fail "index.html is not served at /"
else
  pass "index.html is served at /"

  if echo "$INDEX_HTML" | grep -q 'env-config.js'; then
    pass "index.html contains <script src> for env-config.js"
  else
    fail "index.html does NOT reference env-config.js" \
         "The script tag <script src=\"/env-config.js\"></script> is missing from the built HTML"
  fi

  if echo "$INDEX_HTML" | grep -q 'window._env_'; then
    pass "index.html contains window._env_ initialization"
  else
    fail "index.html does NOT contain window._env_ initialization"
  fi
fi

# --- Test 3c: The actual JS bundle is served (app can load) ---
# Find the main JS bundle path from the HTML
JS_BUNDLE=$(echo "$INDEX_HTML" | grep -oP 'src="(/assets/[^"]+\.js)"' | head -1 | grep -oP '/assets/[^"]+\.js' || true)

if [ -n "$JS_BUNDLE" ]; then
  BUNDLE_CONTENT=$(curl -sf "http://localhost:${HOST_PORT}${JS_BUNDLE}" 2>&1) || BUNDLE_CONTENT=""
  if [ -n "$BUNDLE_CONTENT" ]; then
    pass "Main JS bundle is served at ${JS_BUNDLE}"
  else
    fail "Main JS bundle at ${JS_BUNDLE} returned empty"
  fi
else
  # Vite might inline the module differently; not a blocking failure
  echo "  ℹ️  INFO: Could not extract JS bundle path from HTML (may use different module format)"
fi

# --- Test 3d: Verify the DOM would contain the keys by checking that ---
#     env-config.js sets window._env_ with proper JS syntax
if [ -n "$ENV_CONFIG" ]; then
  if echo "$ENV_CONFIG" | grep -qP 'window\._env_\s*=\s*\{'; then
    pass "env-config.js sets window._env_ with valid JS object syntax"
  else
    fail "env-config.js has unexpected format" "Got: $ENV_CONFIG"
  fi
fi

echo ""

# ── Step 4: Report ──────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════════════"
echo "  Results: ${PASS} passed, ${FAIL} failed out of ${TESTS_RUN} tests"
echo "══════════════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "  env-config.js content:"
  echo "  ---"
  echo "  $ENV_CONFIG"
  echo "  ---"
  exit 1
fi

echo ""
echo "  🎉 All tests passed! Runtime env injection is working correctly."
exit 0
