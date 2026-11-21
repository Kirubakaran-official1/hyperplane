# Hyperplane LENS: notes for Claude

## What it is
- QuantFriday's back-testing lab, a **separate application** living in the `lens/` folder of the Hyperplane repo (owner 2026-11-21: "use
  the same Hyperplane git, but different docker … if Lens stops it must not affect Hyperplane").
- It has its own docker stack, database, secrets and sign-in. Never read Hyperplane's database or secrets. Reuse Hyperplane code by
  **copying** it here.
- **Admin:** there is no Lens admin page. Hyperplane's dashboard has **⚙ Admin → 🔭 Lens admin** (`frontend/src/lens.jsx`), split from
  "Hyperplane admin" in `server.jsx` AdminArea.
  - Hyperplane's `api` (`main.py` `/api/admin/lens/*`, `admin_user`) calls `lens-api:8000/internal/admin/*` over `qf-edge` with
    `LENS_ADMIN_KEY` (in both `.env` files, made by `lens/deploy/setup.sh`).
  - lens-web passes only `/api/*`, so `/internal` is never public.
  - Lens down → 503 "Lens is not running" in that tab only.
- The owner, the plain-words rules and the UI rules are the same as Hyperplane's. See that repo's `CLAUDE.md` §2 / §2a.

## Stack
| Part | What it is |
|---|---|
| `lens-api` | FastAPI, `backend/app/main.py` |
| `lens-db` | Postgres 16, Lens's own |
| `lens-web` | Caddy: Vite + React pages in `frontend/src`, plus `/api` → lens-api |
| `lens-backup` | Nightly `pg_dump` into `./backups` |

- Compose project name `lens`. `lens-web` joins the external network `qf-edge`.
- Hyperplane's Caddy has `{$LENS_DOMAIN} { reverse_proxy lens-web:80 }`.
- `lens-web` trusts private ranges for X-Forwarded-*, so the visitor's address and https come through.
- Locally, Lens is published only on `127.0.0.1:${LENS_LOCAL_PORT:-8081}`.
- Hyperplane's `deploy/deploy.sh` updates Lens after Hyperplane when `lens/.env` exists. A Lens failure only warns.

## Sign-in (Phase 2, 2026-11-21)
**Security, the same as Hyperplane's customer service:**
- scrypt passwords (`security.py`, copied);
- the same answer for a wrong email or a wrong password, with a dummy hash for equal timing;
- 5 failures → locked for 15 minutes;
- 10 tries per 15 min per address and per email;
- 5 sign-ups per hour per address;
- `session_ver` signs a person out on every device when they are blocked or their role changes.

**Cookie:** `lens_session`, signed with `LENS_SECRET` (salt `lens-session`), 7 days, HttpOnly, SameSite=Strict, Path=/. Host-only: never
`Domain=`.

**Request guard:** every non-GET needs the header `X-Lens: 1`, and an Origin header (if present) must match the host. Otherwise 403.

**Accounts:** sign up → `pending` → a Hyperplane admin approves in ⚙ Admin → Lens admin (`approved_by` = that admin's name) → the person
can sign in. Then `blocked` / `approved` as needed. Lens users have no roles; the `role` column is unused.

**Tables:**
- `lens_users`;
- `lens_logins`: every attempt, with result, device and address. Shown in ⚙ Admin → Lens admin → Sign-ins;
- `lens_admin_log`.

**Pages:**
- `/`: sign in / request access (Hyperplane's layout: `copied.css.js` = Hyperplane's tokens + sign-in styles);
- the Lens home.

**Tests:** Hyperplane scratchpad `lens_test.py`, 46 checks. They cover:
- the brief's 5 acceptance tests;
- approval through Hyperplane's admin;
- `/internal` never public, with no key or a wrong key → 403;
- the cookie flags, the request guard, block and lock-out;
- the front door;
- Lens stopped → Hyperplane fine;
- the Admin-tab split.

## Next: Phase 3, Fyers Data Lab (in Hyperplane's ⚙ Admin → Lens admin)
- The owner's brief is in the conversation of 2026-11-21.
- The owner is on the **Standard (free)** plan: only 10 expired-contract intraday calls a day. The full download needs Prime.
- Fyers' written consent (Terms §12) is required before building a stored copy of the data.
