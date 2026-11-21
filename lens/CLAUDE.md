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

## Phase 3: Fyers Data Lab (2026-11-21)
**Fyers documentation facts (read 2026-11-21, fyers.in/api-docs/v3):**
- Data limits:
  - Standard: 5/s, 50/min, 5,000/day; expired F&O minute data 10 requests/day; index minute history the last 1 year; daily the last 5
    years; expired F&O daily the last 2 years.
  - Prime: 10/s, 500/min, 5,00,000/day; minute history from 3 Jul 2017; expired F&O from 10 Oct 2018 (NSE), 7 Aug 2023 (BSE).
- Minute candles: 100 days per request. Day candles: 366 days. `expiry-dates`: ≤366 days per request.
- Expired data answers have `columns` + `candles`; Greeks can be null; `s` = ok / no_data / error; bad input → 422, code -50.
- Tokens expire at 06:30 IST. Token errors are -8, -15, -16, -17. The login endpoint allows 10 requests per 2 minutes per IP.
- `redirect_uri` must equal the app's Redirect URL. Fyers recommends a URL you control. The default is Fyers' page.
- Fyers is behind Cloudflare: Python's default "Python-urllib" identity gets error 1010 (HTTP 403), so every request sends `UA`.

**Screen:** Hyperplane ⚙ Admin → 🔭 Lens admin → 📊 Fyers Data Lab (`frontend/src/fyerslab.jsx`). The admin server passes
`/api/admin/lens/fyers/*` to `lens-api /internal/admin/fyers/*`. Sub-tabs: Connection, Usage & limits, Tests, Bulk download, Data checks,
Depth & coverage, Compliance.

**Fyers calls (`backend/app/fyers.py`):** plain HTTPS. The addresses come from fyers-apiv3 3.3.0; there is no SDK.
- Sign-in: `api/v3/generate-authcode` → `/api/fyers/callback` → `validate-authcode` with appIdHash = sha256(app_id:secret).
- Data: `/data/history`; `/data/history/fno/expired/{expiry-dates, underlying-symbols, historical-data}`.
- Authorization header: `APPID:TOKEN`.

**The sign-in:**
- The admin clicks Connect → `login_url` stores a one-time `state` (10 min).
- Fyers redirects to `https://lens.quantfriday.in/api/fyers/callback` (public Lens route) → `finish_login` checks the state (single
  use), exchanges the code and stores the token.
- **Owner's flow:** the owner's Fyers app keeps Fyers' own page (`FYERS_PAGE`, `https://trade.fyers.in/api-login/redirect-uri/index.html`)
  as its Redirect URL. After Connect, the admin copies the whole address from that page and pastes it into "Finish connecting".
  `POST /internal/admin/fyers/code` → `finish_from_link`.
- Without a `state` in the pasted text, the newest Connect click of the last 10 minutes is used. A code alone, with no Connect just
  before, is refused.
- `token_valid`: the token works until 06:30 IST the next morning (Fyers docs), or until Fyers refuses it (`token_bad`).
- The app secret and the token are sealed with AES-256-GCM (HKDF from LENS_SECRET). They are never returned to the screen.

**Limits:**
- 80% of the plan (`PLANS`): Standard 4/s, 40/min, 4000/day and 8 expired-contract minute requests/day; Prime 8/s, 400/min.
- Sliding windows of 1.05 s and 61 s.
- -429 → wait `LIMIT_WAIT` (65 s, a full window). After **2** hits in a day → `QuotaWait` until tomorrow. Fyers blocks a user for the
  day after the per-minute limit is exceeded more than 3 times.
- Every call is logged in `fyers_calls`, and the day's counts come from there (`usage`).
- Day allowance used up → `QuotaWait` → the job is `waiting` until 00:05 IST.

**Worker (`lens-worker`, `app/worker.py`, 768 MB, 1 CPU):**
- Runs one job at a time from `fyers_jobs`: queued / running / waiting / paused / cancelled / done / failed.
- A restart re-queues the job, and the manifest rows that were `running` go back to `pending`.
- Kinds: depth (P2), coverage (P3), speed (P4, Prime only), bulk, quality (P5), nightly (18:45 IST weekdays, the index top-up).

**Consent gate:** bulk, speed and nightly need `consent_on` (Compliance: date + reference). This is checked both in the route and in the
worker.

**Storage (`app/lab.py`):** market candles are never stored in Postgres.
- Parquet, zstd: ts INT32 epoch seconds, prices FLOAT, volume/oi BIGINT, Greeks FLOAT.
- Written as a CSV in /tmp → DuckDB COPY (memory_limit 256MB, 1 thread, named columns c0…). `DISTINCT ON ts` drops duplicate minutes.
- Layout:
  - `data/market/spot/{IDX}/{from}_{to}.parquet` (100-day pieces);
  - `futures/{IDX}/{CONTRACT}.parquet`;
  - `options/{IDX}/{EXPIRY}.parquet`: one per expiry, packed from `{EXPIRY}/_parts` once all of its contracts are finished.
- About 14 bytes a candle on the stand-in's data.

**Manifest (`fyers_manifest`):** one row per (symbol, range).
- The plan runs first: daily index levels → expiry lists → contract lists. Options: ATM ±N around the index's last-7-day range, from the
  previous expiry until this one. Futures: the last 95 days of each contract. Index: 100-day pieces.
- Then the download: index, then futures, then options newest → oldest.
- Status per row: pending / running / done / no_data / failed (up to 4 tries). It never fetches a finished row again.

**`parse_strike`:** the trailing digits before CE/PE that are a multiple of the step and within ±30% of the index level.

**Tests (Hyperplane scratchpad):**
- `fyers_mock/fyers_mock.py`: a stand-in Fyers, test only. It answers -429 every 9th request and puts in impossible candles.
- `lab_test.py`: the end-to-end test. It covers the sign-in, sealed secrets, the consent gate, depth, the limits, a bulk download with
  pause / resume / worker restart, packing, RSS < 500 MB, the data checks, Standard's day allowance, an expired sign-in, and the screens.
- `lab_test.py` points Lens at the stand-in through `FYERS_API_BASE` in `lens/.env` and removes that line afterwards.
- **Real Fyers is never called by the tests.**
