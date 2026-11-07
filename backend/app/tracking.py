"""
Tracking of saved portfolios (owner, 2026-11-06: "I need the tracking of the portfolio … since we have the everyday data
bring the line chart of the whole portfolio and the option to choose the individual stock … from the saved date … how much
contribution from large, mid, small cap and the ETF … if the stock is changed handle that … handle the stock split as well
… develop all in the optimised way to consume less data").

Prices    price_hist(sym, d, close): one row per stock / ETF per trade date, written by publish (record_day), the last
          publish of a day wins. Backfilled once from the retained collections (backfill).
Splits    price_adj(sym, d, factor): from day d one old share = factor new shares. Found when a day is written: the raw
          close / previous close is far from 1 while the source's own daily change (measured on its split-adjusted
          history) is small → a split / bonus, snapped to a standard ratio. A real crash shows the same fall in the source
          change, so it is never adjusted. ETFs (no source change): the ratio rule alone, tighter.
Series    track(): from saved_on, per the saved kind —
            analyser  1 share of every stock (owner: "keep 1 stock for all")
            builder   the saved quantities
            sip       AMOUNT-based, like a real SIP (owner 2026-11-06: "the ETF price also grows, I can't invest the same
                      units"): on the first day and then the first trading day of every month / quarter, each holding gets
                      its planned rupees (× (1 + step-up %)^years); whole units are bought at that day's price and the
                      remainder waits for the next instalment (so a costly share is bought every few instalments by itself)
          A change (versions[]) sells the holdings that left at that day's close; the money buys the new ones in whole
          shares and the rest stays as cash in the value. Split factors multiply the shares held from their day.
Reads     track() / spark() take the caller's connection (the customer service reads with its own restricted role).
Cost      one query per portfolio; results cached per (portfolio, last price day, options); > MAX_POINTS days thinned.
"""
import gzip
import json
import math
from collections import OrderedDict
from datetime import date

from .db import pool

BENCH = "NIFTYBEES"                       # the Nifty 50 reference line
MAX_POINTS = 400
STD_FACTORS = (2, 3, 4, 5, 10, 20, 1.5, 4 / 3, 5 / 4, 0.5, 0.2, 0.1, 1 / 3, 0.25)
CHECK_LOW, CHECK_HIGH = 0.78, 1.3         # a raw day move outside this band is examined
GAP_DAYS = 4                              # previous stored close at most this many days back = "the previous trading day"
_cache = OrderedDict()
CACHE_MAX = 600


# ── prices ──
def _snap(f, tol):
    best = min(STD_FACTORS, key=lambda x: abs(f / x - 1))
    return best if abs(f / best - 1) <= tol else None


def detect(prev, close, chg=None, gap=1):
    """the split factor for one day, or None (prev / close raw prices; chg = the source's daily change % if known;
    gap = calendar days since the previous stored close — the source change covers one trading day only, so across a
    longer gap only a clear 1:2 / 1:5 / 1:10 counts)"""
    if not prev or not close or prev <= 0 or close <= 0:
        return None
    r = close / prev
    if gap > GAP_DAYS:
        f = _snap(1 / r, 0.02) if r <= 0.52 else None
        return f if f in (2, 5, 10) else None
    if CHECK_LOW < r < CHECK_HIGH:
        return None
    if chg is not None:
        implied = 1 + chg / 100
        if implied <= 0 or abs(r / implied - 1) < 0.15:            # the source saw the same move: a real one
            return None
        return _snap(implied / r, 0.04)
    if 0.55 < r < 1.8:                                              # ETFs: only clear ratios
        return None
    return _snap(1 / r, 0.02)


def record_day(d, prices, changes=None):
    """store one trade date's closes {sym: close} and any split / bonus found against the previous stored day"""
    rows = [(s, d, float(p)) for s, p in prices.items() if p and p > 0]
    if not rows:
        return 0
    changes = changes or {}
    with pool.connection() as c:
        prev = {r["sym"]: (r["close"], (d - r["d"]).days) for r in c.execute(
            "SELECT DISTINCT ON (sym) sym, close, d FROM price_hist WHERE d < %s AND sym = ANY(%s) ORDER BY sym, d DESC",
            (d, [r[0] for r in rows])).fetchall()}
        with c.cursor() as cur:
            cur.executemany("INSERT INTO price_hist (sym, d, close) VALUES (%s, %s, %s) "
                            "ON CONFLICT (sym, d) DO UPDATE SET close = EXCLUDED.close", rows)
        adj = [(s, d, f) for s, _, p in rows if s in prev and (f := detect(prev[s][0], p, changes.get(s), prev[s][1])) and f != 1]
        if adj:                                       # a price frozen for days then moving is stale data resuming, not a split
            stale = {r["sym"] for r in c.execute(
                "SELECT sym FROM (SELECT sym, close, row_number() OVER (PARTITION BY sym ORDER BY d DESC) AS rn FROM price_hist "
                "WHERE d < %s AND sym = ANY(%s)) t WHERE rn <= 3 GROUP BY sym HAVING count(*) = 3 AND min(close) = max(close)",
                (d, [a[0] for a in adj])).fetchall()}
            adj = [a for a in adj if a[0] not in stale]
        c.execute("DELETE FROM price_adj WHERE d = %s AND NOT (sym = ANY(%s))", (d, [a[0] for a in adj]))
        for a in adj:
            c.execute("INSERT INTO price_adj (sym, d, factor) VALUES (%s, %s, %s) ON CONFLICT (sym, d) DO UPDATE SET factor = EXCLUDED.factor", a)
    return len(rows)


def changes_of(snapshot_id):
    with pool.connection() as c:
        return {r["symbol"]: r["change_pct"] for r in c.execute(
            "SELECT symbol, change_pct FROM snapshot_stocks WHERE snapshot_id = %s AND change_pct IS NOT NULL", (snapshot_id,)).fetchall()}


def backfill():
    """once: the last collection of every retained trade date → price_hist (stocks; ETFs come from publishes)"""
    with pool.connection() as c:
        if c.execute("SELECT 1 FROM price_hist LIMIT 1").fetchone():
            return 0
        snaps = c.execute("SELECT DISTINCT ON (trade_date) id, trade_date FROM snapshots ORDER BY trade_date, taken_at DESC").fetchall()
    n = 0
    for sn in snaps:
        with pool.connection() as c:
            rows = c.execute("SELECT symbol, price, change_pct FROM snapshot_stocks WHERE snapshot_id = %s", (sn["id"],)).fetchall()
        n += record_day(sn["trade_date"], {r["symbol"]: r["price"] for r in rows}, {r["symbol"]: r["change_pct"] for r in rows if r["change_pct"] is not None})
    with pool.connection() as c:                                   # + the ETFs of the latest publish
        r = c.execute("SELECT p.etf_gz, s.trade_date FROM published p JOIN snapshots s ON s.id = p.snapshot_id "
                      "WHERE p.etf_gz IS NOT NULL ORDER BY p.id DESC LIMIT 1").fetchone()
    if r:
        e = json.loads(gzip.decompress(bytes(r["etf_gz"])))
        n += record_day(r["trade_date"], {x["s"]: x.get("p") for x in e.get("etfs", [])})
    return n


# ── series ──
def versions_of(row):
    v = row.get("versions") or []
    return v if v else [{"d": (row.get("saved_on") or date.today()).isoformat(), "holdings": row.get("holdings") or []}]


def _sym_set(vers):
    log = (vers[-1].get("log") or []) if vers else []
    return sorted({h["s"] for v in vers for h in v["holdings"]} | {e[k]["s"] for e in log for k in ("out", "in") if e.get(k)})


def _swaps(vers, px, before, adj, start, hold=()):
    """the swap log of a saved portfolio with what each side did AFTER the swap (owner 2026-11-07, round 15: "keep the track of the
    old one as well — what changed — and track the new one"): the price at the swap day's close (or the last close before it) and now,
    split / bonus adjusted. out_ret = what the stock that left would have done if kept; in_ret = what the new one did."""
    log = (vers[-1].get("log") or []) if vers else []
    if not log:
        return []
    def at(sym, d):                                        # the close on / before d
        days = [x for x in (px.get(sym) or {}) if x <= d]
        return px[sym][max(days)] if days else before.get(sym)
    def now(sym):
        p = px.get(sym) or {}
        return (p[max(p)], max(p)) if p else (before.get(sym), None)
    def ret(sym, d):
        p0 = at(sym, d)
        p1, last = now(sym)
        if not p0 or not p1:
            return None, p0, p1
        f = 1.0
        for dd, fs in adj.items():                         # a split / bonus after the swap: more shares, same money
            if d < dd and (last is None or dd <= last) and sym in fs:
                f *= fs[sym]
        return round((p1 * f / p0 - 1) * 100, 2), p0, p1
    out = []
    hs = {h["s"]: h for h in hold}
    for e in log:
        d = max(date.fromisoformat(e["d"]), start)
        o, i = e.get("out"), e.get("in")
        o_r, o0, o1 = ret(o["s"], d) if o else (None, None, None)
        i_r, i0, i1 = ret(i["s"], d) if i else (None, None, None)
        # round 17 (owner: "the amount is missing for the old and the new stock"): the money in each — the old one: what it was bought for
        # and what it was sold for (the money that moved), and what that money would be now had it stayed; the new one: quantity, what
        # it cost and what it is worth now
        ho, hi = hs.get(o["s"]) if o else None, hs.get(i["s"]) if i else None
        sold = round(ho["cost"] + ho["gain"], 2) if ho and not ho["held"] else None
        om = o and {**o, "then": o0, "now": o1, "ret": o_r, "invested": ho and ho["cost"], "sold_for": sold, "qty": ho and ho.get("bought"),
                    "kept_value": round(sold * (1 + o_r / 100), 2) if sold is not None and o_r is not None else None}
        im = i and {**i, "then": i0, "now": i1, "ret": i_r, "qty": hi and hi["qty"], "invested": hi and hi["cost"], "value": hi and hi["value"],
                    "gain": hi and hi["gain"], "avg": hi and hi["avg"]}
        out.append({"d": e["d"], "out": om, "in": im, "edge": round(i_r - o_r, 2) if o_r is not None and i_r is not None else None})
    return out[::-1]                                       # newest first


def _load(c, syms, start):
    ph = c.execute("SELECT sym, d, close FROM price_hist WHERE sym = ANY(%s) AND d >= %s ORDER BY d", (syms, start)).fetchall()
    pa = c.execute("SELECT sym, d, factor FROM price_adj WHERE sym = ANY(%s) AND d > %s", (syms, start)).fetchall()
    before = c.execute("SELECT DISTINCT ON (sym) sym, close FROM price_hist WHERE sym = ANY(%s) AND d < %s ORDER BY sym, d DESC",
                       (syms, start)).fetchall()
    return ph, pa, {r["sym"]: r["close"] for r in before}


def _price_day_on(c, d):
    """the last price day on or before d (d itself when there is none yet)"""
    r = c.execute("SELECT max(d) AS d FROM price_hist WHERE d <= %s", (d,)).fetchone()
    return r["d"] if r and r["d"] else d


def last_day(c):
    r = c.execute("SELECT max(d) AS d FROM price_hist WHERE sym = %s", (BENCH,)).fetchone()
    return r["d"] if r and r["d"] else c.execute("SELECT max(d) AS d FROM price_hist").fetchone()["d"]


def _group(h):
    return "ETF" if h.get("kind") == "etf" else (h.get("cap") or "Other")


def _thin(idx):
    if len(idx) <= MAX_POINTS:
        return idx
    step = math.ceil(len(idx) / MAX_POINTS)
    out = idx[::step]
    return out if out[-1] == idx[-1] else out + [idx[-1]]


def track(c, row, sym=None, stepup=None):
    """stepup: None = the saved SIP's own step-up %, else the % chosen on the tracking page (0 = off)"""
    """the tracking of one saved portfolio (row: id, kind, inputs, holdings, versions, saved_on) — see the module doc"""
    vers = versions_of(row)
    syms = _sym_set(vers)
    last = last_day(c)
    # Round 17 (owner 2026-11-07: "I couldn't see any data after saving"): a portfolio saved when no price of that day exists yet — a
    # weekend, a holiday, the morning before the first update — was bought at the price the customer saw: the LAST CLOSE on or before
    # the save day. So the tracking starts there (it used to start after it and stayed empty until the next trading day), and every
    # later change (a swap on a Saturday) takes effect at the last close on or before its own day — the same prices forever after.
    save0 = date.fromisoformat(vers[0]["d"])
    start = _price_day_on(c, save0)
    key = (row["id"], str(last), hash(json.dumps([vers, row.get("inputs")], sort_keys=True, default=str)), stepup, sym)
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    ph, pa, before = _load(c, syms + [BENCH], start)
    dates = sorted({r["d"] for r in ph})
    px = {}
    for r in ph:
        px.setdefault(r["sym"], {})[r["d"]] = r["close"]
    adj = {}
    for r in pa:
        adj.setdefault(r["d"], {})[r["sym"]] = r["factor"]
    if not dates:
        out = {"dates": [], "value": [], "put_in": [], "bench": [], "holdings": [], "groups": [], "metrics": None, "splits": [],
               "start": start.isoformat(), "swaps": _swaps(vers, px, before, adj, start)}
        return _remember(key, out)
    kind = row["kind"]
    inp = row.get("inputs") or {}
    freq = inp.get("freq", "month")
    step = (inp.get("stepup") or 0) if stepup is None else max(0, min(50, int(stepup)))
    eff = lambda vd: max((x for x in dates if x <= vd), default=vd)          # a change counts at the last close on / before its day
    vdates = [(eff(date.fromisoformat(v["d"])), v["holdings"]) for v in vers]
    last_close = dict(before)
    qty, cost, proceeds, meta, bought = {}, {}, {}, {}, {}
    cash, put_in, bq = 0.0, 0.0, 0.0                       # bq = benchmark units
    bucket = {}                                            # SIP: rupees set aside per holding, waiting for a whole unit
    cur = None
    inst_i, last_period = -1, None
    out_v, out_p, out_b, splits = [], [], [], []
    held_from = {}

    def price(s):
        return last_close.get(s)

    def buy(s, units):
        p = price(s)
        if not p or units <= 0:
            return 0.0
        qty[s] = qty.get(s, 0) + units
        bought[s] = bought.get(s, 0) + units
        cost[s] = cost.get(s, 0) + units * p
        return units * p

    for d in dates:
        for s, p in ((s, px[s][d]) for s in px if d in px[s]):
            last_close[s] = p
        for s, f in (adj.get(d) or {}).items():           # a split / bonus: more shares, same money
            if qty.get(s):
                qty[s] *= f
                splits.append({"s": s, "d": d.isoformat(), "factor": f})
        bp = price(BENCH)
        # a new version on this day (the first one starts the portfolio)
        # a change made after the last price day (a weekend, or before today's prices arrive) takes effect at that last
        # close, so the new holding shows at once instead of vanishing until the next price day
        while vdates and (vdates[0][0] <= d or d == dates[-1]):
            vd, hold = vdates.pop(0)
            new = {h["s"]: h for h in hold}
            if cur is None:
                cur = new
                for h in hold:
                    meta[h["s"]] = h
                    held_from.setdefault(h["s"], d.isoformat())
                if kind in ("analyser", "builder"):
                    for h in hold:
                        spent = buy(h["s"], 1 if kind == "analyser" else (h.get("qty") or h.get("units") or 0))
                        put_in += spent
                    if bp:
                        bq = put_in / bp
            else:
                gone = [s for s in cur if s not in new]
                came = [s for s in new if s not in cur]
                for s in gone:
                    p = price(s) or 0
                    proceeds[s] = proceeds.get(s, 0) + qty.get(s, 0) * p
                    cash += qty.get(s, 0) * p + bucket.pop(s, 0.0)
                    qty[s] = 0
                if came and kind == "analyser":                # 1 share of each new stock; any shortfall is new money
                    for s in came:
                        spent = buy(s, 1)
                        extra = max(0.0, spent - cash)
                        cash = max(0.0, cash - spent)
                        put_in += extra
                        if bp and extra:
                            bq += extra / bp
                elif came:                                     # builder / SIP: the money of the holdings sold buys the new ones now
                    each = cash / len(came)
                    for s in came:
                        p = price(s)
                        if p:
                            cash -= buy(s, math.floor(each / p))
                for s in came:
                    meta[s] = new[s]
                    held_from.setdefault(s, d.isoformat())
                cur = new
        if kind in ("sip", "msip") and cur is not None:
            pdd = max(d, save0)                            # the first instalment belongs to the save day's month (saved on a Sunday 1st
            period = (pdd.year, (pdd.month - 1) // 3) if freq == "quarter" else (pdd.year, pdd.month)   # = bought at Friday's close, still that month's)
            if period != last_period:
                last_period = period
                inst_i += 1
                years = (inst_i // (4 if freq == "quarter" else 12))
                f = (1 + step / 100) ** years
                new_money = 0.0
                for h in cur.values():
                    add = (h.get("amt") or h.get("slice") or 0) * f   # the planned rupees of this holding
                    bucket[h["s"]] = bucket.get(h["s"], 0.0) + add
                    new_money += add
                    p = price(h["s"])
                    if p:
                        u = math.floor(bucket[h["s"]] / p + 1e-9)
                        bucket[h["s"]] -= buy(h["s"], u)
                if cash > 0:                                  # money from holdings that left lowers this instalment
                    use = min(cash, new_money)
                    cash -= use
                    new_money -= use
                put_in += new_money
                if bp:
                    bq += new_money / bp
        val = cash + sum(bucket.values()) + sum(q * (price(s) or 0) for s, q in qty.items() if q)
        out_v.append(round(val, 2))
        out_p.append(round(put_in, 2))
        out_b.append(round(bq * bp, 2) if bp else None)

    idx = _thin(list(range(len(dates))))
    value_now, invested = out_v[-1], out_p[-1]
    gain = value_now - invested
    # holdings: money in, value now (or money out when it left), gain
    hold = []
    d_last, d_prev = dates[-1], (dates[-2] if len(dates) > 1 else None)
    for s in syms:
        if s not in cost:
            continue
        q = qty.get(s, 0)
        ltp = price(s) or 0
        v_now = q * ltp
        g = v_now + proceeds.get(s, 0) - cost[s]
        m = meta.get(s, {})
        prev = px.get(s, {}).get(d_prev) if d_prev else None
        f_day = (adj.get(d_last) or {}).get(s, 1)
        day = round((ltp * f_day / prev - 1) * 100, 2) if prev and ltp and d_last in px.get(s, {}) else None
        hold.append({"s": s, "n": m.get("n"), "kind": m.get("kind"), "role": m.get("role"), "grp": _group(m), "held": bool(q), "from": held_from.get(s),
                     "cost": round(cost[s], 2), "value": round(v_now, 2), "gain": round(g, 2), "ret": round(g / cost[s] * 100, 2) if cost[s] else None,
                     "qty": round(q, 4), "bought": round(bought.get(s, 0), 4), "avg": round(cost[s] / q, 2) if q else None, "ltp": round(ltp, 2) if ltp else None, "day": day,
                     "day_gain": round(v_now * (1 - 1 / (1 + day / 100)), 2) if day is not None and q else None})
    for s_, h0 in (cur or {}).items():                  # SIP holdings still collecting money for their first unit
        if s_ in cost:
            continue
        ltp = price(s_)
        hold.append({"s": s_, "n": h0.get("n"), "kind": h0.get("kind"), "role": h0.get("role"), "grp": _group(h0), "held": True,
                     "from": held_from.get(s_), "cost": 0.0, "value": 0.0, "gain": 0.0, "ret": None, "qty": 0, "avg": None,
                     "ltp": round(ltp, 2) if ltp else None, "day": None, "day_gain": None, "waiting": round(bucket.get(s_, 0.0), 2)})
    for h in hold:
        if h["s"] in bucket and h.get("held"):
            h["waiting"] = round(bucket[h["s"]], 2)
    hold.sort(key=lambda h: -(h["gain"]))
    groups = {}
    for h in hold:
        gr = groups.setdefault(h["grp"], {"k": h["grp"], "value": 0.0, "gain": 0.0, "n": 0})
        gr["value"] += h["value"]; gr["gain"] += h["gain"]; gr["n"] += 1 if h["held"] else 0
    tot_v = sum(g["value"] for g in groups.values()) or 1
    order = {"Large": 0, "Mid": 1, "Small": 2, "ETF": 3}
    groups = sorted(({**g, "value": round(g["value"], 2), "gain": round(g["gain"], 2), "share": round(g["value"] / tot_v * 100, 1)} for g in groups.values()),
                    key=lambda g: order.get(g["k"], 9))
    # biggest fall from a peak, on value per rupee put in (fair for a SIP that keeps adding money)
    peak, dd = 0.0, 0.0
    for v, p in zip(out_v, out_p):
        if p:
            x = v / p
            peak = max(peak, x)
            dd = min(dd, x / peak - 1) if peak else dd
    held = [h for h in hold if h["ret"] is not None]
    bench_now = out_b[-1]
    metrics = {"value": value_now, "invested": invested, "gain": round(gain, 2), "ret": round(gain / invested * 100, 2) if invested else None,
               "bench_ret": round((bench_now - invested) / invested * 100, 2) if invested and bench_now is not None else None,
               "drawdown": round(dd * 100, 2), "days": len(dates), "changes": len(vers) - 1,
               "best": max(held, key=lambda h: h["ret"])["s"] if held else None, "worst": min(held, key=lambda h: h["ret"])["s"] if held else None,
               "cash": round(cash + sum(bucket.values()), 2), "stepup": step,
               "day_gain": round(out_v[-1] - out_v[-2] - (out_p[-1] - out_p[-2]), 2) if len(out_v) > 1 else None,
               "day_ret": round((out_v[-1] - (out_p[-1] - out_p[-2])) / out_v[-2] * 100 - 100, 2) if len(out_v) > 1 and out_v[-2] else None,
               "last": dates[-1].isoformat(), "prev": dates[-2].isoformat() if len(dates) > 1 else None}
    out = {"start": start.isoformat(), "dates": [dates[i].isoformat() for i in idx], "value": [out_v[i] for i in idx],
           "put_in": [out_p[i] for i in idx], "bench": [out_b[i] for i in idx], "holdings": hold, "groups": groups,
           "metrics": metrics, "splits": splits, "kind": kind, "swaps": _swaps(vers, px, before, adj, start, hold)}
    if sym and sym in syms:                                   # one stock's own line: % since it joined, split-adjusted
        f, base, line = 1.0, None, []
        for d in dates:
            f *= (adj.get(d) or {}).get(sym, 1)
            p = px.get(sym, {}).get(d)
            if p is None or (held_from.get(sym) and d.isoformat() < held_from[sym]):
                line.append(None); continue
            x = p * f
            base = base or x
            line.append(round((x / base - 1) * 100, 2))
        out["sym"] = {"s": sym, "ret": [line[i] for i in idx]}
    return _remember(key, out)


def _remember(key, out):
    _cache[key] = out
    while len(_cache) > CACHE_MAX:
        _cache.popitem(last=False)
    return out


def spark(c, row):
    """list cards: return % now and a 30-point line (from the cached full tracking)"""
    t = track(c, row)
    m = t.get("metrics")
    vals = t["value"]
    pts = vals[-30:] if len(vals) > 30 else vals
    return {"ret": m["ret"] if m else None, "gain": m["gain"] if m else None, "value": m["value"] if m else None, "spark": pts}
