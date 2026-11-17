"""
Admin → Scoring (round 24, owner 2026-11-17: "the zone and regime scores inside the admin panel … any number of scenarios … the default,
and the option to change it … apply it to the old data as well, not only the upcoming data … the most dynamic architecture … optimise the
code, the DB and the RAM").

  profiles   named sets of the strength engine's numbers (zone_engine.DEFAULT_PARAMS); id 1 = the built-in Default; exactly one is live.
             Drafts can be edited; the live one and the ones that were live are kept as they were (duplicate to change them).
  factors    what the engine needs of every stock / ETF of a collection (zone_engine.factors + the monthly regime), stored ONCE per
             collection in score_factors (≈ 100–200 KB gz vs ≈ 6 MB for the raw collection).
  rescoring  a stored output (a past day, a publish, the stock states) is rescored from its factors: the result fields are patched in
             place (zv / rz of each stock; st / c / tf of each ETF), never the raw collection again — one day at a time, a few MB.
  compare    a draft against the live set on the latest stored days, from the factors: colour counts per day, the colour changes, the
             biggest movers, the strength spread, and a back-test — how each colour group did afterwards (30 / 90 days) under each set.
The live set is read by every process that runs the engine (sync: one tiny query at most every few seconds). Applying a set: the
latest publish is rescored at once (customers see it within seconds), the worker rescores every other stored output in the background
(tick), collections without factors get them the heavy way once (publish.build_history), the stock detail rows of the last 14 days are
rebuilt by the worker's history loop. No alerts are sent by a rescore. Owner only (Admin).
"""
import gzip
import hashlib
import json
import threading
import time
from datetime import timedelta

from . import db
from . import zone_engine as ze

SCHEMA = 2                                   # the factor format (2 = + the zone ladder inputs, round 25)
SYNC_EVERY = 5.0                             # seconds between two checks of the live set
DAYS_MAX = 120                               # compare: the most stored days at once
HORIZONS = (30, 90)                          # back-test: days later
MOVERS = 20
_live = {"ver": None, "at": 0.0}
_cmp = {}                                    # compare results by key (the last few)
_cmp_lock = threading.Lock()

# the Period table of the review sheet: representative trend (T) and price (P) readings → a period strength
T_ROWS = (("Uptrend", 0.75), ("Turning up", 0.325), ("Sideways", 0.0), ("Turning down", -0.325), ("Downtrend", -0.75))
P_COLS = (("Above its range", 0.925), ("Near the top", 0.625), ("Upper part", 0.325), ("Lower part", -0.325), ("Near the bottom", -0.625),
          ("Below its range", -0.925))


def _gz(o):
    return gzip.compress(json.dumps(o, separators=(",", ":"), ensure_ascii=False).encode(), compresslevel=6)


def _ungz(b):
    return json.loads(gzip.decompress(bytes(b)))


# ── the live set ──
def seed(c):
    """the built-in Default (id 1) = today's numbers, live when nothing else is (idempotent; called by init_db)"""
    if not c.execute("SELECT 1 FROM score_profiles WHERE id = 1").fetchone():
        c.execute("INSERT INTO score_profiles (id, name, params, status, builtin, note, created_by, applied_at, applied_by) "
                  "VALUES (1, 'Default', %s, CASE WHEN EXISTS (SELECT 1 FROM score_profiles WHERE status = 'active') THEN 'archived' ELSE 'active' END, "
                  "true, 'The owner''s numbers of the Zone Engine Review (Oct 2026). Read only — duplicate it to change it.', 'system', now(), 'system')",
                  (json.dumps(ze.DEFAULT_PARAMS),))
        c.execute("SELECT setval(pg_get_serial_sequence('score_profiles', 'id'), GREATEST((SELECT max(id) FROM score_profiles), 1))")
    if not c.execute("SELECT 1 FROM score_profiles WHERE status = 'active'").fetchone():
        c.execute("UPDATE score_profiles SET status = 'active' WHERE id = 1")
    # round 25: the built-in Default carries every key of today's parameter set (the model = default; same numbers as before)
    c.execute("UPDATE score_profiles SET params = %s WHERE id = 1 AND builtin AND NOT (params ? 'model')", (json.dumps(ze.DEFAULT_PARAMS),))


def sync(force=False):
    """make the live set the one this process uses → its version (the profile id)"""
    now = time.monotonic()
    if not force and _live["ver"] is not None and now - _live["at"] < SYNC_EVERY:
        return _live["ver"]
    try:
        with db.pool.connection() as c:
            r = c.execute("SELECT id, params FROM score_profiles WHERE status = 'active'").fetchone()
    except Exception:                                    # noqa: BLE001 — before init_db: the defaults
        r = None
    _live["at"] = now
    ver = r["id"] if r else 1
    if ver != _live["ver"]:
        ze.set_params(ze.check_params(r["params"]) if r else ze.DEFAULT_PARAMS)
        _live["ver"] = ver
    return ver


def cfg(P=None):
    """what the customer app needs of the live set (published inside every view): the colour cut and the period weights"""
    P = P or ze.live()
    return {"ver": _live["ver"] or 1, "cut": P.cut, "w": dict(P.tf_w), "q": P.q_guard}


def period_table(P=None):
    """the review sheet's Period table with a parameter set: 5 trends × 6 price places → the period strength"""
    P = P or ze.live()
    pw = 0.0 if P.model == "ladder" else P.pos_w             # the zone ladder: where the price sits earns nothing
    return [{"trend": tl, "cells": [round(max(-100.0, min(100.0, 100 * (P.trend_w * t + pw * p)))) for _, p in P_COLS]} for tl, t in T_ROWS]


# ── profiles ──
PROFILE_COLS = "id, name, params, status, builtin, note, created_by, created_at, updated_at, applied_at, applied_by, retired_at"


def _out(r):
    return {**{k: r[k] for k in ("id", "name", "params", "status", "builtin", "note", "created_by", "applied_by")},
            **{k: r[k].isoformat() if r[k] else None for k in ("created_at", "updated_at", "applied_at", "retired_at")}}


def profiles():
    with db.pool.connection() as c:
        return [_out(r) for r in c.execute(f"SELECT {PROFILE_COLS} FROM score_profiles ORDER BY (status = 'active') DESC, builtin DESC, "
                                           "updated_at DESC").fetchall()]


def _name(name):
    n = " ".join(str(name or "").split())[:60]
    if not n:
        raise ValueError("Give the score set a name")
    return n


def create(name, params, by, note=None):
    p = ze.check_params(params)
    with db.pool.connection() as c:
        if c.execute("SELECT count(*) AS n FROM score_profiles").fetchone()["n"] >= 200:
            raise ValueError("Up to 200 score sets — delete an old draft first")
        r = c.execute(f"INSERT INTO score_profiles (name, params, note, created_by) VALUES (%s, %s, %s, %s) RETURNING {PROFILE_COLS}",
                      (_name(name), json.dumps(p), (note or "")[:300] or None, by)).fetchone()
    return _out(r)


def _draft(c, pid):
    r = c.execute("SELECT id, status, builtin FROM score_profiles WHERE id = %s FOR UPDATE", (pid,)).fetchone()
    if not r:
        raise LookupError("That score set was not found")
    if r["builtin"] or r["status"] != "draft":
        raise PermissionError("This score set was live (or is the built-in Default) — it stays as it was. Duplicate it to change it.")
    return r


def update(pid, name=None, params=None, note=None):
    with db.pool.connection() as c:
        _draft(c, pid)
        if name is not None:
            c.execute("UPDATE score_profiles SET name = %s, updated_at = now() WHERE id = %s", (_name(name), pid))
        if params is not None:
            c.execute("UPDATE score_profiles SET params = %s, updated_at = now() WHERE id = %s", (json.dumps(ze.check_params(params)), pid))
        if note is not None:
            c.execute("UPDATE score_profiles SET note = %s, updated_at = now() WHERE id = %s", (note[:300] or None, pid))
        return _out(c.execute(f"SELECT {PROFILE_COLS} FROM score_profiles WHERE id = %s", (pid,)).fetchone())


def delete(pid):
    with db.pool.connection() as c:
        _draft(c, pid)
        c.execute("DELETE FROM score_profiles WHERE id = %s", (pid,))


def apply(pid, by):
    """make a score set live (any but the live one) → (new, old); the outputs are rescored after this (rescore_latest + the worker)"""
    with db.pool.connection() as c:
        r = c.execute("SELECT id, name, status FROM score_profiles WHERE id = %s FOR UPDATE", (pid,)).fetchone()
        if not r:
            raise LookupError("That score set was not found")
        if r["status"] == "active":
            raise ValueError("This score set is already live")
        old = c.execute("SELECT id, name FROM score_profiles WHERE status = 'active' FOR UPDATE").fetchone()
        c.execute("UPDATE score_profiles SET status = 'archived', retired_at = now() WHERE status = 'active'")
        c.execute("UPDATE score_profiles SET status = 'active', applied_at = now(), applied_by = %s WHERE id = %s", (by, pid))
    sync(force=True)
    return r, old


# ── factors ──
def _factors_of(sheets):
    from .publish import regimes                         # late: publish imports this module
    F, reg = ze.factors_all(sheets), regimes(sheets)
    return {s: [(reg.get(s) or (None, None, None))[2], f["M"], f["Q"], f["Y"], f.get("Z")] for s, f in F.items()}


def store_factors(snapshot_id, sheets, kind="stock"):
    """the factors of one collection (its stocks, or its ETF bundle), from sheets already in memory"""
    data = _factors_of(sheets) if sheets else {}
    with db.pool.connection() as c:
        c.execute("INSERT INTO score_factors (snapshot_id, kind, schema, n, data_gz) VALUES (%s, %s, %s, %s, %s) "
                  "ON CONFLICT (snapshot_id, kind) DO UPDATE SET schema = EXCLUDED.schema, n = EXCLUDED.n, data_gz = EXCLUDED.data_gz, built_at = now()",
                  (snapshot_id, kind, SCHEMA, len(data), _gz(data)))
    return len(data)


def store_etf_factors(snapshot_id):
    from .etf import bundle_of
    b = bundle_of(snapshot_id)
    return store_factors(snapshot_id, b, "etf") if b else 0


def load(snapshot_id, kind="stock"):
    """{symbol: [monthly regime, M, Q, Y]} of one collection (None = not extracted yet)"""
    with db.pool.connection() as c:
        r = c.execute("SELECT schema, data_gz FROM score_factors WHERE snapshot_id = %s AND kind = %s", (snapshot_id, kind)).fetchone()
    return _ungz(r["data_gz"]) if r and r["schema"] == SCHEMA else None


def extract(snapshot_id):
    """the heavy way, once per old collection: open the raw collection, keep its factors (stocks + ETFs), let the raw go"""
    with db.pool.connection() as c:
        g = c.execute("SELECT data_gz FROM snapshots WHERE id = %s", (snapshot_id,)).fetchone()
    if not g:
        return 0
    sheets = _ungz(g["data_gz"])
    n = store_factors(snapshot_id, sheets, "stock")
    del sheets, g
    store_etf_factors(snapshot_id)
    return n


def missing_factors(limit=1):
    with db.pool.connection() as c:
        return [r["id"] for r in c.execute("SELECT s.id FROM snapshots s WHERE NOT EXISTS (SELECT 1 FROM score_factors f WHERE f.snapshot_id = s.id "
                                           "AND f.kind = 'stock' AND f.schema = %s) ORDER BY s.taken_at DESC LIMIT %s", (SCHEMA, limit)).fetchall()]


# ── rescoring ──
def zv_of(x, P):
    """(result after the regime, held timeframes) of one factor row"""
    return ze.apply_regime(ze.score({"M": x[1], "Q": x[2], "Y": x[3], "Z": x[4] if len(x) > 4 else None}, P), x[0], P)


def patch_stocks(payload, F, P):
    for s in payload.get("stocks", []):
        x = F.get(s.get("s"))
        if x is None:
            continue
        v, held = zv_of(x, P)
        if v:
            s["zv"] = v
        else:
            s.pop("zv", None)
        if held:
            s["rz"] = held
        else:
            s.pop("rz", None)
    payload["cfg"] = cfg(P)
    return payload


def patch_etfs(ep, E, P):
    for e in ep.get("etfs", []):
        x = E.get(e.get("s"))
        if x is None:
            continue
        v, _ = zv_of(x, P)
        e["st"], e["c"] = (v[1], v[0]) if v else (None, None)
        e["tf"] = [v[2 + i][2] if v and v[2 + i] else None for i in range(3)]
    return ep


STATE_COLS = ("m_state", "q_state", "y_state", "m_st", "q_st", "y_st", "m_nr", "q_nr", "y_nr", "strength", "colour")


def _fingerprint(payload, key, fields):
    return [tuple(x.get(f) for f in fields) for x in payload.get(key, [])]


def rescore(snapshot_id, P=None, ver=None):
    """rescore every stored output of one collection from its factors → what changed, or None (no factors: the heavy way). Writes only
    what really changed: a stored view is rewritten only when a result in it moved, a stock state only when its numbers moved; the set
    that built them is kept in one small row (score_marks) / column — light on the database."""
    P, ver = P or ze.live(), ver or sync()
    F = load(snapshot_id, "stock")
    if F is None:
        return None
    E = load(snapshot_id, "etf") or {}
    from .publish import _state_code
    done = {"history": 0, "published": 0, "states": 0}

    def redo(d_gz, e_gz):
        """(new stock view gz or None = unchanged, new ETF view gz or None)"""
        d = _ungz(d_gz)
        before = (_fingerprint(d, "stocks", ("zv", "rz")), d.get("cfg"))
        patch_stocks(d, F, P)
        nd = _gz(d) if (_fingerprint(d, "stocks", ("zv", "rz")), d.get("cfg")) != before else None
        ne = None
        if e_gz and E:
            e = _ungz(e_gz)
            eb = _fingerprint(e, "etfs", ("st", "c", "tf"))
            patch_etfs(e, E, P)
            ne = _gz(e) if _fingerprint(e, "etfs", ("st", "c", "tf")) != eb else None
        return nd, ne

    with db.pool.connection() as c:
        h = c.execute("SELECT data_gz, etf_gz, score_ver FROM customer_history WHERE snapshot_id = %s", (snapshot_id,)).fetchone()
        if h and h["score_ver"] != ver:
            d, e = redo(h["data_gz"], h["etf_gz"])
            c.execute("UPDATE customer_history SET data_gz = COALESCE(%s, data_gz), etf_gz = COALESCE(%s, etf_gz), score_ver = %s WHERE snapshot_id = %s",
                      (d, e, ver, snapshot_id))
            done["history"] = 1 if d or e else 0
            del d, e
        del h
        for pid in [r["id"] for r in c.execute("SELECT id FROM published WHERE snapshot_id = %s AND score_ver <> %s", (snapshot_id, ver)).fetchall()]:
            r = c.execute("SELECT data_gz, etf_gz FROM published WHERE id = %s", (pid,)).fetchone()
            d, e = redo(r["data_gz"], r["etf_gz"])
            c.execute("UPDATE published SET data_gz = COALESCE(%s, data_gz), etf_gz = COALESCE(%s, etf_gz), score_ver = %s, "
                      "rev = rev + CASE WHEN %s THEN 1 ELSE 0 END WHERE id = %s", (d, e, ver, bool(d or e), pid))
            done["published"] += 1
            del r, d, e
        mark = c.execute("SELECT ver FROM score_marks WHERE snapshot_id = %s", (snapshot_id,)).fetchone()
        if (mark["ver"] if mark else 1) != ver:
            rows = []
            for r in c.execute(f"SELECT symbol, {', '.join(STATE_COLS)} FROM stock_states WHERE snapshot_id = %s", (snapshot_id,)).fetchall():
                x = F.get(r["symbol"])
                if x is None:
                    continue
                v, _ = zv_of(x, P)
                per = (v or [None, None, None, None, None])[2:5]
                new = (*[_state_code(t) for t in per], *[(t[2] if t else None) for t in per], *[(t[5] if t and len(t) > 5 else None) for t in per],
                       v[1] if v else None, v[0] if v else None)
                if new != tuple(r[k] for k in STATE_COLS):
                    rows.append((*new, snapshot_id, r["symbol"]))
            if rows:
                with c.cursor() as cur:
                    cur.executemany("UPDATE stock_states SET m_state = %s, q_state = %s, y_state = %s, m_st = %s, q_st = %s, y_st = %s, m_nr = %s, "
                                    "q_nr = %s, y_nr = %s, strength = %s, colour = %s WHERE snapshot_id = %s AND symbol = %s", rows)
            c.execute("INSERT INTO score_marks (snapshot_id, ver) VALUES (%s, %s) ON CONFLICT (snapshot_id) DO UPDATE SET ver = EXCLUDED.ver, at = now()",
                      (snapshot_id, ver))
            done["states"] = len(rows)
    return done


def stale(ver, limit=10):
    """collections WITH factors whose stored outputs were built with another set — the latest publish first, then newest first"""
    with db.pool.connection() as c:
        return [r["snapshot_id"] for r in c.execute(
            "SELECT f.snapshot_id FROM score_factors f JOIN snapshots s ON s.id = f.snapshot_id WHERE f.kind = 'stock' AND f.schema = %s AND ("
            "  EXISTS (SELECT 1 FROM customer_history h WHERE h.snapshot_id = f.snapshot_id AND h.score_ver <> %s)"
            "  OR EXISTS (SELECT 1 FROM published p WHERE p.snapshot_id = f.snapshot_id AND p.score_ver <> %s)"
            "  OR (EXISTS (SELECT 1 FROM stock_states t WHERE t.snapshot_id = f.snapshot_id) AND "
            "      coalesce((SELECT m.ver FROM score_marks m WHERE m.snapshot_id = f.snapshot_id), 1) <> %s)) "
            "ORDER BY EXISTS (SELECT 1 FROM published p WHERE p.snapshot_id = f.snapshot_id) DESC, s.taken_at DESC LIMIT %s",
            (SCHEMA, ver, ver, ver, limit)).fetchall()]


def rescore_latest():
    """right after Apply: the latest publish (its collection) — customers see the new scores within seconds"""
    ver = sync(force=True)
    with db.pool.connection() as c:
        r = c.execute("SELECT snapshot_id FROM published ORDER BY id DESC LIMIT 1").fetchone()
    return rescore(r["snapshot_id"], ze.live(), ver) if r and r["snapshot_id"] else None


def tick(limit=10, budget=20.0):
    """the worker's idle tick: up to `limit` collections rescored from their factors (fast) → how many"""
    ver = sync()
    t0, n = time.monotonic(), 0
    for sid in stale(ver, limit):
        if rescore(sid, ze.live(), ver) is not None:
            n += 1
        if time.monotonic() - t0 > budget:
            break
    return n


def status():
    ver = sync()
    with db.pool.connection() as c:
        h = c.execute("SELECT count(*) AS n, count(*) FILTER (WHERE score_ver = %s) AS ok FROM customer_history", (ver,)).fetchone()
        st = c.execute("SELECT count(*) AS n, count(*) FILTER (WHERE coalesce(m.ver, 1) <> %s) AS old FROM (SELECT DISTINCT snapshot_id FROM stock_states) t "
                       "LEFT JOIN score_marks m ON m.snapshot_id = t.snapshot_id", (ver,)).fetchone()
        p = c.execute("SELECT id, score_ver, rev FROM published ORDER BY id DESC LIMIT 1").fetchone()
        f = c.execute("SELECT (SELECT count(*) FROM snapshots) AS snaps, count(*) FILTER (WHERE kind = 'stock' AND schema = %s) AS stock, "
                      "count(*) FILTER (WHERE kind = 'etf') AS etf, coalesce(sum(length(data_gz)), 0) AS bytes FROM score_factors", (SCHEMA,)).fetchone()
        d = c.execute("SELECT count(*) AS n, count(*) FILTER (WHERE score_ver = %s) AS ok FROM stock_detail WHERE symbol = '~meta'", (ver,)).fetchone()
    return {"ver": ver, "history": {"days": h["n"], "done": h["ok"]}, "states": {"collections": st["n"], "old": st["old"]},
            "published": {"id": p["id"], "done": p["score_ver"] == ver, "rev": p["rev"]} if p else None,
            "factors": {"collections": f["snaps"], "stock": f["stock"], "etf": f["etf"], "bytes": f["bytes"]},
            "detail": {"days": d["n"], "done": d["ok"]},
            "pending": max(0, h["n"] - h["ok"]) + st["old"] + (0 if not p or p["score_ver"] == ver else 1)}


# ── compare a set with the live one ──
def _forward(c, snap, horizon, base):
    """symbol → return % from this collection's price to the first stored price ≥ horizon days later (only when that day has come)"""
    t0 = snap["taken_at"] + timedelta(days=horizon)
    fut = {r["symbol"]: r["price"] for r in c.execute(
        "SELECT DISTINCT ON (symbol) symbol, price FROM stock_states WHERE taken_at >= %s AND taken_at < %s AND price > 0 ORDER BY symbol, taken_at",
        (t0, t0 + timedelta(days=21))).fetchall()}
    return {s: (fut[s] / p - 1) * 100 for s, p in base.items() if s in fut and p}


def _explain(x, Pc, Pn):
    """one stock under both sets: per period [trend code, price code, mother candle n, place] + the period strengths, then the totals"""
    a, _ = zv_of(x, Pc)
    b, _ = zv_of(x, Pn)
    per = []
    for i, tf in enumerate("MQY"):
        ta, tb = (a[2 + i] if a else None), (b[2 + i] if b else None)
        t = ta or tb
        per.append({"tf": tf, "trend": t[0] if t else None, "pos": t[1] if t else None, "nr": t[5] if t else 0,
                    "place": ze.NR_PLACES[t[6]] if t else None, "cur": ta[2] if ta else None, "new": tb[2] if tb else None})
    Z = x[4] if len(x) > 4 else None
    return {"cur": a[1] if a else None, "new": b[1] if b else None, "cur_c": a[0] if a else None, "new_c": b[0] if b else None, "per": per,
            "ladder": {"cur": ze.ladder(Z, Pc)[1] if Pc.model == "ladder" else None, "new": ze.ladder(Z, Pn)[1] if Pn.model == "ladder" else None}}


def compare(params, days=30):
    """a parameter set (a draft) against the live one on the latest `days` stored collections — totals only (low memory)"""
    Pn = ze.Params(ze.check_params(params))
    ver = sync()
    Pc = ze.live()
    days = max(1, min(DAYS_MAX, int(days)))
    with db.pool.connection() as c:
        snaps = c.execute("SELECT s.id, s.taken_at, s.trade_date FROM snapshots s JOIN score_factors f ON f.snapshot_id = s.id AND f.kind = 'stock' "
                          "AND f.schema = %s ORDER BY s.taken_at DESC LIMIT %s", (SCHEMA, days)).fetchall()
        mark = c.execute("SELECT count(*) AS n, max(built_at) AS t FROM score_factors").fetchone()
    key = hashlib.sha1(json.dumps([ze.check_params(params), ver, days, mark["n"], str(mark["t"])], sort_keys=True).encode()).hexdigest()
    if key in _cmp:
        return _cmp[key]
    if not _cmp_lock.acquire(blocking=False):
        raise RuntimeError("A comparison is already running — try again in a moment")
    try:
        series, trans, hist, movers, latest = [], [[0] * 3 for _ in range(3)], {"cur": [0] * 20, "new": [0] * 20}, [], None
        acc = {h: {side: {k: [0, 0.0, 0.0, 0] for k in (1, 0, -1)} for side in ("cur", "new")} for h in HORIZONS}   # n, Σret, Σexcess, beat
        with db.pool.connection() as c:
            for i, sn in enumerate(snaps):
                F = load(sn["id"], "stock") or {}
                res = {}
                for s, x in F.items():
                    a, _ = zv_of(x, Pc)
                    b, _ = zv_of(x, Pn)
                    if a or b:
                        res[s] = (a, b)
                cnt = {"cur": {1: 0, 0: 0, -1: 0}, "new": {1: 0, 0: 0, -1: 0}}
                for a, b in res.values():
                    if a:
                        cnt["cur"][a[0]] += 1
                    if b:
                        cnt["new"][b[0]] += 1
                series.append({"date": sn["trade_date"].isoformat(), "at": sn["taken_at"].isoformat(),
                               "cur": [cnt["cur"][1], cnt["cur"][0], cnt["cur"][-1]], "new": [cnt["new"][1], cnt["new"][0], cnt["new"][-1]]})
                if i == 0:
                    latest = {"date": sn["trade_date"].isoformat(), "stocks": len(res)}
                    for a, b in res.values():
                        if a and b:
                            trans[1 - a[0]][1 - b[0]] += 1
                        for side, v in (("cur", a), ("new", b)):
                            if v:
                                hist[side][min(19, max(0, (v[1] + 100) // 10))] += 1
                    # the biggest movers: a colour change first, then the size of the strength change
                    ranked = sorted((((a[0] if a else None) != (b[0] if b else None), abs((b[1] if b else 0) - (a[1] if a else 0)), s)
                                     for s, (a, b) in res.items()), reverse=True)[:MOVERS]
                    movers = [{"s": s, **_explain(F[s], Pc, Pn)} for changed, d_, s in ranked if changed or d_ > 0]
                base = {r["symbol"]: r["price"] for r in c.execute("SELECT symbol, price FROM stock_states WHERE snapshot_id = %s AND price > 0",
                                                                     (sn["id"],)).fetchall()}
                for h in HORIZONS:
                    fwd = _forward(c, sn, h, base)
                    if not fwd:
                        continue
                    bench = sum(fwd.values()) / len(fwd)
                    for s, (a, b) in res.items():
                        if s not in fwd:
                            continue
                        r_ = fwd[s]
                        for side, v in (("cur", a), ("new", b)):
                            if v:
                                cell = acc[h][side][v[0]]
                                cell[0] += 1; cell[1] += r_; cell[2] += r_ - bench; cell[3] += 1 if r_ > bench else 0
                del F, res, base
        out_bt = {}
        for h in HORIZONS:
            out_bt[h] = {side: {str(k): ({"n": v[0], "ret": round(v[1] / v[0], 2), "excess": round(v[2] / v[0], 2), "beat": round(v[3] / v[0] * 100, 1)}
                                       if v[0] else {"n": 0}) for k, v in acc[h][side].items()} for side in ("cur", "new")}
        out = {"days": len(snaps), "latest": latest, "series": series, "transitions": trans, "hist": hist, "movers": movers,
               "backtest": out_bt, "table": {"cur": period_table(Pc), "new": period_table(Pn)}, "live": ver}
        if len(_cmp) >= 6:
            _cmp.pop(next(iter(_cmp)))
        _cmp[key] = out
        return out
    finally:
        _cmp_lock.release()
