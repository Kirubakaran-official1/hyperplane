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
  mother candle        an NR breakout / breakdown on that timeframe adds / takes a few points (NR_POINTS: by where the
                       price sits in that zone, 12 combinations, ±2 … ±10) — one point of the strength, never more.
  timeframe strength   100 × (0.6 T + 0.4 P) ± mother candle points               −100…+100
  stock strength       weighted mean of the timeframes: Quarter 50 · Year 30 · Month 20 (owner weights; a missing
                       Month or Year is left out and the rest re-weighted).
  colour               the app's own cut (TREND_CUT 24): green when strength ≥ +24 AND the quarter is not negative,
                       red when ≤ −24, else amber.
Customers receive only the results: [colour, strength, [M], [Q], [Y]] with each timeframe [trend word code, position code,
strength, streak direction, streak length] (streak = periods in a row the zone moved the same way, ≥ 10 % of a width, for
"going down for the last 3 quarters"); the steps, weights and formula stay here. Cost: a few arithmetic operations per stock, once per publish —
no extra work when customers load the app.
Constants are Claude's proposal on the owner's request ("decide the best output") — owner may tune.
Regime analyser (publish.py, owner 2026-10-31): apply_regime squeezes a timeframe that points against the weekly regime
into sideways before the stock strength and colour are worked out.
"""

import re

# Mother candle (NR) breakout / breakdown on the Monthly / Quarterly / Yearly timeframe (owner, 2026-11-01). It is ONE
# point of the timeframe's strength (owner: "−49 to −80 is too huge … this is only one of the points"): the zone
# strength stays 100 × (0.6 T + 0.4 P) and the mother candle adds or takes off a few points (kept within −100 … +100).
# The points depend on WHERE the price sits in that same timeframe's zone (owner: "a breakdown above the zone top is a
# retracement and still strong; inside the zone the meaning is different") — 2 events × 6 places = 12 combinations:
#                        breakout                          breakdown
#   above the zone top   +10 continuation, confirmed       −2  pullback after a breakout, still strong
#   near the top (band)  +10 pushing through the top       −5  rejected at the top
#   upper half           +7  still has to clear the top    −6  losing strength inside the zone
#   lower half           +5  early, in the weak part       −8  weak and getting weaker
#   near the bottom      +4  bounce from support           −10 support giving way
#   below the zone bottom +3 relief bounce, broken zone    −10 downtrend confirmed
# × a very slight child-count variation: NR4 (3 children) = 94 % … NR12 (11 children) = 100 %. Several lengths on one
# timeframe → the longest counts. Near High / Near Low / Back to NR = 0. The scanner flags a breakout only ON the
# breakout candle (the candles after it are no longer children), so it is never counted twice.
# (Earlier versions: lifting the position to the breakout level — rejected as too strong; a flat ±10 — replaced.)
NR_PLACES = ("above", "near_top", "upper", "lower", "near_bottom", "below")
NR_POINTS = {"above": (10, -2), "near_top": (10, -5), "upper": (7, -6), "lower": (5, -8), "near_bottom": (4, -10), "below": (3, -10)}
NR_BASE, NR_FULL = 0.94, 1.0
_BAND = {"ABOVE_TOP": "above", "IN_TOP_BAND": "near_top", "IN_BOTTOM_BAND": "near_bottom", "BELOW_BOTTOM": "below"}


def nr_place(label, rel):
    """where the price sits in the timeframe's zone: the scanner's position label (bands) + the engine's own rel
    (0 = bottom, 1 = top) to split 'inside' into the upper / lower half"""
    if label in _BAND:
        return _BAND[label]
    return "above" if rel > 1 else "below" if rel < 0 else "upper" if rel >= 0.5 else "lower"


def nr_points(n, place):
    """points for a mother candle breakout (+n) / breakdown (−n) at that place"""
    if not n:
        return 0.0
    bo, bd = NR_POINTS[place]
    return (bo if n > 0 else bd) * nr_weight(abs(n))
_NR_N = re.compile(r"_(\d+)[MQY]_")


def nr_weight(n):
    """share of a full zone breakout for a mother candle n bars back (4 … 12)"""
    return NR_BASE + (max(4, min(12, n)) - 4) * (NR_FULL - NR_BASE) / 8


def nr_map(sheets):
    """symbol -> {"M"|"Q"|"Y": +n breakout · −n breakdown} from the collection's NR signals (largest n; both = none)"""
    tf_of = {"Monthly": "M", "Quarterly": "Q", "Yearly": "Y"}
    acc = {}
    for r in sheets.get("Flat_Data_For_Slicers") or []:
        if r.get("Signal_Category") != "NR_PATTERN" or r.get("Timeframe") not in tf_of:
            continue
        d = {"Breakout": 1, "Breakdown": -1}.get(r.get("Signal_Type"))
        m = _NR_N.search(str(r.get("Signal_Name") or ""))
        if not d or not m:
            continue
        sym = str(r.get("Symbol") or "").replace("NSE:", "").replace(",", "").strip().upper()
        cell = acc.setdefault(sym, {}).setdefault(tf_of[r["Timeframe"]], {})
        cell[d] = max(cell.get(d, 0), int(m.group(1)))
    out = {}
    for sym, per in acc.items():
        for tf, cell in per.items():
            if len(cell) == 1:                                   # breakout AND breakdown on one timeframe: ignored
                (d, n), = cell.items()
                out.setdefault(sym, {})[tf] = d * n
    return out

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


def read_stock(zl, zh, nr=None):
    """zl: Zone_Levels row, zh: Zone_History row → [colour 1/0/−1, strength, [M], [Q], [Y]] or None (no quarterly view)."""
    if not zl or not zh:
        return None
    price = _num(zl.get("Price"))
    per = {}
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
        b = (nr or {}).get(tf, 0)                          # mother candle breakout (+n) / breakdown (−n): one point
        place = nr_place(str(zl.get(f"{tf}_Position") or ""), (price - bottom) / (top - bottom))
        s = round(max(-100.0, min(100.0, 100 * (TREND_W * t + POS_W * p) + nr_points(b, place))))
        # + streak ("down for 3 quarters") + mother candle (±n) + where it happened (index in NR_PLACES)
        per[tf] = [trend_code(t), pcode, s, *streak(sh), b, NR_PLACES.index(place)]   # place: always (combination code)
    if per["Q"] is None:
        return None
    return _finish(per)


def _finish(per):
    """[colour, strength, [M], [Q], [Y]] from the timeframe results (each [.., .., strength, ..] or None)."""
    parts = [(TF_W[tf], per[tf][2]) for tf in "MQY" if per[tf] is not None]
    strength = round(sum(w * s for w, s in parts) / sum(w for w, _ in parts))
    colour = 1 if strength >= CUT and per["Q"][2] >= 0 else -1 if strength <= -CUT else 0
    return [colour, strength, per["M"], per["Q"], per["Y"]]


REGIME_SQUEEZE = 0.23                   # same as publish.py: against the regime → inside the sideways band


def apply_regime(v, w):
    """Regime analyser (owner, 2026-10-31): a timeframe strength pointing against the long-term (monthly) regime w (1 / −1) is squeezed
    into sideways; the stock strength and colour are recomputed. → (result, held timeframes e.g. "MQ")."""
    if not v or not w:
        return v, ""
    per, held = {}, ""
    for tf, t in zip("MQY", v[2:]):
        if t is not None and t[2] * w < 0:
            t = [t[0], t[1], round(t[2] * REGIME_SQUEEZE), *t[3:]]
            held += tf
        per[tf] = t
    return (_finish(per), held) if held else (v, "")


def read_all(sheets):
    """symbol -> result for every stock with a Zone_History row ({} for collections without Zone_History)."""
    hist = sheets.get("Zone_History") or []
    if not hist:
        return {}
    clean = lambda v: str(v or "").replace("NSE:", "").replace(",", "").strip().upper()
    zl = {clean(r.get("Symbol")): r for r in sheets.get("Zone_Levels", [])}
    nrs = nr_map(sheets)
    out = {}
    for r in hist:
        sym = clean(r.get("Symbol"))
        v = read_stock(zl.get(sym), r, nrs.get(sym))
        if v:
            out[sym] = v
    return out
