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
- **Access is enforced by the server, and the screen never shows more than the access allows, not even for a split
  second.** This applies to every permission, role, limit and owner-level feature, existing or new. Follow
  "Access rules for every feature" in §7 before adding or changing any of them.
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
│   │   ├── route_guards.py       access audit: every route must check access (§7 "Access rules for every feature")
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
  **Scoring (owner, 2026-10-31):** B2NR / "Back to NR" is a failed breakdown → it is still detected and counted (NR
  charts, sector counts) but adds NOTHING to strength: direction 0, weight 0 in `publish.classify` (`EVENT_W["RECLAIM"]`)
  and the dashboard's `classifySignal` / `EVENT_META.RECLAIM`. Was +0.7 bullish (copied from the dashboard, never
  confirmed); on the 29 Oct collection this changed 19 stocks, 11 of them from uptrend/sideways to sideways/downtrend.
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
| Price_Health | long-term quality from yearly candles (current + 12 years): **POOR** > 70% below the peak, or crashed ≥ 90% with the bottom in the last 5 years, or a round trip (crashed ≥ 80% and now ≥ 10× its 3-year low — the owner's MBECL example 2026-10-04: 114 → 2 → 494) · **WEAK** > 50% below peak, lower than 5 years ago, crashed ≥ 80% at any time, or ≥ 8× its 3-year low · **HEALTHY** otherwise (`HEALTH_*` settings). Extra columns Worst_Crash_Pct, Worst_Crash_Years_Ago, Run_Up_From_3Y_Low_X. **Stretched** (owner's STLTECH case 2026-10-10, ~100 → ~1,000): Run_Up_1Y_X = price ÷ lowest monthly low of the last 12 months; ≥ 5x → POOR ("parabolic"), ≥ 3x → WEAK + column Stretched = Yes (6 Oct: 72 of 2,658 stocks ≥ 3x, 9 ≥ 5x). On 3 Oct data: Healthy 1,812 → 1,293 (customer Strong 1,405 → 1,088); HAL/BEL/SBIN/LT/TITAN stay Healthy; old crashes alone only give WEAK (unadjusted demergers, e.g. ADANIENT 2015). Thresholds chosen with the owner's example — tune in the scanner settings. |
| Technicals | per stock: Price + `{TF}_RSI/_ADX/_BB_Upper/_BB_Lower/_MACD/_Supertrend/_CCI` (raw values; only written when the technicals scrape worked) |
| Zone_Retest | see "Zone retest" above: per stock + TF + side, previous close vs previous bar's zone, current zone + band, `Dist_To_Zone_Edge_Pct`, Health |
| Candles | (2026-11-01) per stock: `M0…M12`, `Q0…Q12`, `Y0…Y12` = "open high low close" of the current bar + the last 12 (`build_candle_rows`, `CANDLE_BARS`). `store.save_snapshot` moves it to `snapshot_candles` (never in `snapshots.data_gz`, so the dashboard never downloads it, ~0.9 MB gz). Only the stock detail view uses it. Collections before 1 Nov 2026 have none. |
| Failed_NR | NR trap: after the mother, bar(s) closed beyond one edge (failed BO/BD), no close beyond the other edge, other bodies inside, latest close back inside and near the OPPOSITE edge (same 1.9/2 rule). Failed BO → LONG at mother Low (stop Low, target High); mirror SHORT. Biggest mother per stock+TF kept. |

All 20 sheets (Technicals only when scraped): Detailed_Signals, Flat_Data_For_Slicers, Signal_Matrix, Signal_Summary, Top_Opportunities,
Bias_Distribution, Signal_Type_Analysis, Multi_Timeframe_NR, Strong_Conviction, Virgin_BO_BD_Analysis,
Sector_Analysis, Industry_Analysis, NR_Breakout_Sector_Industry, Master_Stock_Data, Zone_Levels, Return_Potential,
Price_Health, Failed_NR, Zone_Retest, Technicals (+ Zone_History, Candles — Candles never stored in the collection). Symbols in Flat_Data_For_Slicers are TradingView style `NSE:SYM,` — always clean with
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
  ranking (`ControlTower`) → Focus Command (Priority radar, HTF×LTF confluence (full width), Sector×TF heat · Near
  breakout in one row — Timeframe Alignment Matrix and Industry Hotspots REMOVED 2026-10-10) → Setup Scanner (Zone Breakout Analyser, Stacked setups, setup
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
  inside opens `StockDeepDive`, or `NoSignalReport` (zone position per TF) when the stock has no signals.
  Since 2026-10-11 both are a FULL-SCREEN popup (`ReportShell`, CSS `.rpt*`): header + 3 columns (story · checklist ·
  sector & industry | TF ladder · zones by TF (`RZoneBlock`: 5 boxes, above = green, below = red, inside/bands = grey,
  levels in tooltip) · NR by TF (`RNRBlock`: broke out / ready / broke down / ready / coiling per TF from
  `nrStatesFor` + `s.mtnr`) · setups | technicals (top) · trade plan (Return_Potential / Failed_NR / Zone_Retest rows)
  · price health · industry peers (click = open that stock)). Score anatomy removed (owner). 2 columns ≤ 1180 px,
  1 scrolling column ≤ 760 px; Esc / ✕ / outside click closes. Props `db` + `list` (focus model list, for peers).
  FocusCommandTab uses the shared opener from context, so only ONE report is ever open.
  Original stock pinned in peers (2026-10-11, owner; replaced the Back button): `useStockTrail` + `ReportBackCtx` keep
  only the first stock opened from a page. Peer lists show the top 5 (customer) / top 6 (admin), then — with their
  real rank — the current stock and that original stock (plain row, no tag) when outside the top;
  clicking it goes back. Customer: Home `trail` = [origin] → StockCard `origin` prop; opening from the list starts fresh. The
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
- REGIME ANALYSER (owner, 2026-10-31; CUSTOMER APP ONLY — the admin dashboard is unchanged): the Weekly Supertrend
  (`Technicals` W_Supertrend vs Zone_Levels Price) is the regime for EVERY timeframe D..Y, zones + NR + technicals and
  the AI Portfolio zone engine. Owner choice "Weekly decides": a TF strength whose sign is against the weekly regime is
  squeezed into sideways (`publish.squeeze`, × REGIME_SQUEEZE 0.23 → |v| ≤ 22, order kept; rating char forced "M";
  `zone_engine.apply_regime` recomputes zv strength + colour). The Daily Supertrend never blocks, it only warns:
  W up + D down = "Regime shifting downwards", W down + D up = "shifting upwards". `rx` = weekly regime flipped vs the
  newest collection of an EARLIER trade_date (`earlier_zones()["R"]`, payload `rd` = that day) → "Regime shifted
  downwards / upwards". Payload per stock: `rg` [w, d], `rh` (held TFs of sc), `rz` (held TFs of zv), `rx`. Sector /
  industry: bullish signals + tech bias count only when w ≠ −1, bearish only when w ≠ 1 (and "A" is always recomputed
  when regimes exist). No W_Supertrend = no regime = old behaviour. Customer words only: "Regime analyser", never the
  indicator name (leak check: no "upertrend" in dist/app or /app/api/data). Customer wording (owner, 2026-10-31: "anyone
  could understand, in professional words"; "as the creator I can't understand it — use simple plain English"): NEVER
  say weekly / daily regime, never explain the rule's mechanics ("rising trends count in full" was rejected). Owner's wording (v3): "The current regime of the
  stock is up / down"; W up + D down = "Regime turning down": "has started changing from up to down. A complete change to
  down is expected soon"; W down + D up = "Regime turning up (not confirmed)": "recently it has started changing towards
  up, but this is not confirmed yet and it can turn down again at any time. Monitor it for a few more days"; rx =
  "Regime changed to down / up". `RG_STORY[regime][stock direction]` adds one plain line for EVERY combination of
  regime × the stock's own direction (rising / sideways / falling). A held timeframe = "not trusted yet" (shown as
  sideways); under an up regime a held dip = "seen as a pause". Side effect: with regimes, no stock can be
  up on one TF and down on another, so "Bidirectional" is always 0. UI: Research Regime column + `#rg-filter`,
  `RegimeBox` (label + text only) in the stock card + AI Mode strip, AI insights / focus; Docs → Key words "Regime
  analyser". REMOVED on owner request: the "Not trusted yet: D · W · M" chip, the per-timeframe "not trusted yet" marks
  and the amber held dots (the held timeframes simply read Sideways).
  AI PORTFOLIO = LONG-TERM REGIME (owner, 2026-10-31: "use the weekly and monthly instead of daily and weekly"): the
  MONTHLY Supertrend decides for the zone engine (`zone_apply_regime(zv, rm)`), the weekly only warns. Payload `rp`
  [monthly, weekly], `rz` (held zv TFs), `rpx` (monthly flip vs the previous trading day). `regimeOf(s, rd, true)` →
  "Long-term regime up / down / turning down / turning up (not confirmed) / changed to …" ("monitor a few more weeks").
  Used by analyseZone / analyseHolding (also the Research card's Investment Summary), card chip, reasons, summary
  lines, PDF chip, PF_GUIDE "Long-term regime". The Research view keeps the weekly/daily regime.
  AI Portfolio strength display (owner: "−84% looks like a monthly price move"; a "84/100 · Strength 84/100" version
  was REJECTED: "I need proper −100 to 100… I asked to just add the strength"): signed value WITHOUT "%" (e.g. −84),
  tile labels "Monthly strength" / "Quarterly strength" / "Yearly strength" (app + PDF), colours as before (`tc`).
  `DivBar scale` (AI Portfolio + AI Mode stat cards): coloured zones (down −100…−24 · sideways · up +24…+100), ticks at
  −50 / 0 / +50, a value tag with a ▼ pointer above the end of the fill (owner picked it; a round marker was rejected),
  labels −100 −50 0 +50 +100 under their ticks.
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
- HTF × LTF confluence (2026-10-10): FULL grid — rows Y/Q/M/W trigger × columns +Q/+M/+W/+D (10 valid pairs, lower
  triangle "·"), was Y/Q/M × W/D only. New widget **NR Breakout Overlap** (anchor `ct-nroverlap`, under the confluence):
  per stock the distinct NR breaks (event BREAKOUT / BREAKDOWN, key = TF × NR length from the signal name), so
  W NR4 + W NR6 = 2 breaks. 5×5 grid Y..D: diagonal = 2+ NR lengths broke on that TF, other cells = NR broke on both
  TFs; ▲ breakouts / ▼ breakdowns; "Min NR breaks 1+…4+"; list with the TF·length chips. Uses the Control Tower's
  filtered list. The Bear Trap setup ("Failed Breakdown (Back to NR)") was removed from SETUP_DEFS (card, chip, stacked).
- Setup Scanner navigator (2026-10-10): chips are built in the SAME order as the widgets below — Zone Breakout →
  Stacked Setups → the `SCANNER_PAIRS` cards row by row (see "Control Tower ORDER" below); each chip scrolls to its widget (verified). Zone Breakout Analyser: new "◆ Confirmed by NR · n" pill =
  rows whose `nrBreaks` (same-direction NR breakout / breakdown on any TF) is not empty; "Confirmed only · n" shows its count.
- Control Tower ORDER (owner, 2026-10-10 — keep it): Sector strength | Industry Momentum → Sector × TF Heat | Industry ×
  TF Heat (`ct-matrix`; new industry card = same maths per "Sector|Industry", strength from industryAnalysis, follows the
  sector pick, row click = `indF` filter for the whole Focus Command part) → Alpha Composite (`alpha` prop of
  FocusCommandTab, `ct-alpha`) → Priority Radar → HTF × LTF Confluence → NR Breakout Overlap → Setup Scanner (Zone
  Breakout Analyser, Stacked, then 2-column pairs from `SCANNER_PAIRS`: Overlap Break | Overlap Retrace · Zone Cross |
  Between · Flag | Virgin · Zone Retest | Trend Pullback (zone band) · Trend Pullback | Overlap Wall · NR Break | Near NR
  Break · Multi-TF NR | NR Trap; "#…" ids = sections passed via `sections={trap,retest,trend}`, rendered as half-width
  FocusCards; chips are built from the same list) → Opportunities → Return Expectations → Technical Quant (algo builder)
  → Watchlist Builder. Removed: Near Breakout card, NR Trap "How the trap forms" graph, Technical breadth table.
- Linked selection (2026-10-10): the "Focus Command" header is gone. ONE bordered section "🏭 Sector & Industry
  Analysis" (ControlTower) holds the two bubble panels + `SectorIndustryHeat` (both heat maps, multi-select rows with the
  bubble look: picked = tint + coloured edge + ✓, others dimmed). Selection state `pickSecs` / `pickInds` lives in
  ControlTowerCombined (`picks`); `pickEx` → `dbP` / `dbDirP` / `modelP` feed EVERY widget below (alpha, radar,
  confluence, NR overlap, setups + sections, opportunities, returns, Technical Quant, watchlist). Rule: a picked industry
  narrows its own sector; other picked sectors stay whole. Banner "🎯 Showing only … · ✕ Show all" above Alpha.
- Customer stock card one-screen layout (2026-10-10): `.modal.stock` on ≥ 1000 px = two columns (`.m-grid` / `.m-col`):
  left = summary + verdict + AI insights + sector & industry table; right = trend by timeframe + top-5 peers; Copy sits
  under the price; footer = data time + one-line "education only" (sector / industry lines inside AI insights and the
  long disclaimer are hidden on desktop — the table and the page footer carry them). Extra compaction when height
  ≤ 800 px. Measured: no scrolling at 1920×1080, 1536×864, 1440×900, 1366×768. Phones (< 1000 px): one column in the
  order summary → timeframes → sector & industry → peers, scrolling as before.
- Customer **Trading mode** (2026-10-10, `MODES` / `applyMode` in app main.jsx): two SEPARATE filters again (owner, 2026-10-10 later):
  "Trading mode" `Balanced | Swing | Investing` and "Timeframe" `D W M Q Y`, mutually exclusive — picking a mode clears the TFs,
  picking a TF switches the mode off, clearing every TF lights the last mode again (it is what the data uses). Tooltip shows
  the weights. Page max-width 1440 px; filter bar one line from 1380 px. Styles: Balanced
  (D..Y equal, default) · Swing / Positional (1:2:3:3:1 → M & Q 30 % each) · Investing (0:0.5:1.5:4:4 → Q & Y 40 %).
  `applyMode` rewrites every Combined number on the client: stock `os` = weighted mean of `sc`; sector / industry
  "A" rows = weighted mean of their D..Y `st` and `nb` (n / sig / adv / dec / avg kept from the server's A row),
  re-sorted for ranks. So list, sort, tiles, bubbles, stock card and AI insights all follow the mode. Picking single
  timeframes in the filter ignores the mode. Stored per device (localStorage `qf_mode`). NOTE: the server's own `os`
  still uses TF_WEIGHT 1:2:3:4:5 (only used for the published top 10); the admin dashboard is unchanged.
- Customer stock card "AI insights" (2026-10-10, owner's name for it): header renamed from "Combined view"; the long
  verdict text is replaced by three lines from `insightsOf()` — ✓ Good (uptrend on N of 5 TFs + strongest TF, strong
  reliability, strong industry / sector rank, top-3 in industry) · ⚠ Watch out (stretched, reliability, downtrend /
  disagreeing TFs, average / weak sector or industry with rank, short term cooling: Daily ≥ 30 pts below Weekly) ·
  ◎ Focus (one sentence per verdict). Rule-based text from the published numbers — NOT a language model; no buy/sell words.
- Customer stretched handling (2026-10-10): payload `x` = 1 when Price_Health Stretched = Yes → 🔥 tag in the master
  table and on the stock card; `combinedView` verdict "⚠ Overheated — don't chase" for any stretched uptrend (overrides
  Best case). Default master sort is now **Best uptrend first** (`sort = "best"`): uptrends first, then tier (Strong &
  not stretched → Moderate → Weak or stretched), then strength; "Strongest uptrend first" (pure strength) still exists.
  On 6 Oct data the pure sort had 5 stretched stocks in its top 10 (STLTECH #2); the best sort has none. Docs + quick guide explain 🔥.
- Customer sign-up mode (2026-10-06): Admin → Customers → "New sign-ups" switch: Admin approves each (default) |
  Approve automatically. Stored in `portal_config` (key auto_approve) which hp_portal CANNOT read; it may only call
  `portal_auto_approve()` (SECURITY DEFINER, yes/no). A BEFORE INSERT trigger `customers_auto_approve` sets status
  approved + approved_at for self sign-ups (signup_ip set) when on — hp_portal still has no right to write status.
  portal `/app/api/register` RETURNING status → when approved it starts the session (signed in at once, `signed_in`);
  `/app/api/signup-info` tells the form which subtitle to show. Admin-created "pending" customers are never auto-approved.
  Routes: GET/PUT /api/admin/signup-mode. Verified: hp_portal denied on portal_config, on inserting status, on the trigger fn.
- Customer quick guide (2026-10-05, `frontend/app/src/quick.jsx`): gold ⓘ button in the top bar (left of the bell) →
  modal in very simple words: 1 order Sector → Industry → Stock (river / stream / boat), 2 five timeframes for all three,
  3 decide from stock + industry + sector with the owner's 4 examples (strong stock + weak ind + weak sec = Avoid;
  strong + moderate ind + strong sec = Okay/careful; moderate stock + strong ind + strong sec = Watch; all strong = Best
  case), 4 "4 clicks" walkthrough, button to Docs. `combinedView` now matches example 3: uptrend with |os| < 50 in a
  strong group = "Watch — stock still building". Customer bubble charts say Uptrend / Downtrend (no bullish/bearish).
- Customer sign-in page (2026-10-05): hero = "Protect your capital with the right quant information" + 4 points (stay away
  from traps, trade with the tide, five timeframes one answer, less noise) + "not investment advice" line — worded as
  help, never a promise (SEBI). Sign-up phone field = "WhatsApp number" with an invite to the Hyperplane community note
  (number never shared); Admin → Customers shows it as "WhatsApp …".
  WhatsApp field = searchable country-code picker (`DialSelect`, all 247 codes in `frontend/app/src/dial.js`, Popular
  first, search by name or code, Enter picks; follows Country until picked by hand) + digits-only number, no placeholder;
  India 10 digits starting 6–9, others 5–13; stored as "+91 9876543210"; portal.py checks the same (`PHONE_RE`, `IN_MOBILE_RE`). Phones: hero shows only brand + headline + intro.
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
`customers` · `published` · `hd_tickets` / `hd_messages` / `hd_images` (helpdesk) · `app_modules` / `roles` /
`role_modules` / `customer_roles` / `app_permissions` / `role_permissions` (Access manager) · `customer_sessions` /
`activity_log` / `module_usage` (Activity log) · `snapshot_candles` / `stock_detail` (customer-admin detail view).

### Settings (Admin tab; defaults in `db.DEFAULT_SETTINGS`)
schedule_times ["09:45","14:30"] · weekdays_only true · skip_dates [] (NSE holidays) · catch_up_minutes 180 ·
retention_days 0 (forever) · manual_keep all|latest · telegram_enabled true · nr_mother_body_pct 60 ·
index_add [] · index_keep [] (symbols the dashboard also hides / never hides as index-ETF) · tech_enabled true ·
tech_weight 1.0 · tech {D..Y: rsi_bull 70, rsi_bear 30, rsi70_bull 70, rsi70_bear 40, adx_mode below, adx_value 40,
atr_mode below, atr_value 70, macd_bull 0, macd_bear 0, cci_bull 150, cci_bear −150} (`TECH_TF_DEFAULT`; `get_settings` fills
levels missing from older saved settings) · algos null (Technical Quant algorithms; null = ready-made).

### Worker
Polls every 15 s: queue due slots → claim next queued job → `run_scanner()` in `data/runs/job_N` (chdir, stdout
tee'd into `jobs.log` every 5 s) → move Excel to `data/excel/` → `save_snapshot`. Daily cleanup: retention,
run dirs > 7 days, jobs > 120 days. `SCAN_OFFLINE_DIR` env = recalculate from a raw snapshot instead of scraping
(tests). Chromium: `/usr/bin/chromium` symlinked to `/usr/bin/chromium-browser`, driver `/usr/bin/chromedriver`.

---

- Admin → 👥 Customers → "Customer accounts": "📋 Copy table (N)" (tab-separated with headings → paste into Excel /
  Google Sheets) and "⬇ Download Excel (N)" (`Hyperplane-customers-<date>.xlsx`, sheet "Customers", via the xlsx package
  already in the admin bundle). Both export exactly the rows on screen (status pill + search); columns: Name, Email,
  WhatsApp, City, State, Country, Status (active / expired / pending / blocked), Access until, Joined, Approved on, Last
  login, Logins, Locked until, Signed up from IP, Notes (`CUST_EXPORT` in server.jsx). Owner, 2026-10-18.

- Customer app theme: LIGHT is the default (owner, 2026-10-20); dark only when the customer picked it (`qf_theme` =
  "dark" in localStorage). The admin dashboard keeps its own default.

### Access rules for every feature (owner, 2026-11-01) — READ BEFORE ADDING A PERMISSION, ROLE, LIMIT OR ADMIN PAGE
The owner found the AI Portfolio Builder drawing its full form for a split second, then hiding the buttons a
customer may not use: "this is the wrong way … this is not only for the AI portfolio, for every access we have now
… and for future access creation". Two layers, both required:

**1. The server is the only real gate (Postman / Burp must get nothing extra).**
- Every route checks access in FastAPI itself:
  - admin service: `admin_user` for `/api/admin/*`, `current_user` for the rest;
  - customer service: `need("<app>")` for an application, `need_perm("<app>:<action>")` for a single permission;
    a level such as `builder_tier(c)` is read from `c["perms"]`.
- Never take access from the request: no `tier`, `role`, `admin`, `plan` or limits from the body, query, headers,
  cookies other than the session, or anything the browser stores. Pydantic models ignore extra fields; keep it so.
- Check limits on EVERY route that uses them, not only the main one: build AND preview AND export (see
  `builder.check_plan` + the amount / count checks in `builder.build`). Refuse with 403 and plain words ("Your
  access allows …"); never answer with a different, quietly widened result.
- Send only what this access may see: filter on the server. Never send everything and hide it in the browser.
- Owner-level data also gets a database layer: the restricted `hp_portal` role + row-level security (see
  `stock_detail`).
- Audit after any route change; it must say "0 without an access check":
  - `docker compose exec api python -m app.route_guards`
  - `docker compose exec portal python -m app.route_guards portal`
  - A new public route, or one whose check runs inside the function, must be added to `PUBLIC` / `INSIDE` in
    `backend/app/route_guards.py`, with the reason.

**2. The screen starts with nothing and only reveals: never draw first and hide after.**
- The customer app draws nothing until `/app/api/me` answers (`App` in shell.jsx: apps, perms, pins). The admin
  dashboard draws nothing until `/api/me` answers (the ⚙ Admin tab exists only when `user.admin`). Keep both.
- Anything access-related fetched later must show a short "getting ready" card until it arrives, with "Try again"
  on an error. Never fall back to "no limits" defaults while waiting. Example: the builder's `/app/api/builder/plan`
  (`if (!plan) return …` in builder.jsx, `.bd-wait`).
- Calls that depend on the limits wait for them too (the builder's preview starts only after the plan is known).
- Saved inputs are clamped to the access when it arrives (amount, stock count, options).
- Do not cache access in localStorage / sessionStorage to draw faster: a role removed by Admin would flash back.
- Locked choices are shown as locked ("🔒 fixed for your access") or left out; customer wording never names a
  plan or tier (memory: customer wording).

**Tests for every new permission, role or limit** (scratchpad patterns: `builder_attack_test.py`, `plan_api_test.py`):
- Hand-made requests as the lowest access: over each limit, every locked option, fake "admin" / "tier" in the body
  and in headers, no sign-in → each one 401 / 403, and a normal request still works.
- Screen: slow the access answer on purpose (wrap `window.fetch` with a 1.5 s delay for that URL), sample the page
  every 100 ms, and check the unrestricted view never appears, the waiting card does, and then the restricted view.

### Adoption report (owner, 2026-11-01) — `backend/app/adoption.py` + `frontend/src/adoption.jsx`
- Owner: "convert the activity log report to the adoption report … standard framework … output is more important than
  the glamour UI". It matters once the customer app is sold. The framework is Google HEART + the AARRR funnel, read as
  **Reach → Activate → Adopt → Retain** (the owner said "BDF"; no such standard exists, so these two were used).
- Admin tab "📈 Adoption" (server.jsx, sub "activity") has two sub-tabs: **Adoption report** (default) and **Audit log**
  (the old `ActivityTab` from access.jsx, unchanged and still needed for security events).
- Data lives in `adoption_daily(customer_id, day, module, minutes, visits, actions JSONB, first_action_at)`, kept for
  `ADOPTION_DAYS` = 730 (worker), separate from the 180-day audit log. It is filled live by `POST /app/api/activity`:
  - `open` → visits+1, plus a minute when a new module_usage row starts;
  - `ping` → minute+1 (same guard as module_usage);
  - `kind:"action"` + `action` → `actions[name]+1`, whitelisted per app in `adoption.ACTIONS` (403 otherwise),
    at most `ACTION_CAP` = 50 a day.
  - Server-only actions (`SERVER_ACTIONS`, refused from the client): `portfolio:list_saved` (portfolio PUT) and
    `builder:build` (successful build).
  - Client actions use `trackAction(module, action)` in `frontend/app/src/core.jsx` (fire-and-forget, 30 s throttle):
    research stock_card / filter, simple search, portfolio report, builder sent / download.
  - A one-time backfill from module_usage (flag `adoption_backfill_v1`). Key actions count from `adoption_actions_since`
    (the deploy day), and the report says so.
- Definitions are constants at the top of adoption.py:
  - activated = a key action within 14 days of approval (or of `adoption_actions_since`);
  - adopted app = used on ≥ 3 days in 30 with ≥ 1 key action;
  - habitual = active in ≥ 3 of the last 4 weeks;
  - segments: champion / regular / casual / at_risk / dormant / not_started;
  - score 0–100 = 40% active days + 30% apps adopted + 20% actions + 10% recency.
- API (admin only): `GET /api/admin/adoption?days=7|30|90` (headline with previous-period values, funnel, apps, cohorts,
  attention lists) and `GET /api/admin/adoption/customers?segment&q&sort&page&size`.
- Tests (scratchpad): `adoption_test.py` (synthetic customers with known answers) and `adoption_ui_test.py`.

### Access manager v2 — permissions ↔ roles ↔ customers (owner, 2026-11-01) — SUPERSEDES the role/app details below
- Owner: "in future there might be 10 permissions and many roles … UI good but handling the data gets bad as the
  count grows … only 3 sub-tabs: permission manager, permissions to roles, roles to users … any permission to any role,
  and to a user as well … dynamic but identify everything properly". Decided with the owner: direct grants allowed
  (reason + optional last day); permissions are created by the CODE, the admin edits label / group / description /
  owner-level / on-off.
- **Model** (`backend/app/permissions.py`): customer → roles → permissions `application:action` + direct grants.
  `<app>:view` = open the application (now a real row; `role_modules` is only a trigger-kept mirror for one release,
  nothing reads it — drop it later). `PERMISSIONS` tuple = the catalogue; `sync_catalogue` on every start (new keys
  added; code-owned module/action/requires/sort follow the code; admin-owned name/description/grp/restricted/enabled
  kept; keys gone from the code → `retired`, never deleted). `requires` is one level deep (detail → its app's view).
  `migrate_v2` (settings `perm_model_v2`) copied role_modules → role_permissions once — verified identical access for
  every customer. `customer_permissions` (PK customer+permission, reason NOT NULL, expires_on = last day IST, NULL = no
  end). View `effective_permissions(customer_id, key)` = held via role or active grant, enabled, not retired, its
  requirement effective too — the ONE source for portal (`MODULES_SQL` / `PERMS_SQL`), admin screens and the
  `stock_detail` RLS policy. App on/off = its view permission (PATCH keeps `app_modules.enabled` in step).
- **API** (`backend/app/access_admin.py`, mounted by `main.py` via `access_admin.build(admin_user, _cust, CUSTOMER_COLS)`):
  `GET /api/admin/access` (modules, roles with permissions + owner flag, catalogue with roles / holders / direct
  counts) · roles CRUD (`permissions`, older `modules` still accepted) · `POST /api/admin/access/role-permissions`
  {changes:[{role, perm, on}], dry_run, confirm_owner_level} · `PATCH /api/admin/access/permissions/{key}` ·
  `GET …/permissions/{key}/holders?q&source=all|role|direct&page&size` · `PUT …/permissions/{key}/roles` {add, remove}
  · `GET /api/admin/access/users?q&role&perm&direct&owner&status&sort&page&size` (server-paged, filters on EFFECTIVE
  permission) · `GET/PUT …/users/{id}` (+ `/roles`, `/grants`, `DELETE …/grants/{key}`) · `POST …/users/bulk`
  {customer_ids | filter, add_roles, remove_roles, grant, revoke, dry_run} (≤ 20,000). Legacy kept: `PUT
  /api/admin/customers/{id}/roles`, `POST /api/admin/roles/bulk` (same response), `PATCH /api/admin/modules/{key}`.
  Every write: `dry_run` = done inside a savepoint, effective access before/after compared (who gains / loses what,
  customers affected), then `psycopg.Rollback`. Owner-level additions without `confirm_owner_level` → 409 +
  `X-Confirm: owner-level`. Rules: requires added automatically / dependants removed with their app; default role ≥1
  view and never restricted; a permission on the default role can't become owner-level; ≥1 role per customer; grant
  reason 3–200 chars, last day not in the past; revoking an app grant also revokes grants that need it. Logged:
  role_updated (added/removed/customers_changed), perm_updated, grant_added, grant_removed, grant_expired (worker
  deletes grants 30 days after their last day). New customers' pins: `_pin_new_apps` from effective access.
- **UI** (`frontend/src/access/`: `index.jsx` tabs, `perms.jsx`, `roles.jsx`, `users.jsx`, `ui.jsx` building blocks,
  `shared.jsx` helpers + AM_CSS, `style.js` AX_CSS; `access.jsx` keeps the Activity log and re-exports AccessTab).
  Three tabs: **Permission manager** (grouped by application, search, chips All / Owner-level / Switched off / Not
  given to anyone / Retired, on/off with a review, counts that deep-link to the other tabs; drawer: edit, give to
  many roles, paged "who can use it" with via-role / direct) · **Permissions ↔ Roles** (searchable role list; Role
  view = grouped checklist with All/None + "show only what it has"; Matrix = permissions × up to 12 chosen roles,
  sticky headers, click a cell, "give to all shown", "only rows that differ"; Compare two roles + "make B the same as
  A"; New role from a copy) · **Roles ↔ Users** (server-paged 50/page, filters, sort, tick page → "select all N
  matching" → bulk add/remove role or give/remove a direct permission; drawer: roles, direct grants, every permission
  ✓/✗ with WHY). Common: nothing saves until the review dialog (pending bar for multi-changes), owner-level needs
  typing OWNER. Customer app: account window shows "Extra access (until …)" (`/me.grants`).
- Tests: `access_v2_test.py` (catalogue sync / retired, previews, requires, owner rules, grants + expiry + RLS,
  switch off, 1,000 customers: page 34 ms, bulk preview 1.1 s, bulk 3.1 s) · `access_v2_ui_test.py` (3 tabs at 1,000
  customers + 15 roles, review + OWNER, matrix, compare, select-all bulk, drawer WHY, deep links, phone, console).
  `rbac_ui_admin.py` now covers only the Activity log + Customers (its old Access manager part is in v2's test).

### Access manager (RBAC, customer app only) + Activity log + side nav (owner, 2026-10-27)
- **Applications** = the customer app's modules, fixed catalogue `app_modules` (research | simple | portfolio | builder; admin can
  rename / describe / switch one off for everyone). **Roles** (`roles`, `role_modules`) group applications; a customer
  holds 1+ roles (`customer_roles`) and may open the UNION. Exactly one role `is_default` (partial unique index); trigger
  `customers_default_role` gives it to every new customer (sign-up or admin-created). Built-in role "Customer"
  (`is_system`, all 3 apps) is seeded once by `db._seed_roles` and given to every existing customer; it can be edited,
  never deleted. Rules (API-enforced): the default role needs ≥1 application; un-defaulting only by making another role
  the default; deleting a role moves customers left with no role to the default; a customer needs ≥1 role (block the
  account to stop all access); bulk removals that would leave 0 roles are skipped.
- **Enforcement (portal.py):** `customer()` returns `modules` (enabled apps of the customer's roles, read each request
  → role changes apply live, no re-login). `need(*apps)`: /data + /history need any data app, /portfolio needs
  `portfolio`, /activity only modules held → 403 + header `X-Access: denied` (the app shows "not part of your plan",
  never signs out). Research vs Simplified read the same data, so that split is UI-only. `/me` adds `apps` + `roles`.
  hp_portal can only READ the RBAC tables (verified: cannot change roles/assignments/apps or read the log).
- **Sessions / devices:** every customer sign-in = row in `customer_sessions` (random id carried in the signed cookie as
  `s`; device = 400-day httponly cookie `qf_dev`, label "Chrome · Windows" from `activity.device_label`). The cookie
  check refuses ended sessions (revoked / signed_out / blocked / password_reset). Old cookies without `s` get one
  deterministic `legacy-<sha>` row and a new cookie on /me. `last_seen` updates at most once a minute.
  Admin: sign out one device, or all (also bumps session_ver); block / password reset end every session.
- **Activity log** (`activity_log`): customer events signup · login · login_failed (reason) · locked · logout · open
  (once per app per 10 min) · session_revoked · signed_out_all · roles_changed · blocked · password_reset; dashboard
  users (config.ini): login · login_failed · locked · logout (device cookie `hp_dev`); admin changes role_created /
  role_updated / role_deleted / app_updated. `module_usage` = minutes per session × app × IST day (app pings every 60 s
  while visible; +1 at most every 50 s). `activity.log()` runs in a savepoint and never breaks a request.
  Retention setting `activity_retention_days` (30/90/180/365/730, default 180) — worker `cleanup()` daily.
- **Admin UI** (`frontend/src/access.jsx`, tabs in AdminArea: ⚙ System · 👥 Customers · 📜 Activity log · 🔐 Access
  manager). Activity log: range Today/7/30/90/custom, "⟳ Refresh log" button (loads the newest data now; range,
  filters and open rows stay — nothing is reset) + "Last updated HH:MM · auto every minute" (also reloads itself every
  60 s while visible), 7 KPIs (active now = seen ≤5 min, 3+ devices = possible shared
  account), usage by application, people per day + busiest hours, most active, views People & devices (expand →
  sessions, sign out device / all) · Event log (filters, search, paging 100, Copy / Excel up to 5000) · Dashboard
  sign-ins; person drawer (plan, devices, minutes per app, 30-day bars, timeline). Dates use `istDay()` (Intl en-CA in
  Asia/Kolkata — never toISOString, which is a day behind between 00:00 and 05:30 IST).
  Access manager (owner 2026-10-28): its own inner side nav (`am-snav`, remembered in `hp_access_sec`) with three
  sections — **Roles** (role list + editor: create / edit / duplicate / delete / default, applications as cards with
  Select all / Clear all), **User access mapping** (search, role filter, multi-select bulk add/remove, per-customer
  role picker; applications shown as "N of M" + icons so it scales), **Application manager** (name, description,
  on/off, which roles include it, how many active customers can open it). No permission matrix and no
  "applications → roles → customers" strip (both removed: they grow with the number of applications). Every change
  reloads roles + customers (counts stay right). Customers table has a Plan column (+ "Plan (roles)" in Copy / Excel).
- **Customer app side nav** (`SideNav` in main.jsx), owner's reference image 2026-10-28: a DARK rail in both themes,
  COLLAPSED by default (76 px: icon with its 9.5 px name underneath, up to 3 lines), the open / close toggle at the TOP
  under the logo (☰ when closed, « when open), open = 208 px with 12.5 px names beside the icons (long names wrap, never
  cut). No "Your plan" box in the menu (owner 2026-10-28: the plan is in the Account window) (`qf_nav` = full|min,
  default min). Items: the customer's PINNED applications (max 6, `MAX_PINS` in portal.py), Docs, Helpdesk (unread dot /
  badge) and **More apps** at the bottom (owner 2026-10-28, reference image): a panel beside the rail with search, every
  application on the plan (Pinned / More apps groups), pin / unpin per row (pins disabled once 6 are pinned), click =
  open. Pins live on the account: table `customer_prefs` (customer_id, pins[]; RLS like customer_portfolio), `/me` returns
  `pins` (null = never chose → the first 6 in catalogue order) + `max_pins`, `PUT /app/api/pins` (≤6, only apps on the
  plan). More apps is highlighted while an unpinned app is open. Test: `rbac_ui_moreapps.py` (adds 5 temporary apps).
  ≤900 px: off-canvas drawer opened by ☰ in the top bar (scrim / Esc / picking an item closes it). Top bar = current
  page icon + name + description, Data as of, quick guide, bell, account (Account window shows Plan + Applications).
  Stored `qf_face` outside the plan falls back to the first allowed app; no apps = empty state pointing to the
  Helpdesk. The plan refreshes when the tab regains focus (≥60 s apart). One-row filter bar breakpoints account for
  the nav (1615 px open / 1480 px collapsed).
- Tests (scratchpad): `rbac_api_test.py` (103 API checks incl. DB-role permissions), `rbac_ui_customer.py`,
  `rbac_ui_admin.py` (Selenium).

### Final output for every date + strength evidence (owner, 2026-11-01)
- "Check all the combinations as much as possible … the date picker needs the same output on previous dates … store
  the final output." Runtime scoring covers all 729,000 combinations exactly (no lookup table: one stored number per
  combination would be off by up to ±25 points — more than the mother candle's whole effect).
- `publish.FORMULA_VERSION` (5 = regime + long-term regime + mother candle by place + volume). BUMP IT whenever the
  customer strengths change. `customer_history.formula` records the version; `history_missing()` returns collections
  whose past day is missing / older (scheduled) or whose `stock_states` are missing / older (every collection); the
  worker rebuilds one per idle tick ALWAYS (not only when past days are switched on) and right after each collection
  (`build_history` → past day for scheduled + `_store_states` for all). Admin "pending" = len(history_missing()).
- `stock_states` (admin only, no portal grant): one row per stock per collection — price, cap, reliability, stretched,
  long-term regime, per timeframe `*_state` (0…89 = trend [2,1,0,−1,−2] × 18 + place [NR_PLACES] × 3 + mother candle
  [none, breakout, breakdown]), `*_st` strengths, `*_nr` ±n, stock strength + colour, formula. ~200 bytes a row with
  its index → ~460 KB a collection → ~230 MB a year at 2 collections a trading day. zv timeframe arrays now always carry
  the place index (7th item), not only with a mother candle.
- `evidence.py` + Admin → 🧪 Strength evidence (`frontend/src/evidence.jsx`): levels nr (none + breakout / breakdown ×
  6 places = 13 per timeframe), zone (90 per timeframe), full (M × Q × Y seen, top 300 of 729,000); horizons 7 / 30 /
  90 days; forward return = price at the first collection ≥ horizon later; vs market = minus the average of every stock
  from the same collection; one example per stock per box per period (month / quarter / year); ≥ 30 finished examples
  to judge (verdicts Better / Worse / In line / Not enough yet; Excel). "Rebuild with the current formula" button.
  Collections before ~17 Oct have no Zone_History → no long-term states (their research / regime data is still stored).
- Tests: `evidence_test.py` (states for every collection, past days on the current formula, 27 reports, admin only,
  past-day fields = today's, ETag 304, worker auto-rebuild of an old formula, admin tab).

### Builder plans — Customer / Trader / Admin (owner, 2026-11-01)
- Owner: "bring the AI Portfolio Builder to all the roles … three permissions: customer (common for all), trader and
  admin — trader and admin only from the admin panel … even with Postman or Burp Suite the response must follow the
  role … customer: up to ₹1 lakh, 20 stocks, High reliability only … trader: everything up to ₹10,000 crore with the
  More options … admin: any amount, same volume analyser".
- Permissions (catalogue, permissions.py): `builder:customer` (every role, incl. the default), `builder:trader`,
  `builder:admin` (owner-level, never on the default role); each requires `builder:view`. `migrate_builder_plans`
  (settings `builder_plans_v1`, after `_seed_roles`): every role gets builder:view + builder:customer, the role
  "Customer Admin" gets builder:admin, saved pins get "builder" while there is room. Trader is given to nobody.
  The "AI Portfolio Builder" role now means Customer plan unless Trader is ticked on it.
- `portal.builder_tier(c)`: admin > trader > customer (no plan permission = customer). `GET /app/api/builder/plan` →
  `builder.plan_info` (limits + standard settings). Builds / previews outside the plan → **403** + `X-Plan` (PlanError);
  other bad input 422. Response field `tier` (NOT `plan` — that is the buying plan).
- `builder.TIERS`: customer ₹10,000–₹1 lakh, ≤ 20 stocks, reliability S, options locked (opts / sector_max / weighting
  must equal the standard settings, else 403); trader ₹10,000–₹10,000 crore, ≤ 1,000, S/M, every option; admin
  ₹1,000 – no business limit (`ADMIN_AMOUNT_CEIL` 1e15 sanity bound), ≤ 1,000, S/M, every option.
- Standard settings for every plan (`DEFAULT_OPTS`, `DEFAULT_SECTOR` 10, equal money): long term, Proven trends
  (`good`), Confirmed uptrend, leave out > 30 % in 3 months, 5 % in one stock, standard pace 10 %, volume sizing off.
- UI: form loads the plan, plan badge (`#bd-plantag`), amount / stock chips cut at the plan's limit, Medium shown
  locked, More options shown locked (`<fieldset disabled>`, `#bd-lock`), saved inputs clamped; saved-input key is
  `qf_builder_v2` (new defaults for everyone); default ₹1 lakh / 20 stocks. Guide text updated.
- **Data note (1 Nov 2026):** the new master column `marketcapname` classifies by size, not NSE rank (local data:
  Large 355 / Mid 433 / Small 1,585 vs 99 / 144 / 2,133 before; F&O mid caps 10 vs 88). Owner to decide: switch the
  screener column back, or derive the cap group from the Nifty LargeCap 100 / Midcap 150 lists. Two
  `builder_api_test` cash checks fail on this data until then.
- **Owner, same day — no plan names to customers:** customer text says "Your access allows amounts up to ₹1 L and up to
  20 stocks" under the amount (`#bd-access`; over the limit → `#bd-amt-err` there, not near Build), no badge, More
  options "fixed for your access"; server messages "Your access allows …". Admin labels are "Builder · Customer /
  Trader / Admin level" (`rename_builder_levels`). Access manager: Permissions ↔ Roles is Role view only (Matrix and
  Compare removed); drawers sit above the dashboard header (`.ax-ov` z-index 1000).
- **Volume analyser business logic (same day):** price push = daily swing × √(shares bought a day ÷ dependable volume)
  — from what the customer actually buys, so 1 share of a busy stock = negligible (shown "negligible" under 0.05 %);
  a position under 1 % of one day's trading (`L.LIGHT_SHARE`, `liq.light`) gets one plain line ("easily bought and
  sold"); all positions light → `volume.light` → the section shows "No volume concerns" only and the execution plan is
  "1 day — buy every stock today"; the "after day 30" summary is a table (shares a day, still to buy, money, finished
  on day N + years); "Tricks big players use" (stop-loss hunting, spoofing, front-running, pump and dump, circuit
  traps, marking the close, fake volume, iceberg buying) with how to protect — education only; order tip uses the
  stocks' median daily swing (`liq.swing`).
- Tests: `plan_api_test.py` (catalogue, migration, 8 Postman-style refusals, trader / admin limits, plan removal),
  `plan_ui_test.py`; other suites updated for "every customer has the builder".

### Auto-publish safety check (owner, 2026-11-03) — `publish.quality_issues(sheets)`
- A 23:43 "Sync now" got EMPTY ChartInk tables (master screener, Midcap 150, MicroCap 250); the scanner fell back to
  raw-data-5 for Master_Stock_Data and auto-publish replaced the good data (no mid caps, no volumes, no free float).
- Now, in auto mode, the worker publishes only when `quality_issues` is empty: master rows must carry the master
  screener's volume columns (`Weekly_Volume_1`), every market-cap group (Large / Mid / Small) must have stocks, and
  Zone_Levels must have ≥ 500 stocks. Otherwise the collection is stored but NOT published; the job log says why
  ("⏸ Not published to customers automatically: …") and the last published data stays.

### Customer app design system (owner, 2026-11-02) — `frontend/app/src/ds.css.js`
- Owner: "I have the design system HTML file … themed maroon … use the existing colour, but for the features and slices
  use the design system … make sure the design system primary is not our primary". Source: `frontend/Design System.html`
  (K4K Design System showcase; a bundled page — template + gzip/base64 manifest; the rules live in `window.K4K_RULES`,
  components in `window.SX_CARDS`). Unpacked copies are in the session scratchpad only, not the repo.
- `ds.css.js` = the K4K structure with OUR colours, loaded first by `main.jsx` (`addCss("ds", …)`). Every K4K colour
  role points at the theme variables in `shell.css.js`, so light and dark keep working:
  primary / action / focus → `--acc` (never K4K's maroon #EE4961) · neutral 0/50/100 → `--s1/--s2/--bg` · borders →
  `--b1/--b2` · text heading-default / label-light / disabled → `--t1 / --t2 / --t3` (t3 never for reading text) ·
  success / warning / critical / information → `--long / --mixed / --short / --acc` (+ `…d` surfaces) · AI → `--ret`.
- K4K rules adopted: controls 24/28/32/36/40 (xs–xl), padding-x = (h − 8) ÷ 2; radius 4 buttons · 6 fields / chips
  (square in tables) · 8 cards / popovers / modals · 12 large cards · pill otherwise; type by role (headings 32–14 600,
  body 14/13/12/11, caption 10 = the minimum, caps only for table headers + overlines, tabular numbers); tables header
  40 caps + rows 40/48/56, one divider per row, no zebra, numbers right; status never by colour alone (dot + word);
  one primary button per view; sentence case.
- Components: `ds-h1…h6, ds-body-*, ds-caption, ds-overline, ds-num` · `ds-btn` (+ `--primary/--secondary/--subtle/
  --link/--ai`, `--xs/--s/--l/--xl`, `--icon`) · `ds-field / ds-input` · `ds-chip` (+ tones, `--square`, `ds-chip-dot`)
  · `ds-card / ds-well / ds-divider` · `ds-table` (+ `--compact/--comfortable`, `.num/.strong/.meta`) · `ds-stats /
  ds-stat` (3px accent edge) · `ds-tabs / ds-tab` and `ds-seg` · `ds-note` · `ds-toast` · `ds-tip` · `ds-empty` ·
  `ds-skel` · `ds-progress` · `ds-popover` · `ds-modal`. All names start with `ds-` (the app has global `.ok/.up`).
- New customer-app UI uses these; existing screens are converted screen by screen (owner confirms the order).
- **Conversion done (owner 2026-11-03: "proceed all")** — Builder, Analyser, Research, AI Mode, sign-in, Docs, Quick guide,
  Helpdesk, top bar, owner detail view. What changed and the rules that now hold for every customer screen:
  - One typeface: `--mono` is Inter (no IBM Plex Mono). Aligned figures via `font-feature-settings:"tnum"` on
    `td, th, b, strong, input, output, .mono, .num, .sym, .pct, .ds-num` — NOT on the body (Inter's tnum widens hyphens in
    prose) and NOT `font-variant-numeric` (the `font` shorthand resets it). Prose inside a table cell (the builder fact
    sheet) sets `font-feature-settings:normal`.
  - Scales (applied by a normaliser over every customer stylesheet): weights 400–700 only; sizes 10 · 11 · 12 · 13 · 14 ·
    16 · 18 · 20 · 24 · 32; radius 4 buttons · 6 fields / chips / tiles · 8 cards / popovers · 12 large panels · pill.
    Caps labels = 10/16 600 +0.6 px; table headers = 12/16 700 caps +0.4 px, 40 high; rows 48; numbers right-aligned.
  - Readable secondary text: `--t3` darkened (light #66778e, dark #6a84a2) and `--t2` (dark #8da4bf) so meta text passes
    4.5:1. Filled buttons in light mode use `--ds-action-bg` #0e7490 (white text 5.4:1); dark mode keeps cyan + dark text.
  - Buttons: `.px-btn` = K4K l (36, radius 4, inset border), `.pf-go` / `.primary` = xl (40) filled; chips = pill 24–32
    with tint + `--accb` border when selected; section tabs = underline (`.bd-tabs`, `.tabs`); switchers = pill
    segmented (`.px-seg`, `.sv-pills`); summary tiles = 3 px accent edge on the LEFT (`.bd-kpi`, `.kpi`, `.sx-stat`).
  - **Icons: no emoji / unicode glyphs.** `core.jsx` exports `Icon` (Lucide paths, ISC; stroke 2 at 12 px, else 1.5),
    `AiSpark` (the "Hyperplane AI" mark, our purple `--ret`) and `TONE_ICON` (verdict tone → icon). `combinedView` titles
    are plain words ("Best case — with the tide") + `icon`; never put a glyph back into a label. The shared Helpdesk has
    its own small `HdIc` (admin uses it too). ⓘ = the Lucide info icon (`Info`). Add new icons to `ICON_PATHS`.
  - The shared Helpdesk is styled for the customer app with `.shell …` overrides in shell.css.js (the module's own CSS
    loads later; admin never loads the customer CSS). Top bar: help (Quick guide) and bell = 32 px subtle icon buttons,
    account = ghost pill.
  - Screenshots before / after: scratchpad `ds_shots.py <tag> [screens]`.

### Forgot password + customer email (owner, 2026-11-02) — `backend/app/mailer.py`
- Owner: "people forget the password … provide the forget password option … I don't have a company email or a mail
  server". Sending goes through **Brevo** (transactional email, free tier) over SMTP — config.ini `[mail]`:
  smtp_host, smtp_port (587 STARTTLS · 465 SSL · `security = none` only for a test inbox), smtp_user, smtp_password
  (Brevo "SMTP key"), from_email (a Brevo-verified sender), from_name, reply_to (optional Reply-To, e.g. support@ while
  sending from no-reply@; owner wants a professional sender once a domain is bought), **public_url** (links start with it — never
  the request's Host header). `config.mail()` is None until host, from_email and public_url are set.
- **Who does what**: the customer service never sends mail and never reads config.ini. It calls 3 SECURITY DEFINER
  functions (its only rights here — no access to `password_resets`, `email_outbox` or `customers.pw_hash`):
  `portal_password_forgot(email, token, ip)` → 'sent' / 'limited' (3 links per customer per hour) / 'none' (no
  approved / pending account); `portal_password_check(token)` → masked email or NULL;
  `portal_password_reset(token, hash)` → new password, `session_ver` + 1, every session ended ('password_reset'),
  other open links used, a "password changed" email queued. The worker's `MailThread` (every 3 s, apart from the
  collection loop) sends `email_outbox`; a reset email still waiting after 30 min → 'expired'; failures retried 5×
  with a growing wait; `data` (name, token) is wiped once sent / failed / expired; rows kept 90 days.
- Link = `<public_url>/app/#reset=<token>` (secrets.token_urlsafe(32); the DB keeps only its SHA-256; after `#` it never
  reaches a server, a log or a link scanner); one use, 30 minutes. The app reads it once (`takeResetToken`, also on
  `hashchange`) and wipes it from the address bar.
- Endpoints (public — listed in `route_guards.PUBLIC`): `POST /app/api/password/forgot` (same answer for every email;
  5 per IP / 15 min, 3 per email / hour), `/check`, `/reset` (8–128 characters). Admin: `GET /api/admin/mail` (set up?
  sent / waiting / not sent in 24 h, last error) and `POST /api/admin/mail/test` (sends at once, plain reason on failure).
- UI: sign-in "Forgot password?" → `#auth-forgot`; the link → `#auth-reset` ("Choose a new password for p•••@…"), a used or
  expired link → `#reset-dead` + "Send me a new link"; success → sign-in with the message, email pre-filled. Admin →
  System & settings → "Customer email" card (`#mail-card`, `#mail-test`). Audit log: `reset_requested` (result) and
  `password_reset` (by "email link"), filter "Password resets".
- Tests: `pw_api_test.py` (34) and `pw_ui_test.py` run against a test inbox (`mailtest/smtp_sink.py`, started with
  `docker compose run -d --no-deps --name hp-smtpsink -v <scratch>/mailtest:/sink worker python /sink/smtp_sink.py`); they
  stop the real worker, run a sender with `CONFIG_PATH=/sink/mailtest.ini`, and start the worker again.

### Free float — AI Portfolio Builder (owner, 2026-11-02)
- Owner: "77,516 shares a day — does the ticker have that many shares to trade? … I added 3 more columns … free float =
  grand_total_number − total_foreign_promoter_and_group_number − indian_promoter_and_group_number … the option to use
  the free float … don't go to the max, only some amount is possible — check how much an institution can buy … else
  show it in the stock's details once the share count is alarming … give the i button".
- **Master screener** now has 32 columns: the 29 + `grand_total_number`, `total_foreign_promoter_and_group_number`,
  `indian_promoter_and_group_number` → records / Master_Stock_Data `Total_Shares`, `Promoter_Foreign_Shares`,
  `Promoter_Indian_Shares` (`chartink_fast.SHARE_FIELDS`, by header name, `MASTER_LAYOUTS[32]` by position; at the END
  of the sheet; blank → None, also when the copied row lost its trailing blanks). Flattened copies now require the
  row numbers to run 1, 2, 3 … (a wrong chunk size used to turn volumes into "stocks").
- `liquidity.free_float(m)` → `[free-float shares, all shares]`, None when the total or both promoter counts are blank or
  the numbers don't add up. publish → per stock `ff`.
- **Standard (Claude's proposal, owner may tune — `liquidity.FLOAT_CAP` / `FLOAT_WATCH`)**: one portfolio holds at most
  1 % of a stock's free float; from 0.25 % the holding is shown in the stock's details. `SEBI_LINES` on ALL the
  company's shares, the highest reached is shown: > 1 % named in the shareholding pattern (LODR) · 5 % disclosure
  within 2 working days (SAST Reg 29) · 10 % mutual-fund ceiling / FPI → FDI · 25 % open offer (SAST Reg 3).
- builder: option `by_float` (More options "Size by free float", standard OFF; customer-level access can't change it →
  403). ON: `capof` also ≤ 1 % of the free float (`floatcap`), a stock whose float cap is < 30 % of its slice is
  replaced (`small_float`). Per pick `ff` {status light / watch / over / capped / unknown, show, free, total, free_pct,
  held, held_total, most, most_amt, cap_pct, line}; response `float` (by_float, over, over_amt, capped, watch,
  unknown, replaced, max_held); notes.
- **Holdings accordion (owner, same day: "Key points, Volume analyser and Free float for all the stocks … the content
  looks clumsy … the accordion itself not so good … an accordion for the market-cap level")**: every stock's expanded
  row = `KeyPoints` (`#kp-SYM`, full width) + `VolCard` (`#vc-SYM`) and `FloatCard` (`#ff-SYM`) side by side (stacked
  below 1100 px). Each part is a `Section` card: title + ⓘ, verdict `Pill`s top right (ok / low / cap / bad / mute),
  label · value · note `Row`s (`.bd-kv`), warnings in one "What to watch" box (`.bd-watch`, red when over). Small
  positions keep short versions (no clutter) but all 3 parts always show. A click anywhere on a row opens it (links and
  buttons excepted); the open row has an accent bar. Market-cap group rows are buttons (`#bd-grp-Large` …,
  `aria-expanded`) that fold their stocks; `#bd-gall` folds / shows all groups. Test: `acc_ui_test.py`.
- **Fact sheet (owner, same day: "the volume analyser for all … 4 weeks and months, the quarterly volume as well … the
  same order for all … the boxy alignment is boring, make it professional")**: the open row is ONE sheet (`.fs-sheet`)
  — Key points = the same 8 facts for every stock from `kp` (builder.candidates: st, qstreak, qturn, qhold, breakout,
  regime, rel, ind, r3) with a status dot; Volume analyser = 4 headline numbers (normal trading, you can buy, days to
  buy, price push) + `VolHistory` (last 4 weeks · months · quarters on one scale, real period names from `as_of`,
  dashed normal level; quarters = liquidity `qt`, packed LAST in `vl` so older views still unpack) + 3 lines; Free
  float = 3 headline numbers + `FloatMeter` (your share against the 1 % standard) + 3 lines. No short "light" version
  any more; a missing figure is a dash. Status classes are `t-ok / t-low / t-bad …` — the customer app has a GLOBAL
  `.ok` (sign-in message box) and `.up`, never reuse those names.
- **Owner follow-ups (2026-11-03):** Key points = only 4 tiles — Long-term strength (−100…+100, first), Trend (quarterly),
  Long-term regime, Reliability (`kp` still carries the rest for the download / later use). Volume history = compact mini
  bars (`.fs-strip`, labels UNDER the bars) for 4 weeks · 4 months · 4 quarters · 4 years (liquidity `yrs`, packed last
  in `vl`; republish to fill it). "Normal trading" is worded as an average: "Avg. daily volume 22.33 L · avg. shares a
  day" (the word avg only: no ~ signs, no unit lessons such as "Cr = crore"). The 4 strips sit in one row at every width
  (4-column grid, bars shrink). Old saved results (no `kp` / `qt` / `yrs`) fall back to the reasons list / fewer
  strips. Research: Bidirectional removed everywhere (always 0 since the regime squeeze makes a timeframe against the
  regime sideways, so G and W never meet); Master data tools compact (32 px, 12 px) on the right of the title.
- UI (first version): the option with ⓘ (`#bd-float`, `#bd-ff-y/n`); in a stock's expanded row a "Free float ⓘ" card
  (`FloatCard`, `#ff-SYM`; now for every stock — see the accordion above); "⚠ x% of free float" under the Liquidity cell
  (`.bd-ffx`); banner `#bd-ffbanner` / notes `#bd-ffcapped`, `#bd-ffrepl` in the Volume analyser; 5 download columns;
  a Guide bullet. Tests: `ff_parse_check.py`, `ff_api_test.py`, `ff_ui_test.py`.

### Volume analyser — AI Portfolio Builder (owner, 2026-11-01)
- Owner: "I added the volume for the quarterly and yearly too, and the last few weeks, months, quarters and years …
  not just how many days to buy … a lakh of volume doesn't mean we can acquire all of it — there should be a standard
  … if a stock doesn't help, give the max it supports and focus on the others … with sizing off, warn in the table …
  exact output and a better order to proceed".
- **Master screener** (chartink all-data-of-the-stock-2) now has 29 columns: Sr, Stock Name, Symbol, close, %_change,
  Daily_volume, Weekly_Volume + _1…_4, Monthly_volume + _1…_4, quaterly_volume + _1…_4, yearly_volume + _1…_4, sector,
  industry, marketcapname. `parse_master_table_clipboard` reads the header row BY NAME when present (`master_header_fields`,
  blanks kept as None — young stocks have no yearly candles), else by position (`MASTER_LAYOUTS` 29 / 11 / 9); records
  carry `chartink_fast.VOLUME_FIELDS` (`Weekly_Volume`, `Weekly_Volume_1` … `Yearly_Volume_4`; "_0" = candle so far).
- **`backend/app/liquidity.py`** (publish time, per stock → `vl` packed list + `av` = dependable shares/day):
  per-day volume of each COMPLETED candle (volume ÷ its weekdays, real calendar from the collection day; the current
  candles only spot spikes) → normal = median{median 4 weeks, median 4 months, last quarter}; dependable = min(normal,
  4-week median); trend (4 weeks vs 4 months, ≥1.3 / ≤0.7), spike (today or this week > 3× normal), erratic (monthly CV
  > 0.6), grade by ₹ a day (≥50 Cr Very high · ≥10 Cr High · ≥2 Cr Moderate · ≥50 L Low · else Very low), swing =
  D_ATR / price. Old collections (11 columns) fall back to the week / month so far (n = 0).
- **Acquisition standard** (builder.py `_liq`, `L.capacity`): buying pace option careful 5 % / standard 10 % / fast 20 %
  of a normal day (participation rate); Low / Very low never above 5 %, erratic halved; whole shares a day =
  floor(pace × dependable); most the stock supports = 5 days of that (`BUILD_DAYS`) = also sellable within ~10 days if
  trading halves; price push ≈ swing × √pace. Sizing ON: cap = min(single-stock limit, supported money) through
  `_fill` (rest → other stocks in the group, cash only when all full); a stock supporting < 30 % (`MIN_USEFUL`) of its
  slice is replaced by the next candidate (note "Replaced …"); note "Trading volume is the limit at this amount" when
  cash rises because of it. Sizing OFF: plan unchanged; status "over" + warning "₹X is N× what this stock's trading
  supports … N days to buy … N days to sell in a hurry". Per pick `liq` {status fits/capped/over/unknown, grade,
  dep, norm, value, pace, per_day, most, most_amt, days, exit_days, share (% of one day), push, trend, spike, erratic,
  wk, mo, warn[]}; response `volume` (KPIs, grade shares, replaced) and `plan` (`buying_plan`: computed per day without
  looping — day 1 finishes every one-day stock + first slice of the rest, slowest first, best-ranked first; first 30
  days listed, the rest summed in `more`).
- **Result page layout (owner, same day):** the ℹ notes list and "How Hyperplane AI picked these" are REMOVED (the API
  still returns `notes`); sticky **section tabs** (Overview · Allocation · Volume analyser · What to buy · Buying plan,
  `SectionTabs`, IntersectionObserver lights the tab in view, `scroll-margin-top`); every stock row has an expand
  button IN FRONT (`.bd-xbtn`, + / − expand-all in the header) opening "Why it was picked" (the old column) and below it
  the "Volume analyser" card; the volume column is "Liquidity" (grade + Within limit · N days / Capped at limit / ⚠ N×
  over limit); the section is "Volume analyser" with KPI names Liquid allocation · Execution period · Within / Over
  liquidity limit · Est. market impact, each with an ⓘ, plus a "Liquidity grade" ⓘ; the education-only line stays.
- **UI** (`apps/builder.jsx`): "Buying pace" chips in More options; the "Days to buy" column became **Volume** (grade
  badge + Fits · N days / Kept to its limit / ⚠ N× too big; click → volume card with trading, last 4 weeks / months
  strips, what it carries, your position, warnings); **Volume check** section (KPIs, grade bar, banner listing
  over-sized stocks when sizing is off, replaced stocks); **Buying plan** (Day 1 … with shares, ✓ = stock finished,
  "Show all", the rest summarised, order-placing tips); the download adds the volume columns and the plan.
- Tests: `parse_check.py`, `liq_check.py` (13), `vol_api_test.py` (16), `vol_ui_test.py` (14); builder suites pass.
  Local collections only have the old 11-column master, so the strips show "not enough history yet" until the next
  scanner run with the new screener.

### Customer Admin + permissions + stock detail view (owner, 2026-11-01)
- Owner: "click the stock name in the AI Portfolio Analyser or Builder → monthly, quarterly and yearly zone range, the
  mother candle status, is any NR supporting the trend, has the regime helped, the technical table … draw the zone with
  the mother candle … only the admin, to judge whether the result is right … don't give this access to anyone … be clear
  with the RBAC (e.g. builder: permission, display, detail view) … bring the best standard".
- **RBAC standard (NIST RBAC):** customer → roles → permissions, each permission = `application:action`.
  `application:view` (open and use it) = the `role_modules` row; `app_permissions` is the catalogue of EXTRA actions
  (`portfolio:detail`, `builder:detail`; fixed, seeded in the schema, `restricted` = owner-level); `role_permissions`
  holds them per role. Rules (API, `main._clean_perms`): a permission needs its application in the SAME role; an
  application taken out of a role takes its permissions with it; restricted permissions are never on the default role
  (and a role holding one can't become the default). Effective = permission held by any role AND its application
  enabled + allowed (`portal.PERMS_SQL` → `c["perms"]`; `/me.perms`; `need_perm(key)` → 403 + `X-Access: denied`).
- **Role "Customer Admin"** (seeded once, settings `customer_admin_role_seeded`; a role of that name made by hand is
  REUSED): every application + every restricted permission, given to nobody. Owner assigns it to himself in Access
  manager → User access mapping. Owner-level holders are flagged everywhere (🔒 badge in roles, users, matrix, person drawer).
- **Admin UI (access.jsx):** role editor shows each application card (`key:view · open & use`) with its extra permissions
  nested under it (keys shown in mono); warning box when a role holds owner-level permissions; new section
  **Permission matrix** (every role × every permission, owner-level holder count). Person drawer lists extra permissions.
  Activity log event `detail` ("Stock detail viewed": symbol, application, day) + filter "Stock detail views".
- **Data:** `detail.build_all(sheets, payload, candles)` — per stock: zones D…Y, per M/Q/Y the zone history (bar k ago),
  steps → T, P, place, mother candle n / points / weight, strength (same `zone_engine` arithmetic, test-verified equal
  to zv), 13 candles, NR signals; regime lines/sides + short/long verdicts + held timeframes; technicals (regime line
  sent as key `ST`, its name only in `meta.line_name` — keeps "upertrend" out of the customer bundle); Failed_NR rows.
  Stored by `publish.build_history` in `stock_detail` (PK snapshot_id+symbol, gzip per row — rows are too small for
  TOAST — plus a `~meta` row) for collections of the last `detail.DETAIL_DAYS` (14) days; `history_missing` includes
  missing detail; worker cleanup drops detail + candles older than that. ≈5 MB a collection with candles.
- **Endpoint** `GET /app/api/detail/{symbol}?app_key=portfolio|builder[&date&part]` (permission `<app>:detail`; the
  Analyser follows the day on screen, the builder always the latest). Row-level security: hp_portal may SELECT
  `stock_detail` only while `hp.cid` (set per transaction by `_own`) holds a detail permission — a service bug cannot
  leak it. hp_portal has no grant on `snapshot_candles`. Every look is logged. Rate 120/min.
- **Customer app:** `core.DetailCtx` + `StockLink` (names / tickers become links only with the permission); the view is
  its own lazy chunk `apps/detail.jsx` (+ `detail.css.js`) — never downloaded by other customers. Owner's second ask
  (same day): "very simple, like a checklist — is it satisfied … don't make me calculate … animated picture, not the
  original chart … colour the zones … zone and where the candle breaks on one picture for every timeframe … simple
  words". Right-side panel, top to bottom: verdict (score, "Good uptrend", ✓ Helping / ✗ Holding it back in words) →
  CHECKLIST (rows: zone moving up · price in the upper part · mother candle breaks the right way · regime agrees;
  columns M / Q / Y; ✓ / ✗ / –; result row with the share of the final score) → "About the stock" checks (regime up,
  history healthy, no big run-up, listed long enough, quarterly not negative) → "How the final score adds up" (each
  timeframe adds / takes away X, diverging bars, final score; ⚠ only if the parts don't add up — `pyRound` = Python
  half-to-even) → one ANIMATED zone picture per timeframe, drawn to the zone, NOT to price scale (`zoneScale`:
  piecewise — above / top band / upper half / lower half / bottom band / below get fixed heights, green tints at the
  top, red at the bottom, the price's band outlined): mother candle (purple) + the candles inside it (grey) + latest
  candle (green / red) with ▲ / ▼, dashed mother box, price line + tag sliding in; mini "last 5 zones" steps; one plain
  sentence underneath. "↻ Play again"; reduced-motion respected → technicals with a plain reading (Strong / Weak /
  Trending …) → raw numbers only in a closed "For checking" section. No code words (NR7, T, P) on screen. An error
  boundary keeps a bad record inside the panel. Escape / ✕ close; phone = full width, pictures stacked.
- Tests: `detail_api_test.py` (33: catalogue, seed, rules, /me perms, 401/403/404/422, worked-out = zv for every
  timeframe + 60 stocks' weighted totals, per-application permission, app switched off, live role removal, RLS as
  hp_portal, no grants, activity log, candles out of collections) · `detail_ui_test.py` (normal customer: plain names
  and the chunk never loads; Analyser + Builder clicks, chart parts, hover, 30 builder stocks add up, phone, console,
  admin role editor + matrix; screenshots `detail_*.png`, `admin_role_perms.png`, `admin_matrix.png`).

### Mother candle (NR) breakout in the long-term engine (owner, 2026-11-01)
- "Add the mother candle breakout / breakdown — treat it as the zone breakout or breakdown, give the same score — as a
  parameter of the strength; slight variation by the child count." `zone_engine.nr_map(sheets)`: per stock M / Q / Y
  from `Flat_Data_For_Slicers` NR_PATTERN Breakout (+n) / Breakdown (−n), n = mother bars back (4…12 = 3…11 child
  candles; the longest n wins; breakout and breakdown on one timeframe = ignored). It is ONE POINT of the timeframe
  strength (owner: "−49 to −80 is too huge … only one of the points"): strength = 100 × (0.6 T + 0.4 P) +
  `nr_points(n, place)`, kept within ±100. The points depend on WHERE the price sits in that timeframe's zone
  (owner: "breakdown above the zone top = retracement, still strong; inside the zone the meaning is different") —
  `nr_place`: the scanner's {tf}_Position bands (ABOVE_TOP / IN_TOP_BAND / IN_BOTTOM_BAND / BELOW_BOTTOM) + the engine's
  rel (≥ 0.5 = upper half) for INSIDE. `NR_POINTS` (breakout, breakdown): above +10/−2 · near top +10/−5 · upper half
  +7/−6 · lower half +5/−8 · near bottom +4/−10 · below +3/−10, × `nr_weight` 0.94 (NR4) … 1.00 (NR12). Near High /
  Near Low / Back to NR = 0. The scanner flags BO/BD only ON the breakout candle (bars 1..N−1 must be inside the
  mother, so the next candle is never a breakout again; back inside = nothing). zv timeframe arrays: 6th item ±n,
  7th item the place index in NR_PLACES (−1 none); the regime gate keeps both. Rejected versions: P lifted to the
  breakout level (−49 → −80), flat ±10. Analyser reasons per place ("…slipped back after being held for the last N
  quarters, but it is still above its usual quarterly price level. A pullback; it stays strong." etc. — NR_SAY in
  portfolio-engine.jsx). 29 Oct: 93 stocks, 76 timeframe strengths moved, 3 stocks Keep an eye on → Look at first.
  The Research / AI Mode strength already scored NR Breakout like a zone cross (EVENT_W 1.0 each) — unchanged.

### Customer app = shell + micro-frontends (owner, 2026-11-01: "not a monolithic single file … load fast, consume what we use")
- `frontend/app/src/main.jsx` = 13-line entry (theme, shell styles, render). `shell.jsx` = sign-in, side menu, top bar,
  past-days picker, data loading and `APP_MODULES` (React.lazy). `core.jsx` = shared vocabulary / helpers / small
  components (+ `addCss(id, css)`). `apps/research.jsx` · `apps/simple.jsx` · `apps/portfolio.jsx` · `apps/builder.jsx`
  = one lazily loaded chunk per application, each with its own `*.css.js` (added on first load); `apps/portfolio-engine.jsx`
  = the long-term engine shared by the Analyser and the Research stock card's Investment Summary. `guide.jsx` (Docs) is
  lazy and adds its own CSS. `shell.css.js` = shared styles. A NEW application = a new `apps/<key>.jsx` (default export)
  + an entry in `APP_MODULES` + its row in `app_modules`; never import an app module from the shell statically.
- Kept alive: an opened application stays mounted (hidden) while the customer moves between apps → inputs, results,
  filters and scroll position stay ("I have to go where I left"); scroll per app restored on return. The Builder also
  keeps its last plan in sessionStorage `qf_builder_res` (survives a reload in the tab).
- Data on demand: `/app/api/data` + `/history` load only once Research / AI Mode / Analyser is opened (Builder, Docs,
  Helpdesk never fetch it). `/app/api/data` sends `ETag W/"p<published id>"` (history `W/"h<snapshot>"`) → 304 when the
  browser already holds it. Caddy: `/app/assets/*` `Cache-Control: public, max-age=31536000, immutable` (hashed names),
  everything else under /app `no-cache`.
- The split was made by a script from the old single file (CSS split by which module uses a class; shared rules that
  came after an app rule touching the same element are copied into that app's CSS to keep the cascade). Verified by a
  17-screen pixel comparison before / after (identical except an animated glow) + all test suites. Sizes (gzip): shell
  ~94 KB (mostly React) · research 12 · simple 5 · portfolio 11 + engine 5 · builder 14 · docs 15 (was one 134 KB file).

### Hyperplane AI Portfolio Builder (owner, 2026-10-31) — app key `builder`, its own role
- **Access:** application `builder` (4th in `app_modules`). NOT in the default "Customer" role (`db.CUSTOMER_APPS` =
  research / simple / portfolio — `_seed_roles` no longer gives the Customer role "every application", so a fresh
  production DB is right too). Role **"AI Portfolio Builder"** = every customer dashboard + builder (`BUILDER_APPS`),
  seeded ONCE (settings key `builder_role_seeded`, so deleting it later does not bring it back), given to NOBODY — the
  owner assigns it in Access manager. NEW ACCESS IS PINNED (owner 2026-11-01): `main._pin_new_apps` runs on every role
  assignment (`_assign`) and when apps are added to a role (`update_role`): a customer with SAVED pins gets the newly
  gained apps added while there is room (a full menu gives its last place to the first new app); no saved pins = no
  write (the default menu shows the first 6 in catalogue order; builder is 4th). `POST /app/api/builder` = `need("builder")` → 403 + `X-Access: denied` otherwise;
  rate 30/min per customer. `builder` is also a DATA_APP.
- **Engine** `backend/app/builder.py` (pure, runs in the customer service on the LATEST published view, parsed once per
  publish; ~5–40 ms). Inputs: amount ₹10,000…₹100 Cr · stocks 5…250 (UI presets 20/30/50 + Custom) · mix Large / Mid
  / Small / Cash summing 100 with Cash ≥ 5 % (`CASH_MIN`, the buffer). Presets (owner 2026-11-01): Large 70/10/10/10 ·
  Mid 20/50/20/10 (owner wrote 20/50/10/10 = 90 %; small set to 20 — confirm) · Small 15/15/60/10 · Multi 25 each) · reliability High always, + Medium optional, Low refused (422) · sector limit 15/20/25/30/40/100 (default 25 %)
  · money split equal | strength. Eligible: AI Portfolio view `zv`, ≥3 years history, a Large/Mid/Small cap, chosen
  reliability, LONG-TERM REGIME UP (`rp[0] == 1`; skipped only if the collection has no regime at all), NOT already
  run up (stretched `x`, or `r3` > 30 % in 3 months). Tier 1 = zone engine green ("Doing well"); tier 2 ("Building",
  marked) = strength ≥ +10 and quarter ≥ 0, used only after tier 1 runs out in that group. Conviction = long-term
  strength ± weekly regime (+6 / −10) + High reliability 5 + quarterly up-streak 1.5×(≤4) + industry/sector long-term
  strength tie-breaks − already above this month's zone 4 − 0.5 per % of r3 above 20. Build: stocks per group by the
  mix (largest remainder); round-robin best-first; skip when one share > its slice, the sector would pass its limit
  (money) or the industry already holds max(2, 10 % of N); whole shares; top-up pass (≤ +15 % of a stock's slice);
  a group with fewer picks than asked SHARES its money among the picks it has (owner 2026-11-01: "I kept 10 % cash, the
  plan kept 50 %" — the earlier "missing stocks' money stays cash" rule was wrong): `_fill` water-fills each group's
  money by weight with one stock ≤ `STOCK_MAX` 10 % of the amount (or the plan's own slice if bigger) and every sector
  ≤ its limit; stocks first skipped as too costly get a second chance with the bigger slice; top-up buys stay within
  both caps. Cash ends at the customer's choice (tests: ±2 points at ₹10 L+); when the caps leave extra, a note says so. Weights stay server-side; customers see plan + reasons.
- **UI** (`BuilderView`, now `apps/builder.jsx`): landing = only the inputs (amount with Indian commas + chips, count, style
  cards + 4 sliders/number boxes where a stock group can only eat cash down to 5 % and the cash slider rescales the
  groups, reliability chips with Low locked, "More options"), last inputs in localStorage `qf_builder` (validated on
  load). Result: KPIs (amount, invested, cash kept, stocks, average strength), where-the-money-goes bar + table (chose
  vs plan — `MixBar`: one 100 % bar per row, 2 px gaps, % printed on parts ≥ 9 %, cash = hatched grey with a solid
  label chip; colours = dataviz reference slots 1–3 `--mx-l/m/s` per theme, validated with validate_palette.js, cash
  `--mx-c` neutral), sector bars, notes, "What to buy" grouped by cap (price, quantity, amount, weight, strength, why chips,
  "Building" tag, cash row), how-it-picked + disclaimer; Edit inputs · Ticker copy · Download (Excel = CSV with BOM) ·
  Send to AI Portfolio Analyser (only when the plan has portfolio): shows how many stocks the list holds and asks
  "Add to my list" (keep them, add the new) or "Replace my list" (erase, keep only the plan's) — `addToPf(syms, mode)`.
  Docs section `builder` shows only for customers holding it (`Guide apps=`). Admin Access manager icon added.
- 2026-11-01 v2 (owner: "more powerful … up to 1000 stocks … ₹10,000 to ₹10,000 crore … more fields … quant: zones
  with the regime"): limits 5–1,000 stocks, ₹10,000–₹10,000 Cr. `opts` (POST body, all optional): horizon long (M20 Q50
  Y30 = engine weights) | medium (M45 Q40 Y15) blends the zone engine's per-timeframe strengths; quality strong (≥40) |
  good (≥24) | building (≥24, then ≥10 fill, default); confirmed (weekly regime up too); stock_max 5/10/15/20/25 %;
  run_up 20/30/50/0 (3-month rise cut; stretched 3x always out); fno_only; exclude [sectors]. Ranking adds zone
  stepping (3 × quarterly zone trend code + 1.5 × yearly ± 3 quarter-on-quarter zone step). Notes: price-too-high per
  slice, liquidity (per-stock ₹ above LIQ_WARN Large 50 Cr / Mid 10 Cr / Small 2 Cr → buy over several days), left-out
  sectors. `POST /app/api/builder/preview` (need builder, 120/min): counts per cap (strong / building) + sector list —
  counts only, no names — drives the live "N stocks pass every check today" on the form. Today: ~230–305 pass, so a
  1,000-stock ask returns what passes and keeps the cash share (notes say so).
- UI v2: allocation table (segment + index definition, slim slider, −/+ stepper, ₹ amount, cash row "at least 5%",
  thin summary bar, "100% allocated"); market caps in ONE blue in three shades (large = most contrast; reversed in dark;
  owner: "why green for small cap — it confuses"), cash hatched grey; diversification check `spreadCheck` (guide ranges
  by amount: ≤2 L 8–20 · ≤10 L 15–40 · ≤50 L 20–60 · ≤2 Cr 30–80 · ≤10 Cr 40–150 · ≤100 Cr 60–250 · above 80–500;
  "Less diversified" below, "Spread too thin" under ₹10,000 per stock, "A very wide spread" above; one-click "Use N
  stocks") on the form and the plan; sector list = every sector, scrolls in its card, click / dropdown filters the
  "What to buy" table. More options: horizon, trend quality, regime, run-up, stock limit, F&O only, leave out sectors,
  sector limit, money split ("N changed" in the summary).
- 2026-11-01 v3 — TRADING VOLUME: the master screener `all-data-of-the-stock-2` now has Daily / Weekly / Monthly volume
  (11 columns: Sr, Stock Name, Symbol, close, %_change, Daily_volume, Weekly_Volume, Monthly_volume, sector, industry,
  marketcapname; `_row_to_record` still reads the old 9-column layout; flattened copy chunks 11/9/8) → Master_Stock_Data
  `Volume`, `Weekly_Volume`, `Monthly_Volume`. publish `avg_volume` → per stock `av` (shares/day) = the LOWER of
  weekly ÷ weekdays elapsed this week and monthly ÷ weekdays elapsed this month (candles are "so far"; a spike day must
  not make a stock look easy); falls back to the day's volume. Builder: LIQ_PART 10 % of a normal day, LIQ_DAYS 5.
  Every pick carries `days` (= qty ÷ (10 % × av)); option `by_volume` (owner: "volume for the suggestion, not the
  quantity — give a yes / no option"): No (default) = suggestions only (note + "Days to buy" column, amber > 5 days);
  Yes = each stock's cap = min(single-stock limit, 5 days × 10 % × av × price) in selection, water filling and top-up.
  Sector limits now 5/10/15/20/25/30/40/none. UI: option names Leaders only / Proven trends / Proven + emerging,
  Uptrend regime / Confirmed uptrend, Size by trading volume No / Yes (cards with a one-line explanation); amount chips
  from ₹10 K and ₹50 K; big money on the plan via `money()` / `<Money>` ("₹7,500 Cr", full figure on hover) and
  quantities via `qtyTxt` ("21.79 L"); spread advice suggests the HIGHER end (owner: "9 stocks for ₹1 L → go with 20"):
  below the middle of the range → "Could be more diversified · Use <top>", min ₹2,500 per stock, ≤₹50 K 5–10; on the
  plan only when it holds what was asked. Class names `is-warn / is-info / is-ok` (a bare `info` clashed with the shared
  ⓘ style — the 1,000-stock note collapsed).
- Tests (scratchpad): `builder_api_test.py` (role, refusals, 5 input sets × every rule, speed, determinism),
  `builder_ui_test.py` (Selenium: menu by role, defaults, mix rules, build, Excel, add to Analyser, phone, dark).

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
4a. Access changes (routes, permissions, roles, limits): `python -m app.route_guards` (api) and
    `python -m app.route_guards portal` (portal) report 0 without a check, plus the tests in "Access rules for every
    feature" (§7).
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

**Own domain (owner, 2026-10-20):** `quantfriday.in` bought at Hostinger (Hostinger nameservers). Plan: admin + customers
on `hyperplane.quantfriday.in` (customers at /app); DNS A record `hyperplane` → server IP 130.210.46.117. Server `.env`:
`DOMAIN=hyperplane.quantfriday.in` and `OLD_DOMAIN=hyperplane.duckdns.org` — the Caddyfile's `{$OLD_DOMAIN}` block
301-redirects the old address to the new one keeping the path (compose default = unused `http://old-address.localhost`).
Switch `.env` only AFTER the new name resolves, or Caddy cannot get the certificate. Customers sign in once on the new
address (cookies are per address). Keep the DuckDNS updater running a few months for the redirect.

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

- RSI-70 + ATR (owner, 2026-10-11): technical-data screener now has `d_rsi_70`… (RSI, 70-bar look-back) and ATR columns.
  Scanner `_TECH_KEYS` maps rsi_70 → `rsi70` (tested BEFORE rsi) and atr → `atr`; Technicals sheet adds `X_RSI70`, `X_ATR`.
  Owner rules: RSI-70 bullish ≥ 70 · bearish ≤ 40; ATR works like ADX (no direction; rule "below 70" by default, when met
  it confirms the Supertrend side). ATR is in RUPEES (ChartInk/TradingView standard; ATRP is the % version) — the
  report tooltip also shows ATR as % of price. Tech score divides by the indicators the stock HAS (6 old, 8 new) in
  both `_tech_net` (publish.py) and `buildTechIndex`/`withTechSignals` (`techCount`). Algo builder: fields `rsi70`, `atr`
  (also in main.py `ALGO_FIELDS`); ready-made algos include both; a rule on a TIMEFRAME + indicator no stock has data for
  (e.g. Yearly RSI-70 — needs 70 yearly candles) is skipped (counts as met) with a ⚠ note.
  Real screener header 2026-10-11 (owner's full paste): d..y_rsi_70, d..y_cci, d..y_atr all present → 45 indicator
  columns recognised (verified with the scanner's own reader). Real ATR is in RUPEES (scales with price: RSYSTEMS ₹274 →
  D 19.4, Q 104.7, Y 143.6) — so "ATR below 70" passes for almost every cheap stock and fails for costly ones on M/Q/Y.

- Customer PAST DAYS (owner, 2026-10-11): admin switch in Admin → Customers → "Past days for customers"
  (`portal_config.history`, SECURITY DEFINER `portal_history_enabled()`, routes GET/PUT /api/admin/customer-history).
  Table `customer_history` (snapshot_id PK → snapshots ON DELETE CASCADE, trade_date, taken_at, slot, stocks, data_gz) =
  the same labels-only payload as `published` (`build_history` in publish.py), ONLY for source='scheduled' collections
  (never manual Sync now / imports). Worker: builds right after each scheduled run and back-fills one older collection
  per idle tick, only while the switch is on. Portal role: SELECT + row-level security policy `portal_history`
  USING portal_history_enabled() → with the switch off the database returns no rows. Portal: GET /app/api/history
  (days → open/end times) and GET /app/api/data?date=YYYY-MM-DD&part=open|end (first scheduled run of the day = Day open,
  last = Day end; a day with one run: before noon = open).
  Back-fill is fault-tolerant: a collection that fails to build is recorded in meta `history_failed` {id: error},
  skipped, and shown in Admin; switching past days on again clears the list (retry). Worker logs
  "🗓 Customer past days: prepared collection #N". The customer picker reloads the day list each time it opens. Customer UI: `DayPicker` replaces "Data as of" when on —
  one date + Day open / Day end, no ranges; while on a past day the header button turns yellow ("VIEWING … Day end");
  "↺ Latest data" inside the picker returns (no banner — owner removed it).

- Customer Trend gauge + Simple view (owner, 2026-10-11; v2 same day — owner found v1 "childish"): `TrendGauge` (SVG
  semicircle −100…+100, zones at ±TREND_CUT and ±50, needle = combined `os`) in the stock card (dial only, value + word
  beside it — keeps the one-screen fit at 1366×768) and in the Simple view. Header switch `.face` "Research view |
  Simple view" (no emojis; localStorage `qf_face`). `SimpleView` — professional wording, NO emojis, NO peers section:
  `StockSearch` (ticker / name typeahead, ↑↓ Enter) → name/price → gauge + `combinedView` verdict → "Scores out of 100"
  (stock |os|, sector / industry `st` + rank; tones from `groupState`) → "Trend by period" (diverging horizontal bar per
  period Days…Years: right = up, left = down, "Up 59 / Down 24 / Sideways 14") → "Summary" (fixed order: Trend · Periods
  · Sector · Industry · Rank in industry · Risk · Price change · Conclusion). Uses the current trading mode + past day.
  v3 (owner, same day): page = header → "Quant AI summary" card (overall verdict title + one paragraph built by fixed
  rules: trend → periods disagree → sector & industry → reliability → stretched → `combinedView` text; then 4
  `MetricTile`s: Stock |os| + rank among industry peers, Sector st + rank of N, Industry st + rank of N (Best→Worst
  position line), Historical reliability High/Medium/Low from `h` S/M/W) → Trend meter | Trend by period. "Scores out
  of 100" card and the detail list were dropped (tiles replace them). "Hyperplane AI" branding (renamed from Quant AI, owner): badge on the search, "Hyperplane AI summary",
  landing hero "Understand any stock in seconds · powered by quant algorithms"; info text: our own quant algorithms,
  no outside AI service.
- Past-days switch audit: `portal_config.history_changed` {on, by, at} shown in Admin ("switched on by X on …").
  Verified locally that the switch survives `docker compose up -d --build --force-recreate`.
- Negative side (owner, 2026-10-11): any value below 0 (downtrend side, incl. sideways leaning down) is shown with a
  minus sign and in red — gauge value (stock card + Simple view), Stock tile, Trend-by-period words (`signed()`);
  the summary says "leaning down / up" for sideways stocks.
- Simple view tiles (owner, 2026-10-11): percentage only — no rank, no Best/Worst line, no note under the tiles; the
  gauge, summary text and period rows also use % (e.g. "−49%").
- Simple view, later the same day (owner): "Overall trend meter" = STOCK 50 · SECTOR 25 · INDUSTRY 25 (owner changed it
  from equal thirds) of stock `os`
  (−100…+100) and sector / industry `st` mapped to the same scale ((st − 50) × 2, 50% = neutral); a missing part's
  weight goes to the others; the three inputs are listed under the gauge. Tiles labelled "Stock trend strength / Sector strength / Industry
  strength" + note "trend strength, not how much the price moved". Trading-mode Seg (Balanced / Swing · weeks to
  months / Investing · long term) in the Simple view = the same `mode` as the research filter (also clears TFs).
  Gauge "%" uses the value colour, smaller.
- Docs section 11 "Simple view & the overall trend meter" (owner, 2026-10-11): what the page shows, the meter maths
  (stock as is; sector / industry (x − 50) × 2; weights 50 / 25 / 25; cut-offs ±24 / ±50 / ±75) and the IOC worked
  example (−49, +4, −2 → −24% Moderate downtrend). Gold "must read" sections stay 9 and 10.
- Simple view one-screen layout (owner, 2026-10-11): search + trading mode + Clear on one row; name / price folded into
  the top of the summary card; summary = verdict (left) | 4 tiles 2 × 2 (right); compact rules at max-height 860 px and
  720 px (smaller gauge, slimmer rows, hide the two helper notes). Measured: no scrolling at 1920×1080, 1536×864,
  1440×900, 1366×768; phones stack and scroll.
- Simple view v4 layout (owner, 2026-10-11): search + mode + Clear row → top card (name/price line + "Hyperplane AI
  summary" verdict box full width: professional title + paragraph) → three columns: Overall trend meter (gauge 240,
  210/190 on short screens) | Key metrics (4 tiles 2 × 2) | Trend by period (rows fill the card). Verdict wording via
  `PRO_VERDICT` (maps each `combinedView` title to a professional title + text; the rule is unchanged), e.g.
  "Positive — average group backing", "Strong set-up — fully aligned", "Neutral — no clear trend". Group levels kept at
  55 / 45 + rank (owner: keep as it is). Fits without scrolling at 1920×1080 … 1366×768.
- LEVEL SCALE (owner, 2026-10-11, customer app, both views): `levelOf` on the rounded |value| → Weak 0–30 · Average
  31–60 · Good 61–80 · Strong 81–100 (mirrored for downtrends). Stock words = `${level} uptrend/downtrend`, sideways cut
  (|v| < 24) unchanged. Sector / industry words = levelOf(st). `groupState` (verdicts): Good/Strong (> 60) = backs the
  stock, Weak (≤ 30) = against, else average (old 55 / 45 + rank rule removed). combinedView "Watch — stock still
  building" now = stock ≤ 60 ("only average"). Gauge colour bands ±24 / ±60 / ±80. The Research sector bubble chart
  widget (SectorPanel tooltip + list badges, `strengthLabel` / `strengthCls`) is deliberately UNCHANGED (owner).
- Simple view v5 design: `sx-*` classes — hero card (left: name + ticker chip, sector › industry, price + change pill,
  AI-summary box with professional verdict; right: overall gauge dial with the % BELOW the dial, word, input chips
  "× 50% / × 25% / × 25%") → 4 `Stat` cards in a row (label → name → big % → bar → word pill; reliability = big word +
  note) → "Trend by period" as 5 cells (value with ▲/▼, mini diverging bar, word). Compact rules at max-height 860 / 720.
  Fits without scrolling at 1920×1080, 1536×864, 1440×900, 1366×768.
- Same Overall-trend meter everywhere (owner, 2026-10-11): `OverallMeter` (+ `overallOf`, `trendWordOf`, `dirToneOf`) is
  used by the Simplified view AND the Research stock card (`.om-card`, smaller): dial, % below it, word, input chips.
  The stock card's top: meter (left) | Direction tag (stock summary as its tooltip) + verdict + AI insights (right) — keeps
  the one-screen fit at 1920×1080 and 1366×768. "Trend by period" removed from the Simplified view.
- Naming: header switch "Research view | Simplified view (AI Mode)"; Docs section 11 "Simplified view (AI Mode) & the
  overall trend meter". Simplified-view top bar `.sv-bar2`: search (✕ inside clears ONLY the stock) | "Trading mode"
  pill group (`.sv-pills`) — the old "Clear" button next to the mode was removed (owner: people mistook it for a mode reset).
- RELIABILITY BACK TO THE ORIGINAL RULE (owner, 2026-10-13: "most stocks are Moderate — only huge-drop stocks like VI"):
  `health_status()` in chartink_fast.py — POOR > 70% below peak; WEAK > 50% below peak OR lower than 5 years ago;
  else HEALTHY. The 2026-10-04 crash / round-trip / 3-year run-up / stretched rules no longer change Health (columns are
  still written; `Stretched` still drives the customer 🔥 flag and the "Overextended" verdict). Worker start-up runs
  `rerate_stored_health()` once per `HEALTH_RULES` version (meta `health_rules`): re-rates Price_Health + snapshot_stocks
  in every stored collection from their saved columns, clears customer_history (rebuilt by the back-fill) and
  re-publishes the current customer view. 13 Oct data: Strong 1,458 · Moderate 656 · Weak 335 (was 1,120 / 955 / 374);
  admin "Healthy only" hides 981 (was 1,312). MBECL / STLTECH are Healthy again but Stretched. Stored Excel downloads
  keep the labels they were written with.
- Customer bars (owner, 2026-10-13): `DivBar` — −100 … 0 … +100 with a 0 notch, red-tinted left half / green-tinted
  right half; uptrend fills right of 0, anything below 0 fills left in red. Used by `StrengthBar` (master table Trend
  strength, stock card timeframe rows) and the AI-mode stock stat card (with a "−100 · 0 · +100" scale). Sector /
  industry stat cards keep a 0–100 bar with a "0 · 100" scale. AI-mode stat cards always show the company name (+ ticker),
  the sector and the industry name.
- AI-mode sector / industry cards on −100 … +100 (owner, 2026-10-13, option B): value = the group's strength `st` (same
  number as before) signed by its net bias `nb` (> 0 bullish = right side of the bubble chart, < 0 bearish, 0 neutral);
  `DivBar` like the stock card; word "<Level> · bullish / bearish / neutral" (`grpSigned`, `grpDir`, `grpTone`,
  `grpWord`). Verdict rules and the overall gauge maths ((st − 50) × 2) are unchanged; the gauge chips still show `st`.
- AI PORTFOLIO ANALYSER (owner, 2026-10-16) — customer tab "AI Portfolio" (header switch, 3rd option), branded
  "Hyperplane AI · Portfolio Analyser by QuantFriday". Customers add stocks one by one (no quantities, ≤ 500); saved
  per customer in `customer_portfolio` (customer_id → customers ON DELETE CASCADE, symbols TEXT[]), portal role
  SELECT / INSERT / UPDATE with RLS `portal_own` (customer_id::text = hp.cid); GET / PUT /app/api/portfolio (symbol
  regex, 120 req/min/IP). publish.py adds `yh` (Years_Of_History) per stock. Client-side rules (`analyseHolding`):
  long-term only — Y 4 · Q 4 · M 1.5 (Investing weights without D / W); groups: too new (yh < 3, PF_MIN_YEARS) · under
  pressure (LT ≤ −24, or Y and Q both falling, or h = W and LT < 0) · intact (LT ≥ +24, Y and Q not falling, h ≠ W, not
  stretched) · else watch. Sector / industry long-term backing = average of their Q and Y rows (nb sign = bullish /
  bearish) — shown, never decides. Indirect wording (no buy / sell / hold). `portfolioSummary` paragraph + portfolio
  gauge (average LT), distribution bar, sector mix, filter pills + card grid (attention first). Thresholds are Claude's
  proposal built on the owner's guidance — owner may tune. Docs section "AI Portfolio".
  v2 (owner, 2026-10-16): two stages — build (add any number, numbered list, "Analyse my portfolio" button) → result
  (add more at the top, "Edit list" goes back; a saved list opens on the result). Customer words: plain, NO long dashes
  "—", no timeframe names in the intro / summary. Groups renamed red / amber / green: "Look at first" (review) · "Keep an
  eye on" (watch) · "Doing well" (intact) · grey "Too new to judge". Summary = short coloured bullet lines; gauge
  "Current strength of the portfolio"; sector-mix section removed; 3 coloured widgets (name, ticker, %; click → card);
  colour-coded filter chips; sort "Weakest first / Best first"; card boxes ordered Monthly · Quarterly · Yearly.
  Summary line classes use the `pl-` prefix (`.info` is the ⓘ icon style — do not reuse it).
  v3 (owner, 2026-10-16): strength = the stock's OWN `sc` only (sector / industry never added; shown on the card under "For
  reference, not in the strength") with weights Quarterly 50 · Yearly 30 · Monthly 20 (owner-approved). Zone step: publish.py
  `earlier_zones(trade_date)` loads the newest stored collection of the previous month / previous quarter (zones are fixed
  inside a period and roll at its start — verified) and adds `zs: [M, Q]` per stock (1 up · 0 level · −1 down · None) —
  middle of the zone moved ≥ ZONE_STEP (10 %, Claude's proposal, owner may tune) of the earlier zone's width. Owner rule
  "change by one step": Doing well + Q stepped down → Keep an eye on; Keep an eye on + Q down + strength < 0 → Look at first;
  Look at first + Q up → "Improving" tag. Customers read "price range", never "zone". "Too new" renamed "Recently listed"
  (needs 3 years of yearly data). Start page = two columns (headline, search, numbered list, Analyse button | How it works,
  colour key). 4 widgets in one row (red, amber, green, grey; fixed height). Cards fixed height (452 px) with the reasons in
  a thin `.pf-scroll` scroller (slim at rest, wider on hover).
  v4 (owner, 2026-10-16): header tab "AI Portfolio Analyser". Cards: no ✕ (remove via Edit list), "Reliability: High /
  Medium / Low" chip (not "Price history"), no "Moved down" tag, no Higher / Same / Lower range labels in the boxes (the
  quarter step still moves the colour and is told once in the reasons; the monthly step is published but not shown), a box at
  exactly 0% reads "Sideways", sector / industry chips carry an ⓘ (opens upward: `<Info above>`) saying they are not used in
  the strength. Card no longer clips (overflow visible) so the ⓘ shows; its colour stripe has its own rounded corner.
  A box with no value shows "No data ⓘ"; Yearly's ⓘ says "Hyperplane needs 10 years of price data to calculate the yearly
  trend" (owner, 2026-10-16; checked: all 30 stocks without a yearly value have 6–10 years of history).
  Low reliability (h = W) is ALWAYS "Look at first", whatever the strength (owner, 2026-10-16; recently listed still wins).
  Summary titles (owner: plain words): "Many of your stocks need attention" (≥ 30 % red) · "Most of your stocks are doing
  well" (≥ 60 % green) · "Some stocks are doing well, others need watching" · "Your stocks are too new to judge".
  Privacy note (owner wording, 2026-10-16): start page = right panel under "Your privacy" (not above the list); result page =
  under "Add more stocks": "Private to you. Your stock list is visible only to you, the account holder. It is never visible
  to other users or to the admin, as per SEBI norms. We take the privacy of your investments seriously." ("as per SEBI
  norms" added on the owner's explicit decision, 2026-10-17, after Claude flagged that no specific SEBI rule is known to
  back it.) No "saving / saved" words anywhere;
  a status shows only when an update fails. Fact behind it: the list IS stored server-side (customer_portfolio, RLS per
  customer); no admin screen or API exposes it — keep it that way (never add an admin view of portfolios), or the note
  becomes false. Direct database access could still read it (owner informed).
  PROTECTION INSIGHTS (owner, 2026-10-17: "my goal is to protect them") — section between the colour widgets and the cards,
  built only from the card numbers (no new rules): `ProtectionCheck` (5 checks: low reliability · Q and Y both falling ·
  quarter step down · stretched · one sector ≥ 40 % of ≥ 4 stocks; info rows small caps / recently listed; pill "X of 5
  clear", red if a red check fails), `TrendMap` (SVG scatter x = Quarterly, y = Yearly, corner labels Rising / Cooling off /
  Recovering / Falling outside the plot, dot colour = group, ticker labels placed right / left / above / below without
  overlap, red first, else hover), `StrengthGlance` (heat table M / Q / Y + strength bar), `PortfolioSpread` (company size
  bar, sector count + largest, price range vs last quarter bars, sector backdrop with ⓘ "reference only"). Every stock in
  them is clickable → jumps to its card.
  Same day the owner removed Protection check, Strength at a glance and How your portfolio is spread: only the Trend map
  stays (full width; drawn at the card's real pixel width via ResizeObserver so text keeps its size; 380 px tall, 300 on
  narrow screens). Cards carry a market-cap tag ("Large cap" / "Mid cap" / "Small cap", from `cap`).
  Result page order (owner, 2026-10-17): AI summary | gauge → `.pf-mid` = colour boxes 2 × 2 (red, amber / green, grey; 250 px
  each) | Trend map (fills the same height; svg sized from its box's width AND height via ResizeObserver, min 300 px when
  stacked) → filter / sort + cards. No "Protection insights" heading any more. ≤ 1000 px: boxes above the map.
  ZONE ENGINE (owner, 2026-10-17: "do all the math in the backend … decide the best output"). Scanner writes a new sheet
  `Zone_History` (build_zone_history_rows: M/Q/Y current + last 4 zones from Chartink virgin-data, `M0_Top`…`Y4_Bottom`;
  virgin-data was always downloaded but never stored before). `backend/app/zone_engine.py` — CONTINUOUS calculation (owner
  2026-10-17: "cover all 27k combinations, true strength, optimized"; replaced the first 30-cell / 27-pattern version, which
  gave only 187 distinct strengths): per timeframe trend T (4 zone steps in widths of the older zone, ±0.5 width = full
  step, recency 40/30/20/10) and price position P (inside the current zone −0.67…+0.67, ±1 a quarter width outside);
  timeframe strength = 100 × (0.6 T + 0.4 P); stock strength = Q 50 · Y 30 · M 20 (missing M/Y re-weighted); colour green
  ≥ +24 AND quarter ≥ 0, red ≤ −24 (the app's TREND_CUT). publish adds `zv: [colour, strength, [M], [Q], [Y]]` (each
  [trend code 2…−2, position code 2/1/−1/−2, strength]) for EVERY stock with Zone_History (1,821 on 13 Oct, ~76 ms once
  per publish). Customer app `analyseZone`: plain words for non-finance users (uptrend / turning up / sideways / turning
  down / downtrend; price above / upper part / lower part / below "this quarter's price range"; never "zone"); boxes show
  the period strength + the app's level word; overrides: recently listed grey, low reliability red, rose very fast never
  green. Card tags redesigned: one status badge (`.pf-status`) + neutral chips (`.pf-meta`, coloured dot only) for cap,
  reliability, "Rose very fast", "Improving", sector / industry. No zv → old strength rules. 13 Oct: engine G 302 · A 1,207 ·
  R 312 (after overrides G 260 · A 1,037 · R 524). Review: D:\Trading\Hyperplane_Zone_Engine_Review.xlsx (all 27,900 typical
  combinations + every real stock with its exact values). Constants are Claude's proposal — owner may tune.
  PDF REPORT (owner, 2026-10-17): "Download report" button on the AI Portfolio result page. Made in the customer's
  browser (the list never leaves the device) by `app/src/report.js` with jsPDF 4.2.1 (dependency added; lazy-loaded chunk
  ~135 KB gzip, main bundle unchanged). PortfolioView builds the model with `reportModel()` (same rows / summary / words
  as the screen; report.js only draws, no analysis). Pages: dark branded cover (logo, "AI Portfolio Report", prepared
  for / data as of / report date / stocks, colour counts, privacy + disclaimer) → overview (AI summary | vector gauge,
  spread bar, 6 key numbers) → colour groups 2 × 2 → Trend map (vector, labels via shared `app/src/labels.js`, also used
  by the on-screen map) → stock-by-stock cards → "How to read" + disclaimer. Header (logo, title, customer, data date,
  gradient rule) and footer (brand · private · education only · Page X of Y) on every page after the cover. Standard PDF
  fonts: report.js swaps "−" and symbols for plain characters. Typical file ~100 KB, made in ~0.5 s.
  REDESIGN (owner, 2026-10-17: "professional like the big companies"; chose AI Portfolio page, style = clean fintech +
  a touch of institutional research). One design language in the `.pf` CSS block: solid surfaces, 1px borders, 14px
  corners, Inter + tabular numbers, colour only for status (`.c-good/.c-bad/.c-mid/.c-side`, `.px-pill`, `.px-chip`).
  Result page (`.px`): page header ("Your portfolio", meta, search · Edit list · Download report), quiet privacy line →
  `.px-over` (AI summary with status pill + headline + divided points | strength panel: gauge, big number, status split)
  with a 5-tile key-numbers strip → `.px-row2` (2 × 2 colour groups | Trend map with legend + gridlines) → `.px-hold`
  holdings TABLE (`HoldingRow`: Stock · Status · Strength with mini bar · Monthly · Quarterly · Yearly · Reliability;
  click = expandable details: strength + DivBar + period tiles + chips | Why + sector / industry reference). Filter and
  sort are segmented controls; jump() from groups / map opens and highlights the row. ≤ 760 px the table becomes a
  list (stock + status + strength). Start page restyled in the same language (solid accent, no gradients).
  Same day (owner): key-numbers strip REMOVED; strength panel content centred top-to-bottom (`.px-sbody`); the click-to-open
  table was replaced by ALWAYS-OPEN cards (`HoldingItem`, `.px-item`: who — name, ticker, sector › industry, status pill,
  chips | how strong — big strength + DivBar + Monthly / Quarterly / Yearly tiles | why — reasons + sector / industry
  reference), no repeated data, several visible at once; missing values show "No data ⓘ" (never "n/a").
  The reasons column is headed "✦ HYPERPLANE AI · RESEARCH SUMMARY" (`.px-aih`, owner — not "Why") inside its own soft
  accent panel (`.px-whyc`). Sector / industry chips + their ⓘ sit in the LEFT column under the tags (`.px-backdrop`,
  label "Sector and industry"), not in the summary panel (owner: more space there).
  NO "range" WORDING (owner, 2026-10-17: "people don't know what a range is" — supersedes the earlier "price range" notes
  above). Reasons compare over time: "<Quarterly|Yearly|Monthly> view: compared with the last 4 <quarters|years|months>,
  the trend is going up / has just turned up / is flat / has just turned down / is going down, and the price is very
  strong / holding up well / weak / very weak this <period>." The monthly line is always shown (+ "Keep an eye on it." /
  "A good short-term sign." when trend and price agree). Fallback rules say "compared with last quarter, the trend has
  improved / weakened". Summary: "Compared with the last 4 quarters, N stocks are trending up and M trending down."
  STREAK WORDING (owner, same day: "not always 'last 4' — say going down for the last 2 / 3 quarters"): zone_engine adds
  per timeframe a streak [direction, length] = periods in a row the zone middle moved the same way (≥ MOVE 10 % of the
  older zone's width; up to 4, from the current + last 4 zones). Customer sentence: "<View>: the trend has been going
  up / down / flat for the last N <periods>" (N ≥ 2) or "the trend turned up / down this <period>" / "is flat this
  <period>", then "and the price is very strong / holding up well / weak / very weak [this <period>]" (no repeated "this
  <period>"). zDir() (streak direction) drives the summary counts ("On the quarterly view, N trending up…"), "Improving"
  and the report's trending numbers. Older payloads without the streak fall back to the trend-code words.
  The 4 colour boxes were replaced (owner: "boxy") by ONE `StatusPanel` ("Portfolio by status", `.px-status`, 560 px =
  same height as the Trend map): split bar → 4 status tabs (dot + name, big count, "% of portfolio", coloured underline
  on the active one; first non-empty status selected) → status description → clean rows (`.px-srow`: name, ticker ·
  sector, quarterly streak "▼ Down for 3 quarters" / "▲ Turned up this quarter" / "Flat…", MiniBar + strength %; click
  → jump to the card). Phone: tabs 2 × 2, rows show name + %. Class `.px-sv` is the big portfolio number — the row value
  uses `.px-sval`.
  LAYOUT v3 (owner, same day): StatusPanel REMOVED (duplicated the holdings). Order now: header → `.px-strip` (gauge 150 |
  "Current strength of the portfolio" + big number | "How your N stocks are split" bar + counts) → `.px-row2` (AI summary
  card `.px-sumc`, no dividers, tighter spacing | Trend map, same height) → Holdings: sort control top-right, the status
  TABS are the holdings filter (split bar + "All stocks" + 4 statuses with count and "% of portfolio"; clicking the
  active tab returns to All) + description line. Each stock card shows a "Key insight" row under the M / Q / Y tiles
  (`streakShort`: "▼ Down 3 qtrs", "▲ Up 2 months", "▲ Turned up", "Flat 4 yrs", tooltip = full sentence).
  Then (owner): the insight chip moved INSIDE each M / Q / Y tile in place of the level word ("Average downtrend" removed;
  it is the tile value's tooltip); units "mths / qtrs / yrs"; a "No data" tile shows only "No data ⓘ". The strip shows 4
  quick facts beside the big % (`.px-facts`): Strongest, Weakest, Quarterly trend "N up · M down", Low reliability "N of
  total"; split legend 2 × 2.
  Insight chips: no ▲ / ▼ arrows (colour shows direction), full units ("Down 3 quarters", "Up 2 months", "Flat 4 years"),
  chips may wrap to 2 lines (never cut). Holdings header: "RELIABILITY All · High · Medium · Low" segmented filter (with
  counts, combines with the status tabs; "No stock matches these filters." when empty) next to "SORT Weakest / Best first".
  The reliability filter has NO red / amber / green dots (owner: confused with strength) and an ⓘ explaining, in this
  order, Low (fell > 70 % from its high → always Look at first) · Medium (> 50 % below its high or lower than 5 years ago)
  · High (stayed close to its high).
  Reliability filter is MULTI-SELECT (High / Medium / Low toggles, none selected = all; no "All" button). The strip's
  "Quarterly trend" fact was replaced by "Last 3 months: ±x% avg" (ⓘ: average price change since the end of <month −3>,
  each stock equal, no quantities): scanner writes `M3_Close` (= m3_close, monthly close 3 months ago) into Zone_History;
  publish adds `r3` = price vs M3_Close in % — dropped when outside −95 … +400 % (unadjusted corporate actions, e.g. MBECL
  showed +12,372 %).
  Then (owner): "Last 3 months" REPLACED by "Spread: N sectors · top X%" (amber when one sector ≥ 40 % of ≥ 4 stocks; ⓘ
  names the largest sector, the 40 % risk note and the large / mid / small cap counts; every stock counts equally). `r3`
  is still published but no longer shown. Facts have only the ⓘ popup (no `title` tooltip) and a thin vertical divider
  separating them from the big %.
  Phones (≤ 760 px): the strip stacks — gauge, label + big % centred, then the 4 facts as a 2 × 2 grid under a line
  (values may wrap), then the split. Checked at 430 / 820 / 1600 px: no overlap.
  INVESTMENT AI SUMMARY (owner, 2026-10-17) — Research view stock card (`StockCard`), full-width block under the two
  columns: `InvestmentSummary` runs the AI Portfolio engine (`analyseHolding`) for that one stock — a DIFFERENT formula
  from the card's own Research strength (owner: no issue). Shows status pill + description, `StrengthTiles` (shared with
  the AI Portfolio cards: long-term strength, DivBar, M / Q / Y tiles with streak chips), "Last 4 months" diverging
  month bars + "Since the end of <month>: ±x%" (compounded), and the research summary. Data: scanner writes
  `M1_Close`…`M4_Close` (month-end closes) into Zone_History; publish adds `mr` = [m−3, m−2, m−1, this month so far] %
  (each outside −95 … +400 % → None). No `mr` → "Month-by-month prices are not available for this stock yet."
  Then (owner: "only the summary part"): the block is ONLY "✦ LONG-TERM · AI INVESTMENT SUMMARY" (ⓘ) + the plain-word
  research sentences in a soft accent panel — no status, strength, tiles or month bars. `mr` / `r3` stay published, unused.
