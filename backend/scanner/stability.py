"""
Stability score (owner, 2026-11-06: "don't check based on specific years … check all the history you have … you can
identify the falls using the zones and levels as well … use multiple of the best strategies to identify the best stable
stocks … at the same time don't move every slightly deviated stock to Medium, else there is no difference").

One score 0 … 100 from six independent checks on ALL the history the scanner has (13 yearly, 13 quarterly candles,
5 quarterly and 5 yearly zones). Reliability High = score ≥ HIGH_SCORE (and not Low); Low stays the hard rule in the
scanner (far below its peak). Pure Python, no heavy imports: the scanner computes it for new collections, the worker
re-rates stored ones from their stored candles and zones.

  recent falls   the deepest fall inside the last 13 quarters (peak → later low)          25 % → 100 · 65 % → 0
  past crashes   every yearly crash in the whole history (year low vs the peak before it),
                 older ones count a little less (≤ 3 y ×1, ≤ 6 y ×0.85, older ×0.7)          35 % → 100 · 85 % → 0
  now vs peak    how far today's price is below its all-time high                          10 % → 100 · 60 % → 0
  consistency    share of up years, less when years swing wildly (spread above 35 %)
  rise speed     price ÷ the lowest monthly low of the last 12 months                       1.6x → 100 · 3.3x → 0
  zones          the quarterly and yearly zones (Zone_History): up steps count 1, level ½
  weights 20 · 15 · 20 · 15 · 15 · 15; a short record pulls the score toward 50 (confidence = years / 5, at least 0.4).
Constants are Claude's proposal — the owner may tune them.
"""

HIGH_SCORE = 58                  # reliability High from this score (calibrated 2026-11-06: ~600 of ~1,800 stocks; was 1,171)
WEIGHTS = {"recent": 20, "crash": 15, "peak": 20, "steady": 15, "speed": 15, "zones": 15}
WORDS = {"recent": "deep recent fall", "crash": "big past crash", "peak": "far below its peak", "steady": "uneven years",
         "speed": "rose too fast", "zones": "zones stepping down"}


def _ok(v):
    return v is not None and v == v


def _clip(v):
    return 0.0 if v < 0 else 100.0 if v > 100 else v


def max_fall(highs, lows):
    """deepest fall (%, negative) from a running peak to a later low; bars newest first (index 0 = now)"""
    peak, worst = None, 0.0
    for h, l in zip(list(highs)[::-1], list(lows)[::-1]):
        if not _ok(h) or not _ok(l) or l <= 0:
            continue
        if peak:
            worst = min(worst, (l / peak - 1) * 100)
        peak = max(peak or 0, h)
    return worst


def _crash_eff(yh, yl):
    """the worst yearly crash, weighted by how long ago it happened (%, positive)"""
    peak, worst = None, 0.0
    n = len(yh)
    for j in range(n - 1, -1, -1):                      # oldest → now; j = years ago
        h, l = yh[j], yl[j]
        if not _ok(h) or not _ok(l) or l <= 0:
            continue
        if peak:
            w = 1.0 if j <= 3 else 0.85 if j <= 6 else 0.7
            worst = max(worst, -(l / peak - 1) * 100 * w)
        peak = max(peak or 0, h)
    return worst


def _zone_steps(zones):
    """(up, level, down) steps of a zone list newest first [(bottom, top)]"""
    up = lv = dn = 0
    for (b0, t0), (b1, t1) in zip(zones, zones[1:]):
        if not all(_ok(v) for v in (b0, t0, b1, t1)) or t1 <= b1 or t0 <= b0:
            break
        x = ((t0 + b0) - (t1 + b1)) / 2 / (t1 - b1)
        up, lv, dn = up + (x >= 0.1), lv + (-0.1 < x < 0.1), dn + (x <= -0.1)
    return up, lv, dn


def facts_of(price, yh, yl, qh, ql, run1y):
    """the numbers behind the reasons: deepest recent fall, worst past crash, distance from the peak, 1-year rise"""
    peak = max((h for h in yh if _ok(h)), default=None)
    return {"fall3": max_fall(qh, ql), "crash": _crash_eff(yh, yl), "run1y": run1y,
            "dd": (price / peak - 1) * 100 if peak and price else None}


def stability(price, yh, yl, yc, qh, ql, run1y, zq=(), zy=()):
    """→ (score 0…100 or None, parts {name: 0…100}, years). yh / yl / yc: yearly high / low / close newest first
    (index 0 = this year); qh / ql: quarterly high / low newest first; run1y: price ÷ the lowest monthly low of the
    last 12 months; zq / zy: quarterly / yearly zones [(bottom, top)] newest first."""
    years = sum(1 for h in yh if _ok(h))
    if not price or not years:
        return None, {}, years
    peak = max(h for h in yh if _ok(h))
    parts = {}
    parts["recent"] = _clip(100 - (abs(max_fall(qh, ql)) - 25) * 2.5)
    parts["crash"] = _clip(100 - (_crash_eff(yh, yl) - 35) * 2)
    parts["peak"] = _clip(100 - (max(0.0, (1 - price / peak) * 100) - 10) * 2) if peak > 0 else 50.0
    closes = [price] + [c for c in yc[1:]]
    rets = [(a / b - 1) * 100 for a, b in zip(closes, closes[1:]) if _ok(a) and _ok(b) and b > 0]
    if len(rets) >= 2:
        mean = sum(rets) / len(rets)
        spread = (sum((r - mean) ** 2 for r in rets) / len(rets)) ** 0.5
        parts["steady"] = _clip(100 * sum(r > 0 for r in rets) / len(rets) - max(0.0, spread - 35))
    else:
        parts["steady"] = 50.0
    parts["speed"] = _clip(100 - (run1y - 1.6) * 60) if _ok(run1y) and run1y else 70.0
    uq, lq, dq = _zone_steps(list(zq))
    uy, ly, dy = _zone_steps(list(zy))
    n = uq + lq + dq + uy + ly + dy
    parts["zones"] = 100 * (uq + uy + 0.5 * (lq + ly)) / n if n else 60.0
    raw = sum(WEIGHTS[k] * v for k, v in parts.items()) / sum(WEIGHTS.values())
    conf = max(0.4, min(1.0, years / 5))
    return round(50 + (raw - 50) * conf), {k: round(v) for k, v in parts.items()}, years


def weakest(parts, facts=None, n=2):
    """plain reasons for the n weakest checks (below 60), with the numbers when known"""
    f = facts or {}
    txt = {"recent": f"fell {abs(f['fall3']):.0f}% within the last 3 years" if _ok(f.get("fall3")) else WORDS["recent"],
           "crash": f"crashed {f['crash']:.0f}% in its history" if _ok(f.get("crash")) else WORDS["crash"],
           "peak": f"{abs(f['dd']):.0f}% below its peak" if _ok(f.get("dd")) else WORDS["peak"],
           "steady": "uneven year-to-year moves",
           "speed": f"rose {f['run1y']:.1f}x in a year, too fast to call steady" if _ok(f.get("run1y")) else WORDS["speed"],
           "zones": "price zones stepping down"}
    return [txt[k] for k, v in sorted(parts.items(), key=lambda kv: kv[1]) if v < 60][:n]
