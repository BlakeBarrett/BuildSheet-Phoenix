#!/bin/bash
set -e

echo "Running all tests..."
npx playwright test
echo "Tests completed successfully."
