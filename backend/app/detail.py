"""
Stock detail view (owner, 2026-11-01: "if I click the stock name in the AI Portfolio Analyser or Builder I need to see
everything — monthly, quarterly and yearly zone range, the status of the mother candle, is any NR supporting the trend,
has the regime helped the trend, then the technical table … draw the zone along with the mother candle … only the admin,
to judge whether the result is right").

Built once per collection next to the final output (publish.build_history) and stored in stock_detail; the customer
service serves one stock at a time to customers whose roles hold a "*:detail" permission (Customer Admin). Every number
is worked out with the SAME zone_engine functions as the strength customers see, so the view explains the real result:

  per Monthly / Quarterly / Yearly
    zone        today's zone (top, top band, bottom band, bottom) + where the price sits
    history     the current zone and the last 4 (bar k periods ago), the steps between them → trend T
    position    P from where the price sits in the current zone
    mother      the NR signals on that timeframe, the counted one (longest), its place in the zone and its points
    strength    100 × (0.6 T + 0.4 P) + mother candle points → after the long-term regime gate
    candles     open / high / low / close of the current bar and the last 12 (scanner sheet "Candles")
  regime        Supertrend lines and sides (daily, weekly, monthly), short-term (weekly decides) and long-term
                (monthly decides) verdicts, timeframes held back as sideways
  technicals    every indicator per timeframe (Technicals sheet)
"""
import re

from . import zone_engine as ze

DETAIL_DAYS = 14                       # stock_detail / snapshot_candles are kept this many days (worker cleanup)
BARS = 12
_NR_NAME = re.compile(r"_(\d+)([DWMQY])_")
_TF_OF = {"Daily": "D", "Weekly": "W", "Monthly": "M", "Quarterly": "Q", "Yearly": "Y"}
_ZONE_KEYS = (("top", "Top_Zone"), ("top_near", "Top_Near"), ("bottom_near", "Bottom_Near"), ("bottom", "Bottom_Zone"),
              ("position", "Position"), ("dist_top", "Dist_Top_Pct"), ("dist_bottom", "Dist_Bottom_Pct"))
_TECH = ("RSI", "RSI70", "ADX", "ATR", "BB_Upper", "BB_Lower", "MACD", "Supertrend", "CCI")


def _sym(v):
    return str(v or "").replace("NSE:", "").replace(",", "").strip().upper()


def _r(v, n=4):
    return None if v is None else round(v, n)


def _bar(cell):
    try:
        o, h, l, c = (float(x) for x in str(cell or "").split())
        return [o, h, l, c]
    except ValueError:
        return None


def _zone(zl, tf):
    z = {k: (zl.get(f"{tf}_{col}") if k == "position" else ze._num(zl.get(f"{tf}_{col}"))) for k, col in _ZONE_KEYS}
    z["position"] = str(z["position"] or "") or None
    return z if z["top"] is not None or z["bottom"] is not None else None


def _side(price, line):
    return None if price is None or line is None else (1 if price > line else -1 if price < line else 0)


def explain_tf(price, zl, zh, tf, b):
    """One timeframe, step by step — the same arithmetic as zone_engine.read_stock (strength before the regime gate)."""
    hist = [(ze._num(zh.get(f"{tf}{k}_Bottom")), ze._num(zh.get(f"{tf}{k}_Top"))) for k in range(5)] if zh else []
    sh = ze.shifts(hist) if hist else []
    t = ze.trend(None, sh) if hist else None
    bottom, top = ze._num(zl.get(f"{tf}_Bottom_Zone")), ze._num(zl.get(f"{tf}_Top_Zone"))
    if (bottom is None or top is None) and hist:
        bottom, top = hist[0]
    p, pcode = ze.position(price, bottom, top)
    out = {"history": [list(x) for x in hist], "steps": [_r(x) for x in sh],
           "step_points": [_r(ze._clip(x / ze.FULL_STEP, -1.0, 1.0)) for x in sh],
           "recency": list(ze.RECENCY[:len(sh)]), "T": _r(t), "P": _r(p), "pcode": pcode, "nr": b,
           "trend_code": ze.trend_code(t) if t is not None else None, "streak": list(ze.streak(sh))}
    if p is None:
        return out
    rel = (price - bottom) / (top - bottom)
    place = ze.nr_place(str(zl.get(f"{tf}_Position") or ""), rel)
    pts = ze.nr_points(b, place)
    out.update(rel=_r(rel), place=place, nr_points=_r(pts, 2), nr_weight=_r(ze.nr_weight(abs(b)), 3) if b else None)
    if t is not None:
        base = 100 * (ze.TREND_W * t + ze.POS_W * p)
        out.update(zone_points=_r(base, 2), strength=round(max(-100.0, min(100.0, base + pts))))
    return out


def nr_signals(sheets):
    """symbol -> [{tf, n, type, name}] every mother-candle signal of the collection (all timeframes)"""
    out = {}
    for r in sheets.get("Flat_Data_For_Slicers") or []:
        if r.get("Signal_Category") != "NR_PATTERN":
            continue
        m = _NR_NAME.search(str(r.get("Signal_Name") or ""))
        tf = _TF_OF.get(r.get("Timeframe")) or (m and m.group(2))
        out.setdefault(_sym(r.get("Symbol")), []).append(
            {"tf": tf, "n": int(m.group(1)) if m else None, "type": r.get("Signal_Type"), "name": r.get("Signal_Name")})
    return out


def build_all(sheets, payload, candles=None):
    """{"meta": the formula's constants, "stocks": {symbol: detail}} for every stock of the customer view"""
    zl = {_sym(r.get("Symbol")): r for r in sheets.get("Zone_Levels", [])}
    zh = {_sym(r.get("Symbol")): r for r in sheets.get("Zone_History", []) or []}
    tech = {_sym(r.get("Symbol")): r for r in sheets.get("Technicals", []) or []}
    failed = {}
    for r in sheets.get("Failed_NR", []) or []:
        failed.setdefault(_sym(r.get("Symbol")), []).append(
            {k: r.get(k) for k in ("Timeframe", "Trap", "Trade", "Mother_Bars_Ago", "Mother_High", "Mother_Low",
                                   "Failure_Bars_Ago", "Failure_Close", "Position_In_Mother_Pct")})
    cdl = {_sym(r.get("Symbol")): r for r in candles or []}
    nrs, sigs = ze.nr_map(sheets), nr_signals(sheets)
    out = {}
    for s in payload.get("stocks", []):
        sym = s["s"]
        z = zl.get(sym)
        if not z:
            continue
        price = s.get("p")
        t = tech.get(sym) or {}
        lines = {tf: ze._num(t.get(f"{tf}_Supertrend")) for tf in "DWMQY"}
        tfs = {}
        for tf in "DWMQY":
            row = {"zone": _zone(z, tf), "signals": [x for x in sigs.get(sym, []) if x["tf"] == tf]}
            if tf in "MQY":
                row.update(explain_tf(price, z, zh.get(sym), tf, nrs.get(sym, {}).get(tf, 0)))
                row["weight"] = ze.TF_W[tf]
                c = cdl.get(sym)
                row["candles"] = [_bar(c.get(f"{tf}{k}")) for k in range(BARS + 1)] if c else None
            tfs[tf] = row
        before = ze.read_stock(z, zh.get(sym), nrs.get(sym)) if zh.get(sym) else None
        out[sym] = {
            "s": sym, "n": s.get("n"), "sec": s.get("sec"), "ind": s.get("ind"), "cap": s.get("cap"), "p": price,
            "c": s.get("c"), "h": s.get("h"), "x": s.get("x"), "yh": s.get("yh"), "av": s.get("av"), "r3": s.get("r3"),
            "mr": s.get("mr"), "zs": s.get("zs"),
            "tf": tfs,
            "before": before, "final": s.get("zv"),
            "regime": {"lines": lines, "side": {tf: _side(price, v) for tf, v in lines.items()},
                       "short": s.get("rg"), "short_held": s.get("rh", ""), "short_flip": s.get("rx"),
                       "long": s.get("rp"), "long_held": s.get("rz", ""), "long_flip": s.get("rpx")},
            "short_term": {"r": s.get("r"), "sc": s.get("sc"), "os": s.get("os"), "o": s.get("o")},
            # (the regime line is sent as "ST": its name stays out of the customer app bundle — meta.line_name)
            "tech": {tf: {("ST" if k == "Supertrend" else k): ze._num(t.get(f"{tf}_{k}")) for k in _TECH} for tf in "DWMQY"} if t else None,
            "failed_nr": failed.get(sym),
        }
    meta = {"tf_weight": ze.TF_W, "trend_w": ze.TREND_W, "pos_w": ze.POS_W, "recency": list(ze.RECENCY),
            "full_step": ze.FULL_STEP, "cut": ze.CUT, "squeeze": ze.REGIME_SQUEEZE,
            "nr_points": ze.NR_POINTS, "nr_places": list(ze.NR_PLACES), "nr_base": ze.NR_BASE, "bars": BARS,
            "candles": bool(cdl),
            "line_name": "Supertrend"}       # the regime line's name: sent only to the detail view, never in the app bundle
    return {"meta": meta, "stocks": out}
