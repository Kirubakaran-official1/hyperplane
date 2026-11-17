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

### 2a. The UI the owner expects (read before ANY UI change — he repeats these)
Collected from his feedback; apply them to every screen you add or touch, and check each in the browser (desktop, phone width, dark mode).
1. **Use the real estate — no wasted space.** One gap between blocks (12 px, from the flex gap of the page; never a gap *plus* margins),
   a slim one-line brand band (~50 px), a plain action bar (no tray), cards that fill their row. An empty area beside or under a card
   (e.g. under the AI summary) is a bug: fill it with a useful stat or rebalance the grid. Pages run full width.
2. **One page format in every app**: slim `BrandBand` (eyebrow · title · sub · right-hand tabs), then `.hp-actbar`, then tabs / KPI tiles.
   The same tiles (`.tk-k` family), the same table (`.hp-t`, Builder style: accordion group rows, ticker in the accent colour, numbers
   right-aligned), the same form (Builder layout: numbered steps left, "How it works" + "Your plan" right, `.al` slider rows).
3. **Modern, not "old school"**: soft rounded tiles and pills, light shadows, calm colours, icons in rounded tiles, gauges with a marker,
   a key under a bar instead of text inside it. No heavy borders, hatched fills, thick bars with text inside, or dated boxed widgets.
4. **Buttons stay normal**: the standard solid `.px-btn.primary` for the one call to action, plain `.px-btn` for the rest. No gradient
   buttons, no loud glow, nothing "too contrast". Green means *good / safe* only — never a decorative colour.
5. **Colours**: no green except for "up / good"; market-cap shades are one blue family (`--mx-l/m/s`); every colour must work in light
   and dark. Validate chart palettes with the dataviz validator.
6. **Pop-ups are centred** (never a side panel); an (i) pop-up must always be readable (normal case, inside the screen, never under a card).
7. **Motion is small and meaningful** (a swap slides out / in, a block fades up) and respects `prefers-reduced-motion`. Effects he tried and
   rejected stay out (the click "water bed" ripple).
8. **Plain customer words**: outcomes only, no method names, no plan / tier names, no weekly / daily wording; the admin sees the technical terms.
9. **Every list / table can be filtered**, bars that show shares filter the table below them, big numbers are readable (₹ lakh / crore words).
10. **Mobile first-class**: no sideways scroll at 400 px, the same content reachable; dark theme is a full theme, not an afterthought.

### 2b. Every new application must connect to the shared pieces (owner 2026-11-11: "if any new application comes, it needs to obey inbox, rbac and so on")
A new customer application is not finished until each line below is done and tested:
1. **RBAC:**
   - an `app_modules` row (key, name, sort);
   - its `<key>:view` permission plus any extra actions in `app_permissions`, with `restricted` set for owner-level ones;
   - a once-only migration in `permissions.py` that grants it to the right roles. The **Customer Admin** role always gets every application and every restricted permission.
   - Every route is guarded server-side with `need("<key>")` / `need_perm(...)`, and `route_guards.py` must report 0 routes without an access check on both services.
2. **Shell:**
   - `APP_MODULES` + `APP_SLUG` (`/app/<slug>`), an `AppIcon`, and the pin order;
   - `BrandBand` + `.hp-actbar` (§2a);
   - activity tracking (`track(module, ...)`) and adoption actions;
   - Docs (`guide.jsx`) and a Helpdesk template where it helps.
3. **Inbox:** anything the app wants the customer to act on or know about is a `customer_notifications` row with:
   - `app` = its key, `type` = `action` (a portfolio / stock change to make) or `info`;
   - a `kind` in `inbox.APP_OF_KIND`;
   - its code and colour in `inbox.jsx` `META` / `ORDER` and `notify.jsx` `CODE`.
   - Actions must settle themselves (`inbox.settle`) when the customer does the thing anywhere in the app.
   - Saved portfolios go through `SAVED_KINDS` → tracking → `monitor.run_alerts` (daily checks) → Inbox.
4. **Community / people:** never send another customer's email, phone, id or city to a customer — names only (`community._out`, `people`).
5. **Security:**
   - `SafeModel` bodies, limits enforced by the server ("even with Postman or Burp");
   - RLS + column grants for any new table the customer service touches (`db._setup_portal_role`);
   - per-account / per-IP rate limits.
6. **Tests:** API + browser suite in the scratchpad (`run_all.sh`), including access (403 without the permission), Inbox items, phone width and dark mode. Add the suite to the list in CLAUDE.md.
7. **Buy on Zerodha (round 20):** an application whose results hold stocks and quantities gets an owner-level `<key>:zerodha` permission
   (granted once to the Customer Admin) and a `ZerodhaButton` (core.jsx) with lines `[{s, qty, every?}]`. Lines are always checked on the
   server (`/app/api/zerodha/check` → `prepare`) against Zerodha's own list; the server never places an order. Inside a pop-up use `inline`.

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
  help, never a promise (SEBI). Sign-up phone field = "Mobile number" (round 19: every WhatsApp wording and the community-invite note were
  removed — owner: "don't want WhatsApp as of now"); Admin → Customers shows it as "Mobile …".
  Mobile field = searchable country-code picker (`DialSelect`, all 247 codes in `frontend/app/src/dial.js`, Popular
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
- **Ready-made requests + one-click limit request (owner, 2026-11-03):** "if the limit is increasing in the customer
  account, ask the user to raise a ticket … the template in the predefined queries … in one click it can send to the
  admin". `core.jsx` `HD_TEMPLATES` (Increase my portfolio limit · Renew my access · Add an application · Change my email ·
  Report wrong data) → `Helpdesk templates=` (customer app only; never for staff) shows them as chips in New query: one
  click fills subject + severity + message, still editable. `openReq {id:"new", tpl}` opens New query pre-filled.
  Builder `LimitAsk`: only when the amount or the stock count goes past the access limit (NOT in the locked More options —
  owner removed it there), "Request a higher limit" sends the query directly (subject `HD_LIMIT_SUBJECT`, low, body = current limit + what was
  asked for); an OPEN query with that subject is shown ("already with QuantFriday") instead of a duplicate; "View
  request" opens it. Uses the normal ticket endpoint (its rate limits apply); the limits stay enforced server-side.
  The custom stock count may now be typed past the limit so the message shows (the server refuses it anyway).
  Test: scratchpad `limit_ui_test.py`.
- **Builder → Analyser hand-off fix (2026-11-03):** the Analyser picks its screen (start / result) once, when it opens; if it
  was already open on the start screen (empty list) and the builder then sent stocks, it stayed on "Analyse my portfolio".
  Now `shell.addToPf` bumps `pfSent` → `PortfolioView sent=` → shows the result. Test: scratchpad `pf_handoff_ui_test.py`.
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
  Mobile, City, State, Country, Status (active / expired / pending / blocked), Access until, Joined, Approved on, Last
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
  default min). Items: the customer's PINNED applications (max 8 since 2026-11-06, `MAX_PINS` in portal.py and access_admin.py; `migrate_pins8` adds the AI Momentum SIP to saved pins), Docs, Helpdesk (unread dot /
  badge) and **More apps** at the bottom (owner 2026-10-28, reference image): a panel beside the rail with search, every
  application on the plan (Pinned / More apps groups), pin / unpin per row (pins disabled once 6 are pinned), click =
  open. Pins live on the account: table `customer_prefs` (customer_id, pins[]; RLS like customer_portfolio), `/me` returns
  `pins` (null = never chose → the first 8 in catalogue order) + `max_pins`, `PUT /app/api/pins` (≤8, only apps on the
  plan). More apps is highlighted while an unpinned app is open. Test: `rbac_ui_moreapps.py` (adds 5 temporary apps).
  ≤900 px: off-canvas drawer opened by ☰ in the top bar (scrim / Esc / picking an item closes it). Top bar = current
  page icon + name + description, Data as of, quick guide, bell, account (Account window shows Plan + Applications).
  Stored `qf_face` outside the plan falls back to the first allowed app; no apps = empty state pointing to the
  Helpdesk. The plan refreshes when the tab regains focus (≥60 s apart). One-row filter bar breakpoints account for
  the nav (1615 px open / 1480 px collapsed).
- Tests (scratchpad): `rbac_api_test.py` (103 API checks incl. DB-role permissions), `rbac_ui_customer.py`,
  `rbac_ui_admin.py` (Selenium).

### Momentum SIP v3 + saved plans + alerts / notification centre (owner, 2026-11-06) — app key `sip`
- Owner: "brand it as the Momentum SIP … index / stock / commodity as 3 sliders, gold 10 % by default … the index part must
  always cover Nifty large, mid and small caps; themes are going high, so don't push huge lots into one ETF … High / Medium /
  Low as a multi-select … stock mix as sliders … stock SIP is secondary … a Momentum check and Portfolio adjuster tab …
  alerts in the notification centre (what to change, the better alternative — only for stocks) … ETFs: never remove
  core index ETFs when the trend falls; a theme only in the worst case … how many years + a step-up and a growth simulator
  (no growth, 5 %, 10 %) … remove the 'Next 12 months' calendar … the same save + alerts for the Builder and the Analyser".
- **Reliability v3 (`scanner/stability.py`, `HEALTH_RULES = "v3-stability"`)**: a 0–100 stability score from the whole
  price history (recent / crash (recency-weighted) / peak / steady / speed / zones stepping), confidence-shrunk for short
  histories. High ≥ 58, Low < 30, hard POOR at a fall ≤ −70 %. Published per stock: `rs` (score) and `sf = [years, fall 3y %,
  1-year rise ×, 4-month rise %]`. Builder/SIP eligibility also drops a stock up > `RUN_4M_MAX` 50 % in 4 months and adds
  `STEADY_BONUS`. Customer wording: "a 0–100 stability score" (portfolio-engine `relWhy`, guide, Builder ⓘ).
- **`backend/app/sip.py`** (pure function on the published stock view + ETF summary): `alloc` {index, stock, commodity}
  ints summing to 100 (a missing part = 0; default 60/30/10), `rel` ⊆ S/M/W (any mix), `mix` {Large, Mid, Small} (70/15/15),
  `count` (None = `STOCK_RULE`, or 3/5/10/15/20/25), `stepup` 0/5/10/15/20, `years` 1–40.
  Index = `CORE` (Nifty 50 40 · Next 50 15 · Midcap 150 25 · Smallcap 250 20, always, whatever the trend) + up to
  `THEME_MAX` themes (recommended theme / strategy / international with st ≥ 24 and regime up) for `THEME_SHARE` 25 % of
  the index money, each ≤ `THEME_CAP` 10 % (also through upgrades / top-ups). Commodity = gold; silver only from 20 % and
  when not falling. Over budget ≤ `OVER_MAX` 10 %, ONLY to buy a holding every instalment that costs ≤ `UPGRADE_MAX_X` 2× its
  share (so the split stays true); the top-up never passes the amount. No calendar. `check_holdings` (keep / exit / new —
  a saved plan keeps its units while prices move ≤ `DRIFT` 5 %; a Builder portfolio keeps its shares, a replacement gets
  whole shares for the money of the one sold), `apply_changes`, `stock_status`, `etf_status` (core + gold never flagged).
- **Saved plans** (`customer_sips` with `kind` sip | builder, `alerts`, `state`; RLS `portal_own`, `MAX_SAVED` 5 per kind):
  `GET/POST /app/api/saved`, `PATCH/DELETE /app/api/saved/{id}`, `GET …/check`, `POST …/apply`. Frontend `saved.jsx`
  (`SavedPlans`, `SaveBar`) is shared by the SIP's **Momentum check** tab and the Builder's **My portfolios** tab.
- **Alerts** (`backend/app/monitor.py`, run by `publish` after every publish, never fails it): saved plans with alerts →
  NEW stock exits only (state.flags) → a notification `{items: [{s, n, why, alt}]}`; a SIP also gets "this month's /
  quarter's order is ready" once per period; the Analyser list (`customer_portfolio.alerts / alert_state`) → stocks whose
  long-term colour turned red or direction turned down, with an alternative from the same sector (else cap). Kept 120 days.
- **Notification centre** (`frontend/app/src/notify.jsx`, replaces `InboxBell` in the customer top bar): one bell for
  Hyperplane AI alerts (`GET /app/api/notifications`, `POST …/read {ids|all}`) + helpdesk replies; an alert opens a side
  panel (what to remove → the better alternative) and **Open** goes to the app (sessionStorage `hp_open_<app>` + window
  event `hp-open`, read by `saved.jsx` / `portfolio.jsx`).
- **Analyser**: `AiWatch` panel (`GET /app/api/portfolio/check`) with Swap + Alerts toggle (`PUT /app/api/portfolio/alerts`).
- **UI** `apps/sip.jsx` (BrandBand "Momentum SIP", `.hp-tabs` Build | Momentum check, linked sliders `rebalance()`, insights
  side panel, growth simulator — an assumed rate, labelled an illustration), `sip-report.js` PDF (simulator at the chosen
  rate). Tests (scratchpad): `sip_v3_test.py` (API, 70+ checks), `sip_v3_ui_test.py` (browser).

### My portfolios + tracking, one page format, ETF sections (owner, 2026-11-06, after the SIP v3 release)
- **Saved portfolios** (`customer_sips`, kinds `analyser` (→ app portfolio) · `builder` · `sip`, `MAX_SAVED` 50 per kind,
  `saved_on`, `versions [{d, holdings}]`): Save takes a name only; alerts are switched on inside a saved portfolio. Every
  change (Apply changes, a Swap via `PUT /app/api/saved/{id}/holdings` — the server sizes the replacement from the money of
  the old holding) appends a dated version (a second change the same day replaces that day's version).
  `GET /app/api/saved?kind=all&spark=1` = every kind the customer's apps allow, with `tag` and a sparkline.
  `GET /app/api/alternatives?s=&exclude=` = `monitor.alternatives` (same sector, else same cap; High/Medium uptrend; top 3).
  The Analyser kind is checked by `monitor.portfolio_flags` (portal `_check`, monitor alerts with kind `analyser`); the
  old Analyser-list alert switch is gone from the UI (`customer_portfolio.alerts` unused).
- **Tracking** (`backend/app/tracking.py`): `price_hist(sym, d, close)` written by `publish` for every stock + ETF
  (`record_day`, upsert per trade date; backfilled once from the stored collections by the worker). Splits / bonuses →
  `price_adj(sym, d, factor)`: raw close ÷ previous close outside 0.78…1.3 while the SOURCE daily change
  (`snapshot_stocks.change_pct`, split-adjusted) is small → factor snapped to a standard ratio (±4 %); across a gap
  > `GAP_DAYS` 4 only clear 1:2/1:5/1:10; ETFs (no source change) ratio-only ±2 %; never when the last 3 stored closes
  are identical (stale data resuming). `track(conn, row, sym, stepup)`: analyser = 1 share each, builder = saved qty,
  sip = instalments on the first trading day of each month / quarter (cadence `every`, step-up × (1+s)^years, switchable),
  versions sell at that close and buy the new ones (whole shares, rest = cash); output dates / value / put_in / bench
  (NIFTYBEES with the same cash flows) / holdings (return, gain, sold) / groups Large·Mid·Small·ETF / metrics (gain, vs
  Nifty, biggest fall on value ÷ put-in, best/worst, days, changes) / splits; one holding's split-adjusted % line with
  `?sym=`; > 400 points thinned; cached per (id, last price day, versions+inputs hash, options). Reads use the caller's
  connection (the portal's restricted role has SELECT on price_hist / price_adj only).
- **UI** `frontend/app/src/saved.jsx`: `MyPortfolios({app})` (tag chips, cards with value / return / sparkline) →
  `Tracker` (KPIs, `LineChart` hand-built SVG: one axis, 2 px lines, crosshair + one tooltip for every series, keyboard,
  table fallback; series colours validated with the dataviz validator — portfolio #0891b2, Nifty 50 #8b5cf6, put in
  #c2410c / dark #ea580c), contribution bars (`--mx-*` + ETF violet), holdings with Better alternative + Swap, momentum
  check + Apply, alerts / step-up switches). Tabs "My portfolios" in the Analyser (`pf-tab-mine`), Builder
  (`bd-tab-saved`) and SIP (`sip-tab-mine`); notifications open the portfolio (`hp_open_<app>` {ref}).
- **One page format**: `BrandBand` = compact (eyebrow, then title with the sub beside it; tabs / actions vertically
  centred on the right); result actions go in a `.hp-actbar` row below the band; every app is full width; "DATA AS OF"
  always in the top bar (`AsOfCtx` / `useAsOf(app, as_of)` for ETF, SIP, Builder); AI Mode empty state = centred hero.
- **ETF Analyser**: no top picks / tiles — search + trend filter, then sections Commodities · Broad market · Sectors &
  themes · Strategy · International (+ Other), one row per market with its best ETF; row → side panel listing every ETF.
- **Momentum SIP**: index part = core four + up to `EXTRA_MAX` 10 themes (uptrend) and diversifiers (Strategy low
  volatility / equal weight / value / quality, International — not falling), together ≤ 40 %, each ≤ 6 % of the index
  money; simulator = one slider with the % on a bubble. Tests: `track_test.py`, `sip_v3_test.py`, `sip_v3_ui_test.py`.

### Round 4 (owner, 2026-11-06): two SIP apps, one table format, swap only on regime-down, renames + app order
- **Two SIP apps** on one engine (`sip.py`): `sip` "AI ETF SIP Builder" (Reliable) = `build_etf` (ETFs only; opts gold 0–50,
  index cap mix Large → Nifty 50 + Next 50 / Mid → Midcap 150 / Small → Smallcap 250, themes / diversifiers / international
  on-off, easy-to-trade, extra 0/4/6/10 — replaced in round 5 by `count`; `check_etf`) — `POST /app/api/sip`; `msip` "AI Momentum SIP" (Risk) = `build_stock`
  (stocks only, `MSIP_RULE` 12 → 30 stocks, `MSIP_MAX_EVERY` 6, amount-based; `check_stock`) — `POST /app/api/msip`,
  `msip:view` for every role (`migrate_msip`). Frontend: `apps/sip.jsx` `SipView mode="etf"|"stock"`, `apps/msip.jsx`;
  element ids are prefixed with the app key (`sip-*` / `msip-*`). Saved kind `msip` (tracked like `sip`).
- **Swap only when the long-term REGIME turns down** (`rp[0] == -1`): `monitor.regime_flags` / `portfolio_flags`,
  `sip.stock_status`; the tracking response flags held rows (`flag`) — only those rows show Swap; ETFs: a theme in the
  worst case shows "Consider removing".
- **One table format** (`shell.css.js` `.hp-t`, `.hp-grp`, `.hp-gbtn`, `.hp-tbar`, `.hp-gall`; `core.jsx` `GroupRow`):
  the Builder look — accordion group rows with a swatch + summary stripe, ticker `.sym`, numbers right — in the tracking
  holdings (Large / Mid / Small / ETFs), both SIP results (Qty each month, Price per unit, ₹ per month, Size, Reliability /
  Role) and the ETF Analyser (one table, type groups). Swap animation: `.hp-leaving` / `.hp-swapped` / `.hp-toast`
  (`useToast`), `prefers-reduced-motion` respected.
- **Header strip** = one line (~52 px): eyebrow chip, title, sub, tabs right. **Renames**: research → "Deep Research",
  simple → "AI Mode" (app_modules + permission labels updated only from the old defaults). **Order**: simple 1, research 2;
  `migrate_pin_order` puts AI Mode first in saved pins; the landing app = the first pin; More apps has ↑ / ↓ to arrange.
- Analyser watch redesigned (comparison cards, regime-down only) and placed above the holdings; "Better alternative" on a
  card only for a regime-down stock. ETF card pop-up scrolls to the top on a pick and shows "How to buy" (Zerodha Kite).
  SIP "How to buy" pop-up; a Helpdesk "Request a higher limit" note in both SIP forms; AI mark white in primary buttons.
- Tests: `sip_split_test.py` (API), `sip_v3_ui_test.py` (browser, round 4), `track_test.py`.

### Round 5 (owner, 2026-11-06): AI watch rows, report swaps, SIP forms in the Builder layout, ETF count, filters
- **AI ETF SIP Builder: number of ETFs** instead of on/off switches: `opts = {gold, caps, count}`, `count` in `sip.ETF_COUNTS`
  (6, 8, 10, 12, 15, 20). Core index ETFs (Large = Nifty 50 + Next 50) and gold come first; the other places go to
  `sip._extras()` in order — themes in an uptrend, steady strategy / international not falling, sector ETFs with the
  regime up (0 < st < 24), other broad indices — one per market, easy to trade only. More than 6 asked → the extras may
  take up to 60 % of the index money (core ≥ 40 %), each ≤ `EXTRA_CAP`. `info.etf_extra` = how many qualify today; the
  form dims counts above that and the result says "N of M asked". Old saved inputs with themes / extra keys still load.
- **SIP forms** (both apps) use the AI Portfolio Builder layout: `.pf-start.bd-start` with numbered `.bd-f` steps on the
  left, `aside.pf-sr` (How it works, Your plan, a "ETFs are the safest" note / a "Prefer lower risk? AI ETF SIP Builder"
  card) on the right. The Builder's slider rows (`.al*`, `.bd-f`, `.bd-l`, `.bd-amt`, `.bd-chips`, `.bd-hint`, `.bd-sum`,
  `.mx-*`) moved from `builder.css.js` to `shell.css.js` so every app shares them. The Momentum SIP RISK banner has a
  `#msip-to-sip` button.
- **Result bars filter the table**: ETF SIP "Where the money goes" / "Markets", Momentum SIP "Stocks by market cap" /
  "Sectors" (computed in the page from the holdings, all of them) — click = filter, again = clear, `#<app>-fclear`.
  KPI "ETFs picked for you" (`#sip-picked`) with a role bar (core · strongest · gold).
- **AI watch** (`portfolio.jsx` `AiWatch`): branded folding header (`#pf-watch-tog`, closed state in sessionStorage
  `hp_watch_shut`), one compact row per regime-down stock (~58 px): stock + sector › industry → better stock with a
  "Same sector & industry" / "Same sector" / "Same market cap" badge and up to 3 options switched in place
  (`.pf-wopts`, animated), Swap. Data: `GET /app/api/portfolio/check` items carry `sec, ind, cap, st, alts[3]`;
  `monitor.alternatives` ranks same industry → same sector → same cap; strengths use `monitor.lt_strength` (the
  Analyser card's M 20 · Q 50 · Y 30), not the short-term `os`.
- **Report**: "Download report" fetches `/portfolio/check` and `report.js` draws a **Suggested swaps** page at the end
  (before the disclaimer; "All clear" when none). `core.loadChunk()` wraps every lazy import (apps, Docs, detail, both
  PDF reports): retry once, else reload the page once (sessionStorage `hp_reloaded`) — a page opened before an update
  no longer fails to load a renamed chunk.
- **ETF Analyser M · Q · Y**: coloured pills (green rising, red falling, grey sideways) with the letter.

### Round 6 (owner, 2026-11-06 / 07): Momentum SIP levels, count box, advanced options, PDF cover, AI Mode gradient
- **AI Momentum SIP Builder** (renamed 2026-11-07 from "AI Momentum SIP"; app key `msip`, DB name / permission labels updated
  only from the old defaults): two levels like the AI Portfolio Builder — `msip:customer` (every role) and `msip:admin`
  (Customer Admin role; owner-level, needs `confirm_owner_level`). `sip.MSIP_TIERS`: Customer = ≤ ₹50,000 an instalment,
  10–50 stocks, High reliability only, More options locked; Admin = any amount (sanity bound), 5–2000 stocks, High / Medium /
  Low, every option. Enforced in `sip.check_stock(..., tier)` (`SipPlanError` → HTTP 403; other bad input → 422), also on
  `POST /app/api/saved`; `GET /app/api/msip/info` returns `plan` (+ `sectors`). Test: `msip_level_test.py`.
- Count: chips + a whole-number box (`#msip-n`; any integer within the level, the recommended count when empty).
- **More options** = the Builder's own (horizon, trend quality, regime, run-up, F&O only, leave out sectors) + "most stocks in
  one sector" (`sector_max`, default 25). `inputs.opts` / `inputs.sector_max` are saved with the plan and passed to
  `builder.candidates(opts)`. Shared CSS (`.bd-more`, `.bd-cards2`, `.bd-fs`, `.bd-lock`, `.px-points`) moved to `shell.css.js`.
- Result: under the AI summary `AiNumbers` (trend spread bar + strongest / biggest group / High-reliability or core share).
- Redirect: solid green `.sp-tosafe` button in the RISK banner + a green card with "Sleep peacefully with ETFs." in the form.
- **SIP PDF** (`sip-report.js`, both apps): cover page like the Portfolio report, overview, holdings by group, growth chart +
  table, how to buy, disclaimer. **AI Mode** landing: animated gradient aura + fading grid (`.sv-aura`, `.sv-grid`).

### UI round 2 (owner, 2026-11-06: "the detail page looks ugly … take the inspiration from Dhan, Zerodha, Groww")
- **SIP tracking is AMOUNT-based** (tracking.py): each instalment puts the holding's planned rupees (`amt` × (1 + step-up)
  ^years) into a per-holding bucket, buys whole units at that day's price, the rest waits (shown as "₹x waiting", counted in
  the value). A swap / version change buys the new holding at once with the money of the one sold (Builder and SIP).
  `GET /app/api/saved/{id}/track?stepup=N` takes the step-up % (0/5/10/15/20; None = the saved one). The SIP form has no
  step-up any more — it lives in the growth simulator (and on the tracking page). Holding rows carry qty / avg / ltp /
  day / day_gain; metrics carry day_gain / day_ret ("since <prev stored day>"), last / prev.
- **Tracking page** (`saved.jsx` Tracker): header (← back, name + tag, step-up select, Alerts switch, Momentum check,
  delete) · 6 summary tiles · Performance card (period tabs 1W…All, holding selector, chart) · Allocation table + stacked
  bar · Top movers · Holdings table like a broker (Qty, Avg cost, LTP, Invested, Cur. value, P&L, Net chg, Day chg, Swap)
  + Exited · Swap = centre pop-up (`.tk-modal`) with the 3 best alternatives.
- **Global**: `.page` is full width (no 1440 px cap); inputs no longer force `color-scheme:dark` (checkboxes follow the
  theme); `.hp-switch` = the on/off switch; one summary-tile look (`.tk-k`, `.sp-kpi`, `.bd-kpi` in shell.css.js); ETF card,
  SIP insights and the notification detail open as CENTRE pop-ups; Save = a small name box (`SaveBar`) and a closable
  "Saved as …" strip (`SavedNote`); the simulator bubble stays inside the slider (clamp).

### Funds & indices wall + ETF analyser (owner, 2026-11-06)
- "Remove the wall … add the wall before sending to the current applications … keep the ETF as a separate section; I
  don't want ETF in my admin and customer applications … only the tradable ones, not the bonds … admin: all the real data
  and why it is picked, at the end before the algo signals … customer: only the strength and the recommended one".
- **Wall** (`backend/scanner/funds.py`, shared by scanner + `publish.is_index`): `is_fund_or_index` = sector "Indices",
  NIFTY/SENSEX/BEES/…ETF symbols, ETF / index fund / fund of funds in the name, Admin `index_add` / `index_keep` (worker →
  `sc.FUND_ADD/FUND_KEEP`). `chartink_fast.attempt_scraping` splits right after `build_market_frame` + master: stocks →
  `frame` / master / category lists (EVERYTHING else — signals, the 14 sheets, Excel, Telegram, snapshot, admin, customer —
  sees stocks only; the old `exclude_words` leak of HDFCGOLD, GOLDCASE, MON100 … is closed), funds → `etf_frame`.
- **ETF pass** `build_etf_bundle`: keeps `is_tradable_etf` = traded (any weekly volume; plain indices such as NIFTY500 /
  India VIX report 0) and not debt / cash-like (`funds.DEBT`: bond, Bharat Bond, gilt, G-Sec, SDL, liquid, 1D rate,
  overnight, money market, T-bill …; CPSE ETF stays). Same builders with `_skip_words` narrowed to `ETF_SKIP_WORDS` (the
  builders' old inline `exclude_words` checks are `_skipped(sym)`); `nr_flat_rows` emits the NR_PATTERN rows
  (`nr_tf_type` is shared with the Excel writer). Writes `etf_data_<stamp>.json` beside the Excel — never into the Excel
  or Telegram. ~295 ETFs (Nov 2026), ~140 with a long-term strength (the rest are too young for zone history).
- **Storage**: `etf_collections(snapshot_id → snapshots CASCADE, etfs, data_gz)` (no portal grant); the worker stores the
  file right after `save_snapshot`, BEFORE auto-publish. `published.etf_gz` = the customer summary (NULL without ETF data).
- **`backend/app/etf.py`**: `classify` (RULES, first match: Gold · Silver · Broad market · Sector & theme · Strategy ·
  International · Other; underlying e.g. every gold ETF → "Gold"); per ETF the same engines as stocks (zone_engine strength
  + `apply_regime` on the monthly regime, `publish.regimes`, `liquidity.analyse`, Price_Health years). **Recommended**, one
  per underlying: the most traded (avg ₹ a day) among those ≥ `REC_MIN_VALUE` ₹1 Cr a day and not erratic; within
  `REC_TIE` 10 % of the top the longer history wins; reason "Most traded Gold ETF · ₹224 Cr a day · 13+ years". Picks seen:
  GOLDBEES, SILVERBEES, NIFTYBEES, JUNIORBEES, BANKBEES, ITBEES, PSUBNKBEES, CPSEETF, MON100. `admin_rows` (cached per
  collection) = every number + `checks` (4 ✓/✗) + `why_not`; `customer_payload` = s, n, k (class), u, st, c, r, why only.
- **Access / API**: app module `etf` + permission `etf:view` (Access manager — not default). Customer `GET /app/api/etf`
  (`need("etf")`, ETag/304). Admin `GET /api/snapshots/{sid}/etf` (`current_user`).
- **Customer app** `frontend/app/src/apps/etf.jsx` (+ `etf.css.js`, nav icon "coins", Docs section) — owner 2026-11-06:
  "long-term model, like the portfolio builder, the best ETF … less text on the page (use ⓘ) … proper navigation back …
  feel like AI, small AI summaries, branding". Three levels: **Home** (branded AI header band with ⓘ for the explanation;
  `#ef-ai-home` Hyperplane AI summary — headline follows the biggest bucket: "Most markets are moving sideways — 4 up, 16
  sideways, 1 down", strongest / gold & silver / weakest lines; Popular groups; type chips + search; group cards per type,
  Gold & silver share a row, left edge coloured by the best ETF's trend) → **Group** (`#ef-ai-group` summary, `#ef-hero`
  the best ETF's card, other ETFs → `#ef-modal`, "More in <type>" chips, `#ef-back`) → **ETF card** (AI one-liner
  `.ef-take`, verdict + strength, trend over months / quarters / years, overall direction, easy to trade, track record,
  recommended reason or why another is preferred, alternatives). Sticky `.ef-nav`: breadcrumb (`#ef-home` All groups ›
  type › group) + "Jump to a group" `<select id="ef-group">` (optgroups by type). Opening a group pushes a history step,
  so the browser's Back returns home; "All groups" always goes home. AI texts = fixed rules on the published data.
  Payload: tf, rg, lq, v, e, y, wn + `groups` — no prices, zones or formulas. Access: "Open ETF Analyser" (etf:view).
- **Admin** `frontend/src/etf.jsx` → Control Tower section "📀 ETF analyser" (`CT_NAV` `ct-etf`, rendered just before
  Technical Quant; `EtfSnapCtx` = newest collection on screen; version objects carry `id`): type + group dropdown
  (`#etf-group`, optgroups by type, most traded group first), sort, search, ★ only, Excel, copy. Clicking an ETF opens its
  report in a side panel (`#etf-panel`, like a stock's deep-dive; Esc / ✕ closes): headline numbers, the timeframe table
  (zones, steps, T, P, raw → after-regime strength, mother candle), trading (volume analyser + 4w/4m/4q/4y), the ✓/✗
  Recommended checklist, and every ETF of the same group by trading with why each is or isn't the pick. Collections from
  before the wall have no ETF data ("appears from the next collection").
- Tests (scratchpad): `etf_test.py` (18 API checks), `etf_ui_test.py` (customer + admin browser).

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
- **Builder overview cards (2026-11-06):** "Where the money goes" = the two comparison bars (You chose / Plan, `MixBar`) +
  an aligned list per segment (`.mx-list`: name · plan % with "you chose X%" · stocks · full amount) — a donut and small
  tiles were rejected ("previous bar better for comparison", "unreadable"). Sectors card: ranked rows (01, 02 …), rounded
  bars, "N stocks" chips, a "top 3 hold X%" line; its list fills the money card's height (no empty space). Master data
  header: title left, tools right on one row (fixed select widths), wrapping only under 1100 px.
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

### Round 7 (owner, 2026-11-07): ETF styles, stock count from the Builder engine, ETF stats, menu order, AI Mode page gradient
- **AI ETF SIP Builder style** replaces "number of ETFs" (round 5): `opts = {gold, caps, style}`, `style` in `sip.ETF_STYLES`
  (`focus` / `standard` / `diverse`; default standard). `focus` = only what is going up (`sip._up`: regime up and strength ≥ 24) —
  the core markets only when they are up, up to 8 others, no forced core (falls back to Nifty 50 with a note when nothing is
  up); `standard` = all core (by the cap mix) + up to 5 going-up ETFs; `diverse` = standard + up to 5 diversifiers (steady
  strategy, international not falling, steady sector ETFs, other broad indices). A diversifier is never added to focus /
  standard. `STYLE_EXTRA` = (most extras, most of the index money in one). `info.etf_pool` (core / core_up / up / div / per style).
- **AI Momentum SIP Builder**: the recommended stock count = the AI Portfolio Builder's advice (`builder.SPREAD` table,
  `builder.spread_best`) with the SIP floor `MSIP_RULE` (15 / 20 / 20): `sip.msip_recommended`, `sip.msip_rule()` →
  `info.msip_rule` / `info.spread` (₹1 Cr → 80, ₹10 Cr → 150). The sector limit defaults to 10 %.
- **ETF Analyser** type stats (`#ef-stats`): All ETFs + one tile per type (ETFs, markets, up / sideways / down); a tile opens its group.
- **Menu**: AI Mode first, Deep Research second as the DEFAULT (`migrate_research_second` reorders saved pins once); ↑ ↓ in More apps still arrange every app freely.
- **AI Mode**: the whole page is the gradient (`.sv-aura` fixed behind the app — `body` is transparent, `html` carries the colour);
  choosing a stock on the landing page plays "Hyperplane AI is reading …" (`.sv-think`, ~1.1 s, skipped with reduced motion), then the
  answer rises in (`.sv-in`). The redirect button / card in the Momentum SIP are gradient (accent → violet), not green.
- A swap or a plan saved after the last price day (before the day's prices arrive): `tracking.track` applies the pending version at
  the last close, so the new holding shows at once.

### Round 8 (owner, 2026-11-07): ETF Analyser lists every ETF
- The table shows EVERY ETF by default (one row each, grouped by type, best of a market first; columns ETF · Market · strength ·
  M·Q·Y · Trade · Price). The **Best in segment** button (`#ef-best`, `aria-pressed`) narrows it to the old one-row-per-market view.
  Search matches ticker, name and market; the trend filter applies per ETF.
- Clicking an ETF opens the card with **About this ETF** (`#ef-about`): a plain-word line for its market (`apps/etf-about.js`
  `MARKET_ABOUT`, one per market, `CLASS_ABOUT` as the fallback — add a line there when a new market appears), what one unit costs,
  how easy it is to trade, the record and where it stands among the ETFs of its market. Test: `etf_ui_test.py`.
- **ETF Analyser column**: "Trade" (a word) became **Traded a day** — the rupees that change hands on a normal day (`e.v`, `₹11.8 Cr`) with the
  plain word under it ("Easy to trade"); in both the all-ETFs and the Best in segment views.
- **AI Mode blocks** (`CellField` in `apps/simple.jsx`, canvas `.sv-cells`): on opening, square cells pop in a wave from the top to the bottom;
  the cell under the mouse lights up and leaves a fading trail; choosing a stock sends a ring of cells out from the centre. Drawn only while
  something moves; reduced motion / touch: still grid only. It sits behind the page (z-index −1, `pointer-events:none`).
- **AI Mode result** (round 11): the header names the stock (`title = name`, `accent = · TICKER`, sub = sector › industry) with the verdict as a coloured chip
  (`#sv-vchip`); the four stat cards are `Stat` + `Gauge` (icon tile, big number, −100 … +100 gauge with a marker, plain-word pill; reliability = three steps).
  `.sv-in>*` uses `backwards` fill (a forwards fill kept a stacking layer that hid (i) pop-ups under later cards). `core.Info` moves a pop-up back inside
  the screen on narrow windows (`keepInside`). `.hp-actbar .px-btn.primary:hover` must repeat the gradient (a plain `background` on the base hover rule turned it white).
- The click ripple ("water bed") was tried and removed at the owner's request (2026-11-07); the blocks keep the opening wave and the mouse trail only.
- **Normal buttons** (2026-11-07): the gradient was dropped — the action bar's call to action is the standard solid `.px-btn.primary`, and the Momentum SIP
  switch button / card button are plain solid buttons.
- **Mix bar** (`MixBar` in `apps/builder.jsx`, CSS at the end of `shell.css.js`): soft pills with gaps + a one-line key with every percentage
  (no text inside the bar); new Large / Mid / Small tokens `--mx-l/m/s` (indigo → periwinkle → pale, inverse in dark); cash = dotted grey pill.

### Round 9 (owner, 2026-11-07): sharing saved portfolios (ID + private / public, RBAC)
- Every saved portfolio (`customer_sips`, kinds sip / msip / builder / analyser) has `share_id` (8 hex, made by the database, unique) shown as
  **ETF-1A2B3C4D / MOM-… / PB-… / PA-…** (`portal.SHARE_PREFIX`) and `visibility` = `private` (default) | `public`. The ID is on every card and on the
  portfolio page (`.svp-id`, click copies) for every customer.
- **RBAC**: one permission per application — `sip:share`, `msip:share`, `builder:share`, `portfolio:share` (each requires that app's `:view`).
  `migrate_share` gives them to the **Customer Admin** role only; the Customer role has none, so its **Share button is shown disabled** (lock icon,
  "Sharing is not available for your access."). The owner can grant them to any role in Admin → Access manager. Enforced on the server:
  `PATCH /app/api/saved/{id}` with `visibility: "public"` → 403 without the permission (making it private is always allowed, even after the permission
  is taken away).
- **Reading a public one**: `GET /app/api/shared/{code}` (any signed-in customer who has that application; read only). It goes through the SQL function
  `shared_portfolio(code)` (SECURITY DEFINER) — other customers' rows are never readable by the portal role (the RLS policy is unchanged). The answer has
  no owner, no rupee amount, no quantity, no tracking: instrument, group, sector and the % share only. `OpenById` on My portfolios opens it
  (`SharedView`). Tests: `share_test.py` (API), `share_ui_test.py` (browser).

### Round 10 (owner, 2026-11-07): an address for every app and every saved portfolio
- **Addresses** (`core.jsx` `APP_SLUG`, `routeOf`, `goPath`; the History API, no router library; Caddy already sends `/app/*` to the page):
  `/app/ai-mode`, `/app/deep-research`, `/app/portfolio-analyser`, `/app/portfolio-builder`, `/app/etf-analyser`, `/app/etf-sip-builder`,
  `/app/momentum-sip-builder`, `/app/docs`, `/app/helpdesk`, and **`/app/portfolio/<ID>`** for a saved portfolio. The shell reads the address on
  first paint (`/app/` → the first pin, then `replaceState` to its address), pushes a step for every app change (`setFace(f, push)`), and follows
  Back / Forward (`popstate`). The browser tab title names the app. Each app stays its own lazily loaded file (no monolith).
- `/app/portfolio/<ID>`: the prefix names the application (`CODE_APP`: ETF → sip, MOM → msip, PB → builder, PA → portfolio). If the ID is one of the
  customer's own (`/app/api/saved?kind=all`) it opens in that application's My portfolios (the `hp_open_<app>` + `hp-open` path the notifications use);
  otherwise the read-only `SharedView` page (`#shr-page`, lazily loaded from `saved.jsx`) — "not found" while it is private. Opening / closing a
  portfolio in My portfolios moves the address (`MyPortfolios` listens to `hp-route` / `popstate`).
- **Share controls on the page** (no pop-up): `Private | Public` (`#svp-visseg`, Public disabled with "Sharing is not available for your access." without
  the app's `:share` permission) + **Copy link** (`#svp-copylink`, the full `/app/portfolio/<ID>` address) + the address shown under the title (`#svp-url`).
- Tests: `route_ui_test.py` (addresses, Back / Forward, own / shared / private portfolio), `share_ui_test.py`, `share_test.py`.

### Round 11 (owner, 2026-11-07): the public portfolio page, 12-character IDs, tampering
- **IDs**: `db.hp_share_id()` makes every saved portfolio's ID — `XXXX-XXXX-XXXX-XXXX`, **16** characters from 31 letters / digits (no 0 O 1 I L),
  drawn from the fully random bytes of `gen_random_uuid()` (cryptographic): about 7.3 × 10^23 IDs, no kind prefix, no order. Older IDs were replaced.
- **Public page** `/app/portfolio/<ID>`: `main.jsx` renders ONLY `public.jsx` (no app shell, no side nav, no `/app/api/me`, no sign-in).
  It calls `GET /app/api/public/portfolio/<ID>` — open on purpose (`route_guards.PUBLIC`), no session read or made, `Cache-Control: no-store`,
  `X-Robots-Tag: noindex`, the same 404 for a wrong / private / missing ID, at most 20 a minute and 200 an hour per address (and 1,200 a minute
  overall). The answer is `shared_portfolio()` trimmed by `_public_view` (no owner, amounts, quantities, row ids, tracking). The old signed-in
  `/app/api/shared/{code}` is gone. An owner's own portfolio in the app lives at `/app/<app-name>/portfolio/<ID>`.
- **Tampering** (everything the page limits, the server limits — tested with direct requests in `tamper_test.py`):
  `_clean_holdings` checks every saved holding (known symbols of today's data only, each once, the right kind for the app, finite numbers in range,
  role / sleeve from a fixed list, names and prices taken from the server, the total inside the plan's amount, at most `HOLD_MAX` rows);
  saving a Builder plan checks its amount / count / reliability against the customer's builder level (403); a swap (`PUT …/holdings`) can only
  keep a stored holding as stored or replace one stock with one stock from today's data, sized by the server — nothing can be added or resized.
- **Public page** (round 13, owner: "full width, a better format, no plan section, ₹ quick starts"): `public.jsx` is its own full-width design
  (not the Tracker): sticky header (Log in / Sign up free), a hero (name, what it is, tag / ₹ a month / style / years / since, Copy link) with a
  **quick start** card — SIP: ₹10K / ₹25K / ₹50K a month, portfolio: ₹50K / ₹1 L — that stores `hp_intent` {app, amount} in sessionStorage and opens
  `/app/<app-name>?signup=1`; after sign-up / log-in that application opens with the amount filled in (`builder.jsx` / `sip.jsx` read and clear it).
  Then six KPI tiles, the performance chart (`saved.LineChart`, height 340) with the step-up chips (SIP), periods and a per-stock line; "Where the
  money is" (groups + top sectors / markets) and Top movers; one holdings table (initials avatar, weight bar, P&L pill); a closing brand band with a
  second quick start. A portfolio saved after the last trading day shows a "Tracking starts with the next trading day" note and the plan only.
  Data: `GET /app/api/public/portfolio/<ID>` (plan) + `…/track?stepup&sym`; open on purpose, no session, no-store, noindex, 60 a minute / 600 an hour
  per address; the owner and the row id are never sent.
- **Public page, round 14** (owner: "rethink completely — it is forward-tested, mostly little or no data … the Large / Mid / Small mix first with a
  progress symbol … no weight bar … simulators like the brokers, with animation … the chart full width"). It replaces the round-13 layout above
  (CSS prefix `.pq-*`; no `saved.LineChart`, no table, no movers). The order is:
  1. Hero with the quick start. The facts include "Live since" and the step-up.
  2. **The mix** (`#pub-mix`): one tile per cap with an animated ring.
     - Large / Mid / Small, plus "Gold & themes" when there is any.
     - A stock is placed by its `cap`; an ETF by its index `u` (Nifty 50 / Next 50 → Large, Midcap → Mid, Smallcap → Small, else Other).
     - Each tile shows the share %, the count, and ₹ (a month for a SIP).
  3. **Live tracking** (`#pub-track`):
     - When tracked (≥ 2 days): 5 KPIs, plus its own SVG line chart (`Lines`, ResizeObserver, so it fills the card), with a hover tooltip and a draw-in animation.
     - Before that: `#pub-notyet` with a pulse.
     - A forward-test road (Saved → First close → 1 week → 1 month → 3 months, `#pub-road`) shows while under 21 days.
  4. **Simulators** (`#pub-sim`): sliders for amount / years / assumed growth, step-up chips, two result cards that count up, and animated year bars (`#pub-bars`).
     - Tabs for a SIP: SIP growth / Goal planner / Start now vs later. For a portfolio: Lump sum growth / Goal planner / As a monthly SIP.
     - A "Start with ₹X" button goes through the same `hp_intent` sign-up. A monthly amount from a portfolio opens the AI ETF SIP Builder.
     - Always labelled "an illustration at the growth you pick, never a forecast".
  5. **The portfolio** (`#pub-table`): cards, biggest first, filtered by the mix chips.
     - Each card has a coloured top edge per cap, the weight as a number (no bar), ₹ a month / amount, units or shares, the sector or index, and "Since saved" (a P&L chip, or "Live soon").
  6. The brand band.
  
  `route_ui_test` checks the mix tiles, cards (no table / bar), the chart width and all three simulators.

### Round 15 (owner 2026-11-07) — swaps on the record, AI watch on the overview, sharing for all, admin light + shared portfolios
- **Sharing:** every role that opens an application holds its `:share` permission (`perms.migrate_share_all`, once, `share_all_v1`).
  It is still one permission per application, so the owner can remove it per role.
- **Rename:** pencil next to the name on the tracker (`#svp-rename`), using `PATCH /app/api/saved/{id}` `{name}`.
- **Swap log:** `portal._new_version(conn, c, r, hold, pairs)` appends `{d, out, in}` (s, n, kind, cap, sec) to `versions[-1].log`, up to 200 entries.
  - The log carries over to every later version, so a same-day replacement or a swap on the save day never loses it.
  - A hand swap passes its pairs, and so does apply (`replaces`). Anything left over pairs up in order.
  - `tracking._swaps` turns the log into `swaps` (newest first), split / bonus adjusted:
    - `out.ret`: what the stock that left did after the swap ("if kept");
    - `in.ret`: what the new one did;
    - `edge = in − out`.
  - `_sym_set` loads the log's symbols too.
  - Shown in the tracker as `SwapHistory` (`#svp-swaps`) and on the public page as `Swaps` (`#pub-swaps`). A swap from today reads "Starts next close".
- **Upgrades:** `monitor.alternatives(…, up=3)` adds up to 3 bigger companies (Small → Mid / Large, Mid → Large) in the same industry, else the same sector.
  - Each item has `up: true`; the like-for-like ones carry `up: false`.
  - `/app/api/alternatives` (now open to portfolio / builder / msip) and `/app/api/portfolio/check` use it.
  - `saved.SwapOptions` shows "Same size" and "Upgrade to a bigger company" groups; the Analyser watch marks upgrades with ↑.
  - Swap still only appears on regime-down stocks.
- **AI watch on the overview:**
  - `GET /app/api/saved` adds `watch` (the count of regime-down stocks) to every portfolio.
  - `GET /app/api/saved/{id}/watch` returns each flagged stock with its `alts` (same-size and upgrades). It is own-row only and rate-limited.
  - Each overview tile (now a `div role=button`) has the "Hyperplane AI watch" button (`#svp-aiw-<id>`, red count or ✓). ETF SIP tiles have none.
  - A click opens `AiWatch`: about 1.6 s of scan animation (orb + ticking symbols, `#aw-scan`), then the swaps (`#aw-list`) or "All clear". A swap can be made right there.
- **Public page:**
  - **Simulators:** a fixed `RATE = 5` % a year, with a note that it is below the long-run average. There is no growth slider and no one-time amount anywhere.
    - A portfolio's own amount is fixed (`#pub-fixed`); its tabs are "This portfolio" and "Add a monthly SIP".
    - SIP tabs: growth / goal (monthly only) / start now vs later.
    - Labels are "Amount invested" and "Projected value".
  - **Quick start:** portfolios get ₹50K / ₹1 L / ₹5 L. The Customer builder level allows up to ₹1 L, so ₹5 L shows the limit note there.
  - **Wording and colours:** the tagline is "Forward-tested portfolios, tracked live every trading day". "Portfolio spread" replaces "The mix". Cap colours are solid (#2563eb / #7c3aed / #ea580c / #ca8a04).
  - **Road:** the forward-test road rolls on past 3 months (6 months, 1 year, then every year). It always shows the five milestones around today and the next one.
  - **Signed in:** a browser signed in to the app (`localStorage hp_signed`, set / cleared by `shell.App`; a hint only) gets "Open Hyperplane" instead of Log in / Sign up. Its quick starts skip `?signup`.
  - **Link opens:** each open of the plan endpoint counts one via the SECURITY DEFINER `shared_portfolio_seen(code)` (`customer_sips.views`, `last_view`). Only a number is stored.
- **Admin:**
  - **Theme:** light is the default (`hp_theme`). The colour tables (`BIAS_COLOR`, `STRENGTH_COLOR`, `SECTOR_PALETTE`, `MCAP_COLOR`) are `themed(dark, light)` proxies driven by `LIGHT`, which the Dashboard sets on each render. The page background follows `html.hp-dark`.
  - **Removed:** the Opportunities and Horizon tabs, and Admin → Strength evidence (`evidence.jsx` is no longer imported; the backend is untouched).
  - **Access manager:** one `GroupHead` (the whole bar folds, rotating chevron, 34 px icon, "x of n on") and `useFold(store, keys)`, which remembers closed groups and gives "Collapse all / Expand all". Used in the Permission manager (`#pm-foldall`) and the Roles view (`#role-foldall`).
  - **📂 Shared portfolios** (`frontend/src/portfolios.jsx`, `GET /api/admin/portfolios`):
    - every saved portfolio with the customer, ID, application, visibility, holdings count, changes, tracked value / return and link opens;
    - an "Open ↗" link (public only) opens `/app/portfolio/<ID>` in a new tab (`target=_blank`, `noopener`);
    - search, filters, sort, Copy and Excel export;
    - no holdings are ever sent.
    - Note: this shows the admin the customers' private portfolios too (by name and value), which the owner asked for (round 15). It goes past the earlier "the customer portfolio list stays private" rule.
- **Tests:**
  - `round15_test` (49 checks).
  - `share_test`, `share_ui_test` and `route_ui_test` now check the no-permission path on a test role, "No-share (suite)", which is the Customer role without `:share`.

### Round 16 (owner 2026-11-07) — past data as a permission, every app follows the day; overall AI watch; simulators everywhere
- **Past data = permission `research:history`** ("Past data in every application", owner-level).
  - The Customer Admin role gets it (`migrate_history_perm`, `history_perm_v1`); Customers don't.
  - It replaces the admin switch: the admin card now only shows how many days are ready. `portal_config.history` is no longer read, and the `customer_history` RLS policy is `USING (true)`.
- **How a day travels:**
  - The app sends `X-HP-Day: YYYY-MM-DD.open|end` with every `/app/api/*` call (`core.setApiDay`, set by the shell's day picker).
  - Portal middleware `_day` keeps the header per request. `_session()` → `_check_day` refuses it with 403 without the permission, 404 for an unknown day and 422 for a bad format.
  - `_latest_view()` / `_latest_etf_view()` then answer with that day (`_hist_views`, LRU of 12).
  - These always use today: swaps (`holdings` PUT), apply / check, the AI watch, tracking flags and alternatives (`today=True`).
- **Per-day capabilities** (`_day_caps`):
  - **Zones:** collections before 29 Oct 2026 have no `zv` zone view. The Builder, Builder preview and both SIP Builders answer 422 "collected before the zone view was stored", never an empty result.
  - **ETF:** `customer_history.etf_gz` is built with each past day (`publish._etf_gz`) and backfilled once by the worker (`history_etf_backfill`). Days without an ETF file get a clear 422 / 404.
  - **Picker:** `/app/api/history` returns `zones` and `etf` per day, and the picker notes when the open app can't use a day.
- **Shell:** for permission holders, the day picker shows in every application. The apps with their own server data (ETF, SIP, Momentum SIP, Builder) remount with `key={dayKey}` when the day changes.
- **Saved on a past day:** `saved_on` = that trade date and `inputs.as_of` = that collection's time. Tracking runs from that day to today.
  - The tracker shows a "Back-tested from …" chip (`#svp-bt`).
  - The shared page says it was built on that day's data and shows "Back-tested from" (`#pub-back`); the public `inputs` include `as_of`.
- **Swaps show price + company size:** `monitor.size_of` → `{p, mcap (₹ Cr = ff[1] × p), cap}`.
  - It's on every alternative, on the AI watch items, and on `/app/api/alternatives` `cur`.
  - `SwapOptions` shows a "Now" row (`#tk-cur`) and `SizeTags` on every choice.
- **Overall AI watch:** `#svp-aiall` at the top of My portfolios covers every non-ETF portfolio, with the total count of stocks to change.
  - `AiWatch({list})` handles one portfolio or all of them: the scan animation, then the swaps grouped by portfolio.
- **Portfolio page:**
  - Sticky section tabs like the Builder's (`SectionTabs`, `#svp-tabs`): Overview · Performance · Allocation · Holdings · Swaps · Simulators.
  - The simulators come from `sim.jsx` (`idp="svp"`); the holdings stay a table.
- **Simulators (`sim.jsx`, shared with the public page):** growth is 5 % by default and adjustable from 0 to 100 % (number + slider, clamped, with "Back to 5%").
  - Notes: 5 % is below average; above 15 % is a stretch.
  - The CSS is scoped to `.pq-sim`.
- **Shared page:**
  - **Colours:** the app's own cap palette (`--mx-l/m/s/c`, a blue ramp, no orange). Avatars use `--mx-*t` text on the tone, and a deeper edge under each ring keeps small cap readable.
  - **Tile effect:** the AI Mode tile field (`cells.jsx` `CellField`, moved out of `apps/simple.jsx`) appears only in the hero (with a fading grid) and the closing band.
  - **Spacing:** tighter throughout.
- **Icon and buttons:**
  - The ETF SIP icon is now stacked coins with a rising line (the piggy bank is gone).
  - The result action bars (SIP / Momentum SIP / Builder) are one slim row of 34 px buttons: Edit inputs · Save · [PDF | CSV | Tickers Copy TV] as one joined group · "How to buy" as a quiet link · "Send to AI Portfolio Analyser" as a light accent button on the right.
- **Tests:** `round16_test` (76 checks).

### Round 17 (owner 2026-11-07: "I couldn't see any data after saving … tracking not happening … swap not showing in the shared one")
- **Cause:** tracking started at the save day and loaded only price days on or after it. A portfolio saved when that day had no price yet (weekend, holiday, the morning before the first update) had no days at all: value "—", 0 holdings, an empty shared page, until the next trading day.
- **Rule now (`tracking.track`):**
  - **Start:** the start is `_price_day_on(save day)`, the LAST close on or before the save day. That is the price the customer saw when saving, and it stays the start forever.
  - **Changes:** every later version (a swap, an apply) takes effect at the last close on or before its own day (`eff`). A Saturday swap stays at Friday's close when Monday arrives.
  - **SIP instalments:** the first instalment's period is the save day's month or quarter (`max(d, save0)`). Saved on Sunday 1 Dec and priced at Friday's November close, it is December's instalment, never one for each month.
- **Pages:** the shared page shows its numbers and holdings from the first close (`have`). The line starts on day 2, and in between the page says "Priced at the close of …" (`#pub-first`). The portfolio page says the same (`#svp-first`).
- **Tests:** `timing_test` (48 checks) covers:
  - a save on a no-price day for every kind;
  - the next trading day: one more day, same purchases, value moves, no extra instalment;
  - a no-price-day swap: shown at once on both pages, same purchase after the next day;
  - a month turn: one instalment;
  - both pages. Among other things, it inserts a simulated next price day to check that tracking (customer and shared) grows day after day, then deletes it.
### Round 17b — sign-up screening: real customers only (owner 2026-11-07: "a test profile with fake details … without my review in production")
- **Flow** (`signup_guard.py`, `mailer.py`, `portal.py`):
  1. `/app/api/register` first **refuses** throw-away mail services (`DISPOSABLE`) and impossible phones (one digit repeated, 1234567890 / 9876543210).
  2. It creates the account **pending**. The old trigger no longer approves at insert; `customers_auto_approve` is now a no-op.
  3. `portal_signup_start` records `review_flags` (`screen()`: placeholder domain, test-like email or name, repeated-digit phone, digits or no vowels in the name) and queues a "confirm your email" mail.
  4. The mail's link is `/app/#verify=<token>`. It sits after the `#`, so a mail scanner's prefetch can't use it up; the page POSTs `/app/api/signup/verify`. It is one use, valid 48 hours, and only its SHA-256 is stored.
  5. `portal_verify_email` then decides:
     - **No flags and Admin "Approve automatically" is on:** the account is approved, the customer is emailed "approved", and the owner gets a ✅ Telegram line.
     - **Otherwise:** the account stays pending, the customer is emailed "confirmed, we'll approve you", and the owner gets a 🔎 Telegram message with the reasons ("Admin approves each sign-up" when auto-approve is off).
  6. The owner's own **Approve** in Admin → Customers now emails the customer ("approved") and marks the email verified (`main.update_customer`).
- **Sign-in before confirming:** 403 with header `X-Verify: 1`. The sign-in form shows "Send the confirmation link again" (`/app/api/signup/resend`: 3 an hour per address, 4 a day per account, the same answer for unknown addresses). A resend ends the earlier link.
- **Owner messages:** table `owner_alerts`, sent by the worker's mail thread (`mailer.deliver_alerts`) through the Telegram bot in config.ini. Nothing is sent when Telegram isn't set up, and the bot token is never logged.
- **Rights:** the customer service has no right to read or write `signup_verifications`, `owner_alerts` or `email_verified_at`. It only calls three SECURITY DEFINER functions (`portal_signup_start / resend`, `portal_verify_email`).
- **Existing customers:** approved accounts were backfilled as verified, so nothing changes for them. `customers.email_verified_at` and `review_flags` are shown in Admin → Customers (✓ email confirmed / ✉ not confirmed, ⚠ reasons).
- **Not possible without a paid provider:** a phone one-time code (SMS). The number is checked for shape only.
- **Tests:** `signup_screen_test` (41 checks). It stops the real mail worker, uses a local test inbox, and restarts the worker and restores the auto-approve setting at the end. `auto_test.py`, `phone_test.py` and `dial_test.py` are old exploratory scripts for the instant sign-up and are no longer meaningful.

### Round 17c — validation (owner 2026-11-07: "auto-approve stays the default; Gmail only, no corporate ids; no numbers in the name; all proper validation; no SQL injection; check the sign-in and sign-up pages")
- **Rules** (`signup_guard.py`; the page mirrors them in `frontend/app/src/validate.js` and only helps — the server checks everything again):
  - **Email:** `@gmail.com` only, with a 6–30-character name of letters, digits and single dots, starting and ending with a letter or digit. No `+` part, no `googlemail.com`, no other or company domains. Gmail ignores dots, so `a.b@` and `ab@` are one inbox (`canonical_gmail`, one account).
  - **Name:** letters of any language, plus space . ' ’ - only. No digits (including Arabic-Indic), no markup, no hidden or zero-width characters, 2–60 characters.
  - **City / state:** letters only, no repeated symbols. India's state must be one of the 36 listed, and the country one of the list.
  - **Password:** 8–128 characters with a letter and a number; not a common password; not the email name or first name.
  - **Phone:** unchanged (+91 starts with 6–9, no repeated or sequential numbers).
  - **Everywhere:** control, zero-width and unassigned characters are refused (`clean()`); every refusal is a plain 422 sentence with an `X-Field` header naming the box.
- **Auto-approve is the default:** `portal_auto_approve()` answers `true` when no switch is stored. An approved account still needs the confirmed email (and no fake flags) — see 17b.
- **SQL injection:** every query already used bound parameters; these are extra walls.
  - Values are validated before any query.
  - `safe.SafeModel` is the base of every customer-service request model. Any control character (NUL, ESC…) is refused with a 422. Before this, a NUL in a saved name returned a 500 and one in the portfolio list a 502.
  - Pydantic's own errors become one plain sentence (`RequestValidationError` handler).
  - Login / forgot / resend use `_safe_email`.
- **The sign-in and sign-up pages** (`AuthScreen`): bugs found by probing and fixed:
  - **Name box:** it took digits and markup. Now numbers and symbols can't be typed (a one-line hint shows).
  - **Email:** it wasn't trimmed, and two pasted emails stuck together. Now spaces are dropped and the email is lower-cased.
  - **Error messages:** browser bubbles ("Please select an item in the list") are replaced by inline messages under each field, shown once the field is left or Submit is pressed. The cursor goes to the first problem.
  - **Typed passwords:** a password typed in one form stayed when switching sign-in ↔ sign-up. Now they're cleared.
  - **Click lost on Submit:** leaving a field showed its message, the layout shifted, and the click on "Create account" landed on nothing. `keepFocus` (mousedown on a button or link inside the form) fixes it.
  - **New:** show / hide eye on every password box, a password strength meter, a "Gmail only" hint, and placeholders without example.com.
  - **Reset-password page:** it now uses the same password rule.
- **Tests:**
  - `signup_validation_test` (about 120 checks: every refusal with its field, injection payloads in every open endpoint, the pages).
  - `signup_screen_test` (Gmail addresses now).
  - `pw_ui_test` was updated.
  - `probe_auth_endpoints.py` (NUL and injection strings against the signed-in endpoints).
  - `pw_api_test`, `auto_test`, `phone_test` and `dial_test` are stale: they assume mail isn't set up, or the old instant sign-up. `pw_api_test` now sends real emails if run.

### Round 18 — swap options in four sections (owner 2026-11-07: "a section for the same industry, the same sector, a better alternative, then the upgrade — and say so clearly when the industry has none")
- **Server** (`monitor.alternatives`): each option carries `section` (`industry`, `sector`, `cap`, `up`). Up to 3 in each section, 3 upgrades. The order is industry → sector → cap → up. An upgrade is a bigger company in the same industry (else the same sector), and is not repeated in the sections above it.
  - **industry:** the same sector and industry.
  - **sector:** the same sector, another industry.
  - **cap:** another sector, the same size. This is the "Better alternative".
  - **up:** a bigger company.
  - `/app/api/alternatives` `cur` now also names `ind` and `sec`.
- **Page** (`core.swapSections(items, cur)`, one place for every swap list):
  - **Explanation first:** "We look in this order: …".
  - **Amber note:** when the industry has no peer, "There is no other stock in <industry> that passes the long-term checks today, so the first choices come from the same sector".
  - **Four sections:** each has a title, a subtitle, and an empty line saying why it has no options ("Already a large company — there is nothing bigger to upgrade to").
  - **Where it shows:** the Swap pop-up on a saved portfolio and the AI watch pop-up (`saved.SwapOptions`), and the Analyser watch drop-down (`apps/portfolio.jsx`).
  - **Best match:** the first option; it is the one the Analyser row names.
- **Test:** `sections_test` (about 75 checks) covers the rules of each section for stocks with and without industry peers, and all three screens.

### Round 18b — one swap panel for every swap place (owner 2026-11-07: "the UI of the swap is not so good … section separation hard to read")
- **`frontend/app/src/swap-ui.jsx` `SwapPanel`** is the ONLY swap-options UI. It is used by the Swap pop-up and the AI watch (`saved.SwapOptions`) and by the Analyser watch drop-down (`apps/portfolio.jsx`).
  - **Layout, top to bottom:**
    - a "Replacing" card (the stock, a "Regime turned down" chip, price, size, the money that moves);
    - "How we choose.";
    - the amber note when the industry has nothing;
    - numbered jump chips;
    - four coloured section cards, each with a header (number, title, sub, count), column heads and rows;
    - each row: ticker + tags, name, price per share, company size, strength pill + reliability, Swap.
  - **Responsive:** it uses container queries (`@container`), not viewport media, so the narrow pop-up and the wide drop-down each lay out correctly.
  - **Class names are deliberately unusual** (`.swx`, `.nl`, `.swt`). Global `.top`, `.lbl`, `.who` and `section` styles in `shell.css.js` leaked into the rows before. Keep new classes prefixed `swp-` or similar.
  - **AI watch:** the old per-stock header line (`.aw-ih`) shows only after a swap or when there are no options; otherwise the Replacing card names the stock.
- **Selectors the tests rely on:** `[data-section]`, `[data-empty]`, `[data-notice]`, `[data-opt]`, `[data-pick]`, `#tk-why`/`#tk-notice` (pop-up, `idp="tk"`), `#pfw-<sym>-why` (Analyser).

### Round 18c — swap panel as a 2×2 grid of tables + details on click (owner 2026-11-08: "looks childish, not professional … 2×2 grid, keep it as the table as usual, colours of our theme … the details of the stock on click")
- **Replaces the 18b card layout.** The numbered jump chips are gone, and so are the per-section colours (green / orange / purple).
  - Each section is now a neutral card: an `--s2` header holding title, sub and an accent count pill, above a real `<table class="hp-t swp-t">`.
  - Table columns: Stock · Price · Size · Strength · Swap.
  - The four cards sit in `.swp-grid`, which is 2×2. It drops to one column under a 900 px container width, and the Size column hides under 460 px.
  - Only the Best-match row's Swap button is `.px-btn.primary`; the others are plain.
- **Details on click:**
  - A click on a row (`tr.swp-row`) opens `tr.swp-dr` with `[data-detail-of=SYM]` under it; a second click closes it.
  - It shows: why the stock is offered (by section); company and sector › industry; long-term strength with the difference from the replaced stock; price; size; reliability; and what the money buys.
  - **"Full detail view"** appears only when `DetailCtx.can(app)` is true, so `<app>:detail` stays owner-level. `app` is `builder` for Builder-kind saved portfolios, otherwise `portfolio`.
- **Server:** `/app/api/alternatives` `cur` now also carries `n` and `st` (`lt_strength`), so the replaced stock's strength is shown and compared.
- **Pop-ups:** the Swap pop-up is now `wide`, and `.tk-modal.wide` is 1120 px.
- **Removed the blocks above the grid** (owner, same day: "not needed, it's already there"): the Replacing strip, "How we choose" and the amber note.
  - The pop-up header and the watch row already name the stock.
  - The empty Same-industry card still says "No other stock in … today".
  - The replaced stock's price, size and strength appear in each option's details for comparison.
  - The panel now starts with the grid. `#tk-why`, `#tk-notice`, `#tk-cur` and `[data-notice]` no longer exist.

### Speed and housekeeping (owner 2026-11-07: "production feels slower … remove garbage but keep all the data cache")
- **Measured locally:** every API < 60 ms, DB ~200 MB. Slowness on prod is therefore network, browser, or CPU taken by collection / other jobs. It is not the app's own work.
- **Changes:**
  - `docker-compose.yml` `x-logs` → container logs rotate at 10 MB × 3 per service (they grew without limit before). Takes effect after `docker compose up -d`.
  - `tracking.CACHE_MAX` 200.
  - `portal._rate` purges old keys every 2000 calls.
  - **The portal logs `SLOW <ms> <path>`** for any request over 400 ms. On prod: `docker compose logs portal | grep SLOW`.
- **Safe cleanup (keeps all data, caches and volumes):**
  - `docker builder prune -af`
  - `docker image prune -f`
  - `sudo journalctl --vacuum-time=7d`
  - `sudo apt-get clean`
  - Postgres `VACUUM (ANALYZE)`
- **NEVER** `docker system prune --volumes`, `docker volume rm` or `docker compose down -v`. They delete the database and the data cache.

### Round 19 — WhatsApp removed · Unified Inbox · Hyperplane Community (owner 2026-11-08 / 09)

**WhatsApp removed** ("don't want WhatsApp as of now"):
- Every WhatsApp trace is gone:
  - the community-link code (`portal_community()`, `/api/admin/community` link, `/me.community`);
  - the sign-up invite note;
  - the "WhatsApp number" wording.
- The field is now **"Mobile number"** and is still collected and checked the same way.
- The schema drops the function and the `portal_config` key.
- **Never build an unofficial WhatsApp bulk sender.** The number gets banned. The official Business API is paid.

**Unified Inbox** (`frontend/app/src/inbox.jsx`, `/app/inbox`; backend `inbox.py` + `portal.py /app/api/inbox*`):
- Modelled on the owner's sample (an enterprise approvals inbox). It has three panes:
  - **Left:**
    - tabs **Action needed · Updates · Done**;
    - search;
    - **Filter & Group** (by application / portfolio / none, filter by app);
    - date chips (Today, 7d, 30d, 60d, Custom);
    - collapsible groups per application with a coloured code badge: PA, PB, ES, MS, HP (Hyperplane updates), HD (Helpdesk).
  - **Middle:**
    - a type chip (PORTFOLIO CHANGE / SIP ORDER / ANNOUNCEMENT / HELPDESK QUERY), the reference, the status pill and a fact strip;
    - an **Overview** tab with a stock table and **Swap**, which opens the round-18c `SwapPanel` in a pop-up and calls `PUT …/holdings` with `replaces`;
    - an **Activity** tab with a timeline.
  - **Right:**
    - **Status flow:** Raised → Seen → Stocks settled → Done.
    - For a helpdesk item, the conversation instead (`HdThread`, exported from `shared/helpdesk.jsx`).
- **Data:** `customer_notifications` gains these columns:
  - `app` (portfolio | builder | sip | msip | hyperplane);
  - `type` (action | info);
  - `status` (open | done), `done_at`, `done_note`;
  - `items_done` (`{symbol: {how: swapped|removed|recovered, in, d}}`).
- **Backfill:** `app` comes from the kind. An item with `items` or `order` is an action. Rows older than 45 days are closed.
- **Customer service grant:** UPDATE only on `read_at, status, done_at, done_note, items_done`.
- **Items settle by themselves** (`inbox.settle`):
  - `portal._new_version`: a swap or removal settles that stock. This covers every swap place.
  - `PUT /app/api/portfolio`: a stock taken off the Analyser list.
  - `monitor.run_alerts`: a flag that cleared counts as "recovered — no change needed".
  - When every stock is settled, the item closes. A new SIP order closes the previous open order (`inbox.close_orders`).
- **Customer actions:** Mark done (with an optional note, ≤ 200 characters, hidden characters stripped) and Reopen.
- **Helpdesk tickets** are merged in at read time from `hd_tickets`, never copied:
  - open with an unread reply → action;
  - open otherwise → info;
  - closed → done.
- **Announcements** (Admin → Customers → 📣):
  - `POST /api/admin/announce` sends a message to every approved customer, or to one role, as `kind='announce'`, `app='hyperplane'`, `type='info'`, with a batch id.
  - There is a list with sent and seen counts, and **Withdraw** (`DELETE …/{batch}`).
- **Bell (`notify.jsx`):** now a small preview.
  - The count is unread items plus unread helpdesk replies, capped at "99+".
  - The latest 6 are listed, and each opens the inbox on that item.
  - **Open inbox →** opens the full page. The old Detail modal is gone.
- **Layout gotcha:** the inbox is wrapped in `.ib-wrap { container-type: inline-size }`. A container query cannot style the container itself, so `.ib` must not be the container.

**Hyperplane Community** (`frontend/shared/community.jsx`, used by both apps; backend `community.py`):
- One group chat for every approved customer and the owner. The customer app has it at `/app/community` (chat icon in the top bar). The admin app has a 💬 Community tab with Chat / Reports / Muted.
- **Privacy rule (owner):** customers see a person's **name only**.
  - `_out` never sends email, phone, customer id or city to a customer, only `name`, `mine`, `admin` and `hue` (a salted-hash colour).
  - The admin side adds `email` and `customer_id` for moderation.
  - Search matches message text only.
- **Messages:**
  - helpdesk-style blocks: text ≤ 2 000 characters and ≤ 4 images (bytes checked, browser-shrunk ≤ 1.2 MB, BYTEA, served with a sandbox CSP);
  - `reply_to` is a quote;
  - `thread_id` puts the message in a thread panel on the right; the reply count is kept by the `cm_thread_count` trigger;
  - reactions from a fixed set (👍 ❤️ 😂 😮 🙏 🔥);
  - delete your own message. A removed thread head stays as "Message removed";
  - report (not your own, not the admin's);
  - day separators, a "New messages" line, grouping by author within 5 minutes, "↓ N new", older pages, a lightbox, and search.
- **Links:** clickable only in admin posts. In customer posts they stay plain text (anti-scam).
- **Rules card:** shown on first visit (name only, no tips or selling, no phone numbers). Posting is refused until it is accepted.
- **Admin side:**
  - posts as **"Hyperplane · Admin"** (verified badge, accent tint);
  - pins to the top bar;
  - can delete any message;
  - can pause a customer's posting for 1 h, 24 h, 7 d or "until lifted" (`9999-12-31`, because psycopg cannot read `infinity`);
  - a reports queue: Delete / Pause 24 h / Keep;
  - a Muted list with Lift.
- **Badge:** `useCommunityUnread` polls every 30 s.
  - The count covers new room messages plus new replies in threads you took part in, capped at "99+".
  - `admin: true` turns the badge accent-coloured with a shield (`#cm-btn[data-admin=1]`).
  - A new member starts "caught up": the `cm_members` row is created with `last_read_id = max(id)`.
- **Security (database-enforced):**
  - `cm_*` tables use per-command RLS policies:
    - everybody reads;
    - a customer inserts only as themself, and only while `cm_can_post(cid)` is true (approved and not muted);
    - updates only `deleted_at` of their own messages;
    - reactions, reports and members rows are their own only.
  - Mutes and pins are not writable by the customer service, and a muted customer is refused by the database even through a script.
  - Limits:
    - per IP 120 per minute (helpdesk limiter);
    - 10 posts per minute and 300 per day;
    - 30 images per day;
    - 60 reactions per minute;
    - 600 posts per minute across everyone;
    - Caddy and the services allow 8 MB for `/app/api/community*` and `/api/admin/community*`.
- **Realtime:** polling, no sockets. The room every 4 s (`?after=`). Every 16 s, the state of the visible ids (`POST …/refresh`). A thread every 4 s.
- **`route_guards`:** `/app/api/community` requires `cm_customer`.

**Tests:**
- `inbox_test` (40 checks): API plus browser, including Swap from the inbox, the bell, phone width and dark mode.
- `community_test` (70 checks):
  - privacy, images, quote and thread, unread with the admin mark, RLS (delete, post-as-someone-else, muted, lift-mute denied), reports, pin, search, 429;
  - browser: 99+ badge, admin mark, rules, links, reaction, thread, image, report, pinned bar, phone, dark mode and the admin tab.
- `signup_validation_test`: a NUL byte is refused earlier by `SafeModel` (generic 422). The test accepts that.

### Round 19b — Community redesign, member tags, @mentions, favourites · Inbox renamed and simplified (owner 2026-11-09)
Owner's words: "tag people near the name like Admin — created and given in my admin app"; "the conversation UI is too old school — my
messages right and others left like WhatsApp"; "mark a chat as favourite and a favourites view with its threads"; "anyone can tag
anybody"; "keep the name Inbox; Action = any portfolio swap / stock change from any application; Updates = when anyone tags you in the
chat; Done = all completed; remove Today / 7d — show all".

**Community UI** (`frontend/shared/community.jsx`, rewritten):
- **Bubbles** like WhatsApp:
  - mine on the right (accent tint), others on the left with an avatar and the name in the person's colour plus their tags;
  - grouped within 5 minutes;
  - the time (and ★ / 📌) inside the bubble;
  - the quote inside the bubble;
  - reactions under it, and a "N replies" pill.
- **Wallpaper and controls:**
  - a dotted wallpaper, sticky day pills, a "New messages" pill;
  - a round send button and a pill input;
  - hover tools: react · reply · thread · ☆ · ⋯.
- **Left menu:**
  - views: Community chat · Favourites · Mentions · Pinned;
  - admin only: Member tags · Reports · Paused members.
  - Under 980 px container width the menu becomes a chip row.
- Class names are prefixed. Use `cm-first`, not `top`: the global `.top` (the shell header style) drew lines across rows.

**Member tags (admin only):**
- Tables: `cm_tags` (name, colour from `TAG_COLORS`) and `cm_member_tags`.
- Admin routes:
  - `GET/POST/PUT/DELETE /api/admin/community/tags[/{id}]`;
  - `GET /api/admin/community/people?q=` (approved customers with email and tag ids);
  - `PUT …/people/{cid}/tags`.
- The admin page **Member tags** lets you create a tag, recolour it, delete it, and give it per person with toggle chips. A message's ⋯ menu has "Tags for {name}".
- Every message carries the author's `tags: [{n, c}]`. The customer service may only SELECT the two tables.

**@mentions (anyone):**
- **Picker:** `GET /app/api/community/people?q=` offers members who have posted, plus Hyperplane. It sends names only, keyed by an opaque `handle(cid)` (a salted hash). You can't mention yourself.
- **Body blocks:** the client sends `{"t":"at","k":handle}`. The server stores `{"t":"at","cid","n"}`, or `{"t":"at","adm":true}` for Hyperplane. The page gets `{t:"at", n, me, adm}`, never the id. Limit: 10 per message.
- **Notifications:** the database trigger `cm_notify_mentions` turns a stored mention into a `customer_notifications` row: `kind='mention'`, `app='community'`, `type='info'`, body `{mid, thread, by, admin, text}`. `cm_unnotify` removes it when the message is removed.
- **Mentions view:** `?view=mentions` (`body @> [{"t":"at","cid":…}]`, GIN index).

**Favourites:**
- `cm_favs` (who, message) is per person, with RLS on own rows. Toggle with `PUT …/{mid}/fav`; list with `?view=fav`.
- A thread reply in a list view shows "In a thread · Open the thread". `listing.counts` gives fav, mentions and pinned for the menu.

**Limits:** the Community has its own per-IP limit, `community.guard_ip`: 600 a minute. The page polls every 4 s, and people in one office share an address, so the helpdesk's 120 was too low.

**Inbox:**
- The title is just "Inbox".
- Tabs are **Action** (portfolio swaps and stock changes from any application), **Updates** (Community mentions, announcements, Helpdesk queries — helpdesk is always `info` now) and **Done**.
- The date chips are removed; everything is listed.
- A mention item has the chip MENTION, From / Where / Sent, and **Open in the Community**. That marks it done and opens the Community on the thread, or on the Mentions view with the message highlighted.

**Tests:** `community_test` has 104 checks: tags, mentions, inbox handoff, favourites, RLS on stars, and bubble sides. `inbox_test` is updated.

### Round 19c — Groups (REMOVED in round 19d — kept here as history): Teams-style tags anyone can make (owner 2026-11-09: "anyone can tag anyone from the chat — groups like Teams, by name")
- **What it is:** anyone in the Community makes a **named group** of people from the chat (e.g. "Swing traders"). Typing `@` + the group name in a message reaches everyone in it: each member gets an Inbox → Updates item titled "X mentioned @Group" (body `group`), and it is in their Mentions view.
- **Who can do what:**
  - the maker, or the admin, can rename or delete a group and change its people;
  - a member can leave;
  - anyone can mention any group.
  - The admin's member badges (round 19b) are a separate feature and stay.
- **Data:**
  - `cm_groups` (case-insensitive unique name, `created_by_kind` / `created_by`).
  - `cm_group_members`: group, customer and the shown name.
  - The `cm_notify_mentions` trigger expands `{"t":"at","gid"}` to the members. A person is notified once, never the writer, and only approved customers.
  - RLS:
    - everyone reads;
    - only the maker inserts, updates and deletes the group and adds members;
    - a member deletes their own membership.
- **API:**
  - customers: `GET/POST /app/api/community/groups`, `PUT/DELETE …/groups/{id}`, `POST …/groups/{id}/leave`;
  - admin: the same under `/api/admin/community/groups`.
  - The @ picker (`people`) also offers groups as `{k:"g:<id>", n, group:true, size}`.
- **Limits:** 2–30 characters, no `@`; up to 100 people a group; 10 groups per person; 300 in total; 30 changes per hour. Only people who have posted can be added, by their opaque handle; "Include me" adds yourself.
- **Mentions:** the view and its count use `body @> ANY([my name pattern, each of my groups' patterns])`.
- **UI:**
  - a left-menu **Groups** view: New group (name, search people from the chat, chips, Include me), and group cards with Mention / Edit / Leave / Delete;
  - a group mention in a message shows bold `@Group`, highlighted for its members.
- **Tests:** `community_test` has 122 checks, including groups: maker-only edit and delete, the RLS insert, picker, Inbox for each member but not the writer, leave and the admin edit.


### Round 19d — Groups removed · mentions only for Customer Admins · date search · Inbox rows and filters (owner 2026-11-11)
Owner's words:
- "Remove that group — not going to create any groups now."
- "Users can only tag the admins — those tagged as Customer Admin in the admin application — anyone can pick them; show the name with the Admin tag; the tagged people must be notified under the Inbox."
- "Give a date search in the chat — if the user picks a date two years back it should show fast — proper indexing by date; don't search by message."
- "Inbox: bring the name outside like the Helpdesk list, and an application-wise filter."

**Groups dropped:**
- Removed: `cm_groups` / `cm_group_members` (`DROP TABLE` in the schema), the group routes, `GroupsPane` and the group branches of the trigger and picker.
- Old Inbox items from group mentions stay as history.

**Community admins = approved customers holding the role "Customer Admin"** (Admin → Access manager, matched by role name, case-insensitive). The database function `cm_admins()` (SECURITY DEFINER, granted to the customer service, which cannot read roles) returns them.
- The @ picker (`community.people`) offers only them, names only, by an opaque handle. It never offers yourself.
- `post.resolve` accepts only their handles. When the role is taken away, the mention is refused (422).
- Their messages carry `role_admin: true`, so the page shows the **Admin** badge beside the name (the same badge as Hyperplane's own posts).
- A mention notifies them through the trigger: Inbox → **Updates** → Community, "X mentioned you in the Community".
- The ⋯ menu's "Mention …" is offered only on their messages.

**Date search replaces message search** (the `q` parameter and the search box are gone):
- `GET …/community?day=YYYY-MM-DD` returns:
  - that day in Indian time, or the next day with messages (`asked` vs `day`);
  - up to 500 messages;
  - `prev` / `next` = the nearest earlier / later days with messages.
- Every query is a range on the partial index **`cm_messages_room_day` (created_at) WHERE thread_id IS NULL**, so any age reads as fast as today. The test checks the plan uses it.
- `listing` returns `first_day` (the picker's minimum).
- **UI:** a date picker in the chat header opens a day bar: date · ‹ Earlier day · Later day › · Back to the latest. Writing waits for the latest view.

**Inbox:**
- **Rows** follow the Helpdesk list layout:
  - the title with its age;
  - **who it's from** in bold · the summary (`fromOf`: Hyperplane AI watch / Hyperplane AI / Hyperplane / Helpdesk / the person who mentioned you);
  - #ref · app code · status · date.
- **The filters stay on screen** (the Filter & Group pop-over is gone):
  - an **Applications** select listing each application with its count in the open tab, to see which application's portfolio needs the change;
  - a **group-by** select: By application / By portfolio / No grouping.
- **Class-name gotcha:** the global `.ap` (the More apps panel) leaked into a row span, so the code is now `.ib-ap`.

**Tests:**
- `community_test`: 115 checks, including admin-only mentions, role removal, the badge, date search (two years back, empty day → next, bad date, index plan, UI day bar).
- `inbox_test`: the selects, the application filter and the bold "from" name.

### Round 19e — date search is a From → To range (owner 2026-11-11: "I want a proper date picker, from — to")
- **Server:** `GET …/community?dfrom=YYYY-MM-DD&dto=YYYY-MM-DD[&cursor=]` (`community.by_range`), replacing round 19d's `?day=`.
  - Returns the room between the two days, Indian time, both included, oldest first, 300 at a time.
  - The cursor is `"<created_at>|<id>"` and the first page carries the `total`.
  - `dto < dfrom` returns 422, as does a bad date.
  - It still reads only the partial index `cm_messages_room_day`, so the age of the range doesn't matter.
- **UI:** a "Search by date" button in the chat header opens a pop-over:
  - quick choices: Today, Yesterday, Last 7 days, Last 30 days, This month;
  - **From** and **To** date fields (between the first Community day and today; "To" left empty means one day);
  - Clear / Show messages.
  - The bar shows the range and its message count, with Change dates and Back to the latest. **Load more** is used for big ranges, and writing waits for the latest view.
- **Tests:** `community_test` has 119 checks, including a busy day of 310 messages paged 300 + 10 with nothing repeated, and the picker and presets in the browser.
- **Note (2026-11-11):** the owner removed AI Momentum SIP (`msip:view`) from the default **Customer** role in Access manager. `rbac_api_test` and `tamper_test` still expect every customer to have it, so they fail until the role or the tests change.

### Round 19f — date-picker overlap, stale menu numbers (owner 2026-11-11)
- **Picker overlap:** `research.css.js` has a global `.fl{…height:16px}`. Once Deep Research had been opened, it squashed the picker's From / To row, so the hint lay over the boxes.
  - The picker now uses only `cm-dp-*` class names; the hint is a wrapping `<p class="cm-dp-hint">`.
  - The test opens Deep Research first and checks the geometry.
  - **Rule (again):** every new class is prefixed per module. The shell and the apps have global short names: `.top`, `.ap`, `.fl`, `.lbl`.
- **Stale menu numbers:** Favourites / Mentions / Pinned / Reports were counted only when the page loaded.
  - The customer and admin `…/community/refresh` now also return `counts`, `pinned` (and `reports` for the admin), re-read every 16 s.
  - Opening a view sets its number from what it actually shows.
  - What the owner saw was the automated suite's own pinned / reported messages: the suites run against the local database and delete their data at the end. Expect test rows to appear briefly while a suite runs.

### Round 19g — calendar date picker · AI watch names the stock being replaced (owner 2026-11-11)
- **"A date picker, not the type one":** `RangeCal` in `shared/community.jsx` replaces the typed From / To date inputs.
  - A month grid (Monday first) with ‹ › and month / year selects (only months between the Community's first day and today).
  - Click the first day, then the last; hovering previews the range. The ends are filled, the days between are tinted, today is in bold, and days outside the range are disabled.
  - A From / To summary sits under the grid. The quick choices stay.
  - Test hooks: `#cm-cal`, `[data-day=YYYY-MM-DD]`, `#cm-cal-m`, `#cm-cal-y`, `#cm-cal-prev`, `#cm-cal-next`, `#cm-dp-sum`.
- **"I can't see against which stock the swap is" (Hyperplane AI watch pop-up, `saved.jsx` AiWatch):**
  - Round 18 showed the per-stock header only after a swap, and round 18c removed SwapPanel's Replacing card, so no stock was named.
  - Every block now starts with a header strip (`[data-replacing=SYM]`, red left bar): REPLACE / SWAPPED · symbol · Regime down · name · sector › industry · price · size · strength.
  - `sections_test` checks every block has it.

### Round 19h — Analyser card "Better alternative" uses the sectioned panel (owner 2026-11-11: "handle the better alternative properly — it was one straight list")
- `apps/portfolio.jsx` `BetterAlt`: the button on a regime-down card opens a centred pop-up. It is rendered into `document.body` with `createPortal`, so the card's animations cannot clip it.
- The pop-up holds the shared `SwapPanel`, headed "Replace SYM →" with name · sector › industry.
- Swap replaces the stock in the list and closes. Escape and the backdrop close too.
- Hooks: `#pf-alt-SYM`, `#pf-altmod`. `sections_test` checks the four sections, the header and Escape.
- **ETF "Best in segment" (same day, "not working properly while clicking"):**
  - Probed with real mouse clicks at 1700, 1280 and 1024 px; nothing covers the button.
  - It toggles 302 ETFs ↔ 66 markets, including with the Up filter (29 → 11) and a search ("gold": 25 → 1), and a row still opens its card. No fault was reproduced locally; waiting for the owner's exact steps.

### Round 19i — tracker swaps, "Needs a swap" filter, Stock insight pop-up (owner 2026-11-12)
Owner's words: "the swap was not properly happening in My portfolios inside the table"; "a filter to show only the swap stocks"; "clicking a new stock in the swap recommendation — the well-detailed data like the AI summary as a pop-up, with the option to swap".

**Tracker swap bug:**
- A second swap on the same day replaces that day's version (`portal._new_version`), so `changes` stayed the same.
- The tracking reload (`useEffect` on `it.changes`) never ran, and the table kept the old stock with its Swap button.
- Fix: a `rev` counter, bumped after each swap, is added to the reload dependencies.
- `sections_test` does two swaps on the same day and checks the table both times.

**Filter:**
- Holdings bar: **All · N / Needs a swap · N** (`#svp-f-all` / `#svp-f-swap`, `.tk-filt`).
- It shows only the regime-down stocks. It falls back to All once none are left.

**Stock insight** (`frontend/app/src/stock-insight.jsx`, lazy-loaded from `swap-ui.jsx`, rendered with a portal):
- A click on any stock in any SwapPanel opens it: the Tracker's Swap pop-up, the AI watch, the Analyser watch, the Analyser card's Better alternative, and the Inbox swap.
- It replaces the inline details row of round 18c.
- Contents:
  - "Why it is offered";
  - **the Analyser's holding card** for that stock (category, chips, sector / industry, StrengthTiles and the Hyperplane AI research summary from `portfolio-engine.analyseHolding`);
  - a new-vs-now table (strength with its difference, price, size, reliability, sector › industry);
  - **Swap X → Y** (`#si-swap`, which calls the panel's `onPick`), Back to the options, and the owner-only Full detail view.
- **Server:** `GET /app/api/stock/{sym}` (`need("portfolio","builder","msip")`, 60 a minute) returns the stock row of today's view, its size, and only the Q/Y sector and industry rows the summary reads.
- `/app/api/alternatives` `cur` now also carries `rel`.
- Hooks: `#si-pop[data-detail-of]`, `#si-card`, `#si-why`, `#si-cmp`, `#si-reason`, `#si-x`.

**Tests:** `sections_test` now picks its stocks from today's data (regime-down stocks with and without a same-industry option) instead of fixed names, which broke after a new publish.

### Round 19j — Stock insight inside the same window; no detail view on swap screens (owner 2026-11-12)
Owner's words: "remove the detail view on swap — it is only for the manager — is this access restricted?"; "I don't like the pop-up on a pop-up — handle it within one pop-up"; "some issue on the pop-up".
- **One window:** `StockInsight` is no longer an overlay (no portal, no `.si-ov`).
  - `SwapPanel` shows it **in place of the options grid** (the grid is hidden with an inline `display:none`; `hidden` loses to `.swp-grid{display:grid}`).
  - "Back to the options" (`#si-back` / `#si-back2`) returns. Swap sits at the top (`#si-swap-top`) and the bottom (`#si-swap`).
  - **Esc** is caught in the capture phase and goes back to the options, without closing the outer pop-up. Before, one Esc closed both windows.
  - It scrolls into view when opened.
- **No Full detail view on any swap screen.** It was only ever shown to roles holding `<app>:detail` (DetailCtx), and the data route `/app/api/detail` refuses everyone else server-side.
  - `community_test` checks a plain customer gets 403 there, and that `/app/api/stock/{sym}` returns only {stock, rd, as_of, p, mcap, cap, sectors, industries}.
  - `sections_test` checks no Full detail view appears on the swap screens, even for a Customer Admin.

### Round 19k — one Inbox item per portfolio · process labels · Detail view for the Customer Admin everywhere, inside the same window (owner 2026-11-13)
Owner's words:
- "one portfolio against one inbox message — check every day whether the swap is still needed, merge the new swap, remove the one not needed any more — too many messages";
- "from which app, which process — investment or SIP";
- "in the inbox, an option to check the swappable stock data";
- "for the admin the detail view like the Portfolio Builder's, in all places, only for the Customer Admin, in the RBAC properly";
- "a swap pop-up, then More details as the admin — a side panel appears along with the pop-up".

**One item per portfolio:**
- `inbox.sync_changes` is called by `monitor.run_alerts` for every plan and for the Analyser list after each publish:
  - still flagged → kept, with its reason and suggestion refreshed;
  - newly flagged → merged in, and the item becomes **unread** again;
  - no longer flagged and not swapped → removed from the list (`items_done` keeps "recovered" for Activity);
  - swapped / removed → stays as a history row;
  - nothing left → the item closes.
- A new item opens only for symbols flagged for the first time, so a stock the customer marked done does not come back daily.
- `inbox.consolidate` runs at every start and merges old duplicates into the newest one.
- New column `updated_at`: the Inbox and the bell sort by it, and the row's age is the last change. The customer service may update it.
- `sync_changes` is tested directly in `inbox_test` (merge, drop, re-unread, close, reopen).

**Process:**
- `/app/api/inbox` items carry `plan: {name, kind, code, process}`.
- `process`: Saved stock list · Your Analyser list · Investment · one-time amount · ETF SIP · monthly / quarterly · Stock SIP · monthly / quarterly.
- It appears on the row (after the app code) and in the facts (Application · Process · Portfolio · To change · Raised on · Last checked).

**Swappable stock data in the Inbox:** a stock of an item (`[data-ibpeek]`) opens the shared `StockInsight` **in the same middle pane**: "Back to the item", and "Find a swap for X", which opens the swap window.

**RBAC:**
- The new owner-level permission **`msip:detail`** ("Stock detail view", requires `msip:view`) is granted once to the Customer Admin (`migrate_msip_detail`).
- `/app/api/detail?app_key=` accepts portfolio · builder · msip. The `stock_detail` RLS already allows any held `action='detail'` permission.
- The frontend picks the app per portfolio kind: `DETAIL_APP` = analyser / portfolio → portfolio, builder → builder, msip → msip. ETF SIPs have no stock detail.

**Detail view everywhere, never a second layer:**
- `StockDetail` (apps/detail.jsx) has an `inline` mode: no overlay, no side drawer, no page lock.
- **StockInsight shows "AI summary | 🔒 Detail view" tabs** only when `DetailCtx.can(app)` is true, and draws the detail view inside the same window. Esc steps back from Detail → AI summary → options, and never closes the outer window.
- On pages (not windows), the symbol is a `StockLink`, which opens the usual drawer and stays one layer: the My portfolios holdings table, the Analyser watch rows, and the Momentum SIP results (`app="msip"`).

**Tests:**
- `inbox_test`: the sync, the process label, the peek, the inline detail, and the swap waiting for the save instead of a fixed pause.
- `sections_test`: the Detail tab inside the swap window, no `.dt-overlay`, and Esc stepping back.
- `detail_api_test`: 3 detail permissions, and msip:detail giving 200 for the Customer Admin and 403 for a normal customer.
- **Note:** `access_v2_test` still expects the Momentum SIP in the default Customer role, which the owner removed on 2026-11-11.

### Round 19l — detail view of BOTH stocks while swapping, Customer Admin only, same window (owner 2026-11-13)
Owner's words: "while swapping I need the detail view of the swappable one too, only for the Customer Admin — normal view first, then a button, in the same pop-up, not a side panel".
- **StockInsight tabs:** for holders of `<app>:detail`, the tab row is **AI summary | 🔒 Detail view · NEW new | 🔒 Detail view · CUR now** (`#si-tab-ai`, `#si-tab-detail`, `#si-tab-detail-cur`).
  - Each tab draws `StockDetail inline` for its stock inside the same window. The insight still opens on the AI summary.
  - Esc: detail tab → AI summary → options.
- **SwapPanel:** a small "See CUR in detail ›" link (`[data-curpeek]`) above the options opens the replaced stock's own insight, with no Swap button: the AI summary for everyone and the detail tab for the Customer Admin.
- `sections_test` checks both detail tabs and the replaced-stock insight inside the same `.tk-modal`, with no `.dt-overlay`.

### Round 20 — Buy on Zerodha (Kite Publisher offsite basket), Customer Admin first (owner 2026-11-13)
Owner's words: "push the script and quantity to Zerodha … if not logged in, Zerodha asks for the login … our ticker and Zerodha's might be
different — the best way, with validation that the same ticker is used in Zerodha … no scraping from untrusted sources, proper compliance".
Full write-up (sources, setup, crosswalk, checklist): `docs/zerodha-publisher.md`.
- **How it works:** the customer's own browser posts a form (`api_key` + `data` = basket JSON) to `https://kite.zerodha.com/connect/basket`.
  Kite logs them in when needed, shows the orders, and they confirm there. No order API, no Zerodha token, nothing automatic.
- **Symbols** (`backend/app/zerodha.py`): Zerodha's official NSE instrument list (`api.kite.trade/instruments/NSE`), fetched by the worker
  once a day after 08:35 IST (Zerodha's advice), stored whole in `zerodha_instruments` after a sanity gate (exact header, ≥ 1,500 rows,
  ≤ 20 % drop — else the old list stays). Our ChartInk symbol → ✓ same tradingsymbol · ⚠ exactly one `<sym>-<series>` (BE / BZ / SM / ST)
  · ✓ admin correction (`zerodha_symbol_map`, target must be on the list) · ✗ missing / blocked. Never matched by name.
  On 13 Nov 2026: 2,717 published stocks / ETFs → 2,557 same symbol, 160 `-BE` / `-BZ`, 0 missing.
- **Orders:** NSE · CNC · **LIMIT** (offsite baskets reject MARKET — market protection is not passed) at OUR latest server price
  +1 % to buy / −1 % to sell (owner's choice), rounded to Zerodha's `tick_size` per instrument; whole lots; `readonly:false`;
  ≤ 10 lines a basket (more = "basket 1 of N", each its own click); 8-character uppercase tag.
- **Where:** SIP + Momentum SIP result (this instalment's units; "1 every N" holdings unticked), Builder result (day 1 of the buying plan
  when there is one), saved SIP / Builder (tracker `#svp-zr`; lines built on the server from the plan), Inbox "order is ready" (`#ib-zr`),
  swaps (tracker banner `#svp-zr-swap`, Swaps list `#sw-zr-N`, Inbox swapped rows, AI watch — **inline** there, no pop-on-pop).
  A swap basket = SELL the old stock (≤ what the plan's tracking holds; the Analyser list has no quantities) then BUY the new one.
- **RBAC:** `sip:zerodha`, `msip:zerodha`, `builder:zerodha`, `portfolio:zerodha` (owner-level; `migrate_zerodha` → Customer Admin once).
  `ZerodhaCtx` in core.jsx; customers without it get no button and never download the `zerodha` chunk.
- **Return:** the redirect URL registered on the Publisher app is `/app/api/zerodha/return` (public — the SameSite=Strict cookie does not
  come with Kite's redirect). It drops the query (request token never stored; `uvicorn.access` filter keeps the path only) and 303s to
  `/app/#zerodha=success|cancelled|other`. The shell restores the page left (`hp_zerodha.here.path`), then POSTs `/returned` as the
  signed-in customer: their newest `SENT_TO_KITE` hand-off of the last 2 h → `RETURNED_UNVERIFIED` (else a `NEEDS_REVIEW` row). The
  screen says "Kite says … sent for placing — check Kite → Orders", never placed / filled, and offers the next basket.
- **Tables:** `zerodha_instruments`, `zerodha_symbol_map` (portal read-only), `zerodha_handoffs` (portal: own rows by RLS, insert + the
  return columns only; worker expires after 2 h, deletes after 400 days). Publisher key + on/off: `portal_config.zerodha`, read by the
  portal only through `portal_zerodha()`.
- **CSP:** `/app` `form-action 'self' https://kite.zerodha.com` (the only outside place a form may go).
- **Admin → 🔗 Zerodha:** setup steps + redirect URL (copy), the key and on/off, the list status + "Load now", today's stocks not plainly on
  Zerodha with Map to… / Block / Clear, the last 100 hand-offs.
- **Tests:** `zerodha_test` (72 API checks: RBAC 403, catalogue, list + coverage, resolution, tick / limit, quantities, 10-line cap, tag,
  SELL only in a swap within the plan, basket JSON, return without token in URL / log / DB, replay, RLS, switched off), `zerodha_ui_test`
  (35 browser checks; `form.submit` is replaced in the page so NOTHING reaches Zerodha), `zerodha_admin_ui`.

### Round 20b — Connect Zerodha in the top bar + international momentum ETFs (owner 2026-11-13)
Owner's words: "Connect Zerodha on the top of every page … one-time … very very simple for people who are not tech … step by step in the
customer app itself … once connected show it". He chose to stay on the free Publisher hand-off (no algo certification: the customer confirms
every order on Kite). Publisher keeps no login of ours, so the top bar says **"Zerodha · ready"** (the steps are done) — never "logged in".
- **Top bar** `ZerodhaChip` (core.jsx, `#zr-chip`) for holders of any `<app>:zerodha`: "Connect Zerodha" → `ZrConnect` (zerodha.jsx) — one
  window, 3 steps: (1) a Zerodha account — "Yes, I have one" / "Open a Zerodha account" (zerodha.com/open-account, new tab), (2) sign in to
  Kite on this device (kite.zerodha.com, new tab) → "I'm signed in", (3) how buying works (delivery only; **-BE stocks are delivery only, no
  intraday**, so they work the same; Zerodha may ask to sign in each day) → Done. Then "Zerodha · ready" (green) on every page; its window:
  Open Kite · See the steps again · Disconnect.
- **First Buy on Zerodha** without the steps → the same 3 steps first, in the same pop-up (or inline in the AI watch), then the orders.
- **Back from Kite** with a sent basket marks ready by itself. The `#zerodha=` hash is now read and cleared at module load (shell.jsx
  `ZR_BACK`) — the app's own routing used to drop it when the customer came back to plain `/app/`.
- **Stored:** `customer_zerodha (customer_id PK, ready_at)` — own table with RLS (a `customer_prefs` row would turn "never chose pins" into
  "no pins"). Nothing secret is stored: the only key is the owner's Publisher key (a public app id) in Admin → Zerodha.
  `POST /app/api/zerodha/ready {ready}`; `/me.zerodha_ready`.
- **AI ETF SIP Builder, More diversified** (`sip._intl_momentum`, `INTL_MAX = 2`): the 2 strongest international ETFs in a long-term uptrend
  (`_up`), easy to trade, one per market, first among the extras (so they always fit), role `diversifier`, ≤ `EXTRA_CAP` each — even when
  not "Recommended" (owner: "momentum, easy to trade, top 2"; their trading may be uneven → "buy it with a limit order" in the why).
  On 13 Nov 2026: MONQ50 (Nasdaq Q-50 +79) and MAFANG (FANG+ +31). Focus / Standard unchanged.
- **Tests:** `zerodha_test` (+ ready mark, RLS, no pins row, More diversified), `zerodha_ui_test` (+ chip, 3 steps, links, ready, Disconnect,
  ready by itself after a return, phone).

### Round 20c — each customer's own Publisher key, encrypted; Account settings; disclaimer (owner 2026-11-13)
Owner's words: "the API key comes from the customer, in the customer app, not the admin app … the step-by-step guide in ONE pop-up … store it
against the user, encrypted with high-end security … next time just ask them to log in to Kite in the next tab … if they didn't, ask while
pushing the order … remove the zombie code … a market-risk disclaimer before placing … the key under Profile → Account, change or remove".
- **Admin:** the Publisher key field, the on/off switch and `portal_config.zerodha` / `portal_zerodha()` are gone. Admin → 🔗 Zerodha keeps
  only the symbol list (status, Load now, corrections), the hand-offs and "Customers connected: N".
- **Vault** (`backend/app/vault.py`): AES-256-GCM envelope (a random data key per secret, sealed by the master key), AAD = purpose + kek id +
  customer id (a copied or edited row fails to open). Master key = `secrets/zerodha_kek` (base64 32 bytes, git-ignored), mounted read-only
  into the **portal only** (`./secrets:/run/hp-secrets:ro`) — `.env` would reach api / worker. `secrets/zerodha_kek_old` = kek id 0.
- **Table** `zerodha_keys (customer_id PK, key_ct, key_nonce, dek_ct, dek_nonce, kek_id, key_hint (last 4), saved_at)`, RLS own row.
  Routes: `PUT/DELETE /app/api/zerodha/key`, `GET /app/api/zerodha/status` (key hint, available, redirect URL); `/me.zerodha` = {hint, saved}.
  `prepare` opens the key (`vault.unseal`) only for that hand-off; 409 "Connect Zerodha first" / "could not be opened — save it again".
- **Customer app:** `ZerodhaChip` "Connect Zerodha" / "Zerodha · connected"; `ZrConnect` = `KeyForm` (4 steps + the redirect URL with Copy +
  a password-type key field, autocomplete off) or `Connected` (••••hint, Log in to Kite in a new tab, Replace key, Remove key). Buy on Zerodha
  without a key → `KeyForm` first (same pop-up / inline), then the orders. Profile menu "Zerodha" + Account window row "Change or remove key".
- **Orders:** the market-risk disclaimer ("Investments in the securities market are subject to market risks …") with a required "I have read
  and understood this" tick before Open Kite. Kite opens in a **new tab** (`window.open` inside the click → form `target="hp_kite"`;
  blocked pop-up → this tab); the Hyperplane tab shows "Kite opened in a new tab" and "Open basket 2 of N". State in localStorage.
  Basket lines now carry `validity: "DAY"` (the owner's tested format). The round 20b 3-step "ready" flow was removed.

### Round 20d — guided Zerodha onboarding with screenshots; no part of the key is ever shown (owner 2026-11-13)
Owner's words: "improve the Zerodha onboarding … use only the email and phone of the Zerodha account … don't show any part of the key — show the
encrypted one … educate the user … ask them to create a developer account … the screenshots in the website itself, every field marked, don't
fill the IP … then log in … hide my details in the images".
- **Connect Zerodha = 3 steps in ONE pop-up** (`KeyForm`, zerodha.jsx): (1) free Kite developer account — `developers.kite.trade/signup`
  / `login`, "use only the email and mobile number of your Zerodha trading account", every field explained, **IP Whitelist: leave it
  empty**; (2) Create new app (`/apps/new`) — Publisher (free, not Connect / Personal), any name, the Redirect URL with Copy, any
  description, Create; (3) copy the API key → the key field → Save; then `Connected` = "Step 4: log in to Kite". Change key opens at step 3
  with an empty field ("See all the steps" goes back); the saved key stays until the new one is saved (one UPSERT).
- **Screenshots** `frontend/app/src/zr-guide/*.png` (imported → hashed assets in the zerodha chunk only): the owner's console screenshots
  with every personal detail and the real API key painted over, fields outlined + numbered, the IP whitelist marked LEAVE EMPTY.
  Made by the scratchpad script `zr_guide_imgs.py` (re-run it with new screenshots if Zerodha changes its pages).
- **Key ID instead of the last 4 characters:** `zerodha_keys.key_fp` = `vault.key_id(key)` — HMAC-SHA256 under a sub-key of the master key,
  shown as `XXXX-XXXX` ("Encrypted key ID"). `key_hint` was dropped (round 20c rows without a key ID are removed at start: customers save
  again). `/me.zerodha` and `status.key` = {id, saved}.
- Tests: `zerodha_test` (key ID format, no run of the key in it, no `key_hint` column, a failed change keeps the saved key),
  `zerodha_ui_test` (the 3 steps, links, the IP / email notes, the screenshots load, Change key shows nothing of the old key).

### Round 21 — SIP reminders, check-in of real orders, sell-then-buy swaps, multi-basket UX, All Portfolios (owner 2026-11-13)
Owner's words: "a monthly reminder for the SIP — ask for the date … a notification in the Inbox, from where they place the order on Zerodha or
go to the portfolio … track the real order … if stocks were swapped, remove the old stocks first, then another basket for the new ones — the
system doesn't know whether the previous order is done … multiple baskets: don't confirm automatically … always a new tab … a swap never
repeated … All Portfolios in More apps for every customer, not pinned".
- **Reminder:** `customer_sips.reminder_day` (1–28, PATCH `/app/api/saved/{sid}` — SIPs only), tracker "Reminder: Day N" select
  (`#svp-remind`). `monitor.run_reminders` (worker, once a day after 09:00 IST, settings `sip_reminders_day`): on that day (quarterly: first
  month of the quarter) one Inbox item "<plan>: this month's instalment is due" `{order, total, period, reminder}`; a plan with a reminder
  no longer gets the automatic "order is ready" item. Inbox: Buy on Zerodha + Open the plan + "On Zerodha (2026-11): …" status.
- **Check-in** (Hyperplane cannot read Zerodha): `zerodha_handoffs.period / swap_key / step / checkin / checked_at`.
  `POST /app/api/zerodha/handoffs/{id}/checkin {status placed|partly|not_placed, lines [{s, qty, price}]}` (own row; subset of the basket;
  qty 0…10× plan; price ≤ 10× limit). A placed instalment (last basket of the run) closes its Inbox item (`inbox.settle_order`); the same
  instalment is refused again (409) unless `again`. `GET /app/api/saved/{sid}/zerodha` → periods (placed / partly / waiting / not placed),
  swaps (todo · sell_sent · sold · buy_sent · done), waiting baskets, real holdings (qty, avg cost) — the tracker's **On Zerodha** section
  (`#svp-zerodha`) beside the model tracking.
- **Swaps = two steps:** check / prepare take `step`; sell (≤ what the plan holds) → check in → buy → check in → done. The buy is refused
  before the sell check-in, the sell after it, both once done (never sent twice). "I don't hold it / sold it already" =
  `POST /app/api/zerodha/swap/skip-sell` (a SKIPPED hand-off). Swaps list buttons follow the state (Sell on Zerodha · Check in the sell ·
  Buy on Zerodha · Check in the buy · "Done on Zerodha").
- **Baskets:** Kite ALWAYS opens in a new tab (`window.open` in the click → form `target=hp_kite`; blocked → a real `<form target=_blank>`
  button; never this tab). After each basket the window asks "Did you place basket k of N?" — Placed as planned · Edit what I placed ·
  Not placed — before offering the next. Kite's tab (return URL) shows what Kite said + the same check-in + Close this tab, and tells the
  Hyperplane tab through localStorage (`hp_zerodha_ret` heard, `hp_zerodha_ck` checked in). A basket sent earlier and not checked in
  (`check.pending`) opens first. `ZrCheckInBox` (shell, `ZerodhaCtx.checkin`) for the tracker's waiting list.
- **All Portfolios:** module `portfolios` + `portfolios:view` (`migrate_all_portfolios` → every role), `apps/allportfolios.jsx`
  (slug `all-portfolios`): totals (portfolios, invested, value, returns from `saved?kind=all&spark=1`) + `MyPortfolios app="portfolios"`
  (KIND_OF_APP → "all"). Never in the default pins (shell leaves it out); under More apps.
- Tests: `zerodha_test` (+ swap steps, check-in rules, reminders, instalment once, Zerodha view), `zerodha_ui_test` (rewritten: new tab
  only, check-in gates, Kite tab heard, swap two-step → done, Inbox instalment closes, All Portfolios, Account key).

### Round 21b — several swaps at once: all sells, then all buys (owner 2026-11-13)
Owner: "for the swaps bring the option for all sell then all buy with the check box"; also "UI issue: Your holdings from your check-ins".
- **Swaps list** (`SwapHistory`, `zrBulk`): a tick box on each swap not done yet (state todo / sold) + "Select all" bar (`#sw-bulk`) →
  "Sell all N on Zerodha" (ticked swaps still to sell) and "Buy all N on Zerodha" (ticked swaps already sold). Shown when ≥ 2 can be ticked.
- **Source `swaps`** (`ZrIn.swaps = [{out, in}]`, `step` required): check / prepare build one line per eligible swap (sell: state todo;
  buy: state sold) — others are left out and listed (`check.swaps[].ok`). The basket records `zerodha_handoffs.swap_keys` (one key per line).
  Swap state is now per stock (`_line_ok`): a partly check-in counts the stocks with a quantity > 0, so in a shared sell basket one swap can be
  sold and another not. After all sell baskets are checked in, the window offers "Next: buy the new stocks" (`#zr-bulk-buy`).
- **On Zerodha** section: the card has no padding of its own — its content now sits in `.zrs-body` (12 × 16 px), tables boxed.
- Tests: `zerodha_test` (+ shared sell basket, per-stock check-in, buy only the sold one, done never offered again),
  `zerodha_ui_test` (+ tick 2 → sell all → check in → buy all → check in → all done; the label inside the card padding).

### Round 22 — Hyperplane Planner: notes, journal, tasks, calendar, projects, knowledge graph (owner 2026-11-14)
Owner's words: "a complete trader journal app … personal notes, to-do, calendar view … like Notion … write anything like OneNote … a proper
knowledge graph … personal and office notes … multi-purpose … filters, date range, topic search … multiple notebooks — trading, office, to-do,
fitness … paste images … download the whole notes as PDF / document … merge, split … mini project planner … inspiration from Notion, Asana …
mobile friendly … avoid page-to-page redirects — a holistic view … Hyperplane Planner … my every-day application". Customer app only — the
admin service has no Planner route (the owner only grants it in Access manager).
- **Access:** module `planner` (sort 9) + `planner:view` (not restricted); `migrate_planner` (settings `planner_v1`) gives it to
  **Customer Admin** once — other roles get it in Access manager. Every route `need("planner")`, `_rate`, `_own` (RLS). Notes are private to
  each customer (RLS `portal_own` on every `pl_*` table + column grants); nobody else — the owner included — reads them through the app.
- **Data (`db.py`):** `pl_notebooks` (unique name per customer), `pl_pages` (kind note | journal | project; doc JSONB + body text for search;
  tags; day; pinned; project status / due; rev; trashed_at), `pl_links` (src → dst, from the [[links]]), `pl_tasks` (status todo | doing |
  done, priority 0–3, due, repeat daily | weekdays | weekly | monthly, page_id = project, sort), `pl_files` (pictures, bytea), `pl_prefs`
  (`{digest}`). Composite FKs (customer_id, id) everywhere so a row can never point at another customer's row.
- **Server (`planner.py`, routes at the end of `portal.py`):** `GET /app/api/planner` = everything the screen needs at once (notebooks, page
  meta without words, tasks, links, prefs, today, usage, limits); the first call seeds Trading / Office / To-do / Fitness + a pinned Welcome
  note. Pages: create, get (doc + backlinks), PUT save `{title, doc: JSON string, rev}` (409 + X-Rev when the version moved — never a silent
  overwrite), PATCH details, copy, merge (each source = an H1 section, its headings one level down), split (a page per heading of a level, or
  at block index), docs (for downloads, ≈ 6 MB per answer + `more`), trash / restore / delete (only from the trash) / empty. Tasks: create,
  PATCH (done on a repeating task adds the next one, never in the past), delete, clear done. Search: every word in title / words / topics.
  Pictures: `POST /files {image: data URL}` (PNG / JPEG / WebP sniffed, ≤ 2 MB, 250 MB per customer, 300 a day) → `/app/api/planner/files/<id>`
  (private cache, nosniff, sandbox CSP).
- **The doc is an allow-list, never HTML** (`clean_doc`): blocks paragraph, heading 1–3, bullet / ordered / task lists, blockquote, codeBlock,
  horizontalRule, image (our own file URL only), table; inline text, hardBreak, pageLink {id, label}; marks bold, italic, strike, underline,
  code, highlight, link (http / https / mailto, rel noopener). Unknown node → 422; unknown attrs dropped; control / bidi characters stripped.
  The doc travels as a JSON **string** (SafeModel's depth limit) — the client strips U+007F–U+009F first.
- **Limits (server):** 30 notebooks, 5000 pages, 10000 tasks, doc ≤ 600k chars / 20k nodes / depth 24, 200 pictures a page, 12 topics,
  merge ≤ 50, trash emptied after 30 days (worker), unused pictures removed after 2 days. Body cap 3.5 MB on `/app/api/planner*` (Caddy 4 MB
  block before the generic 64 KB one). Rate buckets planner / -write / -save / -heavy / -search / -files / -file.
- **Inbox:** kind `planner_due` (app planner, src `planner`, code PL, teal). The worker once a day after 07:00 IST (meta
  `planner_digest_day`): one open item per customer holding `planner:view` with the summary on — "Planner: N tasks due today · M overdue",
  body `{today, late, n_today, n_late}`; updated, never repeated; closes itself when nothing is due ("All caught up"). Today has the switch
  "Morning summary in the Inbox". Inbox detail: the tasks by name + Open the Planner + Mark done.
- **Screen (`apps/planner*.jsx`, CSS `planner.css.js`, every class `pl-`):** one page — band (search Ctrl K with quick results, New menu with
  templates), `.hp-actbar` (views Today · Notes · Tasks · Calendar · Projects · Graph; topics MultiSelect, From → To date range, Download),
  notebook chips (All + each, pencil to edit, + Notebook), then the view with the open note beside it (desktop: list column 300–380 px +
  note; "Wide" hides the list; phone ≤ 900 px: the note is a full-screen sheet with Back). Views read their own width (container queries).
  Pop-ups are centred (`Modal` in `planner-lib.jsx`). Remembered in this browser only: view, notes layout / sort, tasks layout, the open page.
  Never remounted on the day change (no `dayKey`) — an open note keeps its words.
  - Today: greeting, quick add, tiles (due today, late, done this week, notes this week), Late / Today / Next 7 days, today's journal
    buttons (templates), recently edited, active projects with progress.
  - Notes: cards (notebook colour on top, thumbnail, snippet / search hit, topics) or list (`.hp-t`); kind filter; sort; Select → Merge,
    Download, Move to, Trash; Trash view (Restore, Delete for good, Empty).
  - Tasks: list (Late, Today, Next 7 days, Later, No date, Done + Clear done) or board (To do · In progress · Done; drag on a mouse, ‹ › on
    every card). Task pop-up: title, details, status, due, repeat, priority, notebook, project, topics.
  - Calendar: month (Monday first), tasks by due + dated notes / project due dates; pick a day → its list, quick add, journal / note for that
    day; drag a task to another day. Narrow: dots + the day list.
  - Projects: cards with status, due, progress from the project's tasks, next tasks, add a task; the project note shows its tasks on top.
  - Graph (`planner-graph.jsx`, own chunk): canvas force layout of its own (grid repulsion, springs, centring), dots in the notebook
    colour, size by links, hover = neighbours, click opens, drag dots, pan, wheel / pinch zoom, Fit; Topics switch adds topic rings;
    "Only connected notes"; "Most connected" list beside it (the text view). Reduced motion: laid out first, drawn once.
  - Editor (`planner-editor.jsx`, own chunk — TipTap 3.34 StarterKit + TaskList + TableKit + Image + Highlight + Placeholder +
    CharacterCount + our `pageLink` node): title, details row (notebook, type, date or project status / due, topics, pin), sticky toolbar,
    "/" block menu (blocks + templates) and "[[" note-link menu (or "New note …") through `@tiptap/suggestion` → a React menu; click a
    link to open that note; "Linked from" at the bottom. Pictures pasted / dropped / picked are made ≤ 1600 px (WebP, else JPEG) in the
    browser and uploaded; pictures from web pages are never stored as outside links. Autosave 1.2 s after typing (Ctrl S now), on leaving,
    on hiding the tab; 409 → "Load the latest" / "Keep mine". More: Download, Duplicate, Split…, Merge with…, Move to the trash.
  - Downloads (`planner-export.js`, own chunk; jsPDF / docx load only then): scope this note · picked · notebook · what the filters show ·
    everything; PDF (own block renderer; cover + contents with page links when several; page numbers; standard Latin fonts — ₹ → "Rs",
    other scripts → choose Word), Word .docx (headings, lists with numbering, check boxes, quotes, code, tables, pictures, links), Markdown;
    one file or a file per note in a .zip (own store-only zip writer). `trackAction("planner", "export")`; the server counts `note` and
    `task_done`.
  - Icons: the Planner has its own Lucide set (`PI` in `planner-lib.jsx`) — `ICON_PATHS` in core.jsx has no notebook / editor icons.
  - Notebook colours (keys blue, orange, teal, pink, green, violet, amber, red, sky — "slate" replaced: it read as grey): fixed order,
    checked with the dataviz validator on #ffffff (light) and #0d1520 (dark) — every check passes; light / dark hexes in `NB_COLORS`.
    The notebook's name is always written beside its colour.
- Docs: "Hyperplane Planner" section in `guide.jsx` (shown to customers who have the app).
- Tests: `planner_test` (API ≈ 110: 403 on every route without the permission, 401 signed out, seeding, notebooks, rev conflict, the
  allow-list, pictures, links / backlinks, copy / merge / split / docs, search, tasks + repeats, RLS between customers, Inbox digest,
  clean-up, adoption, cascade), `planner_ui_test` (59: no access → no code; Today; editor with "/", check list, "[[", pasted picture,
  autosave; backlinks; conflict → Keep mine; board; calendar; projects; graph; Ctrl K search; notebooks + filters; merge; split; trash;
  Markdown / PDF / Word / zip downloads; Inbox summary → Open the Planner; light; phone 400 px with no sideways scroll + note sheet).
- Deploy: new npm packages (TipTap, docx) and a new Caddy block → the normal `bash deploy/deploy.sh` rebuild of every container.

### Round 22b — the Planner as one clean dashboard (owner 2026-11-14, same day, before the first deploy)
Owner: "default keep Trading journal as the one notebook for all the customers · don't keep the notebooks on the top nav — what if the count
increases · clean · all I need is the main dashboard · in the main dashboard itself I can add the task · just To-do · Notebook — write anything ·
Planner with start and end date and a proper status, easy like entries in a table, indent and outdent any task, no pop-up · Calendar view of
all the to-dos and plans for that day from all notebooks or the selected one — Calendar is a view, not a feature · no journal for now".
Asked and answered: all three on one page; notebooks as a slim list on the left. **This replaces the Round 22 screen** (Today, Notes, Tasks,
Projects and Graph tabs, notebook chips, the task pop-up, the board, journal and project pages are gone).
- **Server:** `SEED` = one notebook "Trading journal". `pl_tasks` gains `kind` (todo | plan), `parent_id` (composite FK to the same
  customer's row, ON DELETE CASCADE), `start_on` (CHECK due ≥ start), status `hold`; `UNIQUE (customer_id, id)`. The table shape changed
  before any deploy (the local copy was dropped and made again). `task_create(kind, start, parent_id, after_id)` — a row under a planner
  row only (≤ 6 levels, the parent's notebook), `after_id` puts it straight after a row; to-dos never have a start / parent / hold;
  planner rows never repeat. `POST /app/api/planner/tasks/{id}/move {action: indent | outdent | up | down}` (indent = under the row above;
  outdent = right after the old parent; up / down among the rows beside it — top rows per notebook) → the rows that changed. A planner
  row's notebook moves the rows under it; a row under another cannot move alone (422). Delete takes the rows under it (`removed`).
  Clear done = to-dos only. App module / permission wording: "Your to-dos, notes, plans and calendar".
- **Screen:** band (search for notes, to-dos and plans; New: note · to-do · planned task · note templates) → left: `NotebookRail` (All +
  each with counts; + adds in place; three dots: rename in place, colour, delete with an inline confirm; "Find a notebook" past 8;
  the morning-summary switch at the bottom; ≤ 900 px it is a dropdown `#pl-nb-pick`) → main: [Dashboard | Calendar], topics, date range,
  Download → **Dashboard** = To-do and Planner side by side (stacked under 1000 px), Notes below.
  - To-do: the add box at the top (notebook select when All; date chip) → Late / Today / Upcoming / No date / Done (Clear). Edit the words
    in place; the date chip opens the browser's picker (`showPicker`); three dots: repeat, notebook, delete. No pop-up.
  - Planner: a table (Task · Start · End · Status · three dots). Typing: Enter = next row, Tab = under the row above, Shift + Tab = back,
    Alt + ↑ / ↓ = move, ↑ / ↓ = next row, Backspace on an empty row = delete it. "Add a row". A parent shows done / total; rows fold.
    In All notebooks the top rows are grouped under their notebook. Deleting a row with rows under it asks first (the only confirm).
  - Notes: cards (12, then "Show all"), New note, sort, Graph, Select → merge / download / move / trash, Trash. A note (and the graph) opens in
    the main area with "Dashboard" back; on a phone the note is a full-screen sheet. No note types, no dates on notes; templates: Trade
    notes, Meeting notes, Workout log, Weekly review, Project brief.
  - **Calendar** (a view): planned rows as bars from start to end (lanes, 3 shown per week, "+N more"), to-dos on their day (drag to another
    day), the picked day's list on the right (add a to-do for that day). A bar / a planned row → the dashboard on that row (`focusTask`).
    Narrow: dots + the day list. It follows the notebook picked on the left.
- Tests: `planner_test` (+ the planner rows: order after a row, dates, kinds, indent / outdent / up / down, six levels, notebook moves the
  rows under it, someone else's rows → 404, clear done keeps plans, delete takes the rows under it), `planner_ui_test` rewritten (64).

### Round 22c — more room, more data, progress, times, dated notes, a week view (owner 2026-11-14)
Owner: "the to-do is not handled properly · open and close the notebook list like the side nav · better UI · handle more planners and notes ·
the planner full screen with a minimise at the top right · expand all / collapse all · a progress bar — a parent follows its children · FY in the
date selector · a weekly calendar like Teams: select 1 hr / 2 hr for a purpose, time optional, keep the month · a note for a specific date: pick the
date and its to-dos and notes appear; keep the common notes as they are · tick to show common and dated notes · minimal tabs, great use of space".
- **Server:** `pl_tasks.progress` (0–100, planner rows only) and `time_from` / `time_to` (to-dos only; both or neither; needs a day; end after
  start; no day → no time) — added with `ALTER … ADD COLUMN IF NOT EXISTS` (local data kept) and in the portal column grants. Progress ⇄ status
  on a planner row: progress > 0 on Not started → In progress, 100 → Done, Done → 100, leaving Done → 0 (Not started) or 90. A repeating to-do
  keeps its time. Notes for a date reuse `pl_pages.day` (null = a common note).
- **Notebook list:** the panel button folds it to a 52 px strip of initials in the notebook colour (name in the tooltip / aria-label);
  remembered in this browser (`hp_pl_ui.railMin`).
- **To-do:** no scroll box inside the card any more; each group shows 6, then "Show all N"; done to-dos behind a "Done (n)" tick; an optional
  time chip (clock) per dated to-do; the add box's date can be cleared.
- **Planner:** columns Task · Start · End · (Days, full screen) · Progress · Status; a slider per row (5 % steps), a parent shows the average of its
  rows (read only, bottom-up); overall progress in the header; Hide done (a row and everything under it done); Expand all / Collapse all; full
  screen (fixed over the page, Escape or the corner button to minimise).
- **Notes:** "New note" → a common note / a note for today; the note's details have an optional Date (clear it → common again); Common / Dated
  ticks; cards or a list; 12 cards / 25 rows, then Show all; dated cards show their date.
- **Date filter:** This FY / Last FY (1 April → 31 March, labelled "FY 2026–27").
- **Calendar** (`planner-calendar.jsx`): Month | Week (one day on a narrow screen). Week = an hour grid (48 px an hour, opens at 07:00, a red
  line at the time now): drag over hours → a new block to name (Enter); drag a block to move it (day and time), its lower edge to resize (15 min
  steps); click → change it in place (title, day, time, done, no time, delete); a touch tap adds an hour. The all-day row has planned bars,
  to-dos without a time and dated notes. Month cells show dated notes too; the day list has To-do (by time), Planned (with progress), Notes and
  "A note for this day".
- Tests: `planner_test` (+ progress ⇄ status, times, a dated note), `planner_ui_test` (93: + fold the list, Show all, time chip, progress roll-up,
  expand / collapse, hide done, full screen with Days, FY, week drag-create / move / resize / edit, a note for a day, Common / Dated).

### Round 22d — formulas in notes, pasted from ChatGPT / Claude (owner 2026-11-14)
Owner: "allow copy and paste of formulas from ChatGPT or Claude — pi, sigma and all the formulas".
- **Packages:** `@tiptap/extension-mathematics` 3.34.0 + `katex` 0.16.45 (pinned; the editor chunk only). KaTeX's CSS + fonts are bundled
  (`/app/assets`), so the `/app` CSP now has `font-src 'self' https://fonts.gstatic.com` (Caddyfile).
- **Server allow-list:** blocks gain `blockMath`, inline gains `inlineMath`; attrs = `{latex}` only (control / bidi characters stripped,
  ≤ 4000 chars, an empty one is dropped); the LaTeX is in the searchable text. Nothing else of a formula is stored.
- **Editor** (`planner-math.jsx`): `InlineMath` / `BlockMath` (block in display mode) with KaTeX `{throwOnError: false, strict: "ignore",
  trust: false, maxSize: 20, maxExpand: 500}` (no \href / \url / HTML). Paste: HTML with KaTeX (`.katex`, `.katex-display`) or MathML (`<math>`)
  → the `application/x-tex` annotation becomes a formula, parsed at note level (`PMParser.parseSlice`) so a formula block pasted alone fits;
  text with `$…$`, `\(…\)` (inline) or `$$…$$`, `\[…\]` (block) → formulas (only when the HTML has no formatting worth keeping; never inside a
  code block); "$5 and $10" stays text. After a paste / insert that ends on a formula the cursor goes after it (`caretAfterMath`) — the next key
  never replaces it. "/formula", "/formula block" and the Σ toolbar button open `MathPanel` (LaTeX box, quick signs, live preview,
  Insert / Save / Remove); a click on a formula opens it too.
- **Downloads:** Markdown keeps `$…$` / `$$…$$`; Word writes readable signs (`texText`: Greek letters, ∑ ∏ ∫ ∞ ± × ≤ ≥ ≠ ≈ …, `\frac{a}{b}` →
  (a)/(b), `\sqrt{x}` → √(x)) in Cambria Math; the PDF prints the same text with Latin fonts (signs it cannot print become "?").
- Tests: `planner_ui_test` (100: + ChatGPT-style KaTeX paste, Claude-style $…$ text, "$5 and $10" stays text, KaTeX fonts load, /formula with a
  live preview, click to change, Markdown keeps $…$, Word shows ∑ and π).

### Round 22e/22f — to-dos done or missed, Excel-like planners, several planners, tabs (owner 2026-11-15)
Owner (22e): "fixed heights with a scroll bar · the three widgets on one screen, each with a maximise · to-dos completed or missed, tracked, off the
main list — better icons · date and time on one row, 24-hour · the planner like Excel (drag dates / status down, copy and paste with Excel) · Excel
cells pasted in a note become a table". (22f): "the calendar only shows to-dos and notes · the progress a slider · one button to expand / collapse ·
a better time picker (no forced hour) · a new to-do goes on today · Clear only from the dashboard · the to-do header steady · the date picker is not
working · a daily to-do — one line? · a long to-do readable on hover · a proper full to-do view (Notion / Asana) · the notebook menu cut off · less
gap · several planners in a notebook · tabs under the notebooks: Dashboard (with the calendar), To-do, Planner (a tile per planner), Notes".
- **Server:** `pl_tasks.status` gains `missed` (to-dos only; `done_at` = when closed; a repeating to-do done or missed makes the next one; not in the
  morning summary). `pl_tasks.archived_at` — "Clear" (`POST /tasks/clear-done {status: done | missed}`) only hides closed to-dos from the dashboard
  (`archived` in the row); reopening clears it. **`pl_plans`** (id, notebook, name, sort; RLS + grants; ≤ 200 a customer; names unique per notebook):
  `POST /plans`, `PATCH /plans/{id} {name, notebook_id, sort}` (a planner moving notebook takes its rows), `DELETE /plans/{id}` (its rows go too).
  `pl_tasks.plan_id` (composite FK, cascade): a planner row lives in a planner (a top row without one goes to the notebook's first planner — one
  called "Planner" is made when there is none; a row under another takes its parent's planner); top-row siblings are per planner; a top row moves
  to another planner with `PATCH {plan_id}` (its rows follow); a planner row never changes notebook on its own (422). Old rows were moved into one
  "Planner" per notebook by the schema (local data kept).
- **Screen:** the side panel = notebooks + **tabs** (Dashboard · To-do · Planner · Notes; icons when folded; in the bar on a phone).
  Dashboard = three **Widgets** (fixed heights, own scroll bars, a maximise button — Escape / the button to come back; 8 px gaps).
  - To-do widget: Open · Done · Missed tabs in the header (counts inside — the header never changes size); the add box puts a new to-do on today;
    rows: a state icon (ring → done = filled green check; missed = calendar-cross; click to reopen), the words (edit in place; long ones read in full
    on hover — a small card), a missed icon on hover / late rows, the notebook's initial (All notebooks), the date chip (its own small calendar:
    Today · Tomorrow · Next week · No date · a month — `DatePop`; the browser picker was unreliable), the time chip (start times every 15 minutes,
    24-hour, then a length 15 m – 4 h; a small clock icon when there is no time — no layout change on hover), the three dots (missed, repeat,
    notebook, delete). Late group: one icon marks every late to-do missed. Done / Missed: by date, the last-30-days rate, Clear.
  - The full to-do view (`TodoBoard`, the To-do tab and the maximised widget): sections on the left (Today, Upcoming, Late, No date, All open,
    Done, Missed + the 30-day rate), a list with columns (To-do · Notebook · Date · Time · Repeat), grouped by date, Find, Show cleared.
  - Planner widget: a chip per planner (with its progress) + "+ Planner"; the picked planner's table (`PlannerTable`). Planner tab: a tile per
    planner (progress, rows, done, late, dates) → open one full page (rename, notebook, delete in its menu).
  - `PlannerTable`: row numbers; cells pick (click, drag, Shift + click, row numbers for whole rows); the corner square fills down (dates step a
    day — or the step between the last two; status / progress copy; parents keep their roll-up); Ctrl + C → tab-separated text for Excel;
    Ctrl + V (or pasting into a row's title) reads Excel rows (header skipped; dd/mm/yyyy, yyyy-mm-dd, 20-Nov-2026, Excel day numbers;
    "In progress" / "Done" / "On hold"; 40% / 0.4) — rows past the end are added when the Task column is in the paste; Delete clears dates;
    double-click / Enter changes a cell (dates in `DatePop`, status in a list, typing digits on a progress cell); the progress is a slider; one
    button expands / collapses all; the eye hides finished rows; a Days column when maximised; a row's menu moves it to another planner.
  - Notes widget: icon buttons (graph, pick, trash), New → a common note / a note for today; the Notes tab = the same, full page.
  - Calendar: to-dos and notes only (no planner bars); a repeating to-do shows its coming days faintly ("repeats", not clickable); cleared to-dos
    stay.
  - Menus and pickers are `position: fixed` (`useFloat`) — nothing that scrolls cuts them off; the hidden-until-hover rule is on the menu
    *button* only (the open menu used to inherit opacity 0); the side panel stacks above the widgets.
  - Notes: cells copied from Excel / Google Sheets paste as a table (the picture Excel also puts on the clipboard is ignored); tab-separated
    text becomes a table too.
- Tests: `planner_test` (+ missed, clear = archive, planners: default, second, names, rows, moving rows / planners, someone else's → 404, delete),
  `planner_ui_test` (129: + hover full text, header steady, scroll inside, missed / Done / Missed / Clear, DatePop, TimePop, full to-do view, a
  daily to-do is one line, planners: create / switch / move a row / tiles / rename, the slider, one expand button, Excel fill / copy / paste,
  the tabs, the calendar without planner rows and with repeats, the notebook menu fully visible, Excel cells → a table in a note).

### Round 23 — ETF Analyser: basket → analyser, ETF portfolios, basket SIP, Buy on Zerodha (owner 2026-11-15)
Owner: "move the ETF to a basket, then the basket to the analyser like the AI stock analyser — same page, same style, same download, same Save
portfolio · a better basket UI / UX · the arrow under the progress in the first (All ETFs) card · Best in segment by default · make an ETF-only
portfolio a SIP with every option of the ETF SIP portfolio; a normal one is an ETF portfolio like the stock portfolio · place the order to Zerodha
as SIP or one time".
- **Server:** `customer_etf_basket` (customer_id PK, symbols TEXT[]; RLS own row; grants) · `GET/PUT /app/api/etf/basket` (need etf; today's ETFs
  only, each once, ≤ 30) · `POST /app/api/etf/basket/sip {symbols, amount, freq, years, weights|null}` (need etf + the sip module; `sip.build_basket`:
  equal or whole-% shares adding to 100, the AI ETF SIP Builder's whole-unit rules — 1 unit every k ≤ 3 instalments, top-up within the amount,
  ≤ +10 % only to buy every instalment; same result shape as build_etf, `basket: true`, inputs `{basket, src: "etf", weights?}`).
  Saved kinds: **`etf`** (app etf; holdings 1 unit each, name / price / market from the server; tag "ETF Analyser"; tracked like the Analyser list;
  momentum check = `sip.check_holdings(kind="etf")` — themes in a long-term downtrend, replacement 1 unit; no reminder; no stock alerts) and a
  basket SIP saved as **`sip`** (`inputs.basket` checked by `sip.check_basket`, needs etf too; tag "ETF Analyser · SIP"; everything a SIP has).
  `GET /saved?kind=etf` = ETF portfolios + basket SIPs. Permissions: `etf:share` (every role with etf:view), `etf:zerodha` (owner-level, Customer
  Admin — `migrate_etf_basket`). Zerodha source **`etf`** (a one-time basket from the client's lines, or a saved ETF portfolio's 1-unit lines);
  ETF portfolio swaps hold 1 like the Analyser. Adoption actions etf: basket · report · sip.
- **Screen:** ETF Analyser tabs ETFs · Basket · My portfolios. List: Best in segment on by default; the first card shows ▲ ◆ ▼ under its bar;
  a round + in each row's first cell (a tick when in the basket; the row still opens the card) and Add to basket on the card; a sticky bar at the
  bottom (count, first tickers, Analyse basket) → a side drawer (each ETF with its strength, the split by type, the same market twice, remove,
  empty). `etf-basket.jsx` BasketView = the AI Portfolio Analyser's page for ETFs: search to add, Save portfolio (SaveBar kind etf), Make it a SIP,
  Buy on Zerodha (one time: an amount split equally into whole units → ZerodhaButton source etf, Customer Admin), Download report (report.js with
  `noun / nouns / band / title1 / tagline / header`), gauge + facts + split, AI summary (counts only — the ETF Analyser's ±24 and Recommended,
  no new rule), trend map (Q × Y), the AI check (a better ETF of the same market → Swap / Keep it only; the same market twice), cards per ETF
  (colour group Look at first / Keep an eye on / Doing well / Too new by the ±24 trend). SIP: a form (amount, monthly / quarterly, years, equal or
  your own % with sliders) → `SipResult` (extracted from sip.jsx — the AI ETF SIP Builder's result page, `res.basket` words). saved.jsx: kind etf
  (tag, ofTag — the ETF tag also holds basket SIPs, no stock AI watch, no alerts switch, "1 unit of each ETF", Buy on Zerodha source etf).
- Tests: `etf_basket_test` (60: catalogue / roles, basket rules + RLS, SIP split rules, saving both kinds + tampering, tracking, check, share,
  Zerodha preview only — nothing recorded), `etf_basket_ui_test` (bar, drawer, analyser, search, AI check, PDF, one-time box → Zerodha window with
  form posts stubbed, save → tracker, SIP form → result → save → reminder, dark, phone, default role without Buy), `etf_ui_test` updated (Best in
  segment on by default, the first card's arrows).

### Round 23b — Planner menus opened "somewhere else" (owner 2026-11-17, screenshot of a planner tile's … menu)
- Cause: the panels were `position: fixed` inside boxes that make fixed count from themselves — a card / tile lifting on hover (`transform`)
  and the panels with container queries (`container-type` = layout containment). Fix: `Float` (planner-lib.jsx) draws every floating panel in a
  portal at the end of `<body>` (`.pl-float`, z-index 100 — above the maximised widget 43, the pop-ups 60, the toast 90): Menu (`.pl-mpop`; its
  outside-click check also looks inside the panel), DatePop, TimePop, the long to-do tip, the editor's / and [[ menu, the formula panel. The
  notebook colours (`NB_CSS`) also apply under `.pl-float`.
- The customer build keeps fonts as files (`vite.app.config.js` assetsInlineLimit): KaTeX's smallest fonts were inlined as `data:` and blocked by the
  CSP (`font-src 'self'`).
- Test `planner_float_test` (146 panels): every … menu, date chip and time chip on every view — dashboard, rail, the 3 maximised widgets, To-do, the
  tiles (real hover), a planner page, Notes, a note, the calendar (month / week), dark + scrolled, phone — opened with a real mouse: it touches its
  button, overlaps it sideways, stays in the window, is on top and lives in the portal; plus the / menu at the cursor and the tip under its to-do.

### Round 23c — every report as PDF · Word · Markdown (owner 2026-11-17: "download everything as Word + Markdown — 3 options")
- `app/src/doc-export.js` (its own chunk; docx / jsPDF load inside): a page describes its report once as a document model
  `{file, title, subtitle, meta, blocks}` (h / h2 / p / ul / kv / table / note / pb) and gets **Word** (docx, the Planner's library — header,
  page numbers, tables, bullets), **Markdown**, or a plain **PDF** (jsPDF, columns sized by their measured text) where the page has no
  designed PDF. Models: `docFromReport` (report.js's model — AI Portfolio Analyser and the ETF basket; report.js now takes `noun / nouns /
  band / title1 / tagline / header`), `docFromSip` (AI ETF SIP, Momentum SIP, basket SIP — with the growth simulator rows on screen),
  `docFromBuilder` (overview, segments, sectors, holdings, volume check, buying plan).
- Buttons: Analyser + ETF basket — a joined group "Download report · PDF · Word · Markdown" (`#pf-dl` / `-docx` / `-md`, `#ef-bk-dl…`); the
  SIP results — PDF · Word · Markdown · CSV (`#sip-docx`, `#msip-md` …); the Builder — PDF · Word · Markdown · Excel (`#bd-pdf` …).
- Test `downloads_test` (21): every button downloads its file and each file holds the report (a real PDF, a Word file that opens with the
  title and tickers, Markdown with the headings).

### Round 24 — ⚙ Admin → 🎚 Scoring: the strength engine's numbers, editable, applied to the past too (owner 2026-11-17)
Owner: "the zone × regime scores (Hyperplane_Zone_Engine_Review.xlsx) inside the admin panel — any number of scenarios, the default, the option
to change it … apply it to the old data as well, not only the upcoming data … the most dynamic architecture … optimise the code, DB and RAM".
Decided: scope = the strength engine; save → compare → apply; Apply rescores every past day (saved portfolios keep their price tracking;
alerts already sent stay).
- **Engine (`zone_engine.py`)**: every number is a parameter — `DEFAULT_PARAMS` (recency 0.4/0.3/0.2/0.1, a full step 0.5, trend words
  0.5 / 0.15, trend · price share 0.6 / 0.4, Q50 Y30 M20, cut 24 + "quarter not negative", the 12-cell mother candle table, NR base 0.94,
  streak move 0.10, regime squeeze 0.23), `check_params` (ranges, shares add up to 1, Quarter weight > 0 …), `Params`, `set_params` (the
  module constants RECENCY / TF_W / CUT … always hold the LIVE set — detail.py reads them). Two steps: `factors(zl, zh, nr)` (per period:
  zone steps, rel = where the price sits, the place label code, the mother candle n) → `score(f, P)`; `read_stock` / `read_all` = factors +
  score. **Golden check**: old vs new engine on every stored collection — 24,864 stock and 1,007 ETF results identical (raw, after the
  regime, after a JSON round trip of the factors).
- **Data (db.py)**: `score_profiles` (name, params, status draft | active | archived, builtin, note, who / when applied / retired; one live —
  partial unique index; id 1 = the built-in **Default**, seeded by `scoring.seed`), `score_factors` (snapshot, kind stock | etf, schema,
  JSON gz `{symbol: [monthly regime, M, Q, Y]}` ≈ 150 KB a collection), `score_marks` (the set the stock states of a collection were built
  with — one row, never stamped on every state row), `score_ver` on customer_history / published / stock_detail, `published.rev` (+1 when a
  publish is rescored in place). Everything stored before round 24 counts as built with Default (1) — nothing is rebuilt on deploy.
- **`scoring.py`**: `sync` (the live set into this process — one tiny query at most every 5 s), profiles CRUD (drafts only; Default, the
  live set and the ones that were live are locked — copy to change), `apply` (→ `rescore_latest`: today's view within a second),
  `store_factors` (publish / build_history store them while the raw collection is open), `extract` (old collections, once, by the worker),
  **`rescore(snapshot)`** — from the factors only: patch `zv` / `rz` of each stock + `cfg` in the stored view, `st` / `c` / `tf` of each
  ETF, the stock states — and it **writes only what changed** (a view only when a result moved, a state row only when its numbers moved);
  `stale` / `tick` (the worker: up to 10 collections a tick), `status`, **`compare(params, days)`** — from the factors, day by day, totals
  only: colour counts per day (live vs set), the colour changes, the 20 biggest movers (a colour change first) with their periods, the
  strength spread, and the **back-test**: each colour's return vs all stocks of the same day after 30 / 90 days (stock_states prices).
  `period_table` = the review sheet's Period table (5 trends × 6 places) for any set.
- **publish.py**: the view carries `cfg {ver, cut, w, q}`; factors stored; `score_ver` recorded; `history_missing` (heavy) only for
  collections WITHOUT factors and for the stock detail rows (last 14 days). **worker**: `scoring.tick()` before the heavy loop; factor
  backfill one collection per idle tick. **portal**: every cache / ETag carries the version (`p{id}-{rev}`, `e{id}-{rev}`,
  `h{snapshot}-{score_ver}`, `_hist` by (snapshot, ver)) — a rescored view is a new download. **etf.py**: admin rows cached per set.
- **Admin routes** (admin_user): `GET /api/admin/scoring` (profiles, status, defaults, Period table), `/status`, `POST /profiles`,
  `PATCH|DELETE /profiles/{id}`, `POST /profiles/{id}/duplicate`, `POST /compare {params, days ≤ 120}` (one at a time — 429), `POST
  /profiles/{id}/apply` (activity log `scoring_apply`, from → to).
- **Admin screen** (`frontend/src/scoring.jsx`, ⚙ Admin → 🎚 Scoring): status strip (live set, since / by, past days rescored, factors,
  "Rescoring… N left" polled every 4 s); the sets (Live / Default / Draft / Was live, + From the live set / From Default); the editor grouped
  like the review sheet (each number with "was …" and ↺ to the Default; the trend / price shares keep adding up to 1); the **live Period
  table** (the change from the live set in brackets); Compare (counts with ±, the colour-change matrix, back-test 30 / 90, movers → their
  periods, each stored day as two bars); Apply → a centred confirm.
- **Customer app**: `cutOf(data)` / `dirCut` (core.jsx) — the AI Portfolio wording and the report's guide use the live cut from the view
  (Deep Research keeps TREND_CUT 24); colours always come from the server's `zv`.
- **Measured** (local, 2,000 stocks a collection): rescoring a day from its factors ≈ 14 MB Python / +35 MB process vs the old full rebuild
  177 MB / +450 MB (and 2.7 s vs 29 s with the memory tracer on); the worker rescored all 24 stored collections in 12–15 s; a whole Apply
  wrote ≈ 21 MB to the database log; Compare over every stored day < 1 s.
- Tests: `scoring_test` (53: access, Default, 17 refusals, drafts, compare = no change against itself / fewer greens with a higher cut /
  movers / back-test, apply → new ETag + new colours at once, ETFs, the worker rescores every past day + the stock states, the activity
  log, back to Default → every stock, ETF and past day exactly as before, the old set locked), `scoring_ui_test` (tab, live table, save,
  compare, centred confirm, apply → rescored → back to Default, narrow window).
- Local note: on 17 Nov the local Postgres (data on the Windows D: drive through Docker Desktop) hit one PANIC creating a WAL file
  ("Interrupted system call") during a burst of rescoring writes and recovered by itself — a Windows bind-mount issue, not seen on Linux;
  the rescoring now writes only what changed.

### Round 25 — a second scoring model: the Zone ladder (owner 2026-11-17) — a scenario only, Default stays live
Owner: "a price near the top of a zone is resistance — it can reverse, yet it scores well … keep the formula as it is … for the bottom no
marks … monthly zone in the upper side of the quarterly: small marks … weekly zone above / upper part / breaking the monthly, quarterly or
yearly zone: small marks … the upper part or band of a price means nothing … reduce marks for the negative ones … monthly and quarterly the
most (quarterly very slightly higher), weekly and yearly less … another scoring model along with the default — switch with the same data".
Decided: trend / mother candle / regime / weights / colour cut as Default; only the price-position part is replaced; a breakout counts when
the last completed candle CLOSED beyond the zone; strict ladder; back-test on production before choosing.
- `zone_engine`: params `model` ("default" | "ladder") + `ladder` {close {W 4, M 9, Q 10, Y 5}, strict, pairs {WM [2,4,5,−4,−5], WQ
  [2,4,6,−4,−6], WY [1,2,3,−2,−3], MQ [2,4,6,−4,−6]} = upper part · breaking the top · fully above · breaking the bottom · fully below};
  `zone_in(small, big)`, `ladder(Z, P)` → (total, items); the ladder model: period strength = 100 × trend share × T ± mother candle (no
  price place), stock strength = weighted periods + the ladder total (clipped ±100), the result's 6th element = the ladder total; against
  the long-term regime the total is squeezed like the periods. factors gain `Z` = [W, M, Q, Y zone bottom / top, price, Prev_Week / Month /
  Quarter / Year close] (score_factors schema 2 — the worker re-read the 24 local collections in < 90 s). Golden check again: the default
  model identical on every stored collection.
- builder.py adds the ladder total to its own strength (`zv[5]`); detail.py / detail.jsx: the ladder model's formula line, "How the final
  score adds up" gets a Zone ladder row, a "Zone ladder — each item" checklist in plain words, the verdict lists ladder items instead of the
  price place. The built-in Default now stores `model: default` explicitly.
- Scoring tab: the model choice on every set, the ladder's marks editor (breakouts, strict, the four zone-in-zone pairs), "+ Zone ladder",
  the set's model under its name, the movers show their ladder items.
- Tests: `ladder_test` (default marks, 5 refusals, draft, compare + ladder items, apply → every result has 6 elements and strength =
  periods + marks for all 1,723 stocks, colours, the detail view's ladder, the Builder, past days, back to Default exactly), scoring_test /
  scoring_ui_test again.
- Round 25b (owner: "sometimes a weekly breakdown, then a monthly break up — that is simply a consolidation; handle it"; found: AVALON
  17 Nov −3 → +27 green while its price was below its weekly, monthly and quarterly zones with every last candle closed inside — 24 of
  131 such stocks turned green): two switches in `ladder`, on by default — `consol` (the weekly candle closed one way and a higher one
  the other way → those marks cancel, item `consol_W<tf>`, "consolidation") and `guard` (the green gate: the price below the monthly or
  quarterly zone while that candle has not closed outside → not green, no marks change, item `gate_<tf>`; the result's 7th element).
  Latest local day: Default 271 / 1150 / 302 · Zone ladder 194 / 1365 / 164 (green / amber / red). ladder_test + scoring suites pass.

### Round 25c (owner 2026-11-17: "in the inbox the content was not displaying properly")
- The Stock insight card (`stock-insight.jsx`) is wrapped in `.si-cq` (`container-type: inline-size`): ≤ 1000 px of its own width → 2 columns
  with the research summary on a full row; ≤ 620 px → 1 column. The `.px-item` grid used viewport media queries only, so inside the Inbox's
  reading pane it overflowed and squeezed the summary to one word a line. `inbox_test` checks the card fits the pane.

### Round 26 (owner 2026-11-17: "bring this as the mobile app … not a store app … any shortcut") — `/app` installs as a phone app
- `frontend/app/public/` (Vite's default public dir for root `app`, served at `/app/…` by the existing `try_files`; `no-cache` already applies):
  - `manifest.json`: Hyperplane, `id` / `start_url` / `scope` `/app/` (the admin dashboard stays outside), `display: standalone`, colours `#070d1a`.
  - `icons/`: 192 / 512 (`any`), a maskable 512 and the 180 apple-touch icon, drawn from the logo SVG in `app/index.html` with headless Chrome
    (scratchpad `make_icons.py`).
  - `sw.js`: network-first for page loads only, with `offline.html` (logo inlined) as the only thing cached. It never touches `/app/api/*` or
    files, so a deploy reaches the installed app at its next open and no data is kept on the phone. `skipWaiting` + `clients.claim`.
- `app/index.html`: manifest link (written `/manifest.json`; Vite adds the `/app/` base), `theme-color`, apple-touch-icon, the
  `*-web-app-capable` / title / status-bar metas. `main.jsx` registers `/app/sw.js` in production builds only (the CSP has no inline script).
- Docs: "Use Hyperplane as an app on your phone" (Android Chrome → Install app; iPhone Safari → Share → Add to Home Screen).
- Not built (owner: not now): store apps, phone notifications, app lock, a bottom bar. The business-model plan (model portfolios with
  subscriptions, after the owner's SEBI RA registration) is parked.
- Test: `pwa_test` (manifest, icons and their sizes, no-cache, the helper in charge of `/app/` only, Chrome's installability check, `/app/api`
  never from the helper, sign-in under it, offline page with both page and helper offline, back online, admin pages outside).

### Round 27 (owner 2026-11-18: "bring the option to download the app … like an APK … same like the Chrome install … Mobile App section under Account")
- **The Android app is a Trusted Web Activity** (Google's Bubblewrap 1.27). It is a ~1.8 MB shell that opens `https://hyperplane.quantfriday.in/app/`
  full screen in Chrome's engine: every screen and all data come live from the website, deploys reach it at its next open, and it shares
  Chrome's sign-in. Package `in.quantfriday.hyperplane`, Android 7.0+ (minSdk 24, required by androidbrowserhelper), notifications off.
  - Rebuild it only for a new name, icon or version: raise `appVersionCode` + `appVersion` (that key, not `appVersionName`) in
    `deploy/android/twa-manifest.json`, then run `bash deploy/android/build-apk.sh`, then commit
    `frontend/app/public/download/hyperplane.apk` + `frontend/public/.well-known/assetlinks.json`, push and deploy.
- **Build in Docker only** (`deploy/android/Dockerfile`: JDK 17 + Node 20 + Android cmdline-tools in `cmdline-tools/latest`, platform 36,
  build-tools 36.1.0). Three traps already solved:
  - The tools must NOT be unpacked into the SDK root (their `source.properties` there hides the platform → "Failed to find target
    android-36"). `$ANDROID_HOME/bin/sdkmanager` is a link, because Bubblewrap only checks that `bin/` exists.
  - Gradle downloads itself with Java, which fails on one unreachable GitHub address (185.199.109.133 from this ISP). curl fetches it
    into the `hyperplane-apk-gradle` volume and the wrapper is pointed at that file.
  - The keystore password is made inside the container (Windows Python wrote a CR that keytool rejects).
- **Signing key:** `secrets/android/hyperplane.keystore` + `keystore.pass` (git-ignored). **Never print or commit them.** The owner must keep a
  backup; without it the app can never be updated in place. Its SHA-256 fingerprint is in `assetlinks.json`, which is public by design.
- **Caddy:**
  - `handle /.well-known/assetlinks.json`: JSON, no login. It used to fall into the dashboard's forward_auth; without it the app shows an
    address bar.
  - `/app/download/*.apk` is served as `application/vnd.android.package-archive`, `attachment; filename="Hyperplane.apk"`.
- **Account window → Mobile app** (`shell.jsx` `MobileApp`, `#acct-mobile`):
  - **Android app** (`#acct-mob-android`): downloads the APK, then shows the 3 install steps and the Play Store note.
  - **iPhone app** (`#acct-mob-ios`): Apple allows no app file outside the App Store, so it shows the Add to Home Screen steps, with
    "first open this page in Safari" in other iPhone browsers.
  - The visitor's own phone is highlighted (user agent; `PHONE`). A computer gets "open this page on your phone".
  - The section is hidden in `display-mode: standalone` (inside the installed app).
  - Docs: the phone section names the Account → Mobile app path.
- **Data vendor note (owner's question):** the APK and the installed app hold no data and no data code. Changing the data vendor touches only
  the server's collector / publish side and never the apps. Whether a vendor licence counts the APK as a separate "mobile app" is a
  contract question for the vendor.
- **Test:** `pwa_test`, now with the Mobile app section on a computer, Android, iPhone Safari and iPhone Chrome, the APK and assetlinks
  responses, hidden when installed (matchMedia overridden — headless Chrome ignores display-mode emulation), phone width and dark mode.
- **Round 27b** (owner: "in the drop down bring the mobile app download as one more section … its own bigger pop-up with an image … all
  your portfolios in your pocket"):
  - The section left the Account window. The account menu has **Mobile app** (`#acct-mobile-it`, "Android · iPhone", hidden when
    installed), which opens `MobilePop` (`#mob-pop`, `.modal.mob-pop`, 880 px, two columns; stacked under 760 px).
  - **Left:** an animated phone picture, drawn in CSS / SVG — a "My portfolios" line, a cap ring, the AI watch. It shows no return numbers
    on purpose.
  - **Right:** "All your portfolios, in your pocket.", three ✓ points and two large buttons: **Download for Android** (`#mob-android`) and
    **Add to iPhone** (`#mob-ios`). The steps (`#mob-steps-android` / `#mob-steps-ios`) open under them.
  - Android is the filled button except on an iPhone. Reduced motion stops the animations.
- **Round 27c** (owner: "use that image … remove the top company name … the right side feels heavy for a simple download"):
  - The left side is the owner's picture, `app/public/img/mobile-app.webp` (1000 × 977, 38 KB). It is cropped from their 2160 × 2700 PNG
    below the title. The drawn CSS phone is gone.
  - The right side is only the eyebrow "Mobile app", "Hyperplane AI, in your pocket.", "Install it on your phone in a few seconds." and
    the two buttons stacked. The ✓ list is gone.
  - On phones the picture is 280 px high, from the top.
  - Note: the picture shows lock-screen alerts (AI watch, SIP reminder). The app has no phone push yet; alerts arrive in the Inbox.
- **Round 27d** (owner, on an Android 14/15 phone: "the app is not even opening … the logo is wrong … too many rows in the top nav …
  the pop-up is not visible on mobile"):
  - **The crash.** Version 1.0.0 closed at once on start: `IllegalArgumentException: Component class R.u does not exist`.
    - `"enableSiteSettingsShortcut": false` leaves `ManageDataLauncherActivity` out of the manifest. R8 then renames it (`R.u`), and the
      library's LauncherActivity still calls `setComponentEnabledSetting` on it.
    - **Keep `enableSiteSettingsShortcut: true`** (Bubblewrap's default). It adds a harmless "Site settings" item on long-press.
  - **Version 1.0.1** (code 2): the fix plus the right logo. It installs as an update over 1.0.0 with the same key.
  - **Verified on an Android 14 emulator** (Play image, Chrome 113): the site link is verified, the app opens full screen with no address
    bar, and it opens again from the launcher. The emulator image `hyperplane-android-emu` is test-only, from scratchpad `emu/`.
  - **Icons** are now the full mark (core.jsx `Logo` at ≥ 36 px, two dots each side). The browser-tab favicon stays the small variant.
    - `make_icons.py` draws them.
    - `build-apk.sh` takes `ICON_HOST=http://host.docker.internal` to read the icons from the local stack before they are deployed.
  - **Phone top bar (≤ 640 px):**
    - one row: burger, the title (shrinks with …), Zerodha, help, community, bell, avatar (no caret);
    - the date / day picker is the only second row;
    - `.acct-menu` is at most 100vw − 16 px wide.
    - Test: `mobile_top_test` (360 px, Android user agent: rows, the same row as the bell, no sideways scroll; the account menu, the Mobile
      app pop-up, the day picker and the bell's list on screen).
