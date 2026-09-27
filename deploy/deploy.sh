#!/usr/bin/env bash
# Update the server to the latest code on GitHub. Safe to run any time.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "▶ Pulling the latest code..."
git pull --ff-only
echo "▶ Rebuilding and restarting only what changed..."
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
echo "✓ Deployed $(git log -1 --format='%h %s')"
docker compose ps
