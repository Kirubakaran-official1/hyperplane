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

Round 24 (owner 2026-11-17: "the scoring inside the admin panel … default, and the option to change it … apply it to the old data as well
… most dynamic … don't consume a lot of RAM"): every number above is a PARAMETER (DEFAULT_PARAMS = the values above; the live set comes
from Admin → Scoring, app/scoring.py) and the engine runs in two steps:
  factors(zl, zh, nr)  what the engine needs of one stock — per timeframe the zone steps, where the price sits (rel), the scanner's
                       place label, the mother candle n — read ONCE from a collection and kept small (score_factors)
  score(f, P)          the result from the factors with a parameter set P: pure arithmetic, so a past day is rescored in
                       milliseconds without opening its raw collection again.
read_stock = score(factors(…)) — with the default parameters the results are exactly the ones before round 24. The module constants
(RECENCY, TF_W, …) always hold the LIVE set (set_params), so detail.py and the admin views explain the numbers in use.

Round 25 (owner 2026-11-17: "a price near the top of a zone is resistance — it can reverse, yet it scores well … for the bottom give no
marks … the monthly zone in the upper side of the quarterly zone: small marks … the weekly zone above / in the upper part / breaking the
monthly, quarterly or yearly zone: small marks … reduce marks for the negative ones … monthly and quarterly the most, quarterly very slightly
higher, weekly and yearly less … another scoring model along with the default, switch with the same data"): a second MODEL, "ladder".
Everything as in the default (zone trend, mother candle, regime, the period weights, the colour cut) — only the PRICE POSITION part of a
period's strength is gone (100 × trend share × T ± mother candle); the stock strength then gets the ZONE LADDER marks:
  confirmed breakouts   the last completed week / month / quarter / year CLOSED above that zone's top (Prev_*_Close > *_Top_Zone):
                        + close[W|M|Q|Y]; closed below its bottom: − the same. Strict ladder (ladder.strict): the monthly one counts only
                        when the weekly one did too, the quarterly needs the monthly, the yearly the quarterly (each side on its own).
  zone in zone          where a smaller zone sits in a bigger one — Weekly in Monthly, Weekly in Quarterly, Weekly in Yearly, Monthly in
                        Quarterly: upper part / breaking the top / fully above → + small marks; lower part → 0; breaking the bottom /
                        fully below → − small marks (ladder.pairs).
  A price inside a zone (upper part, near the top or the bottom) earns nothing in this model. Against the long-term regime the marks are
  squeezed like the periods. The result carries the ladder total and the green gate ([colour, strength, M, Q, Y, ladder, gate]).
  Round 25b (owner: "sometimes a weekly breakdown, then a monthly break up — that is simply a consolidation; handle it"):
  consolidation (ladder.consol)  the weekly candle closed one way and a higher one the other way → those breakout / breakdown marks
                                 cancel (0) — the stock is ranging, not breaking.
  green gate (ladder.guard)      the price below the monthly or the quarterly zone while that candle has not closed outside yet (a
                                 fall not confirmed) → not green; no marks change.
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
NR_FULL = 1.0
_BAND = {"ABOVE_TOP": "above", "IN_TOP_BAND": "near_top", "IN_BOTTOM_BAND": "near_bottom", "BELOW_BOTTOM": "below"}
LABELS = ("", "ABOVE_TOP", "IN_TOP_BAND", "IN_BOTTOM_BAND", "BELOW_BOTTOM")      # factor code of the scanner's place label (0 = inside)
MODELS = ("default", "ladder")
LADDER_TFS = "WMQY"
LADDER_PAIRS = ("WM", "WQ", "WY", "MQ")                     # smaller zone · bigger zone
ZONE_IN = ("upper", "break_top", "above", "break_bottom", "below")   # the five placements that carry marks (a lower part is 0)
DEFAULT_LADDER = {
    "close": {"W": 4, "M": 9, "Q": 10, "Y": 5},             # a confirmed breakout (+) / breakdown (−) on that timeframe
    "strict": True,                                         # the ladder W → M → Q → Y
    "pairs": {"WM": [2, 4, 5, -4, -5], "WQ": [2, 4, 6, -4, -6], "WY": [1, 2, 3, -2, -3], "MQ": [2, 4, 6, -4, -6]},
    "consol": True,                                         # weekly one way, a higher candle the other way → consolidation (0)
    "guard": True,                                          # not green while the price is below the monthly / quarterly zone, unconfirmed
}

# ── the parameters (round 24): the owner's defaults; Admin → Scoring keeps named sets and applies one ──
DEFAULT_PARAMS = {
    "recency": [0.4, 0.3, 0.2, 0.1],          # weight of the latest zone step … the oldest
    "full_step": 0.5,                         # a zone move of this many widths counts as a full step
    "up": 0.5, "turn": 0.15,                  # trend words: ≥ up = uptrend, ≥ turn = turning up (and the same below zero)
    "trend_w": 0.6, "pos_w": 0.4,             # period strength = 100 × (trend_w × T + pos_w × P)
    "tf_w": {"M": 20, "Q": 50, "Y": 30},      # stock strength = weighted mean of the periods
    "cut": 24,                                # colour: green ≥ +cut, red ≤ −cut (the app's TREND_CUT)
    "q_guard": True,                          # green also needs the quarter not negative
    "nr": {"above": [10, -2], "near_top": [10, -5], "upper": [7, -6], "lower": [5, -8], "near_bottom": [4, -10], "below": [3, -10]},
    "nr_base": 0.94,                          # a 4-bar mother candle counts 94 % … a 12-bar one 100 %
    "move": 0.10,                             # streak: a zone middle moving ≥ this many widths counts as up / down
    "squeeze": 0.23,                          # against the long-term regime: the period strength × this (into sideways)
    "model": "default",                       # round 25: "default" (the price position counts) or "ladder" (zone ladder marks instead)
    "ladder": DEFAULT_LADDER,                 # the zone ladder's marks (used by the "ladder" model only)
}


class Params:
    """one parameter set, ready for the arithmetic (a dict from check_params / DEFAULT_PARAMS)"""
    __slots__ = ("recency", "full_step", "up", "turn", "trend_w", "pos_w", "tf_w", "cut", "q_guard", "nr", "nr_base", "move", "squeeze",
                 "model", "l_close", "l_strict", "l_pairs", "l_consol", "l_guard")

    def __init__(self, d):
        self.recency = tuple(float(x) for x in d["recency"])
        self.full_step, self.up, self.turn = float(d["full_step"]), float(d["up"]), float(d["turn"])
        self.trend_w, self.pos_w = float(d["trend_w"]), float(d["pos_w"])
        self.tf_w = {k: d["tf_w"][k] for k in "MQY"}
        self.cut, self.q_guard = d["cut"], bool(d["q_guard"])
        self.nr = {k: tuple(d["nr"][k]) for k in NR_PLACES}
        self.nr_base, self.move, self.squeeze = float(d["nr_base"]), float(d["move"]), float(d["squeeze"])
        self.model = d.get("model", "default")
        lad = d.get("ladder") or DEFAULT_LADDER
        self.l_close, self.l_strict = {k: lad["close"][k] for k in LADDER_TFS}, bool(lad["strict"])
        self.l_pairs = {k: tuple(lad["pairs"][k]) for k in LADDER_PAIRS}
        self.l_consol, self.l_guard = bool(lad.get("consol", True)), bool(lad.get("guard", True))


def _num_in(v, lo, hi, what, whole=False):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or not lo <= v <= hi or (whole and int(v) != v):
        raise ValueError(f"{what}: {'a whole number' if whole else 'a number'} from {lo} to {hi}")
    return int(v) if whole else float(v)


def check_params(d):
    """a parameter set from Admin → Scoring, checked (ValueError with a plain reason) and complete"""
    if not isinstance(d, dict):
        raise ValueError("The scores are missing")
    g = lambda k: d.get(k, DEFAULT_PARAMS[k])
    rec = g("recency")
    if not isinstance(rec, list) or len(rec) != 4:
        raise ValueError("Recency: four weights, the latest step first")
    rec = [_num_in(x, 0, 1, "Recency weight") for x in rec]
    if rec[0] + rec[1] <= 0:
        raise ValueError("Recency: the two latest steps cannot both be 0")
    up, turn = _num_in(g("up"), 0.05, 1, "Uptrend word from"), _num_in(g("turn"), 0.01, 0.95, "Turning word from")
    if turn >= up:
        raise ValueError("Trend words: 'turning' must start below 'uptrend'")
    tw, pw = _num_in(g("trend_w"), 0, 1, "Trend share"), _num_in(g("pos_w"), 0, 1, "Price share")
    if abs(tw + pw - 1) > 1e-9:
        raise ValueError("Period strength: the trend share and the price share must add up to 1")
    tfw = g("tf_w")
    if not isinstance(tfw, dict):
        raise ValueError("Stock strength: a weight for Month, Quarter and Year")
    tfw = {k: _num_in(tfw.get(k), 0, 100, f"{'Month Quarter Year'.split()['MQY'.index(k)]} weight", whole=True) for k in "MQY"}
    if tfw["Q"] <= 0:
        raise ValueError("Stock strength: the Quarter weight must be above 0 (every strength needs the quarter)")
    nr = g("nr")
    if not isinstance(nr, dict) or set(nr) != set(NR_PLACES):
        raise ValueError("Mother candle: a breakout and a breakdown value for each of the 6 places")
    out_nr = {}
    for k in NR_PLACES:
        if not isinstance(nr[k], list) or len(nr[k]) != 2:
            raise ValueError("Mother candle: a breakout and a breakdown value per place")
        out_nr[k] = [_num_in(nr[k][0], 0, 20, "Mother candle breakout points", whole=True), _num_in(nr[k][1], -20, 0, "Mother candle breakdown points", whole=True)]
    nr = out_nr
    if not isinstance(g("q_guard"), bool):
        raise ValueError("Colour: the quarter rule is on or off")
    model = g("model")
    if model not in MODELS:
        raise ValueError("Choose the default model or the zone ladder")
    lad = g("ladder")
    if not isinstance(lad, dict) or not isinstance(lad.get("close"), dict) or not isinstance(lad.get("pairs"), dict) or not isinstance(lad.get("strict"), bool):
        raise ValueError("Zone ladder: the breakout marks, the zone-in-zone marks and the strict ladder on / off")
    close = {k: _num_in(lad["close"].get(k), 0, 30, f"Zone ladder: {'Weekly Monthly Quarterly Yearly'.split()['WMQY'.index(k)]} breakout marks", whole=True)
             for k in LADDER_TFS}
    pairs = {}
    for k in LADDER_PAIRS:
        v = lad["pairs"].get(k)
        if not isinstance(v, list) or len(v) != 5:
            raise ValueError("Zone ladder: five marks for each zone-in-zone pair")
        what = f"Zone ladder {k[0]} in {k[1]}"
        pairs[k] = [_num_in(x, 0, 20, f"{what} (a plus)", whole=True) for x in v[:3]] + [_num_in(x, -20, 0, f"{what} (a minus)", whole=True) for x in v[3:]]
    for k in ("consol", "guard"):
        if not isinstance(lad.get(k, True), bool):
            raise ValueError("Zone ladder: consolidation and the green gate are on / off")
    ladder = {"close": close, "strict": lad["strict"], "pairs": pairs, "consol": lad.get("consol", True), "guard": lad.get("guard", True)}
    return {"model": model, "ladder": ladder, "recency": rec, "full_step": _num_in(g("full_step"), 0.1, 2, "A full step"), "up": up, "turn": turn,
            "trend_w": tw, "pos_w": pw, "tf_w": tfw, "cut": _num_in(g("cut"), 5, 60, "Colour cut", whole=True), "q_guard": g("q_guard"),
            "nr": nr, "nr_base": _num_in(g("nr_base"), 0.5, 1, "Shortest mother candle share"), "move": _num_in(g("move"), 0.01, 0.5, "Streak move"),
            "squeeze": _num_in(g("squeeze"), 0, 1, "Regime squeeze")}


_P = Params(DEFAULT_PARAMS)
# the live set as plain constants (detail.py and the admin views read these) — kept in step by set_params
RECENCY, FULL_STEP, TREND_W, POS_W, TF_W, CUT, MOVE = _P.recency, _P.full_step, _P.trend_w, _P.pos_w, dict(_P.tf_w), _P.cut, _P.move
NR_POINTS, NR_BASE, REGIME_SQUEEZE, UP, TURN, Q_GUARD = {k: _P.nr[k] for k in NR_PLACES}, _P.nr_base, _P.squeeze, _P.up, _P.turn, _P.q_guard


def set_params(d):
    """make a (checked) parameter set the live one in this process"""
    global _P, RECENCY, FULL_STEP, TREND_W, POS_W, TF_W, CUT, MOVE, NR_POINTS, NR_BASE, REGIME_SQUEEZE, UP, TURN, Q_GUARD
    _P = Params(d)
    RECENCY, FULL_STEP, TREND_W, POS_W, TF_W, CUT, MOVE = _P.recency, _P.full_step, _P.trend_w, _P.pos_w, dict(_P.tf_w), _P.cut, _P.move
    NR_POINTS, NR_BASE, REGIME_SQUEEZE, UP, TURN, Q_GUARD = {k: _P.nr[k] for k in NR_PLACES}, _P.nr_base, _P.squeeze, _P.up, _P.turn, _P.q_guard


def live():
    return _P


def nr_place(label, rel):
    """where the price sits in the timeframe's zone: the scanner's position label (bands) + the engine's own rel
    (0 = bottom, 1 = top) to split 'inside' into the upper / lower half"""
    if label in _BAND:
        return _BAND[label]
    return "above" if rel > 1 else "below" if rel < 0 else "upper" if rel >= 0.5 else "lower"


def nr_points(n, place, P=None):
    """points for a mother candle breakout (+n) / breakdown (−n) at that place"""
    if not n:
        return 0.0
    P = P or _P
    bo, bd = P.nr[place]
    return (bo if n > 0 else bd) * nr_weight(abs(n), P)
_NR_N = re.compile(r"_(\d+)[MQY]_")


def nr_weight(n, P=None):
    """share of a full zone breakout for a mother candle n bars back (4 … 12)"""
    P = P or _P
    return P.nr_base + (max(4, min(12, n)) - 4) * (NR_FULL - P.nr_base) / 8


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


def trend(zones, sh=None, P=None):
    """T in −1…+1 (None when fewer than 2 steps exist)."""
    P = P or _P
    steps = [_clip(x / P.full_step, -1.0, 1.0) for x in (sh if sh is not None else shifts(zones))]
    if len(steps) < 2:
        return None
    w = P.recency[:len(steps)]
    if sum(w) <= 0:
        return None
    return sum(a * s for a, s in zip(w, steps)) / sum(w)


def streak(sh, P=None):
    """(direction 1 up · 0 flat · −1 down, how many periods in a row up to now) from the latest step backwards."""
    if not sh:
        return 0, 0
    move = (P or _P).move
    d = [1 if x >= move else -1 if x <= -move else 0 for x in sh]
    n = 1
    while n < len(d) and d[n] == d[0]:
        n += 1
    return d[0], n


def _pos(rel):
    """P in −1…+1 and the plain position code (2 above · 1 upper part · −1 lower part · −2 below) from rel (0 bottom … 1 top)"""
    code = 2 if rel > 1 else 1 if rel >= 0.5 else -1 if rel >= 0 else -2
    return _clip(2 * rel - 1, -1.5, 1.5) / 1.5, code


def position(price, bottom, top):
    """P in −1…+1 and the plain position code: 2 above · 1 upper part · −1 lower part · −2 below."""
    if None in (price, bottom, top) or top <= bottom:
        return None, None
    return _pos((price - bottom) / (top - bottom))


def trend_code(t, P=None):
    """2 uptrend · 1 turning up · 0 sideways · −1 turning down · −2 downtrend (plain words in the app)."""
    P = P or _P
    return 2 if t >= P.up else 1 if t >= P.turn else -2 if t <= -P.up else -1 if t <= -P.turn else 0


def factors(zl, zh, nr=None):
    """what the engine needs of one stock: {"M"|"Q"|"Y": [zone steps, rel (None = no zone / price), place label code, mother candle n]}
    (None without the zones) — read once from a collection, scored any number of times (score)"""
    if not zl or not zh:
        return None
    price = _num(zl.get("Price"))
    out, zb = {}, {}
    for tf in "MQY":
        sh = shifts([(_num(zh.get(f"{tf}{k}_Bottom")), _num(zh.get(f"{tf}{k}_Top"))) for k in range(5)])
        bottom = _num(zl.get(f"{tf}_Bottom_Zone"))
        top = _num(zl.get(f"{tf}_Top_Zone"))
        if bottom is None or top is None:                    # fall back to the history's current zone
            bottom, top = _num(zh.get(f"{tf}0_Bottom")), _num(zh.get(f"{tf}0_Top"))
        rel = None if None in (price, bottom, top) or top <= bottom else (price - bottom) / (top - bottom)
        lab = str(zl.get(f"{tf}_Position") or "")
        out[tf] = [sh, rel, LABELS.index(lab) if lab in LABELS else 0, (nr or {}).get(tf, 0)]
        zb[tf] = (bottom, top)
    # round 25 — the zone ladder: each timeframe's current zone and the close of its last completed candle
    zb["W"] = (_num(zl.get("W_Bottom_Zone")), _num(zl.get("W_Top_Zone")))
    out["Z"] = [*zb["W"], *zb["M"], *zb["Q"], *zb["Y"], price, *[_num(zl.get(f"Prev_{n}_Close")) for n in ("Week", "Month", "Quarter", "Year")]]
    return out


def zone_in(small, big):
    """where a smaller zone sits in a bigger one: above · break_top · upper · lower · break_bottom · below (None = a zone missing)"""
    (sb, st), (bb, bt) = small, big
    if None in (sb, st, bb, bt) or st <= sb or bt <= bb:
        return None
    if sb > bt:
        return "above"
    if st < bb:
        return "below"
    if st > bt and sb >= bb:
        return "break_top"
    if sb < bb and st <= bt:
        return "break_bottom"
    if st > bt and sb < bb:                                  # the smaller zone is wider than the bigger one: no placement
        return None
    return "upper" if (sb + st) >= (bb + bt) else "lower"


def ladder(Z, P=None):
    """the zone ladder of one stock → (total marks, [(item, marks)]) — confirmed breakouts / breakdowns (strict W → M → Q → Y) and the
    zone-in-zone placements; only items with marks are listed"""
    if not Z:
        return 0, []
    P = P or _P
    zones = {"W": (Z[0], Z[1]), "M": (Z[2], Z[3]), "Q": (Z[4], Z[5]), "Y": (Z[6], Z[7])}
    closes = {"W": Z[9], "M": Z[10], "Q": Z[11], "Y": Z[12]}
    state = {}                                               # how the last completed candle closed: 1 above the zone · −1 below · 0 inside
    for tf in LADDER_TFS:
        (b, t), c = zones[tf], closes[tf]
        state[tf] = None if None in (b, t, c) or t <= b else 1 if c > t else -1 if c < b else 0
    # consolidation: the weekly candle closed one way and a higher one the other way — those marks cancel (it is ranging, not breaking)
    mixed = {tf for tf in "MQY" if P.l_consol and state["W"] and state[tf] and state["W"] == -state[tf]}
    off = ({"W"} | mixed) if mixed else set()
    items, up_chain, dn_chain = [], True, True
    for tf in LADDER_TFS:
        up, dn = state[tf] == 1, state[tf] == -1
        if tf not in off:
            if up and (up_chain or not P.l_strict) and P.l_close[tf]:
                items.append((f"up_{tf}", P.l_close[tf]))
            if dn and (dn_chain or not P.l_strict) and P.l_close[tf]:
                items.append((f"down_{tf}", -P.l_close[tf]))
        up_chain, dn_chain = up_chain and up, dn_chain and dn
    items += [(f"consol_W{tf}", 0) for tf in "MQY" if tf in mixed]
    for k in LADDER_PAIRS:
        where = zone_in(zones[k[0]], zones[k[1]])
        if where in ZONE_IN:
            m = P.l_pairs[k][ZONE_IN.index(where)]
            if m:
                items.append((f"{k}_{where}", m))
    if gate(Z, P):
        items += [(f"gate_{tf}", 0) for tf in "MQ" if _fallen(Z, tf)]
    return sum(m for _, m in items), items


def _fallen(Z, tf):
    """the price is below that zone, but its last candle closed inside or above (the fall is not confirmed yet)"""
    i = "WMQY".index(tf)
    b, t, px, c = Z[2 * i], Z[2 * i + 1], Z[8], Z[9 + i]
    return None not in (b, t, px, c) and t > b and px < b and c >= b


def gate(Z, P=None):
    """the zone ladder's green gate: not green while the price has fallen below the monthly or quarterly zone, unconfirmed"""
    P = P or _P
    return bool(Z) and P.l_guard and (_fallen(Z, "M") or _fallen(Z, "Q"))


def score(f, P=None):
    """[colour, strength, [M], [Q], [Y]] from one stock's factors (None without a quarterly view); the ladder model adds its total as a
    6th element"""
    if not f:
        return None
    P = P or _P
    lad = P.model == "ladder"
    pos_w = 0.0 if lad else P.pos_w                         # the ladder model: where the price sits in a zone earns nothing
    per = {}
    for tf in "MQY":
        sh, rel, lab, b = f[tf]
        t = trend(None, sh, P)
        if t is None or rel is None:
            per[tf] = None
            continue
        p, pcode = _pos(rel)
        place = nr_place(LABELS[lab], rel)
        s = round(max(-100.0, min(100.0, 100 * (P.trend_w * t + pos_w * p) + nr_points(b, place, P))))
        # + streak ("down for 3 quarters") + mother candle (±n) + where it happened (index in NR_PLACES)
        per[tf] = [trend_code(t, P), pcode, s, *streak(sh, P), b, NR_PLACES.index(place)]   # place: always (combination code)
    if per["Q"] is None:
        return None
    return _finish(per, P, ladder(f.get("Z"), P)[0], gate(f.get("Z"), P)) if lad else _finish(per, P)


def read_stock(zl, zh, nr=None, P=None):
    """zl: Zone_Levels row, zh: Zone_History row → [colour 1/0/−1, strength, [M], [Q], [Y]] or None (no quarterly view)."""
    return score(factors(zl, zh, nr), P)


def _finish(per, P=None, lad=None, gated=False):
    """[colour, strength, [M], [Q], [Y]] from the timeframe results (each [.., .., strength, ..] or None); lad = the zone ladder's
    marks (the ladder model only: added to the strength and kept as a 6th element)"""
    P = P or _P
    parts = [(P.tf_w[tf], per[tf][2]) for tf in "MQY" if per[tf] is not None]
    wsum = sum(w for w, _ in parts)
    strength = round(sum(w * s for w, s in parts) / wsum) if wsum else per["Q"][2]
    if lad is not None:
        strength = max(-100, min(100, strength + lad))
    colour = 1 if strength >= P.cut and (per["Q"][2] >= 0 or not P.q_guard) else -1 if strength <= -P.cut else 0
    if gated and colour == 1:                                # the zone ladder's green gate (an unconfirmed fall below M / Q)
        colour = 0
    return [colour, strength, per["M"], per["Q"], per["Y"]] + ([lad, 1 if gated else 0] if lad is not None else [])


def apply_regime(v, w, P=None):
    """Regime analyser (owner, 2026-10-31): a timeframe strength pointing against the long-term (monthly) regime w (1 / −1) is squeezed
    into sideways; the stock strength and colour are recomputed. → (result, held timeframes e.g. "MQ")."""
    if not v or not w:
        return v, ""
    P = P or _P
    per, held = {}, ""
    for tf, t in zip("MQY", v[2:5]):
        if t is not None and t[2] * w < 0:
            t = [t[0], t[1], round(t[2] * P.squeeze), *t[3:]]
            held += tf
        per[tf] = t
    lad = v[5] if len(v) > 5 else None
    gated = bool(v[6]) if len(v) > 6 else False
    if lad and lad * w < 0:                                  # the zone ladder against the regime: squeezed like the periods
        lad, held = round(lad * P.squeeze), held or "L"
    if not held:
        return v, ""
    return _finish(per, P, lad, gated), held.replace("L", "")


def _clean(v):
    return str(v or "").replace("NSE:", "").replace(",", "").strip().upper()


def factors_all(sheets):
    """symbol -> factors for every stock with a Zone_History row ({} for collections without Zone_History)."""
    hist = sheets.get("Zone_History") or []
    if not hist:
        return {}
    zl = {_clean(r.get("Symbol")): r for r in sheets.get("Zone_Levels", [])}
    nrs = nr_map(sheets)
    out = {}
    for r in hist:
        sym = _clean(r.get("Symbol"))
        f = factors(zl.get(sym), r, nrs.get(sym))
        if f:
            out[sym] = f
    return out


def read_all(sheets, P=None):
    """symbol -> result for every stock with a Zone_History row ({} for collections without Zone_History)."""
    out = {}
    for sym, f in factors_all(sheets).items():
        v = score(f, P)
        if v:
            out[sym] = v
    return out
