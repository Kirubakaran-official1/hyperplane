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
| technicals | technical-data-29 | **optional** (`OPTIONAL_RAW_TABLES`: a failed scrape doesn't stop the run). `d_rsi`…`y_cci` → `tech_<tf>_<rsi|adx|bbu|bbl|macd|st|cci>` by keyword, left-merged (never adds stocks) |

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

### Zone retest (Zone_Retest sheet) — owner's words, 2026-09-29
- "Last month closed above the last month zone and now LTP is near the current month zone bottom", same for W/M/Q/Y
  (`ZONE_RETEST_TFS`), mirror for sells. BUY: previous bar close > previous bar's OWN top_zone (virgin-data) and
  close inside the current bottom band (bottom_zone..bottom_near). SELL: previous close < previous bar's own
  bottom_zone and close inside the current top band. No Daily (raw scans have no previous-day zones). No stop/target.

### Rules NOT yet confirmed by a screenshot (ask before changing; verify with `--validate`)
- Trend / flag signals (`last_4mon_up_trend_with_close_...`): currently N completed bars each closing higher/lower.
  The owner described the trend as **each bar's zone higher than the one before** ("4 month zone is less than the 3rd
  month zone"), which differs — not changed yet; get the exact scan (which zone edge, how many bars) first.
- "Near_and_abv/blw_Overlap_..." stacked-support/resistance signals: currently "both bands intersect".
- The basic zone signals (close above/below/near/crossed a TF zone) are implemented from their names.

### Extra sheets written after the original 14 (never reorder)
| sheet | what |
|---|---|
| Zone_Levels | per stock: price, prev closes, per TF `{L}_Top_Zone/_Top_Near/_Bottom_Near/_Bottom_Zone/_Position/_Dist_Top_Pct/_Dist_Bottom_Pct`, Is_FNO, Is_Nifty_500 |
| Return_Potential | monthly-zone breakout entry → Q/Y zone targets; stop = other edge of the monthly band; Status Triggered / Near Entry (≤ `NEAR_ENTRY_PCT`) / Waiting / Target Q/Y Hit |
| Price_Health | long-term quality from yearly candles (current + 12 years): **POOR** > 70% below the peak, or crashed ≥ 90% with the bottom in the last 5 years, or a round trip (crashed ≥ 80% and now ≥ 10× its 3-year low — the owner's MBECL example 2026-10-04: 114 → 2 → 494) · **WEAK** > 50% below peak, lower than 5 years ago, crashed ≥ 80% at any time, or ≥ 8× its 3-year low · **HEALTHY** otherwise (`HEALTH_*` settings). Extra columns Worst_Crash_Pct, Worst_Crash_Years_Ago, Run_Up_From_3Y_Low_X. On 3 Oct data: Healthy 1,812 → 1,293 (customer Strong 1,405 → 1,088); HAL/BEL/SBIN/LT/TITAN stay Healthy; old crashes alone only give WEAK (unadjusted demergers, e.g. ADANIENT 2015). Thresholds chosen with the owner's example — tune in the scanner settings. |
| Technicals | per stock: Price + `{TF}_RSI/_ADX/_BB_Upper/_BB_Lower/_MACD/_Supertrend/_CCI` (raw values; only written when the technicals scrape worked) |
| Zone_Retest | see "Zone retest" above: per stock + TF + side, previous close vs previous bar's zone, current zone + band, `Dist_To_Zone_Edge_Pct`, Health |
| Failed_NR | NR trap: after the mother, bar(s) closed beyond one edge (failed BO/BD), no close beyond the other edge, other bodies inside, latest close back inside and near the OPPOSITE edge (same 1.9/2 rule). Failed BO → LONG at mother Low (stop Low, target High); mirror SHORT. Biggest mother per stock+TF kept. |

All 20 sheets (Technicals only when scraped): Detailed_Signals, Flat_Data_For_Slicers, Signal_Matrix, Signal_Summary, Top_Opportunities,
Bias_Distribution, Signal_Type_Analysis, Multi_Timeframe_NR, Strong_Conviction, Virgin_BO_BD_Analysis,
Sector_Analysis, Industry_Analysis, NR_Breakout_Sector_Industry, Master_Stock_Data, Zone_Levels, Return_Potential,
Price_Health, Failed_NR, Zone_Retest, Technicals. Symbols in Flat_Data_For_Slicers are TradingView style `NSE:SYM,` — always clean with
`replace("NSE:","").replace(",","").strip()` (JS `cleanSym`, Python `store.stock_rows`).

---

## 6. Dashboard (frontend/src/dashboard.jsx)

- `mapDB(rawDB)` turns the workbook JSON into `db = {flat, top, summary, strong, mtnr, virgin, sig_stocks, master,
  masterMap, sectorAnalysis, industryAnalysis, nrSectorIndustry, zoneLevels, returnPotential, priceHealth, failedNR, has}`.
  Several files/collections = `versions[] = {fileName, db, dateValue, dateLabel}`; `mergeDBs()` combines a scope.
- `Dashboard({rawVersions, theme, setTheme, headerCenter, headerRight, extraTabs, emptyState})` — the app shell.
  Tabs: Control Tower, Sector & Industry, Slicer, Opportunities, Horizon, Signals, Master List, (+ Trend & Versions
  when >1 version), + extraTabs from server.jsx (Compare, 🎧 Helpdesk, ⚙ Admin). `tabReq={id,n}` switches tab from
  outside (the helpdesk bell). Conviction, Multi-TF NR and Virgin BO/BD tabs were REMOVED on the owner's request
  (2026-10-03): Virgin is a Control Tower setup list; Multi-TF NR is `MTNRCard`, a half-width card in the Setup
  Scanner's setup-card grid (2 per row, uses the Control Tower's filtered list, nav chip). The sheet holds stocks with
  2+ NR patterns on several TFs OR several NR lengths in one TF (Q NR4…NR12); `nrByTf` parses NR_Signals
  (`Q_N_9Q_HN`, `W_NR_4W_BD` → TF, length, BO/BD/HN/LW/B2NR) and the card shows "Monthly ×2 NR4–5 near high" per TF.
  Chips: All (default) · Stacked in one TF · 2+ / 3+ / 4+ TF · F&O only.
- **Global stock-quality filter** (Healthy/Weak/Poor tick-boxes, unrated counts as Weak) is applied to every tab via
  `healthIndex` → `excludedSymbols` → `filterDB`. Default **Healthy only** (`HEALTH_DEFAULT`), remembered in
  localStorage key `hp_health_allow_v2`.
- **Hide indices & ETFs** (side nav, all pages, default on, localStorage `hp_hide_index`): `indexSymbols()` = sector
  "Indices" (416 symbols) + symbol matching `NIFTY|SENSEX|BEES|ETF$` + name with the word ETF / Index Fund / Fund of
  Funds (433 total on 27 Sep, no false positives — FIRSTCRY "Brainbees" is not caught), plus Admin `index_add`, minus
  `index_keep` (settings, served to all users by `GET /api/view-config`). Also drops the "Indices" sector rows.
- **Control Tower** (`ControlTowerCombined`) order: data scope → Sector + Industry bubble panels → Alpha composite
  ranking (`ControlTower`) → Focus Command (Priority radar, HTF×LTF confluence (full width), Alignment matrix,
  Sector×TF heat, Industry hotspots · Near breakout) → Setup Scanner (Zone Breakout Analyser, Stacked setups, setup
  lists (Stacked Setups has Bullish / Bearish / F&O filters), NR Trap, Zone Retest (`ZoneRetestSection`), Trend Pullback (`TrendPullbackSection`, from the
  `last_N…_trend_with_close_nearto_…_zone` signals)) → Opportunities → Return Expectations → Watchlist Builder. Removed on the owner's request
  (2026-09-29): the Market Intelligence header + KPI strip, Top movers, F&O strategy mapper, Timeframe signal flow,
  Market bias distribution, Focus Map, Relative Strength / Weakness, Conflict Zone. Side nav `CTSideNav` (drawer, ☰
  in the tab bar): quality, Direction All/Long/Short, F&O only, segment (All / Nifty 500 / Large 100 / Mid 150 /
  Small 250), sector, industry, and jump links to `Anchor` ids (`ct-*`).
  Direction locks the side of Opportunities / Return Expectations / NR Trap / breakout analyser via `useLockable`.
- Key logic: `buildFocusModel` (score, TF ladder, dir per stock), `SETUP_DEFS` + `stockSetups`,
  `buildOpportunities` (zone path + NR nested/domino; conviction High ≥ 9, Medium ≥ 6; targets Q/M/W),
  `buildReturnRows` (any entry TF D/W/M/Q, any exit TFs, from Zone_Levels), `zoneBreakRows` (broke a zone, still
  within ≤1/2/3/5 % of the level; Fresh = previous close of that TF was on the other side), `NRTrapSection`.
- The scanner writes `Timeframe` only on NR rows of Flat_Data_For_Slicers (zone rows are blank). Use
  `classifySignal()` whenever a signal's timeframe or direction is needed — never `r.Timeframe`.
- **Sector / industry per timeframe**: `TfPicker` (All · D · W · M · Q · Y) on the Control Tower sector + industry
  panels and at the top of the Sector & Industry tab. All = the scanner's sheets as-is. D..Y = `tfSectorIndustry()`:
  same columns and same strength formula (`attachStrength`, 40% net bias + 30% breadth + 30% momentum), counting only
  that TF's signals, with breadth/momentum from `Price / Prev_<TF>_Close` (Zone_Levels; D uses master Change_Pct).
  Verified: summing D..Y reproduces the sheet's net bias exactly; D reproduces stocks/advancing/declining. The sheet's
  Total_Signal_Count is a bit higher because the scanner double-counts signals on both the long and mixed lists.
- Sector & Industry tab: **F&O only** switch (filters to F&O stocks, then recomputes everything with
  `tfSectorIndustry(db, "ALL")` — verified identical to the sheet when unfiltered — and `nrRowsFromFlat`); clicking an
  industry (bubble or table row) filters the NR table and the stock list. The Horizon tab uses the shared
  `StockFilterBar` (F&O · Nifty 500 · sector · industry, `passSF`).
- **Technicals (Control Tower only, Admin `tech_enabled`)**: `techReadings` classifies each indicator per TF with the
  Admin levels (RSI ≥ bull / ≤ bear, MACD > / <, CCI ≥ / ≤, BB = price outside the bands, Supertrend = price above /
  below, ADX below/above its value confirms the Supertrend side). `withTechSignals` adds ONE `TECH` flat row per stock
  per TF (net of its indicators, weight = `tech_weight` × |net|/6, so full agreement = one zone break on that TF) and
  ONLY for stocks that already have zone/NR signals. `classifySignal` returns kind/event `TECH`; everything built on
  the model (radar, confluence, setups, opportunities, sentiment, report) follows. Sector panels recompute "All" when
  technicals are on (tech adds to bull/bear, not to signal counts). Alpha ranking adds `sign(bias) × wnet × weight`.
  `TechCtx` + `TechBadge` = a 5px dot on the corner of every Control Tower ticker (green / red / grey by net
  readings, counts on hover). It is absolutely positioned on purpose: an inline chip overflowed fixed-width ticker
  cells (radar cards, confluence rows, return bars). Other tabs ignore technicals.
  The stock report shows technicals in their own colour-coded table (`TechTable`, built on `techCells`); TECH rows
  are hidden from the timeframe ladder.
- **Technical Quant** (`TechQuantSection`, anchor `ct-quant`, only when technicals are on): breadth grid + algo
  builder. Rules = `{tf, f, op, rhs:"num"|"field", v | rtf+rf}` over close / prev / RSI / ADX / CCI / MACD /
  Supertrend / BB / zone top, top-near, bottom-near, bottom. 10 ready-made algos (`prebuiltAlgos`: per TF bullish =
  close > zone top + RSI/CCI/MACD bull + close > ST + close > BB upper + ADX rule; bearish mirror) built from the Admin
  levels; operators > ≥ < ≤ = ≠; AND / OR with brackets: an algorithm has `join` (AND default) and `rules` whose
  items are conditions or `{group:true, join, rules}` (nesting ≤ 3 levels; `itemText` / `exprText`, `evalItem`;
  ready-made and older algorithms have no join = all AND); "Match: all|any / at least N" counts top-level items. Algorithms are **admin-managed and shared**: setting
  `algos` (None = the ready-made set), edited in Admin → Algorithms with `AlgoEditor`, validated by `_algos` in
  main.py, delivered to everyone via `/api/view-config`. The Control Tower section is read-only.
- **Compare tab** (`CompareTab`, server.jsx): mode dropdown Intraday / Day over day / Weekly / Monthly / Custom
  (`compareFrom`: previous week = last collection before Monday, previous month = before the 1st), a date + time
  `CollectionPicker` per side, and clickable stat tiles (`STAT_FILTERS`) that filter the table.
  "Who got stronger": each new signal adds and each lost signal subtracts `dir × TF_WEIGHT × signal weight`
  (same weights as the Focus score, via `classifySignal` + the Signal_Summary sheet for signal types); split
  Zones / NR; up/down lists, Stronger ▲/▼ tiles and sorts, and a Strength Δ column.
- **Stock report everywhere**: `StockOpenCtx` + `StockReportHost` (wraps every tab in `Dashboard`). Any `SymCell`
  inside opens `StockDeepDive`, or `NoSignalReport` (zone position per TF) when the stock has no signals. The
  Control Tower provides its own `setOpenSym` so the report uses its filtered, multi-file model. Always render
  tickers with `SymCell` (or `FocusSym` inside Focus Command) so they stay clickable.
- Control Tower sector panel is selectable (bubble or list row): the industry panel then shows only that sector's
  industries; both panels share one timeframe. Side nav has Sector + Industry filters (industry list follows the
  sector).
- The scanner's per-stock `Trading_Bias` counts zone signals only: NR-only stocks come out NEUTRAL, and one
  retracement signal makes the stock RETRACEMENT.
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
| GET /api/view-config | user | Admin options the dashboard needs: index/ETF lists, technicals on/off, weight and levels |
| GET /api/compare?a=&b= | user | per stock: price a→b, move %, bias, signals, new/dropped signals, health |
| GET/PUT /api/admin/settings, POST /api/admin/import, DELETE /api/admin/snapshots/{id}, GET /api/admin/system | admin | schedule, retention, Telegram toggle, import old xlsx, status |

### Customer edition — "Hyperplane by QuantFriday" at `/app` (owner's request 2026-10-03)
- **Separate service** `portal` (`backend/app/portal.py`, port 8100, same image) behind Caddy `/app/api/*`. It has NO
  config.ini / data mount and logs in to Postgres as role `hp_portal` (created by `db._setup_portal_role` from
  `PORTAL_DB_PASSWORD`): SELECT on `published` + `customers`, INSERT only the sign-up columns (status stays
  'pending'), UPDATE only the login counters. Verified: it cannot read snapshots/settings, approve itself or delete.
  Own secret `PORTAL_SECRET_KEY`, cookie `qf_session` (path /app, strict, httponly), 7-day sessions tied to
  `customers.session_ver` (block / password reset = signed out everywhere).
- **Brute force:** customer login 10/15 min per IP + 5 wrong passwords → 15 min account lock (in the DB) + 0.6 s delay,
  constant-time compare, same message for unknown email; sign-up 5/hour per IP and the same answer if the email exists.
  Admin/user login: 8/5 min per IP + 5 fails → 15 min per-user lock, constant-time compare, SameSite=Strict cookie.
- **Dashboard lock-down:** Caddy serves `/login.html|.css|.js` (static, no React) and `/app*` publicly; everything else
  (index.html and the dashboard JS that contains the method) only after `forward_auth` → `GET /api/auth/check` (204),
  else 302 to /login.html. Logout goes to /login.html.
- **Customer bundle** = separate Vite build (`vite.app.config.js`, root `frontend/app`, base `/app/`, out `dist/app`);
  `npm run build` builds both. It must NEVER import `dashboard.jsx` (checked: no formula names in the bundle).
- **Published view** (`backend/app/publish.py`, table `published`, last 30 kept): per stock `r` = 5 letters D W M Q Y,
  each G/M/W/"-": score = TF signal net (classify() = Python port of classifySignal, Focus weights, capped ±2) + zone
  position (above +1, top band +0.5, inside 0, bottom band −0.5, below −1) + technicals × tech_weight when on;
  G ≥ 0.5, W ≤ −0.5. Overall Strong/Leaning strong/Mixed/Leaning weak/Weak from the counts. Indices/ETFs excluded
  (same rule + admin lists). Top 10 = no "-", not POOR health, ranked by Σ TF_WEIGHT × (G +1 / W −1). Only
  `{s,n,sec,ind,cap,p,c,r,o}` + `top` + `as_of` leave the server. `publish_mode` setting: manual (default) | auto
  (worker publishes after each collection; failures never fail the job). Admin: ⚙ Admin → 👥 Customers
  (`CustomersTab`): approve / block / expiry / reset / delete / add, publish mode, preview, publish now.
- Payload v3 also carries per stock `f` (F&O), `sc` = SIGNED strength per TF = round(100·tanh(score/2)) in −100..100
  (plus = uptrend strength, minus = downtrend strength, |v| < 24 = sideways; same cut as G/W), `os` (TF-weighted signed
  combined value) and `sectors` / `industries` {A, D..Y}: rows {k, sec, st, nb, n, sig, adv, dec, avg}
  from `sector_stats` (port of tfSectorIndustry + attachStrength; "All" = the sheets unless technicals are on;
  Indices and Unknown sectors excluded).
- Dashboard multi-select bubbles (2026-10-03): `RotationQuadrantChart` takes `selectedKeys` (array → multi-select,
  `onSelect(key)` and the parent toggles) or legacy `selectedKey`; customer look — selected = white ring + dashed halo,
  others dimmed to .28, "N selected · click again to clear". Control Tower: `pickSecs` / `pickInds` ("Sector|Industry"
  keys) — several sectors filter the industry panel; industry bubbles/rows are selectable with one copy for all their
  stocks. Sector & Industry tab: `selSecs` / `selInds` from bubbles, sector cards, industry rows; detail panel only when
  exactly one sector is picked. Both: changing sectors drops industries outside them (all when none left).
- Customer stock card "Combined view" (2026-10-03): stock summary + its sector + industry on the Combined TF and a
  verdict (`combinedView`): Best case / Careful (strong stock, weak sector or industry) / Okay (average group) / Watch
  only (weak stock, strong group) / Avoid / No edge; bidirectional downgrades Best case. `groupState`: strong = st ≥ 55
  or rank in top 25 %, weak = st < 45 and rank in bottom 50 % (absolute-only made 22/25 top stocks "weak" in a weak
  market). Thresholds chosen by Claude — owner may tune.
- Customer navigation + theme (2026-10-03): NO tab buttons in the top bar. Control Tower is the landing page; the logo
  (`.brand-home`) returns to it; `AccountMenu` (name ▾) = Account (modal: email, access until, appearance) · Helpdesk
  (unread count; red dot on the avatar) · Docs · Appearance Dark/Light · Sign out. Helpdesk / Docs pages show a
  "← Control Tower / <page>" crumb. 🔔 bell still jumps to the Helpdesk. Light theme = `:root[data-theme="light"]`
  variable set (+ `--on-acc --glass --hover --pop --sel-t`), dark default, stored in localStorage `qf_theme`, applied
  before first paint (login page too). Shared helpdesk CSS uses `var(--on-acc,#04121a)`.
- Customer Docs tab (2026-10-03, was "Guide"; file `frontend/app/src/guide.jsx`, `GUIDE_CSS`): third header tab after Helpdesk.
  Sections 9 (golden rules) and 10 (examples) are `must: true` → gold number + "★ Must read". Sideways (2026-10-03):
  KPI tile ◆ Sideways (`cats.side`) and Trend filter ◆ Sideways (tone `flat`); the four state tiles add up to Stocks in view. 12 sections
  with a sticky contents list: Welcome, Quick start in 5 steps, Key words (trend states, strength bands 75/50/24, timeframes,
  reliability, sector vs industry), filter bar, tiles, sector & industry charts (quadrant meanings), Master data, stock card,
  "How to think — the golden rules" (top-down; good stock in a weak sector/industry = avoid; timeframes agree; match TF
  to holding period; strong reliability; sideways = no edge; market mood; strength ≠ target; risk), examples, helpdesk,
  FAQ, disclaimer. Explains meanings only — never formulas. The golden-rule wording was written by Claude from the owner's
  brief ("even if the stock is good, if the sector / industry is not good, avoid") — owner to review / edit.
  Tab icons are line SVGs (`TowerIcon`, `HelpdeskIcon` from shared/helpdesk.jsx, `GuideIcon`); dashboard Helpdesk tab too.
- Customer strength display (2026-10-03): the owner said "▲ 84%" read like an upside price move. No arrows on
  strength any more: master table per-TF cells = `Meter` (5 signal bars lit by |v|/20, colour = direction, "84%",
  tooltip "trend strength … not a price move") under a grouped header "Trend strength by timeframe (0–100%)";
  column "Trend strength"; stock card = `StrengthTag` "81% strength" per TF + "Combined trend strength"; peers = Meter.
- Customer header (2026-10-03): tabs Control Tower | Helpdesk sit in the top bar next to the brand (56 px bar);
  the filter bar is one line from 1300 px up (`.fbar` nowrap, Sector/Industry `.fg.grow` shrink to fit Reset), wraps
  below. The Background filter is labelled "Stock reliability" (card: "<x> reliability").
- Customer "Background" filter (2026-10-03): payload `h` per stock from Price_Health — S = HEALTHY, M = WEAK or
  unrated (same as the Control Tower quality filter), W = POOR; `null` when the sheet is missing (filter hidden).
  Filter bar Seg Strong / Moderate / Weak (multi), Reset clears it, stock card shows "<x> background". Verified counts
  equal the dashboard (Strong 1,405 = Control Tower "Healthy only"). Sector/industry bubbles are not re-filtered by it.
- Customer stock card (2026-10-03): the three Uptrend/Downtrend/Sideways-on boxes are gone (the per-TF rows show it).
  Added, all from the published payload only: "Sector & industry strength" table (st % and rank #/of for Combined +
  D..Y, adv/dec); "Top 5 strongest in <industry>" peers (+ this stock if lower), click opens that peer; its ticker
  copy is only those 5. ("Where it stands" rank/percentile/strip chart was tried and removed at the owner's request.)
- Customer page 4th round: normal-font "Hyperplane" brand; one compact filter bar (`.fbar`, Control-Tower style:
  tiny labels + joined `Seg` button groups — Timeframe Combined·D·W·M·Q·Y, Trend All/Up/Down/Bidirectional, Market cap,
  Segment F&O, Sector / Industry multi-selects, Reset); ⓘ `Info` popovers on filters, KPIs and panels; "Master data"
  table with Trend column (`categoryOf`: one TF = its direction; several / Combined = Bidirectional when they
  disagree, else direction of the average) then Strength % and per-TF %; selected bubble = white ring, others dimmed;
  removing a sector also clears industries (all when no sector is left); stock card "Uptrend on / Downtrend on /
  Sideways on" on grey with centred "None". KPIs and the Trend filter use the same `categoryOf` (mutually exclusive).
- Customer page 3rd round (2026-10-03): Hyperplane dark look (same palette / IBM Plex Mono); trend shown as ▲ 78 / ▼ 64 /
  ◆ sideways (strength 0–100 inside its direction); Timeframe = Combined + multi-select D..Y chips (several = all must
  agree for Up/Down, focus value = average); Trend chips All / Uptrend / Downtrend / ⇅ Bidirectional (up on some TFs,
  down on others — KPI count too); Size chips Large/Mid/Small/Others + F&O; "Ticker copy" header on the table column and
  the table-level copy; stock card groups Bullish on / Bearish on / Sideways on with strength words.
- Customer page (owner's 2nd round, 2026-10-03): two-panel sign-in / sign-up (hero + aligned grid form, big terms
  box); filters on top = Timeframe (All·D·W·M·Q·Y) + Trend (All / Uptrend / Downtrend) + multi-select sector,
  industry, size (Large/Mid/Small/Others) + F&O; KPI strip; Control-Tower-style Sector strength and Industry
  momentum panels (bubble ↔ list, x = net bias, y = strength, click = filter); stock checker with search, sort,
  0–100 scores per TF, copy (plain `A,B,C` / TradingView `NSE:A,`) for the whole table and each row; stock card
  with score bars. Top 10 removed for now (still in the payload). "Uptrend" = rating G on the chosen TF (or
  combined `os` ≥ 24 for Combined; ≤ −24 = downtrend). Disclaimer everywhere (owner told to confirm SEBI rules with compliance).

### Helpdesk (2026-10-03) — `backend/app/helpdesk.py` (shared logic) + `frontend/shared/helpdesk.jsx` (shared UI)
- Customers (/app → 🎧 Helpdesk tab) and dashboard users (🎧 Helpdesk tab) raise queries written like an email: To
  "QuantFriday Helpdesk", Subject, Severity High/Medium/Low, a contenteditable body where images can be pasted /
  dropped / inserted (re-drawn on a canvas → PNG/JPEG ≤ 1.1 MB, max 3; any other file is refused), Send. Admins see
  every query (customers' and users'), reply, close, reopen, delete; owners can close but not reopen. Chat-style
  thread; admin login IDs are never shown to customers/users ("QuantFriday Helpdesk").
- Inbox: `hd_tickets.owner_seen_at` / `staff_seen_at`; `GET …/helpdesk/unread` → 🔔 bell (header, both apps) with a
  dropdown, tab badge and "(n)" in the page title; polled every 30 s while visible; thread every 15 s, list 20 s.
- Routes: customers `/app/api/helpdesk/*` (portal), users/admins `/api/helpdesk/*` (main): tickets (GET list ?status,
  POST create), tickets/{id} (GET marks read), …/messages, …/close, …/reopen + DELETE (admin), unread, images/{id}.
- Storage: `hd_tickets`, `hd_messages` (body = JSONB blocks `{t:text,v}` / `{t:img,id}` / system `{t:event,v}` —
  never HTML, rendered as text), `hd_images` (bytea, mime from magic bytes PNG/JPEG/WebP, served with nosniff +
  `CSP: sandbox`). `hp_portal` gets column-level grants + ROW LEVEL SECURITY (`portal_own` policies on all three
  tables, keyed on `current_setting('hp.cid')` which portal.py sets per transaction) — verified a customer login
  sees 0 rows of another customer even in raw SQL and cannot write a staff reply.
- Guard-rails (Burp Intruder / floods), tested: Caddy body cap 8 MB on helpdesk routes, 64 KB on other /app/api
  routes, server timeouts (read_header 10 s, read_body 120 s, write 180 s, idle 2 m); app Content-Length check (413);
  in-memory per-IP 120 req/min on every helpdesk route before the session/DB (150-request burst → 64 refused),
  per-account 10 writes/min, all accounts 300 writes/min, 300 MB images/day per process; DB quotas per account
  5 new/hour, 20/day, 10 open, 20 msgs/10 min, 300 msgs/query, 30 images/day; 8 000 chars per message.
- `db.init_db` takes `pg_advisory_xact_lock` (api and worker start together and raced on CREATE TABLE).
- Admin tab = `AdminArea` with sub-tabs ⚙ System & settings | 👥 Customers (pending-approval badge); the top-level
  Customers tab is gone. Customer page: tabs 🏛 Control Tower (everything as before) | 🎧 Helpdesk; brand font Oxanium.

### Database (created by `db.init_db`, no migrations tool — add new tables/columns with IF NOT EXISTS)
`snapshots` (taken_at, trade_date, slot, source scheduled|manual|import, label, stocks, signals, sheets[], data_gz,
size_bytes, excel_path) · `snapshot_stocks` (per stock summary, PK snapshot_id+symbol) · `jobs` (queued/running/done/
failed/cancelled, log, one scheduled job per trade_date+slot) · `settings` (JSONB key/values incl. `worker_heartbeat`) ·
`customers` · `published` · `hd_tickets` / `hd_messages` / `hd_images` (helpdesk).

### Settings (Admin tab; defaults in `db.DEFAULT_SETTINGS`)
schedule_times ["09:45","14:30"] · weekdays_only true · skip_dates [] (NSE holidays) · catch_up_minutes 180 ·
retention_days 0 (forever) · manual_keep all|latest · telegram_enabled true · nr_mother_body_pct 60 ·
index_add [] · index_keep [] (symbols the dashboard also hides / never hides as index-ETF) · tech_enabled true ·
tech_weight 1.0 · tech {D..Y: rsi_bull 70, rsi_bear 30, adx_mode below, adx_value 40, macd_bull 0, macd_bear 0,
cci_bull 150, cci_bear −150} (`TECH_TF_DEFAULT`) · algos null (Technical Quant algorithms; null = ready-made).

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
  a "Near_and_abv_Overlap" scan screenshot; the exact **trend** definition (zones rising vs closes
  rising — see §5).
