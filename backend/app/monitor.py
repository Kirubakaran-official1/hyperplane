"""
Alerts and the notification centre (owner, 2026-11-06: "turn on the alert … it will notify what to buy in the notification
centre at the top … if there is any change in the SIP portfolio, what to change — only for the stocks … for the stocks,
if the regime goes down or the strength, send the notification … the same save option for the Portfolio Builder and the
Analyser: if any stock changes it should come in the notification centre — what changed, what to remove and the better
alternative").

run_alerts() runs right after every publish (publish.publish), on the published data, for every saved plan with alerts on
(customer_sips: SIP or Builder portfolios) and every Analyser list with alerts on (customer_portfolio):
  SIP / Builder  sip.check_holdings(): a STOCK that no longer passes the momentum checks → one notification listing the
                 new exits with their replacement (themes are flagged on the page only; core index ETFs never). A SIP also
                 gets "this month's / quarter's order is ready" once per instalment period.
  Analyser       a stock in the list whose long-term colour turned red ("Look at first") or whose long-term direction
                 turned down → a notification with the best alternative from the same sector (else the same market cap).
Only NEW changes notify (the last flags are kept in state / alert_state), so a weekly check never repeats itself.
"""
import json
from datetime import datetime, timedelta, timezone

from . import builder, sip
from .db import pool

IST = timezone(timedelta(hours=5, minutes=30))
KEEP_DAYS = 120                                      # notifications older than this are deleted


REGIME_DOWN = "its long-term regime turned down"


def regime_flags(data, symbols):
    """{symbol: reason} for the stocks whose LONG-TERM REGIME turned down — the only case that asks for a swap
    (owner 2026-11-06: "only if the investment regime changes to down ask for the swap, not for every retracement")"""
    by = {s["s"]: s for s in data.get("stocks", [])}
    return {sym: REGIME_DOWN for sym in symbols if (by.get(sym) or {}).get("rp") and by[sym]["rp"][0] == -1}


def portfolio_flags(data, symbols):
    """Analyser list / saved Analyser portfolios: {symbol: reason} (regime down only) + {symbol: alternative}"""
    by = {s["s"]: s for s in data.get("stocks", [])}
    flags = regime_flags(data, symbols)
    alts = {}
    if flags:
        cands, _ = builder.candidates(data, {"S", "M"}, builder.DEFAULT_OPTS)
        cands = sorted([x for x in cands if x["tier"] == 1 and x["s"]["s"] not in set(symbols)], key=lambda x: (x["s"].get("h") != "S", -x["score"]))
        used = set()
        for sym in flags:
            s = by[sym]
            pick = next((x for x in cands if x["s"]["s"] not in used and x["s"].get("sec") == s.get("sec")), None) or \
                next((x for x in cands if x["s"]["s"] not in used and x["s"].get("cap") == s.get("cap")), None)
            if pick:
                used.add(pick["s"]["s"])
                alts[sym] = {"s": pick["s"]["s"], "n": pick["s"].get("n"), "st": pick["st"], "sec": pick["s"].get("sec"),
                             "rel": pick["s"].get("h")}
    return flags, alts


def size_of(s):
    """price and company size of one stock (round 16: "mention the price and the size of both, the swap and the current one"):
    market cap = total shares (ff[1]) × price, in ₹ crore"""
    ff = s.get("ff") or []
    p = s.get("p")
    mc = round(ff[1] * p / 1e7) if len(ff) > 1 and ff[1] and p else None
    return {"p": p, "mcap": mc, "cap": s.get("cap")}


def lt_strength(s):
    """the long-term strength the AI Portfolio Analyser shows on a stock's card: monthly 20 · quarterly 50 · yearly 30"""
    sc = s.get("sc") or []
    parts = [(w, sc[i]) for i, w in ((2, 20), (3, 50), (4, 30)) if i < len(sc) and sc[i] is not None]
    return round(sum(w * v for w, v in parts) / sum(w for w, _ in parts)) if parts else None


CAP_UP = {"Small": ("Mid", "Large"), "Mid": ("Large",), "Large": ()}


def alternatives(data, sym, skip=(), n=3, up=0):
    """the best n alternatives for one stock: long-term uptrend (High / Medium), the same industry first, then the same sector,
    then the same market cap, strongest first (owner 2026-11-06: "swap as an option, then show the best alternative of that stock").
    up > 0 adds up to `up` UPGRADES (owner 2026-11-07, round 15: "moving from small cap to mid cap — an upgrade in the same sector and
    industry; give multiple swap options"): a bigger company (Small → Mid / Large, Mid → Large) in the same industry, else the same sector."""
    by = {s["s"]: s for s in data.get("stocks", [])}
    s = by.get(sym)
    if not s:
        return []
    cands, _ = builder.candidates(data, {"S", "M"}, builder.DEFAULT_OPTS)
    cands = sorted([x for x in cands if x["tier"] == 1 and x["s"]["s"] not in set(skip) | {sym}], key=lambda x: (x["s"].get("h") != "S", -x["score"]))
    ind = [x for x in cands if x["s"].get("sec") == s.get("sec") and x["s"].get("ind") == s.get("ind")]      # same industry first
    same = [x for x in cands if x["s"].get("sec") == s.get("sec") and x not in ind]
    cap = [x for x in cands if x["s"].get("cap") == s.get("cap") and x not in ind and x not in same]
    bigger = CAP_UP.get(s.get("cap"), ())
    upg = [x for x in ind if x["s"].get("cap") in bigger] + [x for x in same if x["s"].get("cap") in bigger]
    like = [x for x in ind + same + cap if x not in upg[:up]] if up else ind + same + cap

    def one(x, kind):
        lt = lt_strength(x["s"])
        why = ("bigger company · same industry" if x in ind else "bigger company · same sector") if kind == "up" else             "same industry" if x in ind else "same sector" if x in same else "same market cap"
        return {"s": x["s"]["s"], "n": x["s"].get("n"), "st": x["st"] if lt is None else lt, "sec": x["s"].get("sec"), "ind": x["s"].get("ind"),
                "rel": x["s"].get("h"), "why": why, "up": kind == "up", **size_of(x["s"])}
    return [one(x, "like") for x in like[:n]] + [one(x, "up") for x in upg[:up]]


def _period(freq, now):
    return f"{now.year}-Q{(now.month - 1) // 3 + 1}" if freq == "quarter" else f"{now.year}-{now.month:02d}"


def run_alerts(data, etf_data):
    """after a publish: notify the customers whose saved plans / lists changed (never fails the publish)"""
    now = datetime.now(IST)
    made = 0
    with pool.connection() as c:
        plans = c.execute("SELECT id, customer_id, kind, name, inputs, holdings, state FROM customer_sips WHERE alerts").fetchall()
        lists = c.execute("SELECT customer_id, symbols, alert_state FROM customer_portfolio WHERE alerts AND cardinality(symbols) > 0").fetchall()
    for p in plans:
        inp, state = p["inputs"] or {}, p["state"] or {}
        rel = inp.get("rel") or inp.get("reliability") or ["S"]
        try:
            if p["kind"] == "analyser":                              # saved Analyser portfolios: colour / direction turned down
                fl, al = portfolio_flags(data, [h["s"] for h in p["holdings"] or []])
                res = {"exit": [{"kind": "stock", "s": s_, "n": next((h.get("n") for h in p["holdings"] if h["s"] == s_), None), "why": w}
                                for s_, w in fl.items()],
                       "new": [{"s": a["s"], "n": a.get("n"), "st": a.get("st"), "replaces": s_} for s_, a in al.items()], "total": 0}
            else:
                res = sip.check_holdings(data, etf_data, p["holdings"] or [], rel, kind=p["kind"])
        except Exception as e:                                     # noqa: BLE001 — one bad plan never stops the rest
            print(f"⚠ alert check of plan #{p['id']}: {e}")
            continue
        flags = {e["s"]: e["why"] for e in res["exit"] if e["kind"] == "stock"}
        prev = state.get("flags") or {}
        fresh = [e for e in res["exit"] if e["kind"] == "stock" and e["s"] not in prev]
        notes = []
        if fresh:
            items = [{"s": e["s"], "n": e.get("n"), "why": e["why"],
                      "alt": next(({"s": n["s"], "n": n.get("n"), "st": n.get("st")} for n in res["new"] if n.get("replaces") == e["s"]), None)}
                     for e in fresh]
            what = "SIP" if p["kind"] in ("sip", "msip") else "portfolio"
            notes.append((f"{p['name']}: {len(items)} stock{'s' if len(items) > 1 else ''} to change", {"items": items, "what": what}))
        period = _period(inp.get("freq", "month"), now)
        if p["kind"] in ("sip", "msip") and state.get("period") and state.get("period") != period:
            word = "quarter" if inp.get("freq") == "quarter" else "month"
            notes.append((f"{p['name']}: this {word}'s order is ready", {"order": True, "total": res["total"]}))
        with pool.connection() as c:
            for title, body in notes:
                c.execute("INSERT INTO customer_notifications (customer_id, kind, ref_id, title, body) VALUES (%s, %s, %s, %s, %s)",
                          (p["customer_id"], p["kind"], p["id"], title, json.dumps(body)))
                made += 1
            c.execute("UPDATE customer_sips SET state = %s WHERE id = %s",
                      (json.dumps({"flags": flags, "period": period, "checked": now.isoformat()}), p["id"]))
    for r in lists:
        prev = (r["alert_state"] or {}).get("flags") or {}
        flags, alts = portfolio_flags(data, list(r["symbols"]))
        fresh = [s for s in flags if s not in prev]
        with pool.connection() as c:
            if fresh:
                items = [{"s": s, "why": flags[s], "alt": alts.get(s)} for s in fresh]
                c.execute("INSERT INTO customer_notifications (customer_id, kind, ref_id, title, body) VALUES (%s, 'portfolio', NULL, %s, %s)",
                          (r["customer_id"], f"Your portfolio: {len(items)} stock{'s' if len(items) > 1 else ''} need{'s' if len(items) == 1 else ''} a look",
                           json.dumps({"items": items})))
                made += 1
            c.execute("UPDATE customer_portfolio SET alert_state = %s WHERE customer_id = %s",
                      (json.dumps({"flags": flags, "checked": now.isoformat()}), r["customer_id"]))
    with pool.connection() as c:
        c.execute("DELETE FROM customer_notifications WHERE created_at < now() - %s * interval '1 day'", (KEEP_DAYS,))
    return made
