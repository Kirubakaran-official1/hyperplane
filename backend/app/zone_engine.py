"""
AI Portfolio zone engine (owner, 2026-10-17: "do all the math in the backend … cover every combination … the true strength
of the stock … optimized, no extra CPU").

A continuous calculation, so every combination of Monthly / Quarterly / Yearly readings (and every stock inside the same
combination) gets its own exact strength — no lookup boxes. Per timeframe, from the scanner's zones:

  trend     T  −1…+1   the current zone and the last 4 (Zone_History, Chartink virgin-data). Each step = how far the middle
                       of a zone moved against the one before it, in widths of the older zone; a move of half a width or more
                       counts in full (±1). Recent steps count most: 40 / 30 / 20 / 10 %.
  position  P  −1…+1   where today's price sits in the CURRENT zone (Zone_Levels): bottom edge −0.67, middle 0, top edge
                       +0.67, ±1 at a quarter of a width beyond the edges.
  timeframe strength   100 × (0.6 T + 0.4 P)                                      −100…+100
  stock strength       weighted mean of the timeframes: Quarter 50 · Year 30 · Month 20 (owner weights; a missing
                       Month or Year is left out and the rest re-weighted).
  colour               the app's own cut (TREND_CUT 24): green when strength ≥ +24 AND the quarter is not negative,
                       red when ≤ −24, else amber.
Customers receive only the results: [colour, strength, [M], [Q], [Y]] with each timeframe [trend word code, position code,
strength, streak direction, streak length] (streak = periods in a row the zone moved the same way, ≥ 10 % of a width, for
"going down for the last 3 quarters"); the steps, weights and formula stay here. Cost: a few arithmetic operations per stock, once per publish —
no extra work when customers load the app.
Constants are Claude's proposal on the owner's request ("decide the best output") — owner may tune.
"""

RECENCY = (0.4, 0.3, 0.2, 0.1)          # weight of the latest step … the oldest
FULL_STEP = 0.5                         # a zone move of half a width counts as a full step
TREND_W, POS_W = 0.6, 0.4
TF_W = {"M": 20, "Q": 50, "Y": 30}
CUT = 24                                # same as the customer app's TREND_CUT (uptrend / downtrend words)
MOVE = 0.10                             # streak: a zone middle moving ≥ 10 % of the older zone's width counts as up / down


def _num(v):
    try:
        f = float(str(v).replace(",", ""))
        return None if f != f else f
    except (TypeError, ValueError):
        return None


def _clip(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def shifts(zones):
    """zones: [(bottom, top)] newest first → how far each zone's middle moved vs the one before, in older-zone widths."""
    out = []
    for (b0, t0), (b1, t1) in zip(zones, zones[1:]):
        if None in (b0, t0, b1, t1) or t1 <= b1 or t0 <= b0:
            break                                            # a gap ends the history (younger stock)
        out.append(((t0 + b0) - (t1 + b1)) / 2 / (t1 - b1))
    return out


def trend(zones, sh=None):
    """T in −1…+1 (None when fewer than 2 steps exist)."""
    steps = [_clip(x / FULL_STEP, -1.0, 1.0) for x in (sh if sh is not None else shifts(zones))]
    if len(steps) < 2:
        return None
    w = RECENCY[:len(steps)]
    return sum(a * s for a, s in zip(w, steps)) / sum(w)


def streak(sh):
    """(direction 1 up · 0 flat · −1 down, how many periods in a row up to now) from the latest step backwards."""
    if not sh:
        return 0, 0
    d = [1 if x >= MOVE else -1 if x <= -MOVE else 0 for x in sh]
    n = 1
    while n < len(d) and d[n] == d[0]:
        n += 1
    return d[0], n


def position(price, bottom, top):
    """P in −1…+1 and the plain position code: 2 above · 1 upper part · −1 lower part · −2 below."""
    if None in (price, bottom, top) or top <= bottom:
        return None, None
    rel = (price - bottom) / (top - bottom)
    code = 2 if rel > 1 else 1 if rel >= 0.5 else -1 if rel >= 0 else -2
    return _clip(2 * rel - 1, -1.5, 1.5) / 1.5, code


def trend_code(t):
    """2 uptrend · 1 turning up · 0 sideways · −1 turning down · −2 downtrend (plain words in the app)."""
    return 2 if t >= 0.5 else 1 if t >= 0.15 else -2 if t <= -0.5 else -1 if t <= -0.15 else 0


def read_stock(zl, zh):
    """zl: Zone_Levels row, zh: Zone_History row → [colour 1/0/−1, strength, [M], [Q], [Y]] or None (no quarterly view)."""
    if not zl or not zh:
        return None
    price = _num(zl.get("Price"))
    per, parts = {}, []
    for tf in "MQY":
        sh = shifts([(_num(zh.get(f"{tf}{k}_Bottom")), _num(zh.get(f"{tf}{k}_Top"))) for k in range(5)])
        t = trend(None, sh)
        bottom = _num(zl.get(f"{tf}_Bottom_Zone"))
        top = _num(zl.get(f"{tf}_Top_Zone"))
        if bottom is None or top is None:                    # fall back to the history's current zone
            bottom, top = _num(zh.get(f"{tf}0_Bottom")), _num(zh.get(f"{tf}0_Top"))
        p, pcode = position(price, bottom, top)
        if t is None or p is None:
            per[tf] = None
            continue
        s = round(100 * (TREND_W * t + POS_W * p))
        per[tf] = [trend_code(t), pcode, s, *streak(sh)]          # + streak: "going down for the last 3 quarters"
        parts.append((TF_W[tf], s))
    if per["Q"] is None:
        return None
    strength = round(sum(w * s for w, s in parts) / sum(w for w, _ in parts))
    colour = 1 if strength >= CUT and per["Q"][2] >= 0 else -1 if strength <= -CUT else 0
    return [colour, strength, per["M"], per["Q"], per["Y"]]


def read_all(sheets):
    """symbol -> result for every stock with a Zone_History row ({} for collections without Zone_History)."""
    hist = sheets.get("Zone_History") or []
    if not hist:
        return {}
    clean = lambda v: str(v or "").replace("NSE:", "").replace(",", "").strip().upper()
    zl = {clean(r.get("Symbol")): r for r in sheets.get("Zone_Levels", [])}
    out = {}
    for r in hist:
        sym = clean(r.get("Symbol"))
        v = read_stock(zl.get(sym), r)
        if v:
            out[sym] = v
    return out
