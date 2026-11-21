#!/usr/bin/env bash
# Update the server to the latest code on GitHub. Safe to run any time.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "▶ Pulling the latest code..."
git pull --ff-only
echo "▶ Rebuilding and restarting only what changed..."
docker network create qf-edge >/dev/null 2>&1 || true      # shared with Hyperplane LENS (its front door is this Caddy)
docker compose up -d --build --remove-orphans
# Hyperplane LENS (folder lens/, its own docker stack): updated AFTER Hyperplane, and only once it is set up (lens/.env, made by
# bash lens/deploy/setup.sh). A Lens problem only prints a warning — it never stops or undoes Hyperplane's deploy.
if [ -f lens/.env ]; then
  echo "▶ Updating Hyperplane LENS..."
  (cd lens && docker compose up -d --build --remove-orphans) || echo "⚠ Lens did not update — Hyperplane is fine. See: cd lens && docker compose logs"
fi
docker image prune -f >/dev/null
echo "✓ Deployed $(git log -1 --format='%h %s')"
docker compose ps
