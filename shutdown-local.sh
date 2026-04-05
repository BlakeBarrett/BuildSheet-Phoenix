#!/usr/bin/env bash
#
# shutdown-local.sh — Stop the locally running Docker container.
#
# This explicitly stops the container instead of deleting it.
# If the standard stop hangs because of rootless network daemon issues,
# it will hint at the force remove command.
#

set -euo pipefail

CONTAINER_NAME="buildsheet-local-run"

echo "▶ Stopping container ${CONTAINER_NAME}..."

if docker stop "$CONTAINER_NAME"; then
  echo "✅ Container stopped successfully."
else
  echo ""
  echo "⚠️  Warning: Container failed to stop elegantly."
  echo "If you are running rootless Docker and encountered a network permission error,"
  echo "you may need to forcefully remove the container to clear the zombie daemon process."
  echo ""
  read -p "Would you like to force remove it now? [y/N] " -n 1 -r </dev/tty
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "▶ Force removing container..."
    docker rm -f "$CONTAINER_NAME"
    echo "✅ Container removed."
  else
    echo "Container was not removed."
    exit 1
  fi
fi
