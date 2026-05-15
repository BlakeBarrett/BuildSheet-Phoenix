#!/bin/bash
set -eo pipefail

echo "Running all tests..."
npx playwright test 2>&1 | grep -v '^\[WebServer\]'
echo "Tests completed successfully."
