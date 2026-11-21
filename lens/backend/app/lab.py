"""Fyers Data Lab (Phase 3): the probes (what the API really gives), the resumable bulk download and the data checks.

Storage — market data is never put in PostgreSQL. Candles go to Parquet files (zstd, 4-byte prices, epoch-second int32 timestamps),
written and read by DuckDB (embedded, memory_limit 256 MB, 1 thread): small files, fast scans, little RAM.
    {MARKET}/spot/{INDEX}/{from}_{to}.parquet          index minute candles, ≤100-day pieces
    {MARKET}/futures/{INDEX}/{CONTRACT}.parquet        one file per futures contract (last ~95 days of its life)
    {MARKET}/options/{INDEX}/{EXPIRY}.parquet          one file per expiry: every downloaded strike, CE and PE, sorted
                                                       (each contract first lands in {EXPIRY}/_parts; the expiry is packed once complete)
PostgreSQL keeps only the small things: jobs, the manifest (one row per contract + date range — the download is resumable and never
fetches a finished row again), daily index levels (for "at the money"), expiry lists, probe results and the data checks.
"""
import csv
import hashlib
import json
import os
import re
import resource
import shutil
import tempfile
import time
from datetime import date, datetime, timedelta

import duckdb

from . import fyers as fy

MARKET = os.environ.get("MARKET_DIR", "/data/market")
MINUTES_PER_DAY = 375                      # 09:15 – 15:29 IST
CHUNK_DAYS = 100                           # Fyers: at most 100 days of minute candles per request

SCHEMA = """
CREATE TABLE IF NOT EXISTS fyers_jobs (
    id          BIGSERIAL PRIMARY KEY,
    kind        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'queued',
    params      JSONB NOT NULL DEFAULT '{}'::jsonb,
    progress    JSONB NOT NULL DEFAULT '{}'::jsonb,
    message     TEXT NOT NULL DEFAULT '',
    by_admin    TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at  TIMESTAMPTZ,
    ended_at    TIMESTAMPTZ,
    wait_until  TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS fyers_spot_daily (
    idx TEXT NOT NULL, d DATE NOT NULL, open REAL, high REAL, low REAL, close REAL, PRIMARY KEY (idx, d)
);
CREATE TABLE IF NOT EXISTS fyers_expiries (
    idx TEXT NOT NULL, kind TEXT NOT NULL, expiry DATE NOT NULL, contracts JSONB, PRIMARY KEY (idx, kind, expiry)
);
CREATE TABLE IF NOT EXISTS fyers_manifest (
    id          BIGSERIAL PRIMARY KEY,
    kind        TEXT NOT NULL,              -- spot · fut · opt
    idx         TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    expiry      DATE,
    strike      INT,
    cp          TEXT,
    range_from  DATE NOT NULL,
    range_to    DATE NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',   -- pending · running · done · failed · no_data
    rows        INT NOT NULL DEFAULT 0,
    bytes       BIGINT NOT NULL DEFAULT 0,
    checksum    TEXT NOT NULL DEFAULT '',
    attempts    INT NOT NULL DEFAULT 0,
    last_error  TEXT NOT NULL DEFAULT '',
    path        TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (symbol, range_from, range_to)
);
CREATE INDEX IF NOT EXISTS fyers_manifest_todo ON fyers_manifest (status, kind);
CREATE TABLE IF NOT EXISTS fyers_depth (
    idx TEXT NOT NULL, kind TEXT NOT NULL, earliest DATE, note TEXT NOT NULL DEFAULT '', checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (idx, kind)
);
CREATE TABLE IF NOT EXISTS fyers_coverage (
    idx TEXT NOT NULL, expiry DATE NOT NULL, weekly BOOLEAN, strikes INT, futures INT, rows INT, missing_pct REAL,
    has_oi BOOLEAN, has_greeks BOOLEAN, note TEXT NOT NULL DEFAULT '', checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (idx, expiry)
);
CREATE TABLE IF NOT EXISTS fyers_quality (
    path TEXT PRIMARY KEY, kind TEXT NOT NULL, idx TEXT NOT NULL, rows BIGINT, days INT, missing_pct REAL, dup_ts BIGINT, bad_ohlc BIGINT,
    nonpos BIGINT, zero_vol_pct REAL, first_ts TIMESTAMPTZ, last_ts TIMESTAMPTZ, checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


class Stop(Exception):
    """the admin paused or cancelled the job"""


class Refused(RuntimeError):
    """Fyers refused one request (e.g. a date outside the plan's history): that sample is noted, the test goes on"""


def rss_mb():
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)       # Linux: KB


def duck():
    con = duckdb.connect(":memory:")
    con.execute("SET memory_limit='256MB'; SET threads=1; SET preserve_insertion_order=false; SET enable_progress_bar=false")
    return con


def d(s):
    return s if isinstance(s, date) else date.fromisoformat(str(s)[:10])


def _date_of(v):
    """an expiry from Fyers: 'YYYY-MM-DD', 'DD-MM-YYYY' or epoch seconds"""
    if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit()):
        return datetime.fromtimestamp(int(v), fy.IST).date()
    s = str(v)[:10]
    if re.match(r"^\d{2}-\d{2}-\d{4}$", s):
        return date(int(s[6:]), int(s[3:5]), int(s[:2]))
    return date.fromisoformat(s)


def parse_strike(symbol, step, spot):
    """the strike inside an option symbol (NSE:NIFTY2490525000CE, NSE:NIFTY24SEP25000CE, …): of the digits just before CE / PE, the
    trailing part that is a multiple of the strike step and within ±30% of the index level (the date digits come first)"""
    m = re.search(r"(\d+)(CE|PE)$", symbol)
    if not m:
        return None, None
    digits, cp = m.group(1), m.group(2)
    best = None
    for n in range(min(len(digits), 6), 2, -1):
        v = int(digits[-n:])
        if v and v % step == 0 and (not spot or abs(v - spot) <= 0.3 * spot):
            best = v
            break
    return best, cp


# ── writing Parquet (CSV in /tmp → DuckDB → zstd Parquet; never more than one contract in memory) ──
TS_NAMES, NAMES = ("timestamp", "ts", "time", "epoch", "date", "datetime"), {
    "open": ("open", "o"), "high": ("high", "h"), "low": ("low", "l"), "close": ("close", "c"), "volume": ("volume", "v", "vol"),
    "oi": ("oi", "open_interest", "openinterest"), "iv": ("iv", "implied_volatility"), "delta": ("delta",), "gamma": ("gamma",),
    "theta": ("theta",), "vega": ("vega",)}


def _ts(v):
    if isinstance(v, (int, float)):
        return int(v if v < 1e11 else v / 1000)
    return int(datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp())


def write_parquet(path, cols, rows, extra=None):
    """Fyers candles → one Parquet file (atomic). extra = constant columns (strike, cp). Returns (rows, bytes, sha256)."""
    pos = {}
    for i, c in enumerate(cols):
        if c in TS_NAMES and "ts" not in pos:
            pos["ts"] = i
        for k, al in NAMES.items():
            if c in al and k not in pos:
                pos[k] = i
    if "ts" not in pos or "close" not in pos:
        raise ValueError(f"unexpected columns: {cols[:12]}")
    keep = [k for k in ("open", "high", "low", "close", "volume", "oi", "iv", "delta", "gamma", "theta", "vega") if k in pos]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="", dir="/tmp") as f:
        w = csv.writer(f)
        for r in rows:
            w.writerow([_ts(r[pos["ts"]])] + [r[pos[k]] if pos[k] < len(r) else "" for k in keep])
        tmp = f.name
    casts = ["CAST(c0 AS INTEGER) AS ts"]
    for i, k in enumerate(keep, 1):
        typ = "BIGINT" if k in ("volume", "oi") else "FLOAT"
        casts.append(f"TRY_CAST(c{i} AS {typ}) AS {k}")
    names = [f"c{i}" for i in range(len(keep) + 1)]
    for k, v in (extra or {}).items():
        casts.append(f"{int(v)}::INTEGER AS {k}" if isinstance(v, int) else f"'{v}'::VARCHAR AS {k}")
    part = path + ".part"
    con = duck()
    try:
        con.execute(f"COPY (SELECT DISTINCT ON (ts) {', '.join(casts)} FROM read_csv('{tmp}', header=false, all_varchar=true, names={names}) ORDER BY ts) "
                    f"TO '{part}' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 122880)")
        n = con.execute(f"SELECT count(*) FROM read_parquet('{part}')").fetchone()[0]
    finally:
        con.close()
        os.remove(tmp)
    os.replace(part, path)
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return n, os.path.getsize(path), h.hexdigest()[:16]


def pack_expiry(idx, expiry):
    """all of one expiry's option contracts → one sorted file (better compression, far fewer files); the parts are removed"""
    parts = os.path.join(MARKET, "options", idx, expiry.isoformat(), "_parts")
    files = sorted(os.path.join(parts, f) for f in os.listdir(parts) if f.endswith(".parquet")) if os.path.isdir(parts) else []
    if not files:
        return None
    out = os.path.join(MARKET, "options", idx, f"{expiry.isoformat()}.parquet")
    con = duck()
    try:
        con.execute(f"COPY (SELECT * FROM read_parquet({json.dumps(files)}, union_by_name=true) ORDER BY strike, cp, ts) "
                    f"TO '{out}.part' (FORMAT parquet, COMPRESSION zstd, ROW_GROUP_SIZE 122880)")
    finally:
        con.close()
    os.replace(out + ".part", out)
    shutil.rmtree(os.path.dirname(parts), ignore_errors=True)
    return out


# ── jobs ──
def job_check(c, job_id):
    st = c.execute("SELECT status FROM fyers_jobs WHERE id = %s", (job_id,)).fetchone()
    if not st or st["status"] in ("paused", "cancelled"):
        raise Stop(st["status"] if st else "cancelled")


def progress(c, job_id, **kw):
    kw["rss_mb"] = rss_mb()
    c.execute("UPDATE fyers_jobs SET progress = progress || %s::jsonb WHERE id = %s", (json.dumps(kw, default=str), job_id))
    c.commit()


# ── metadata: daily index levels, expiry lists, contract lists ──
def spot_daily(c, f, idx, start, end):
    """daily index candles (normal calls, ≤366 days each) for "at the money" — kept in fyers_spot_daily"""
    have = c.execute("SELECT max(d) AS m FROM fyers_spot_daily WHERE idx = %s", (idx,)).fetchone()["m"]
    cur = max(start, have + timedelta(days=1)) if have else start
    while cur <= end:
        to = min(cur + timedelta(days=365), end)
        j = f.call("history", "/data/history", {"symbol": fy.INDICES[idx]["spot"], "resolution": "D", "date_format": 1,
                                                "range_from": cur.isoformat(), "range_to": to.isoformat(), "cont_flag": 1}, symbol=fy.INDICES[idx]["spot"])
        cols, rows = fy._candles(j)
        for r in rows:
            day = datetime.fromtimestamp(_ts(r[0]), fy.IST).date()
            c.execute("INSERT INTO fyers_spot_daily (idx, d, open, high, low, close) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                      (idx, day, r[1], r[2], r[3], r[4]))
        c.commit()
        cur = to + timedelta(days=1)


def expiries(c, f, idx, start, end):
    """the futures and options expiry dates of an index (the expiry-dates address, ≤366 days per request)"""
    cur = start
    while cur <= end:
        to = min(cur + timedelta(days=365), end)
        j = f.call("expiry-dates", "/data/history/fno/expired/expiry-dates", {"symbol": fy.INDICES[idx]["spot"], "range_from": cur.isoformat(),
                                                                              "range_to": to.isoformat(), "date_format": 1}, symbol=fy.INDICES[idx]["spot"])
        data = (j or {}).get("data") or {}
        ex = data.get("expiry_dates") or data.get("expiryDates") or data
        for kind, key in (("fut", "futures"), ("opt", "options")):
            for v in (ex.get(key) if isinstance(ex, dict) else None) or []:
                try:
                    c.execute("INSERT INTO fyers_expiries (idx, kind, expiry) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (idx, kind, _date_of(v)))
                except (ValueError, TypeError):
                    pass
        c.commit()
        cur = to + timedelta(days=1)


def contracts(c, f, idx, expiry):
    """the contract symbols that expired on a date (futures + options), cached in fyers_expiries.contracts"""
    row = c.execute("SELECT contracts FROM fyers_expiries WHERE idx = %s AND kind = 'opt' AND expiry = %s", (idx, expiry)).fetchone()
    if row and row["contracts"]:
        return row["contracts"]
    j = f.call("underlying-symbols", "/data/history/fno/expired/underlying-symbols", {"symbol": fy.INDICES[idx]["spot"], "expiry_date": expiry.isoformat()},
               symbol=fy.INDICES[idx]["spot"])
    data = (j or {}).get("data") or {}
    con_ = data.get("contracts") or data
    sym = lambda x: x.get("symbol") if isinstance(x, dict) else str(x)
    out = {"futures": [sym(x) for x in (con_.get("futures") if isinstance(con_, dict) else None) or []],
           "options": [sym(x) for x in (con_.get("options") if isinstance(con_, dict) else None) or []]}
    c.execute("INSERT INTO fyers_expiries (idx, kind, expiry, contracts) VALUES (%s, 'opt', %s, %s) "
              "ON CONFLICT (idx, kind, expiry) DO UPDATE SET contracts = EXCLUDED.contracts", (idx, expiry, json.dumps(out)))
    c.commit()
    return out


def spot_range(c, idx, expiry, days=7):
    """lowest low and highest high of the index in the last `days` trading days up to the expiry"""
    r = c.execute("SELECT min(low) AS lo, max(high) AS hi, (array_agg(close ORDER BY d DESC))[1] AS last FROM "
                  "(SELECT * FROM fyers_spot_daily WHERE idx = %s AND d <= %s ORDER BY d DESC LIMIT %s) x", (idx, expiry, days)).fetchone()
    return r if r and r["lo"] else None


def candles(f, kind, symbol, frm, to, expired):
    """one request: minute candles of one symbol between two dates"""
    if kind == "spot" or not expired:
        p = {"symbol": symbol, "resolution": "1", "date_format": 1, "range_from": frm.isoformat(), "range_to": to.isoformat(), "cont_flag": 1}
        if kind != "spot":
            p["oi_flag"] = 1                          # open interest only for futures / options (an index has none)
        j = f.call("history", "/data/history", p, symbol=symbol)
    else:
        p = {"symbol": symbol, "resolution": "1", "date_format": 1, "range_from": frm.isoformat(), "range_to": to.isoformat(), "include_oi": 1}
        if kind == "opt":
            p["include_greeks"] = 1
        j = f.call("historical-data", "/data/history/fno/expired/historical-data", p, symbol=symbol, expired=True)
    if isinstance(j, dict) and j.get("s") not in ("ok", "no_data") and j.get("code") not in (None, 200):
        raise Refused(f"{fy.why(j)[:200]} ({symbol} {frm} → {to})")
    return fy._candles(j)


# ── P2 · history depth ──
def probe_depth(c, f, job):
    today = datetime.now(fy.IST).date()
    for idx, meta in fy.INDICES.items():
        job_check(c, job["id"])
        lo, hi = date(2005, 1, 1), today - timedelta(days=5)              # spot: binary search on "a 5-day window has minute candles"
        refusals = []

        def has(day):
            try:
                return bool(candles(f, "spot", meta["spot"], day, day + timedelta(days=5), False)[1])
            except Refused as e:                       # outside the plan's history (Standard: the last year only)
                refusals.append(str(e))
                return False
        if has(lo):
            hi = lo
        else:
            while (hi - lo).days > 7:
                mid = lo + (hi - lo) / 2
                if has(mid):
                    hi = mid
                else:
                    lo = mid
        found = has(hi)
        note = "binary search, ±7 days" + (f"; Fyers refused older dates: {refusals[-1][:120]}" if refusals else "")
        c.execute("INSERT INTO fyers_depth (idx, kind, earliest, note) VALUES (%s, 'spot', %s, %s) "
                  "ON CONFLICT (idx, kind) DO UPDATE SET earliest = EXCLUDED.earliest, note = EXCLUDED.note, checked_at = now()",
                  (idx, hi if found else None, note if found else f"no minute data found; {refusals[-1][:160] if refusals else ''}"))
        c.commit()
        progress(c, job["id"], step=f"{idx}: index minute data from {hi}")
        start = d(meta["fno_from"]) - timedelta(days=60)
        expiries(c, f, idx, start, min(start + timedelta(days=365), today))
        spot_daily(c, f, idx, start, min(start + timedelta(days=400), today))
        for kind in ("fut", "opt"):
            job_check(c, job["id"])
            e = c.execute("SELECT min(expiry) AS e FROM fyers_expiries WHERE idx = %s AND kind = %s", (idx, kind)).fetchone()["e"]
            note, earliest = "no expiries listed", None
            if e:
                con_ = contracts(c, f, idx, e)
                lst = con_["futures"] if kind == "fut" else con_["options"]
                sym = lst[0] if lst else None
                if kind == "opt" and lst:
                    rng = spot_range(c, idx, e)
                    atm = round(rng["last"] / meta["step"]) * meta["step"] if rng else None
                    best = min(lst, key=lambda s: abs((parse_strike(s, meta["step"], atm)[0] or 1e9) - (atm or 0))) if atm else lst[0]
                    sym = best
                if sym:
                    try:
                        _, rows = candles(f, kind, sym, e - timedelta(days=7), e, True)
                        earliest = e if rows else None
                        note = f"{sym}: {len(rows)} minute candles in its last week" if rows else f"{sym}: listed, but no minute candles"
                    except Refused as ex:
                        note = f"Fyers refused: {ex}"
            c.execute("INSERT INTO fyers_depth (idx, kind, earliest, note) VALUES (%s, %s, %s, %s) "
                      "ON CONFLICT (idx, kind) DO UPDATE SET earliest = EXCLUDED.earliest, note = EXCLUDED.note, checked_at = now()", (idx, kind, earliest, note))
            c.commit()
            progress(c, job["id"], step=f"{idx} {kind}: {note}")


# ── P3 · coverage ──
def probe_coverage(c, f, job):
    today = datetime.now(fy.IST).date()
    for idx, meta in fy.INDICES.items():
        start = d(meta["fno_from"])
        expiries(c, f, idx, start, today)
        spot_daily(c, f, idx, start - timedelta(days=30), today)
        all_e = [r["expiry"] for r in c.execute("SELECT expiry FROM fyers_expiries WHERE idx = %s AND kind = 'opt' AND expiry < %s ORDER BY expiry",
                                                 (idx, today)).fetchall()]
        for year in sorted({e.year for e in all_e}):
            ys = [e for e in all_e if e.year == year]
            for e in (ys[0], ys[len(ys) // 2]) if len(ys) > 1 else ys:
                if c.execute("SELECT 1 FROM fyers_coverage WHERE idx = %s AND expiry = %s AND (rows IS NOT NULL OR note LIKE 'Fyers refused%%')",
                             (idx, e)).fetchone():
                    continue
                job_check(c, job["id"])
                i = all_e.index(e)
                weekly = i > 0 and (e - all_e[i - 1]).days <= 8
                con_ = contracts(c, f, idx, e)
                rng = spot_range(c, idx, e)
                atm = round(rng["last"] / meta["step"]) * meta["step"] if rng else None
                strikes = {parse_strike(s, meta["step"], atm)[0] for s in con_["options"]} - {None}
                ce = [s for s in con_["options"] if s.endswith("CE") and parse_strike(s, meta["step"], atm)[0] == atm]
                c.execute("INSERT INTO fyers_coverage (idx, expiry, weekly, strikes, futures, note) VALUES (%s, %s, %s, %s, %s, %s) "
                          "ON CONFLICT (idx, expiry) DO UPDATE SET strikes = EXCLUDED.strikes, futures = EXCLUDED.futures, weekly = EXCLUDED.weekly",
                          (idx, e, weekly, len(strikes), len(con_["futures"]), "no ATM CE listed" if not ce else ""))
                c.commit()
                if ce:
                    try:
                        cols, rows = candles(f, "opt", ce[0], e - timedelta(days=6), e, True)
                    except Refused as ex:
                        c.execute("UPDATE fyers_coverage SET note = %s, checked_at = now() WHERE idx = %s AND expiry = %s", (f"Fyers refused: {ex}"[:300], idx, e))
                        c.commit()
                        progress(c, job["id"], step=f"{idx} {e}: refused")
                        continue
                    days_ = len({datetime.fromtimestamp(_ts(r[0]), fy.IST).date() for r in rows}) if rows else 0
                    missing = 100.0 * (1 - len(rows) / (days_ * MINUTES_PER_DAY)) if days_ else 100.0
                    has_oi, has_g = "oi" in cols or "open_interest" in cols, any(g in cols for g in ("iv", "delta"))
                    c.execute("UPDATE fyers_coverage SET rows = %s, missing_pct = %s, has_oi = %s, has_greeks = %s, note = %s, checked_at = now() "
                              "WHERE idx = %s AND expiry = %s", (len(rows), round(max(0.0, missing), 2), has_oi, has_g, ce[0], idx, e))
                    c.commit()
                progress(c, job["id"], step=f"{idx} {e}: {len(strikes)} strikes")


# ── the bulk download ──
def plan_bulk(c, f, job):
    """metadata first: daily index levels, expiry lists, contract lists → one manifest row per (contract, date range)"""
    p = job["params"]
    today = datetime.now(fy.IST).date()
    width = int(p.get("strikes", 25))
    for idx in p.get("indices") or list(fy.INDICES):
        meta = fy.INDICES[idx]
        start = max(d(meta["fno_from"]), d(p["start"])) if p.get("start") else d(meta["fno_from"])
        job_check(c, job["id"])
        spot_daily(c, f, idx, start - timedelta(days=30), today)
        expiries(c, f, idx, start, today)
        if p.get("spot", True):                                       # index minutes, 100-day pieces
            cur = start
            while cur < today:
                to = min(cur + timedelta(days=CHUNK_DAYS - 1), today - timedelta(days=1))
                c.execute("INSERT INTO fyers_manifest (kind, idx, symbol, range_from, range_to) VALUES ('spot', %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                          (idx, meta["spot"], cur, to))
                cur = to + timedelta(days=1)
        opt_e = [r["expiry"] for r in c.execute("SELECT expiry FROM fyers_expiries WHERE idx = %s AND kind = 'opt' AND expiry >= %s AND expiry < %s "
                                                 "ORDER BY expiry", (idx, start, today)).fetchall()]
        for i, e in enumerate(opt_e):
            job_check(c, job["id"])
            con_ = contracts(c, f, idx, e)
            if p.get("futures", True):
                for s in con_["futures"]:
                    c.execute("INSERT INTO fyers_manifest (kind, idx, symbol, expiry, range_from, range_to) VALUES ('fut', %s, %s, %s, %s, %s) "
                              "ON CONFLICT DO NOTHING", (idx, s, e, max(start, e - timedelta(days=CHUNK_DAYS - 5)), e))
            if p.get("options", True):
                rng = spot_range(c, idx, e)
                if not rng:
                    continue
                lo = (int(rng["lo"]) // meta["step"] - width) * meta["step"]
                hi = (int(rng["hi"]) // meta["step"] + width + 1) * meta["step"]
                frm = opt_e[i - 1] + timedelta(days=1) if i else max(start, e - timedelta(days=35))
                for s in con_["options"]:
                    k, cp = parse_strike(s, meta["step"], rng["last"])
                    if k is not None and (p.get("full_chain") or lo <= k <= hi):
                        c.execute("INSERT INTO fyers_manifest (kind, idx, symbol, expiry, strike, cp, range_from, range_to) "
                                  "VALUES ('opt', %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING", (idx, s, e, k, cp, frm, e))
            c.commit()
            if i % 10 == 0:
                progress(c, job["id"], phase="listing contracts", step=f"{idx} {e}", listed=_counts(c)["total"])


def pack_finished(c):
    """every expiry whose option pieces are all finished but whose parts are still there (e.g. the worker stopped while packing) → packed"""
    for r in c.execute("SELECT idx, expiry FROM fyers_manifest WHERE kind = 'opt' GROUP BY idx, expiry "
                       "HAVING bool_and(status IN ('done', 'no_data')) AND bool_or(status = 'done')").fetchall():
        if os.path.isdir(os.path.join(MARKET, "options", r["idx"], r["expiry"].isoformat(), "_parts")):
            out = pack_expiry(r["idx"], r["expiry"])
            if out:
                c.execute("UPDATE fyers_manifest SET path = %s, bytes = 0 WHERE idx = %s AND kind = 'opt' AND expiry = %s AND status = 'done'",
                          (out, r["idx"], r["expiry"]))
                c.execute("UPDATE fyers_manifest SET bytes = %s WHERE id = (SELECT min(id) FROM fyers_manifest WHERE path = %s)", (os.path.getsize(out), out))
                c.commit()


def _counts(c):
    return c.execute("SELECT count(*) AS total, count(*) FILTER (WHERE status IN ('done', 'no_data')) AS finished, "
                     "count(*) FILTER (WHERE status = 'failed') AS failed, coalesce(sum(bytes), 0)::bigint AS bytes FROM fyers_manifest").fetchone()


def run_bulk(c, f, job, minutes=None):
    """download every pending manifest row: index first, then futures, then options newest → oldest. Each row is one request, written
    straight to its file; a finished expiry's options are packed into one file. minutes = stop after that long (the P4 speed test)."""
    t0, n0, b0 = time.monotonic(), 0, 0
    today = datetime.now(fy.IST).date()
    pack_finished(c)
    while True:
        job_check(c, job["id"])
        if minutes and time.monotonic() - t0 > minutes * 60:
            break
        r = c.execute("SELECT * FROM fyers_manifest WHERE status IN ('pending', 'failed') AND attempts < 4 "
                      "ORDER BY CASE kind WHEN 'spot' THEN 0 WHEN 'fut' THEN 1 ELSE 2 END, expiry DESC NULLS LAST, id LIMIT 1").fetchone()
        if not r:
            break
        c.execute("UPDATE fyers_manifest SET status = 'running', attempts = attempts + 1, updated_at = now() WHERE id = %s", (r["id"],))
        c.commit()
        try:
            expired = r["kind"] != "spot" and r["expiry"] is not None and r["expiry"] < today
            cols, rows = candles(f, r["kind"], r["symbol"], r["range_from"], r["range_to"], expired)
            if not rows:
                c.execute("UPDATE fyers_manifest SET status = 'no_data', last_error = '', updated_at = now() WHERE id = %s", (r["id"],))
            else:
                if r["kind"] == "spot":
                    path = os.path.join(MARKET, "spot", r["idx"], f"{r['range_from']}_{r['range_to']}.parquet")
                    n, size, chk = write_parquet(path, cols, rows)
                elif r["kind"] == "fut":
                    path = os.path.join(MARKET, "futures", r["idx"], re.sub(r"[^A-Z0-9]", "_", r["symbol"].split(":")[-1]) + ".parquet")
                    n, size, chk = write_parquet(path, cols, rows)
                else:
                    path = os.path.join(MARKET, "options", r["idx"], r["expiry"].isoformat(), "_parts", f"{r['strike']}{r['cp']}.parquet")
                    n, size, chk = write_parquet(path, cols, rows, {"strike": int(r["strike"]), "cp": r["cp"]})
                c.execute("UPDATE fyers_manifest SET status = 'done', rows = %s, bytes = %s, checksum = %s, path = %s, last_error = '', updated_at = now() "
                          "WHERE id = %s", (n, size, chk, path, r["id"]))
                n0 += 1; b0 += size
            c.commit()
            if r["kind"] == "opt" and not c.execute("SELECT 1 FROM fyers_manifest WHERE idx = %s AND kind = 'opt' AND expiry = %s "
                                                    "AND status NOT IN ('done', 'no_data') LIMIT 1", (r["idx"], r["expiry"])).fetchone():
                out = pack_expiry(r["idx"], r["expiry"])
                if out:
                    c.execute("UPDATE fyers_manifest SET path = %s, bytes = 0 WHERE idx = %s AND kind = 'opt' AND expiry = %s AND status = 'done'",
                              (out, r["idx"], r["expiry"]))
                    c.execute("UPDATE fyers_manifest SET bytes = %s WHERE id = (SELECT min(id) FROM fyers_manifest WHERE path = %s)", (os.path.getsize(out), out))
                    c.commit()
        except (fy.QuotaWait, fy.NotConnected, Stop):
            c.execute("UPDATE fyers_manifest SET status = 'pending', attempts = attempts - 1 WHERE id = %s", (r["id"],))
            c.commit()
            raise
        except Exception as e:                                    # noqa: BLE001 — one bad contract never stops the rest
            c.rollback()
            c.execute("UPDATE fyers_manifest SET status = 'failed', last_error = %s, updated_at = now() WHERE id = %s", (str(e)[:300], r["id"]))
            c.commit()
        k = _counts(c)
        el = max(1.0, time.monotonic() - t0)
        rate = n0 / el * 60
        progress(c, job["id"], phase="downloading", done=k["finished"], total=k["total"], failed=k["failed"], gb=round(k["bytes"] / 1e9, 3),
                 per_min=round(rate, 1), eta_min=round((k["total"] - k["finished"]) / rate) if rate > 0 else None, step=r["symbol"])
    pack_finished(c)
    return n0, b0, time.monotonic() - t0


def probe_speed(c, f, job):
    """P4 · Prime only: the real downloader for 10 minutes at 80% of the limits → calls a minute, errors, latency, MB → time to finish"""
    if f.plan_name != "prime":
        raise ValueError("The speed test needs the Prime plan (Standard allows only 10 expired-contract minute requests a day)")
    if not c.execute("SELECT 1 FROM fyers_manifest LIMIT 1").fetchone():
        plan_bulk(c, f, job)
    since = datetime.now(fy.IST)
    n, b, secs = run_bulk(c, f, job, minutes=int(job["params"].get("minutes", 10)))
    s = c.execute("SELECT count(*) AS calls, count(*) FILTER (WHERE NOT ok) AS errors, coalesce(avg(ms), 0)::int AS ms FROM fyers_calls WHERE at >= %s",
                  (since,)).fetchone()
    k = _counts(c)
    per_min = s["calls"] / max(1, secs / 60)
    progress(c, job["id"], result={"calls_per_min": round(per_min, 1), "error_pct": round(100 * s["errors"] / max(1, s["calls"]), 2),
                                   "avg_ms": s["ms"], "mb": round(b / 1e6, 1), "remaining": k["total"] - k["finished"],
                                   "eta_hours": round((k["total"] - k["finished"]) / max(per_min, 0.1) / 60, 1)})


# ── P5 · data checks (no API calls) ──
def quality(c, job=None):
    files = []
    for root, _, names in os.walk(MARKET):
        if "_parts" in root:
            continue
        files += [os.path.join(root, n) for n in names if n.endswith(".parquet")]
    con = duck()
    try:
        for i, path in enumerate(sorted(files)):
            if job and i % 20 == 0:
                job_check(c, job["id"])
            rel = os.path.relpath(path, MARKET).replace(os.sep, "/")
            kind, idx = rel.split("/")[0], rel.split("/")[1]
            grp = "strike, cp, " if kind == "options" else ""
            q = con.execute(f"""
                WITH t AS (SELECT * FROM read_parquet('{path}')),
                     k AS (SELECT {grp} CAST(epoch_ms((ts + 19800) * 1000::BIGINT) AS DATE) AS day, count(*) AS n FROM t GROUP BY ALL)
                SELECT (SELECT count(*) FROM t),
                       (SELECT count(DISTINCT day) FROM k),
                       (SELECT 100.0 * (1 - sum(least(n, {MINUTES_PER_DAY})) / (count(*) * {MINUTES_PER_DAY})) FROM k),
                       (SELECT count(*) - count(DISTINCT ({grp} ts)) FROM t),
                       (SELECT count(*) FROM t WHERE high < greatest(open, close) OR low > least(open, close) OR high < low),
                       (SELECT count(*) FROM t WHERE open <= 0 OR high <= 0 OR low <= 0 OR close <= 0),
                       (SELECT 100.0 * count(*) FILTER (WHERE volume = 0) / greatest(count(*), 1) FROM t),
                       (SELECT min(ts) FROM t), (SELECT max(ts) FROM t)
            """ if "volume" in [x[0] for x in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{path}')").fetchall()] else f"""
                WITH t AS (SELECT * FROM read_parquet('{path}')),
                     k AS (SELECT {grp} CAST(epoch_ms((ts + 19800) * 1000::BIGINT) AS DATE) AS day, count(*) AS n FROM t GROUP BY ALL)
                SELECT (SELECT count(*) FROM t), (SELECT count(DISTINCT day) FROM k),
                       (SELECT 100.0 * (1 - sum(least(n, {MINUTES_PER_DAY})) / (count(*) * {MINUTES_PER_DAY})) FROM k),
                       (SELECT count(*) - count(DISTINCT ({grp} ts)) FROM t),
                       (SELECT count(*) FROM t WHERE high < greatest(open, close) OR low > least(open, close) OR high < low),
                       (SELECT count(*) FROM t WHERE open <= 0 OR high <= 0 OR low <= 0 OR close <= 0), NULL, (SELECT min(ts) FROM t), (SELECT max(ts) FROM t)
            """).fetchone()
            c.execute("INSERT INTO fyers_quality (path, kind, idx, rows, days, missing_pct, dup_ts, bad_ohlc, nonpos, zero_vol_pct, first_ts, last_ts) "
                      "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, to_timestamp(%s), to_timestamp(%s)) ON CONFLICT (path) DO UPDATE SET "
                      "rows = EXCLUDED.rows, days = EXCLUDED.days, missing_pct = EXCLUDED.missing_pct, dup_ts = EXCLUDED.dup_ts, bad_ohlc = EXCLUDED.bad_ohlc, "
                      "nonpos = EXCLUDED.nonpos, zero_vol_pct = EXCLUDED.zero_vol_pct, first_ts = EXCLUDED.first_ts, last_ts = EXCLUDED.last_ts, checked_at = now()",
                      (rel, kind, idx, q[0], q[1], round(q[2] or 0, 2), q[3], q[4], q[5], None if q[6] is None else round(q[6], 2), q[7], q[8]))
            c.commit()
        c.execute("DELETE FROM fyers_quality WHERE NOT (path = ANY(%s))", ([os.path.relpath(p, MARKET).replace(os.sep, "/") for p in files],))
        c.commit()
    finally:
        con.close()
    if job:
        progress(c, job["id"], step=f"{len(files)} file(s) checked")


def nightly(c, f, job):
    """after the market: today's index minutes for each index (small; fits the Standard plan)"""
    today = datetime.now(fy.IST).date()
    for idx, meta in fy.INDICES.items():
        last = c.execute("SELECT max(range_to) AS m FROM fyers_manifest WHERE kind = 'spot' AND idx = %s AND status IN ('done', 'no_data')", (idx,)).fetchone()["m"]
        if not last:
            continue
        frm = last + timedelta(days=1)
        if frm <= today:
            c.execute("INSERT INTO fyers_manifest (kind, idx, symbol, range_from, range_to) VALUES ('spot', %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                      (idx, meta["spot"], frm, today))
    c.commit()
    run_bulk(c, f, job)
