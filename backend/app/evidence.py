"""
Strength evidence (owner, 2026-11-01: "check all the combinations as much as possible … I need the best output and
accuracy"). Every collection stores each stock's combination in `stock_states` (publish.build_history). This module
checks the combinations against what the price did AFTERWARDS:

  forward return   price at the first collection ≥ horizon days later ÷ price now − 1
  vs the market    the same, minus the average forward return of every stock from that same collection
  examples         independent: one per stock, per box, per period (a quarterly box counts a stock once a quarter,
                   a monthly box once a month, a yearly box once a year) — a state that lasts weeks is not counted again
                   at every collection
  enough           ≥ MIN_EXAMPLES examples whose horizon has passed

Levels: "nr" = mother candle (breakout / breakdown) × price place per timeframe = 36 boxes (+ "no mother candle");
"zone" = zone trend × place × mother candle per timeframe = 90 boxes; "full" = Monthly × Quarterly × Yearly
combinations actually seen (of 729,000 possible). Admin only — customers never see this.
"""
import bisect
import statistics
from datetime import timedelta

from .db import pool
from .publish import FORMULA_VERSION

TRENDS = ("Strongly up", "Turning up", "Flat", "Turning down", "Strongly down")
PLACES = ("Above the top", "Near the top", "Upper half", "Lower half", "Near the bottom", "Below the bottom")
NRS = ("No mother candle", "Breakout", "Breakdown")
TF_COL = {"M": "m_state", "Q": "q_state", "Y": "y_state"}
TF_NR = {"M": "m_nr", "Q": "q_nr", "Y": "y_nr"}
TF_ST = {"M": "m_st", "Q": "q_st", "Y": "y_st"}
MIN_EXAMPLES = 30
HORIZONS = (7, 30, 90)
_cache = {"key": None, "rows": None}


def decode(code):
    """0 … 89 → (trend, place, mother candle) words"""
    return TRENDS[code // 18], PLACES[(code // 3) % 6], NRS[code % 3]


def _period(d, tf):
    return (d.year, d.month) if tf in ("M", "full") else (d.year, (d.month - 1) // 3) if tf == "Q" else (d.year,)


def _rows():
    with pool.connection() as c:
        key = c.execute("SELECT count(*) AS n, max(taken_at) AS t FROM stock_states WHERE formula = %s", (FORMULA_VERSION,)).fetchone()
        key = (key["n"], key["t"])
        if _cache["key"] == key:
            return _cache["rows"]
        rows = c.execute("SELECT snapshot_id, symbol, trade_date, taken_at, price, m_state, q_state, y_state, m_nr, q_nr, y_nr, "
                         "m_st, q_st, y_st, strength FROM stock_states WHERE formula = %s AND price > 0 ORDER BY symbol, taken_at",
                         (FORMULA_VERSION,)).fetchall()
    _cache.update(key=key, rows=rows)
    return rows


def _forward(rows, horizon):
    """row index -> (forward return %, excess vs that collection's average %) for rows whose horizon has passed"""
    by_sym = {}
    for i, r in enumerate(rows):
        by_sym.setdefault(r["symbol"], []).append(i)
    fwd = {}
    for idx in by_sym.values():
        times = [rows[i]["taken_at"] for i in idx]
        for k, i in enumerate(idx):
            j = bisect.bisect_left(times, rows[i]["taken_at"] + timedelta(days=horizon), lo=k + 1)
            if j < len(idx):
                fwd[i] = (rows[idx[j]]["price"] / rows[i]["price"] - 1) * 100
    bench = {}
    for i, v in fwd.items():
        bench.setdefault(rows[i]["snapshot_id"], []).append(v)
    avg = {k: sum(v) / len(v) for k, v in bench.items()}
    return {i: (v, v - avg[rows[i]["snapshot_id"]]) for i, v in fwd.items()}


def _box_stats(members, fwd, rows):
    done = [fwd[i] for i in members if i in fwd]
    out = {"examples": len(members), "done": len(done),
           "avg_strength": round(sum(rows[i]["strength"] or 0 for i in members) / len(members), 1) if members else None}
    if done:
        ret = [d[0] for d in done]; exc = [d[1] for d in done]
        out.update(avg_ret=round(sum(ret) / len(ret), 2), med_ret=round(statistics.median(ret), 2),
                   up_pct=round(sum(1 for v in ret if v > 0) / len(ret) * 100, 1),
                   avg_excess=round(sum(exc) / len(exc), 2), beat_pct=round(sum(1 for v in exc if v > 0) / len(exc) * 100, 1))
    if len(done) < MIN_EXAMPLES:
        out["verdict"] = "Not enough yet"
    elif out["avg_excess"] > 1 and out["beat_pct"] > 55:
        out["verdict"] = "Better than the market"
    elif out["avg_excess"] < -1 and out["beat_pct"] < 45:
        out["verdict"] = "Worse than the market"
    else:
        out["verdict"] = "In line with the market"
    return out


def report(level="nr", tf="Q", horizon=30, limit=300):
    if level not in ("nr", "zone", "full") or tf not in TF_COL or horizon not in HORIZONS:
        raise ValueError("Choose a level, a timeframe and a horizon")
    rows = _rows()
    fwd = _forward(rows, horizon)
    boxes, seen = {}, set()
    for i, r in enumerate(rows):
        if level == "full":
            codes = (r["m_state"], r["q_state"], r["y_state"])
            if None in codes:
                continue
            key, per = codes, _period(r["trade_date"], "full")
        else:
            code = r[TF_COL[tf]]
            if code is None:
                continue
            if level == "nr":
                n = r[TF_NR[tf]] or 0
                key = ("none",) if not n else ("Breakout" if n > 0 else "Breakdown", PLACES[(code // 3) % 6])
            else:
                key = code
            per = _period(r["trade_date"], tf)
        uniq = (r["symbol"], key, per)
        if uniq in seen:                                   # one example per stock, per box, per period
            continue
        seen.add(uniq)
        boxes.setdefault(key, []).append(i)
    out = []
    if level == "nr":
        keys = [("none",)] + [(e, p) for e in ("Breakout", "Breakdown") for p in PLACES]
        for k in keys:
            label = {"event": "No mother candle", "place": "any"} if k == ("none",) else {"event": k[0], "place": k[1]}
            out.append({**label, **_box_stats(boxes.get(k, []), fwd, rows)})
    elif level == "zone":
        for code in range(90):
            t, p, n = decode(code)
            out.append({"code": code, "trend": t, "place": p, "nr": n, **_box_stats(boxes.get(code, []), fwd, rows)})
    else:
        for key, members in sorted(boxes.items(), key=lambda kv: -len(kv[1]))[:limit]:
            out.append({"codes": list(key), "M": " · ".join(decode(key[0])), "Q": " · ".join(decode(key[1])),
                        "Y": " · ".join(decode(key[2])), **_box_stats(members, fwd, rows)})
    return {"level": level, "tf": tf, "horizon": horizon, "boxes": out, "seen": len(boxes),
            "possible": {"nr": 13, "zone": 90, "full": 729000}[level], "min_examples": MIN_EXAMPLES}


def status():
    with pool.connection() as c:
        s = c.execute("SELECT count(*) AS rows, count(DISTINCT snapshot_id) AS collections, min(trade_date) AS first, "
                      "max(trade_date) AS last, count(*) FILTER (WHERE formula < %s) AS old FROM stock_states", (FORMULA_VERSION,)).fetchone()
        size = c.execute("SELECT pg_total_relation_size('stock_states') AS b").fetchone()["b"]
        snaps = c.execute("SELECT count(*) AS n FROM snapshots").fetchone()["n"]
        seen = c.execute("SELECT count(DISTINCT (m_state, q_state, y_state)) AS full, "
                         "count(DISTINCT m_state) AS m, count(DISTINCT q_state) AS q, count(DISTINCT y_state) AS y "
                         "FROM stock_states WHERE formula = %s AND m_state IS NOT NULL AND q_state IS NOT NULL AND y_state IS NOT NULL",
                         (FORMULA_VERSION,)).fetchone()
    return {"formula": FORMULA_VERSION, "rows": s["rows"], "collections": s["collections"], "snapshots": snaps,
            "first": s["first"].isoformat() if s["first"] else None, "last": s["last"].isoformat() if s["last"] else None,
            "old_rows": s["old"], "bytes": size, "seen_full": seen["full"], "seen_tf": {"M": seen["m"], "Q": seen["q"], "Y": seen["y"]},
            "possible_full": 729000, "possible_tf": 90, "horizons": list(HORIZONS), "min_examples": MIN_EXAMPLES}


def rebuild_all():
    """Throw away the stored final outputs and states; the worker rebuilds every collection with the current formula."""
    with pool.connection() as c:
        c.execute("DELETE FROM stock_states")
        c.execute("UPDATE customer_history SET formula = 0")
    _cache.update(key=None, rows=None)
