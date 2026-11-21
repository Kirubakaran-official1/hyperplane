#!/usr/bin/env bash
# First-time setup of Hyperplane LENS (the lens/ folder of the Hyperplane repo). Safe to run again: nothing that exists is changed.
#   bash lens/deploy/setup.sh          (from the hyperplane folder)
# · lens/.env with Lens's own random secrets (never Hyperplane's)
# · LENS_ADMIN_KEY: one shared key, written to lens/.env AND Hyperplane's .env, for Admin → Lens admin in Hyperplane's dashboard
# · the shared docker network qf-edge · starts Lens, then restarts Hyperplane's admin server so it picks up the key
set -euo pipefail
cd "$(dirname "$0")/.."
rnd() { (tr -dc A-Za-z0-9 < /dev/urandom | head -c "$1") 2>/dev/null || true; }
touch .env; chmod 600 .env
grep -q '^LENS_SECRET=' .env || echo "LENS_SECRET=$(rnd 64)" >> .env
grep -q '^LENS_DB_PASSWORD=' .env || echo "LENS_DB_PASSWORD=$(rnd 32)" >> .env
KEY="$(sed -n 's/^LENS_ADMIN_KEY=//p' ../.env 2>/dev/null | head -1)"
[ -n "$KEY" ] || KEY="$(sed -n 's/^LENS_ADMIN_KEY=//p' .env | head -1)"
[ -n "$KEY" ] || KEY="$(rnd 48)"
grep -q '^LENS_ADMIN_KEY=' .env || echo "LENS_ADMIN_KEY=$KEY" >> .env
grep -q '^LENS_ADMIN_KEY=' ../.env 2>/dev/null || echo "LENS_ADMIN_KEY=$KEY" >> ../.env
echo "✓ secrets ready (lens/.env, and the shared admin key in Hyperplane's .env) — keep copies somewhere safe; never commit them"
mkdir -p data backups
docker network create qf-edge >/dev/null 2>&1 && echo "✓ network qf-edge made" || echo "· network qf-edge already there"
docker compose up -d --build
(cd .. && docker compose up -d api web) >/dev/null 2>&1 && echo "✓ Hyperplane's admin server restarted with the Lens key"
echo "✓ Lens is running. Approve people in Hyperplane's dashboard: ⚙ Admin → Lens admin."
