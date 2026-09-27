#!/usr/bin/env bash
# Restore a backup:   bash deploy/restore.sh backups/hyperplane_20261002_0230.dump
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f "${1:-}" ] || { echo "usage: $0 backups/hyperplane_YYYYMMDD_HHMM.dump"; exit 1; }
docker compose stop api worker
docker compose exec -T db pg_restore -U hyperplane -d hyperplane --clean --if-exists < "$1"
docker compose start api worker
echo "✓ Restored $1"
