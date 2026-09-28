# CLAUDE.md — Hyperplane

Read this first in every new session. It is the complete context for this project: what it does, how it is built,
the exact trading rules, how to test, how to deploy, and how the owner wants to work.

---

## 1. What this project is

**Hyperplane** is a private quant dashboard for Indian stocks (NSE), built for one trader (Kirubakaran).

1. A **scanner** (`backend/scanner/chartink_fast.py`) scrapes 4 raw "output table" screeners from ChartInk plus index
   lists, then **calculates every zone / NR / virgin / overlap signal in Python** (it replaced ~300 separate screener
   scrapes). It writes `detailed_signals_YYYYMMDD.xlsx` (18 sheets) and can send it to Telegram.
2. A **collector** (`backend/app/worker.py`) runs the scanner on a schedule (default 09:45 and 14:30 IST, weekdays)
   and on demand ("Sync now"), and stores each result in **PostgreSQL** as a "collection".
3. A **web app** (React, `frontend/`) with login shows the collections: latest by default, any older day or date range,
   Admin settings, and a Compare view (intraday / day / week / month / custom).
4. Everything runs with **Docker Compose** on the owner's Oracle Cloud Always-Free server
   (Ampere ARM, 2 OCPU, 12 GB RAM, Ubuntu). Other cron jobs run on that server too — keep resource use small.

---

## 2. How the owner wants to work (important)

- **Never invent a trading rule.** ChartInk conditions must match the owner's real scans exactly. If a rule is not
  known, **ask for a screenshot of that ChartInk scan** — do not guess, and do not add "just in case" settings,
  per-scan exceptions or alternative modes to cover a doubt. (He said: "don't hallucinate", "if you have a doubt ask
  me, don't do these types of custom code".)
- **All scanner settings live in the SETTINGS section at the top of `chartink_fast.py`.** Don't scatter constants.
- **The Excel output must stay compatible.** Existing sheets and columns never change; new sheets are appended at the
  end. The dashboard reads the workbook as-is, so old files must keep loading.
- **Test before delivering.** Run the scanner tests, run the app, check it in a browser. Say plainly what was and
  wasn't tested.
- He works on **Windows** (`D:\Trading\...`), edits locally, pushes to GitHub, then deploys to the server (see §9).
- He is new to Git, SSH, Docker and GitHub. When setup or deploy steps are involved, give exact commands, say
  where to run each one (his PC or the server), and explain in plain words what each step does.
- He writes short messages with typos; read for intent. Reply clearly and briefly; explain trading logic in plain words.
- UI preferences he has asked for: copy buttons everywhere (plain `A,B,C` and TradingView `NSE:A,NSE:B,`), small "i"
  info buttons instead of long text, filters on every list, bubble view by default for sector/industry, a minimal
  pull-out side nav (☰ in the tab bar, takes no space when closed), equal-height widget rows, dark theme first.

---

## 3. Repository layout

```
hyperplane/
├── CLAUDE.md                     ← this file
├── README.md                     ← owner's step-by-step setup: local → GitHub → Oracle server
├── docker-compose.yml            web (Caddy) · api · worker · db (Postgres 16-alpine) · backup · duckdns (optional)
├── config.example.ini            → config.ini (NOT in git): [app] secret_key, [users], [telegram]
├── .env.example                  → .env (NOT in git): DOMAIN, POSTGRES_PASSWORD, DUCKDNS_*, BACKUP_KEEP_DAYS
├── .github/workflows/deploy.yml  push to main → SSH to server → bash deploy/deploy.sh
├── deploy/  deploy.sh (git pull + compose up --build) · backup.sh (02:30 nightly pg_dump) · restore.sh
├── backend/
│   ├── Dockerfile                python:3.12-slim + chromium + chromium-driver (one image for api AND worker)
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py               FastAPI: auth, collections, sync, jobs, compare, admin
│   │   ├── worker.py             scheduler + job runner (runs the scanner, stores results, retention)
│   │   ├── store.py              xlsx → {sheet: rows} gzip JSON + snapshot_stocks rows
│   │   ├── db.py                 psycopg pool, schema (CREATE IF NOT EXISTS), settings
│   │   ├── schedule.py           due slots / next runs (Asia/Kolkata via APP_TIMEZONE)
│   │   └── config.py             reads config.ini (auto-reload on change)
│   └── scanner/
│       ├── chartink_fast.py      THE SCANNER (single file, ~3.7k lines)
│       └── tests/                rule tests + raw_sample/ — NOT in this repo yet (see §8)
└── frontend/
    ├── src/dashboard.jsx         ALL dashboard widgets (~6k lines, one file) — exports Dashboard + helpers
    ├── src/server.jsx            Root: login, DataPicker, AdminTab (incl. Sync now), CompareTab, UserMenu, api()
    ├── src/main.jsx              mounts <Root/>
    ├── Dockerfile                node build → caddy:2-alpine serving /srv
    └── Caddyfile                 {$DOMAIN}: /api/* → api:8000, everything else → SPA; automatic HTTPS
```

Data on the server (all git-ignored): `data/postgres/`, `data/files/` (Excel files `excel/`, scanner work dirs
`runs/job_N/`), `data/caddy/` (certificates), `backups/`.

---

## 4. Data flow

```
ChartInk (4 raw tables + 6 index lists + master)          ← Selenium/Chromium, Copy→table clipboard capture
   → build_market_frame()  one row per stock, all TF OHLC 0..12, zones, virgin zones
   → compute_all_signals() zone + NR + virgin + trend/flag + overlap masks (vectorised numpy)
   → same report pipeline as the old scraper → save_excel_with_enhanced_sheets() → detailed_signals_*.xlsx
   → worker: workbook_to_sheets() → snapshots.data_gz (gzip JSON) + snapshot_stocks (per stock)
   → browser: GET /api/snapshots/{id}/data → mapDB(rawDB) → Dashboard (identical to loading the Excel file)
```

The browser receives exactly what `XLSX.utils.sheet_to_json(ws, {defval:""})` would give, so **any new sheet the
scanner adds reaches the dashboard with no database change**.

### Raw ChartInk tables (`RAW_DATA_URLS`)
| key | screener | contents |
|---|---|---|
| daily_zones | raw-data-5 | close, prev closes (d/w/m/q/y), %change, volume, sector, industry, all zones D/W/M/Q/Y, daily OHLC 0..12 |
| week_month | week-and-month-data | weekly + monthly OHLC 0..12 |
| quarter_year | quarterly-and-yearly-data | quarterly + yearly OHLC 0..12 |
| virgin_zones | virgin-data | top/bottom zone of the current + last 4 bars for W/M/Q/Y (parsed positionally, `vz_<tf><i>_<top|bottom>`) |

Index lists (`capital_urls`): FNO, Nifty_LargeCap_100, Midcap_150, SmallCap_250, MicroCap_250, Nifty_500.
The raw scans already keep only LTP > 10 — **the code applies no extra price filter.**

Scanner CLI (still works standalone): `python chartink_fast.py [--offline raw_YYYYMMDD] [--no-telegram]
[--validate --only zone|nr --limit N --filter TEXT]`. `--validate` scrapes the original ~300 screeners and writes
`validation_report_YYYYMMDD.xlsx` comparing them with the calculated signals (slow; for calibrating rules).

---

## 5. Trading rules (exactly as implemented)

Zone vocabulary per timeframe (from raw-data-5): **top band** = `top_near .. top_zone`, **bottom band** =
`bottom_zone .. bottom_near`. "Zone high/top" = `top_zone`, "zone low" = `bottom_zone`. Timeframes D W M Q Y.

### NR / mother candle — CONFIRMED from the owner's scans
- Mother = the candle **N bars ago** (N = 4..12, TFs D W M Q Y; names like `W_NR_5W_BO`, `M_N_4M_HN`).
- Mother must have a real body: `|O-C| >= (H-L) * NR_MOTHER_BODY_PCT/100`. The % is an **Admin setting**
  (`nr_mother_body_pct`, default 60, owner's choice); the worker sets it on the scanner before each run.
  The old ChartInk "1.5" factor equals 50%.
- Bars 1..N-1: **body only** (open AND close) inside mother High..Low. **Wicks may go outside.** (Owner: "I want only
  the body inside the mother candle, not wick".)
- Latest close decides: **BO** close ≥ mother High · **BD** close ≤ mother Low · **HN** inside and close ≥ High×0.95
  · **LW** inside and close ≤ Low/0.95 (`NR_NEAR_RATIO = 1.9/2`) · **B2NR** bar 1 closed below Low, now back inside.
- **No trend condition, no price filter, all stocks** (no Nifty-500 limit).
- The owner's ChartInk NR scans contain a greyed-out "close ≤ High×2/1.9" breakout cap — it is **off**.

### Virgin BO/BD — breakdown CONFIRMED (4Y_VG_BD_YLZ), breakout = mirror (not yet confirmed by screenshot)
- For i = 1..N: `High_i ≤ top_zone_i` and `Low_i ≥ bottom_zone_i` (each bar's OWN zone, from virgin-data).
- Breakdown: close ≤ current bottom_zone of that TF. Breakout: close ≥ current top_zone of that TF.
- All stocks, no price filter (owner removed the Nifty-500 and price limits on purpose).

### Overlap / retracement — CONFIRMED (W_CLOSE_BLW_M_Z_LOW_OVERLAP_MZL_YZH, DAILY_CLOSE_NEAR_MZ_LOW_OVERLAP_MLZ_QHZ)
- Overlap low: `<a>.bottom_zone` inside `<b>` top band (≤ b.top_zone and ≥ b.top_near).
- Overlap high (mirror): `<a>.top_zone` inside `<b>` bottom band.
- Break: close beyond `<a>`'s own zone level; `weekly_*` names need Weekly Close **crossed** it (prev weekly close on
  the other side). Retracement: close inside `<a>`'s band.

### Rules NOT yet confirmed by a screenshot (ask before changing; verify with `--validate`)
- Trend / flag signals (`last_4mon_up_trend_with_close_...`): currently N completed bars each closing higher/lower.
- "Near_and_abv/blw_Overlap_..." stacked-support/resistance signals: currently "both bands intersect".
- The basic zone signals (close above/below/near/crossed a TF zone) are implemented from their names.

### Extra sheets written after the original 14 (never reorder)
| sheet | what |
|---|---|
| Zone_Levels | per stock: price, prev closes, per TF `{L}_Top_Zone/_Top_Near/_Bottom_Near/_Bottom_Zone/_Position/_Dist_Top_Pct/_Dist_Bottom_Pct`, Is_FNO, Is_Nifty_500 |
| Return_Potential | monthly-zone breakout entry → Q/Y zone targets; stop = other edge of the monthly band; Status Triggered / Near Entry (≤ `NEAR_ENTRY_PCT`) / Waiting / Target Q/Y Hit |
| Price_Health | long-term quality from yearly candles: **POOR** > 70% below multi-year peak · **WEAK** > 50% below peak or lower than 5 years ago · **HEALTHY** otherwise (`HEALTH_*` settings) |
| Failed_NR | NR trap: after the mother, bar(s) closed beyond one edge (failed BO/BD), no close beyond the other edge, other bodies inside, latest close back inside and near the OPPOSITE edge (same 1.9/2 rule). Failed BO → LONG at mother Low (stop Low, target High); mirror SHORT. Biggest mother per stock+TF kept. |

All 18 sheets: Detailed_Signals, Flat_Data_For_Slicers, Signal_Matrix, Signal_Summary, Top_Opportunities,
Bias_Distribution, Signal_Type_Analysis, Multi_Timeframe_NR, Strong_Conviction, Virgin_BO_BD_Analysis,
Sector_Analysis, Industry_Analysis, NR_Breakout_Sector_Industry, Master_Stock_Data, Zone_Levels, Return_Potential,
Price_Health, Failed_NR. Symbols in Flat_Data_For_Slicers are TradingView style `NSE:SYM,` — always clean with
`replace("NSE:","").replace(",","").strip()` (JS `cleanSym`, Python `store.stock_rows`).

---

## 6. Dashboard (frontend/src/dashboard.jsx)

- `mapDB(rawDB)` turns the workbook JSON into `db = {flat, top, summary, strong, mtnr, virgin, sig_stocks, master,
  masterMap, sectorAnalysis, industryAnalysis, nrSectorIndustry, zoneLevels, returnPotential, priceHealth, failedNR, has}`.
  Several files/collections = `versions[] = {fileName, db, dateValue, dateLabel}`; `mergeDBs()` combines a scope.
- `Dashboard({rawVersions, theme, setTheme, headerCenter, headerRight, extraTabs, emptyState})` — the app shell.
  Tabs: Control Tower, Sector & Industry, Slicer, Opportunities, Horizon, Conviction, Multi-TF NR, Virgin BO/BD,
  Signals, Master List, (+ Trend & Versions when >1 version), + extraTabs from server.jsx (Compare, Admin).
- **Global stock-quality filter** (Healthy/Weak/Poor tick-boxes, unrated counts as Weak) is applied to every tab via
  `healthIndex` → `excludedSymbols` → `filterDB`. Default **Healthy only** (`HEALTH_DEFAULT`), remembered in
  localStorage key `hp_health_allow_v2`.
- **Control Tower** (`ControlTowerCombined`) order: data scope → Market Intelligence (KPIs, Alpha rankings,
  Sector/Industry bubble panels, Movers·F&O·Flow·Bias) → Focus Command (Priority radar, HTF×LTF confluence, Focus
  map, Alignment matrix, Sector×TF heat, Near breakout · Relative strength · Conflict · Industry hotspots) → Setup
  Scanner (Zone Breakout Analyser, Stacked setups, setup lists, NR Trap) → Opportunities → Return Expectations →
  Watchlist Builder. Side nav `CTSideNav` (drawer, ☰ in the tab bar): quality, Direction All/Long/Short, F&O only,
  segment (All / Nifty 500 / Large 100 / Mid 150 / Small 250), sector, and jump links to `Anchor` ids (`ct-*`).
  Direction locks the side of Opportunities / Return Expectations / NR Trap / breakout analyser via `useLockable`.
- Key logic: `buildFocusModel` (score, TF ladder, dir per stock), `SETUP_DEFS` + `stockSetups`,
  `buildOpportunities` (zone path + NR nested/domino; conviction High ≥ 9, Medium ≥ 6; targets Q/M/W),
  `buildReturnRows` (any entry TF D/W/M/Q, any exit TFs, from Zone_Levels), `zoneBreakRows` (broke a zone, still
  within ≤1/2/3/5 % of the level; Fresh = previous close of that TF was on the other side), `NRTrapSection`.
- **Timeframe Signal Flow** (`StrategyFlowPanel`): the scanner writes `Timeframe` only on NR rows of
  Flat_Data_For_Slicers (zone rows are blank), so the widget derives D/W/M/Q/Y with `classifySignal()` and colours each
  signal by its own direction. Use `classifySignal()` whenever a signal's timeframe is needed — never `r.Timeframe`.
- **Sector / industry per timeframe**: `TfPicker` (All · D · W · M · Q · Y) on the Control Tower sector + industry
  panels and at the top of the Sector & Industry tab. All = the scanner's sheets as-is. D..Y = `tfSectorIndustry()`:
  same columns and same strength formula (`attachStrength`, 40% net bias + 30% breadth + 30% momentum), counting only
  that TF's signals, with breadth/momentum from `Price / Prev_<TF>_Close` (Zone_Levels; D uses master Change_Pct).
  Verified: summing D..Y reproduces the sheet's net bias exactly; D reproduces stocks/advancing/declining. The sheet's
  Total_Signal_Count is a bit higher because the scanner double-counts signals on both the long and mixed lists.
- **Compare tab** (`CompareTab`, server.jsx): mode dropdown Intraday / Day over day / Weekly / Monthly / Custom
  (`compareFrom`: previous week = last collection before Monday, previous month = before the 1st), a date + time
  `CollectionPicker` per side, and clickable stat tiles (`STAT_FILTERS`) that filter the table.
- **Market Bias Distribution** (`BiasDistributionPanel`) shows the scanner's per-stock `Trading_Bias`, which counts
  zone signals only: NR-only stocks come out NEUTRAL, and one retracement signal makes the stock RETRACEMENT. Left as
  is pending the owner's answer (§10).
- Old Excel files without the new sheets must keep working (sections show a "needs the new scanner" note).
- Styling: CSS variables in the `CSS` string (`.app-shell.theme-dark/.theme-light`), inline styles, IBM Plex Mono +
  Inter. Sticky header 52 px + tab bar 44 px → anchors use `scrollMarginTop: 104`. Don't set `overflow-x:hidden` on
  html/body (it breaks sticky) — `overflow-x: clip` is used.

## 7. Server app

### API (backend/app/main.py) — cookie session `hp_session` (itsdangerous, `session_hours`)
| route | who | what |
|---|---|---|
| POST /api/login, /api/logout, GET /api/me | all | users from config.ini `[users]` `name = password[, admin]`; 8 tries / 5 min per IP |
| GET /api/snapshots?date_from&date_to, /api/snapshots/latest | user | collection list (meta only) |
| GET /api/snapshots/{id}/data | user | gzip JSON workbook, `Content-Encoding: gzip`, cached immutable |
| GET /api/snapshots/{id}/excel | user | original xlsx |
| POST /api/sync | admin | queue a manual collection (returns the running one if busy). The button is in the Admin tab only |
| GET /api/jobs, /api/jobs/{id} | user | history / live log |
| POST /api/jobs/{id}/cancel | admin | cancel a queued job |
| GET /api/compare?a=&b= | user | per stock: price a→b, move %, bias, signals, new/dropped signals, health |
| GET/PUT /api/admin/settings, POST /api/admin/import, DELETE /api/admin/snapshots/{id}, GET /api/admin/system | admin | schedule, retention, Telegram toggle, import old xlsx, status |

### Database (created by `db.init_db`, no migrations tool — add new tables/columns with IF NOT EXISTS)
`snapshots` (taken_at, trade_date, slot, source scheduled|manual|import, label, stocks, signals, sheets[], data_gz,
size_bytes, excel_path) · `snapshot_stocks` (per stock summary, PK snapshot_id+symbol) · `jobs` (queued/running/done/
failed/cancelled, log, one scheduled job per trade_date+slot) · `settings` (JSONB key/values incl. `worker_heartbeat`).

### Settings (Admin tab; defaults in `db.DEFAULT_SETTINGS`)
schedule_times ["09:45","14:30"] · weekdays_only true · skip_dates [] (NSE holidays) · catch_up_minutes 180 ·
retention_days 0 (forever) · manual_keep all|latest · telegram_enabled true · nr_mother_body_pct 60.

### Worker
Polls every 15 s: queue due slots → claim next queued job → `run_scanner()` in `data/runs/job_N` (chdir, stdout
tee'd into `jobs.log` every 5 s) → move Excel to `data/excel/` → `save_snapshot`. Daily cleanup: retention,
run dirs > 7 days, jobs > 120 days. `SCAN_OFFLINE_DIR` env = recalculate from a raw snapshot instead of scraping
(tests). Chromium: `/usr/bin/chromium` symlinked to `/usr/bin/chromium-browser`, driver `/usr/bin/chromedriver`.

---

## 8. Develop and test

### Scanner rule tests (run after ANY scanner change)
```
python backend/scanner/tests/run_all.py          # NR, NR rules, zones, virgin, health/trap
```
**The `tests/` folder (and `raw_sample/`) is not in this repo** — ask the owner for it. Until then, check scanner
changes by importing the module and running the rule on real data, and test with a real collection
(`data/files/excel/detailed_signals_*.xlsx`; older files are in `D:\Trading\Code\New Selenium method\oracle\chartink\`).

### Run the whole app without Docker (fast loop)
```
# PostgreSQL 16 running locally with user/db "hyperplane"
export CONFIG_PATH=$PWD/config.ini DATA_DIR=$PWD/data/files PYTHONPATH=$PWD/backend \
       DATABASE_URL=postgresql://hyperplane:hyperplane@127.0.0.1:5432/hyperplane \
       SCAN_OFFLINE_DIR=$PWD/backend/scanner/tests/raw_sample
(cd frontend && npm ci && npm run build)
STATIC_DIR=$PWD/frontend/dist python -m uvicorn app.main:app --port 8000     # from backend/ (or PYTHONPATH)
python -m app.worker                                                            # second terminal
# open http://localhost:8000, log in, press Sync now (offline mode ≈ 45 s)
```
For frontend-only work: `cd frontend && npm run dev` (Vite proxies /api to :8000).

### With Docker (what production runs)
`docker compose up -d --build` · logs: `docker compose logs -f worker` · local test: `DOMAIN=:80` in `.env` → http://localhost.

### Checks before finishing a change
1. `python backend/scanner/tests/run_all.py` passes (scanner changes; when the tests folder exists).
2. `cd frontend && npm run build` succeeds (frontend changes).
3. App runs; log in; latest collection loads; Sync now completes; Admin + Compare open; no console errors.
4. `docker compose config -q` passes (compose changes).
5. Shell scripts stay LF (`.gitattributes`) and are called with `bash deploy/...` (Windows loses the exec bit).

## 9. Deploy

- Repo: **https://github.com/Kirubakaran-official1/hyperplane** (private, branch `main`). Site:
  **https://hyperplane.duckdns.org**. Server clone: `~/hyperplane` (user `ubuntu`), pulled with a read-only deploy key.
- Owner's push routine (on his PC, in the project folder): `git add .` → `git commit -m "..."` → `git push`.
  The Git identity is set locally for this repo only (not `--global`).
- Planned flow: push to `main` → GitHub Actions (`deploy.yml`, repository secrets SERVER_HOST / SERVER_USER /
  SERVER_SSH_KEY) → `bash deploy/deploy.sh` on the server (`git pull --ff-only` + `docker compose up -d --build`).
- **GitHub Actions is currently disabled on the owner's GitHub account** (account-level block; only GitHub Support
  can lift it — he was advised to open a ticket). Until it is re-enabled, deploy by hand after each push:
  `ssh ubuntu@<server-ip>` then `cd ~/hyperplane && bash deploy/deploy.sh`. A server-side cron that pulls and
  deploys when `main` changes was offered as an alternative; not built yet.
- Only changed images rebuild; data volumes are untouched. HTTPS by Caddy for `DOMAIN`. Oracle needs ports 80/443 open
  in the VCN security list AND in iptables (see README Part 3). Backups: `backups/hyperplane_*.dump` nightly, 14 days.

## 10. History (for context)

- Started as a Selenium scraper of ~300 ChartInk screeners → replaced by 4 raw tables + Python calculation (11 page loads).
- Dashboard grew as a single-file HTML artifact ("Hyperplane", versions v5 → v8) that loaded the Excel by drag-and-drop;
  its code is now `frontend/src/dashboard.jsx` (the `App` shell became `Dashboard`, data comes from the API).
- Recent owner requests implemented: stock-quality filter on all pages, Return Expectations with selectable entry/exit
  TFs, NR Trap, Zone Breakout Analyser (breakouts still near the level), side-nav drawer with filters, Nifty 500 segment,
  hyperplane logo (plane + normal vector + two point classes), Telegram retry on network errors.
- 2026-09: Sync now is admin-only and lives in the Admin tab; NR mother-candle body % moved to Admin (default 60);
  stock quality defaults to Healthy only; Nifty 500 moved into the side-nav segment choices; Timeframe Signal Flow
  "Unknown" bucket fixed. Sector/industry timeframe views; Compare tab with week/month modes, proper collection pickers
  and stat-tile filters; "NR Expansion" setup renamed "NR Breakout · Breakdown".
- Open questions to ask the owner (don't guess): virgin **breakout** scan screenshot; a trend/flag scan screenshot;
  a "Near_and_abv_Overlap" scan screenshot; **Market Bias** — should NR-only stocks take their bias from the NR
  direction (BO/HN = Long, BD/LW = Short), and should RETRACEMENT apply only when there are no long/short signals?
