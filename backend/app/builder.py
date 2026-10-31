"""
Hyperplane AI Portfolio Builder (owner, 2026-10-31) — a model portfolio from the customer's amount, stock count,
market-cap mix and reliability, built on the AI Portfolio engine (zone_engine strength `zv`, long-term regime `rp`).

Pure function on the PUBLISHED customer view (the same numbers the customer app shows), so the customer service can
run it without touching collections. Rules (Claude's proposal on the owner's request "the very highest probability";
the owner may tune the constants):

  Base = ZONES: each timeframe's strength is the zone engine's (how the M / Q / Y zones step + where today's price sits
  in the current zone), already held back by the long-term regime; the horizon option blends them (long = M20 Q50 Y30,
  the Analyser's own weights; medium = M45 Q40 Y15).
  Who can be picked (owner 2026-11-01: amounts ₹10,000 … ₹10,000 crore, up to 1,000 stocks, more options)
    · tier 1 = blended strength ≥ the quality bar (strong 40 · good 24) and the quarter not negative; tier 2 ("Building",
      only with quality "building", used after tier 1 runs out in that group) = strength ≥ 10, quarter not negative
    · long-term regime up (monthly); option "confirmed" = weekly up too. No regime data at all = check skipped
    · reliability High, or High + Medium (Low never); ≥ 3 years of yearly history; Large / Mid / Small cap only
    · NOT already run up: never stretched (3x in a year); 3-month rise above the run-up option (20 / 30 / 50 %, or off)
    · options: F&O stocks only; sectors to leave out
  Ranking (conviction) inside each market-cap group
    blended strength + 6 weekly regime up / − 10 turning down + 5 High reliability + 1.5 per quarter of up-streak (≤ 4)
    + zones stepping: 3 × quarterly zone trend code + 1.5 × yearly code (−2…+2) ± 3 quarter-on-quarter zone step
    + industry / sector long-term strength around 50 % (± 5 / ± 2.5) — tie-breakers, never filters
    − 4 already above this month's zone · − 0.5 per % of the last 3 months above +20 %
  Building
    cash = the customer's cash share (never below CASH_MIN %, the buffer for charges, rounding and new chances);
    each group's money = amount × its share; stocks per group in proportion to the shares (each group with money gets ≥ 1);
    picks go round the groups best-first, skipping a stock when its sector would pass the sector limit (money), its
    industry already holds IND_MAX_SHARE of the stocks, or one share costs more than its slice;
    quantity = whole shares (equal money per stock, or "stronger gets more": weight ∝ conviction, 0.5x…2x of equal);
    when a group has fewer picks than asked (owner 2026-11-01: "I kept 10 % cash, the plan kept 50 %"), its money is
    shared by the picks it has (water filling: one stock ≤ the stock_max option of the amount, a sector ≤ its limit), and a stock
    first skipped as too costly for its slice gets a second chance with the bigger slice — so cash stays at the
    customer's choice unless those limits are full (then a note says why);
    a top-up pass buys one more share of the best picks while the group's money allows; everything left = cash.
Customers receive the plan and plain reasons — never the weights above.
"""
import math

CASH_MIN = 5                     # % always kept as a buffer
IND_MAX_SHARE = 0.10             # at most 10 % of the stocks (min 2) from one industry
MIN_STOCKS, MAX_STOCKS = 5, 1000                       # owner, 2026-11-01: "up to 1000 stocks"
MIN_AMOUNT, MAX_AMOUNT = 10_000, 100_000_000_000       # ₹10,000 … ₹10,000 crore
CAPS = ("Large", "Mid", "Small")
# owner, 2026-11-01 (mid was given as 20/50/10/10 = 90 %: small set to 20 so it makes 100 — owner to confirm)
PRESETS = {"large": {"Large": 70, "Mid": 10, "Small": 10, "Cash": 10}, "mid": {"Large": 20, "Mid": 50, "Small": 20, "Cash": 10},
           "small": {"Large": 15, "Mid": 15, "Small": 60, "Cash": 10}, "multi": {"Large": 25, "Mid": 25, "Small": 25, "Cash": 25}}
SECTOR_LIMITS = (5, 10, 15, 20, 25, 30, 40, 100)          # owner 2026-11-01: 5 and 10 % added
STOCK_LIMITS = (5, 10, 15, 20, 25)                      # % of the amount in one stock
RUN_UP_LIMITS = (20, 30, 50, 0)                         # leave out stocks up more than this % in 3 months (0 = no limit)
# horizon = how the monthly / quarterly / yearly zone strengths are blended (long = the AI Portfolio engine's own weights)
HORIZONS = {"long": {"M": 20, "Q": 50, "Y": 30}, "medium": {"M": 45, "Q": 40, "Y": 15}}
# trend quality bar: (tier-1 minimum strength, tier-2 minimum or None = no "building" fill)
QUALITY = {"strong": (40, None), "good": (24, None), "building": (24, 10)}
REL_WORD = {"S": "High", "M": "Medium", "W": "Low"}
PF_MIN_YEARS = 3
LIQ_WARN = {"Large": 500_000_000, "Mid": 100_000_000, "Small": 20_000_000}   # no volume known: per-stock ₹ that needs care
# Trading volume (owner, 2026-11-01): buying more than LIQ_PART of a normal day's trading moves the price. A position is
# "easy" within a day at that pace; more than LIQ_DAYS days of buying is flagged. With the option "size by volume" ON,
# no position is bigger than LIQ_DAYS days of buying (the rest goes to the others / cash); OFF = suggestions only.
LIQ_PART, LIQ_DAYS = 0.10, 5


class BuildError(ValueError):
    """A customer input that cannot be used (shown to the customer as is)."""


def _group_index(rows_by_tf, industry):
    """name -> average Quarterly + Yearly strength (0–100) of each sector / industry."""
    acc = {}
    for tf in ("Q", "Y"):
        for r in (rows_by_tf or {}).get(tf, []):
            k = (r.get("sec"), r["k"]) if industry else r["k"]
            a = acc.setdefault(k, [0.0, 0]); a[0] += r["st"]; a[1] += 1
    return {k: v[0] / v[1] for k, v in acc.items()}


def check_options(o):
    """The 'More options' inputs (all optional; defaults = the safest everyday choice)."""
    o = dict(o or {})
    out = {"horizon": o.get("horizon", "long"), "quality": o.get("quality", "building"), "confirmed": bool(o.get("confirmed", False)),
           "stock_max": o.get("stock_max", 10), "run_up": o.get("run_up", 30), "fno_only": bool(o.get("fno_only", False)),
           "exclude": [str(x) for x in (o.get("exclude") or [])][:100], "by_volume": bool(o.get("by_volume", False))}
    if out["horizon"] not in HORIZONS:
        raise BuildError("Choose a time horizon")
    if out["quality"] not in QUALITY:
        raise BuildError("Choose how strong the trends must be")
    if out["stock_max"] not in STOCK_LIMITS:
        raise BuildError("Choose a single-stock limit")
    if out["run_up"] not in RUN_UP_LIMITS:
        raise BuildError("Choose the 'already ran up' limit")
    return out


def check_inputs(amount, count, alloc, reliability, sector_max, weighting):
    try:
        amount = float(amount)
        count = int(count)
    except (TypeError, ValueError):
        raise BuildError("Enter the amount and the number of stocks")
    if not MIN_AMOUNT <= amount <= MAX_AMOUNT:
        raise BuildError("Enter an amount between ₹10,000 and ₹10,000 crore")
    if not MIN_STOCKS <= count <= MAX_STOCKS:
        raise BuildError(f"Choose between {MIN_STOCKS} and {MAX_STOCKS} stocks")
    try:
        alloc = {k: float(alloc.get(k, 0)) for k in ("Large", "Mid", "Small", "Cash")}
    except (AttributeError, TypeError, ValueError):
        raise BuildError("Set the market-cap mix")
    if any(v < 0 or v > 100 for v in alloc.values()) or abs(sum(alloc.values()) - 100) > 0.01:
        raise BuildError("The market-cap mix and cash must add up to 100%")
    if alloc["Cash"] < CASH_MIN:
        raise BuildError(f"Keep at least {CASH_MIN}% as cash")
    if sum(alloc[k] for k in CAPS) <= 0:
        raise BuildError("Put some money in at least one market-cap group")
    rel = list(dict.fromkeys(reliability or []))
    if "W" in rel:
        raise BuildError("Low reliability stocks are not allowed in the builder")
    if not rel or any(r not in ("S", "M") for r in rel):
        raise BuildError("Choose High reliability, or High and Medium")
    if sector_max not in SECTOR_LIMITS:
        raise BuildError("Choose a sector limit")
    if weighting not in ("equal", "strength"):
        raise BuildError("Choose how the money is shared")
    return amount, count, alloc, set(rel), sector_max, weighting


def candidates(data, rel, opts=None):
    """(eligible stocks with their conviction and plain reasons; counts of why the others were left out).
    Zones are the base: each timeframe's strength comes from the zone engine (how the zones are stepping + where the
    price sits in the current zone, already held back by the long-term regime), blended by the chosen horizon."""
    o = check_options(opts)
    wts = HORIZONS[o["horizon"]]
    t1, t2 = QUALITY[o["quality"]]
    stocks = data.get("stocks", [])
    has_regime = any(s.get("rp") for s in stocks)
    secs, inds = _group_index(data.get("sectors"), False), _group_index(data.get("industries"), True)
    excl = set(o["exclude"])
    out, skip = [], {"view": 0, "new": 0, "reliability": 0, "regime": 0, "moved": 0, "cap": 0, "weak": 0, "sector": 0, "fno": 0}
    for s in stocks:
        zv = s.get("zv")
        if not zv or s.get("p") is None or not zv[3]:
            skip["view"] += 1; continue
        if s.get("yh") is None or s["yh"] < PF_MIN_YEARS:
            skip["new"] += 1; continue
        if s.get("cap") not in CAPS:
            skip["cap"] += 1; continue
        if s.get("h") not in rel:
            skip["reliability"] += 1; continue
        if s.get("sec") in excl:
            skip["sector"] += 1; continue
        if o["fno_only"] and not s.get("f"):
            skip["fno"] += 1; continue
        rp = s.get("rp")
        if has_regime and not (rp and rp[0] == 1 and (not o["confirmed"] or rp[1] == 1)):
            skip["regime"] += 1; continue
        r3 = s.get("r3")
        if s.get("x") or (o["run_up"] and r3 is not None and r3 > o["run_up"]):
            skip["moved"] += 1; continue
        m, q, y = zv[2], zv[3], zv[4]
        parts = [(wts[k], t[2]) for k, t in (("M", m), ("Q", q), ("Y", y)) if t]
        st = round(sum(w * v for w, v in parts) / sum(w for w, _ in parts))
        tier = 1 if st >= t1 and q[2] >= 0 else 2 if t2 is not None and st >= t2 and q[2] >= 0 else 0
        if not tier:
            skip["weak"] += 1; continue
        sec, ind = secs.get(s["sec"]), inds.get((s["sec"], s["ind"]))
        weekly = rp[1] if rp else None
        qstreak = min(q[4], 4) if len(q) > 4 and q[3] == 1 else 0
        qstep = (s.get("zs") or [None, None])[1]
        score = st + (6 if weekly == 1 else -10 if weekly == -1 else 0) + (5 if s["h"] == "S" else 0) + 1.5 * qstreak
        score += 3 * q[0] + (1.5 * y[0] if y else 0) + (3 if qstep == 1 else -3 if qstep == -1 else 0)   # zones stepping
        score += (0.1 * (ind - 50) if ind is not None else 0) + (0.05 * (sec - 50) if sec is not None else 0)
        score -= (4 if m and m[1] == 2 else 0) + (0.5 * (r3 - 20) if r3 is not None and r3 > 20 else 0)  # stretched
        why = ["Trend still building"] if tier == 2 else []
        why.append(f"Long-term strength {st:+d}")
        if qstreak >= 2:
            why.append(f"Quarterly trend up for {qstreak} quarters")
        elif q[3] == 1:
            why.append("Quarterly trend turned up")
        if q[1] >= 1:
            why.append("Price holding up well this quarter")
        if has_regime:
            why.append("Long-term regime up" + (", confirmed" if weekly == 1 else ", but it has started changing" if weekly == -1 else ""))
        why.append(f"{REL_WORD[s['h']]} reliability")
        if ind is not None and ind >= 61:
            why.append("Strong industry")
        out.append({"s": s, "tier": tier, "st": st, "score": round(score, 2), "why": why})
    return out, skip


def preview(data, reliability, opts=None):
    """What the form shows while the customer types: how many stocks pass every check today, per market cap, and the
    sectors they can leave out. Counts only — no stock names."""
    rel = list(dict.fromkeys(reliability or ["S"]))
    if "W" in rel or not rel or any(r not in ("S", "M") for r in rel):
        raise BuildError("Choose High reliability, or High and Medium")
    pool_, _ = candidates(data, set(rel), opts)
    by = {c: {"strong": 0, "building": 0} for c in CAPS}
    for x in pool_:
        by[x["s"]["cap"]]["strong" if x["tier"] == 1 else "building"] += 1
    sectors = sorted({s.get("sec") for s in data.get("stocks", []) if s.get("zv") and s.get("sec")})
    return {"as_of": data.get("as_of"), "by_cap": by, "total": len(pool_), "sectors": sectors}


def _split(total, shares):
    """Whole numbers in proportion to shares (largest remainder); every group with a share > 0 gets at least 1."""
    keys = [k for k, v in shares.items() if v > 0]
    if not keys:
        return {}
    tot = sum(shares[k] for k in keys)
    raw = {k: total * shares[k] / tot for k in keys}
    n = {k: max(1, math.floor(raw[k])) for k in keys}
    while sum(n.values()) > total and any(v > 1 for v in n.values()):
        k = max((k for k in keys if n[k] > 1), key=lambda k: n[k] - raw[k]); n[k] -= 1
    for k in sorted(keys, key=lambda k: raw[k] - math.floor(raw[k]), reverse=True):
        if sum(n.values()) >= total:
            break
        n[k] += 1
    return n


def _fill(picked, budgets, weights, caps, sec_cap):
    """Money per pick: each group's budget shared by its picks (by weight), never above the single-stock cap and never
    pushing a sector past its limit; what a capped stock cannot take goes to the others in its group (water filling).
    Money that no pick can take stays unspent (→ cash)."""
    alloc = {id(x): 0.0 for xs in picked.values() for x in xs}
    rem, full, sec_used = dict(budgets), set(), {}
    for _ in range(60):
        adds = {}
        for c, xs in picked.items():
            act = [x for x in xs if id(x) not in full]
            if rem.get(c, 0) < 0.5 or not act:
                continue
            wt = sum(weights[id(x)] for x in act)
            for x in act:
                adds[id(x)] = (c, x, min(rem[c] * weights[id(x)] / wt, caps[id(x)] - alloc[id(x)]))
        if not adds:
            break
        by_sec = {}
        for c, x, a in adds.values():
            by_sec[x["s"]["sec"]] = by_sec.get(x["s"]["sec"], 0) + a
        for sec, add in by_sec.items():
            room = sec_cap - sec_used.get(sec, 0)
            if add > room + 1e-6:                            # sector full: shrink its share, its stocks take no more
                f = max(room, 0) / add
                for k, (c, x, a) in list(adds.items()):
                    if x["s"]["sec"] == sec:
                        adds[k] = (c, x, a * f); full.add(k)
        moved = 0.0
        for k, (c, x, a) in adds.items():
            alloc[k] += a; rem[c] -= a; moved += a
            sec_used[x["s"]["sec"]] = sec_used.get(x["s"]["sec"], 0) + a
            if alloc[k] >= caps[k] - 1e-6:
                full.add(k)
        if moved < 0.5:
            break
    return alloc


def build(data, amount, count, alloc, reliability, sector_max=25, weighting="equal", opts=None):
    amount, count, alloc, rel, sector_max, weighting = check_inputs(amount, count, alloc, reliability, sector_max, weighting)
    o = check_options(opts)
    pool_, skip = candidates(data, rel, o)
    groups = {c: sorted([x for x in pool_ if x["s"]["cap"] == c], key=lambda x: (x["tier"], -x["score"])) for c in CAPS}
    money = {c: amount * alloc[c] / 100 for c in CAPS}
    want = _split(count, {c: alloc[c] for c in CAPS})
    equity = sum(money.values())
    sec_cap = equity * sector_max / 100 if sector_max < 100 else math.inf
    ind_cap = max(2, math.ceil(count * IND_MAX_SHARE))
    # one stock never above the single-stock limit, unless the customer's own plan gives each stock more
    stock_cap = max(amount * o["stock_max"] / 100, max((money[c] / want[c] for c in want), default=0))
    picked = {c: [] for c in CAPS}
    sec_money, ind_n, idx, pricey = {}, {}, {c: 0 for c in CAPS}, {c: [] for c in CAPS}

    def capof(s):
        """the most money one stock may take: the single-stock limit, and with 'size by volume' its trading volume too"""
        if o["by_volume"] and s.get("av"):
            return min(stock_cap, LIQ_DAYS * LIQ_PART * s["av"] * s["p"])
        return stock_cap

    def fits(s, slice_):
        return (sec_money.get(s["sec"], 0) + slice_ <= sec_cap + 1e-6
                and ind_n.get((s["sec"], s["ind"]), 0) < ind_cap and capof(s) >= s["p"])

    def take(c, x, slice_):
        s = x["s"]; picked[c].append(x)
        sec_money[s["sec"]] = sec_money.get(s["sec"], 0) + slice_
        ind_n[(s["sec"], s["ind"])] = ind_n.get((s["sec"], s["ind"]), 0) + 1

    active = [c for c in CAPS if want.get(c)]
    while active:                                            # round the groups, best first
        for c in list(active):
            slice_ = money[c] / want[c]
            took = False
            while idx[c] < len(groups[c]):
                x = groups[c][idx[c]]; idx[c] += 1
                if x["s"]["p"] > slice_:
                    pricey[c].append(x); continue            # one share costs more than its slice (for now)
                if fits(x["s"], slice_):
                    take(c, x, slice_); took = True
                    break
            if not took or len(picked[c]) >= want[c]:
                active.remove(c)
    for c in CAPS:                                           # a short group shares its money among fewer stocks, so a
        for x in pricey[c]:                                  # stock skipped as too costly may fit now
            if len(picked[c]) >= want.get(c, 0):
                break
            slice_ = money[c] / (len(picked[c]) + 1)
            if x["s"]["p"] <= min(slice_, capof(x["s"])) and fits(x["s"], slice_):
                take(c, x, slice_)
    for c in CAPS:
        picked[c].sort(key=lambda x: (x["tier"], -x["score"]))
    weights = {}
    for c, xs in picked.items():
        if not xs:
            continue
        raw = [max(x["score"], 1.0) for x in xs] if weighting == "strength" else [1.0] * len(xs)
        eq = sum(raw) / len(raw)
        for x, r in zip(xs, raw):
            weights[id(x)] = min(2 * eq, max(0.5 * eq, r))
    caps = {id(x): capof(x["s"]) for xs in picked.values() for x in xs}
    tgt = _fill(picked, {c: money[c] for c in CAPS if picked[c]}, weights, caps, sec_cap)
    qty = {id(x): math.floor(tgt[id(x)] / x["s"]["p"]) for xs in picked.values() for x in xs}
    sec_act = {}
    for xs in picked.values():
        for x in xs:
            sec_act[x["s"]["sec"]] = sec_act.get(x["s"]["sec"], 0) + qty[id(x)] * x["s"]["p"]
    for c, xs in picked.items():                             # whole shares leave change: buy one more share of the
        left = money[c] - sum(qty[id(x)] * x["s"]["p"] for x in xs)   # best picks while the group's money, the stock
        for loose in (1.15, None):                           # cap and the sector limit allow (first near each target)
            changed = True
            while changed:
                changed = False
                for x in xs:
                    p, k, sec = x["s"]["p"], id(x), x["s"]["sec"]
                    new = (qty[k] + 1) * p
                    if (p <= left + 1e-6 and new <= caps[k] + 1e-6 and sec_act[sec] + p <= sec_cap + 1e-6
                            and (loose is None or new <= tgt[k] * loose)):
                        qty[k] += 1; left -= p; sec_act[sec] += p; changed = True
    holdings = [{"x": x, "qty": qty[id(x)], "cap": c} for c, xs in picked.items() for x in xs if qty[id(x)] > 0]
    invested = sum(h["qty"] * h["x"]["s"]["p"] for h in holdings)
    cash = amount - invested
    notes = []
    for c in CAPS:
        n, w = sum(1 for h in holdings if h["cap"] == c), want.get(c, 0)
        if w and not n and groups[c]:
            notes.append(f"Every {c.lower()} cap stock that passed the checks costs more per share than the "
                         f"₹{money[c] / w:,.0f} available for each, so that money is kept as cash. A larger amount or fewer stocks fixes this.")
        elif w and not n:
            notes.append(f"No {c.lower()} cap stock passed every check today, so that money is kept as cash.")
        elif w and n < w:
            notes.append(f"Only {n} of the {w} {c.lower()} cap stocks you asked for passed every check today, "
                         f"so each of them gets a bigger share of the {c.lower()} cap money.")
    extra = cash / amount * 100 - alloc["Cash"]
    if extra >= 2:
        notes.append(f"Cash is {extra:.1f}% above your choice: the stocks that passed reached the limits that keep the "
                     f"portfolio spread out (at most {o['stock_max']}% of the money in one stock"
                     + (f" and {sector_max}% in one sector" if sector_max < 100 else "")
                     + (", and no more than " + str(LIQ_DAYS) + " days of normal trading per stock" if o["by_volume"] else "")
                     + "), or one share costs more than its share of the money.")
    per = amount * (1 - alloc["Cash"] / 100) / count
    if per < 5000:
        notes.append(f"Each stock gets about ₹{per:,.0f}. Stocks priced above their share are left out; fewer stocks or a larger amount gives a wider choice.")
    if "M" not in rel and len(holdings) < count:
        notes.append("Adding Medium reliability gives the builder more stocks to choose from.")
    days = lambda h: h["qty"] / (LIQ_PART * h["x"]["s"]["av"]) if h["x"]["s"].get("av") else None
    slow = [h for h in holdings if (days(h) or 0) > LIQ_DAYS]
    if slow:
        notes.append(f"{len(slow)} position{'s are' if len(slow) > 1 else ' is'} large compared with how much the stock normally trades "
                     f"(more than {LIQ_DAYS} days of buying at {LIQ_PART * 100:.0f}% of a normal day). Buy slowly over several days, "
                     "choose more stocks, or turn on 'Size by trading volume' in More options.")
    big = {c: sum(1 for h in holdings if h["cap"] == c and not h["x"]["s"].get("av") and h["qty"] * h["x"]["s"]["p"] > LIQ_WARN[c]) for c in CAPS}
    if any(big.values()):
        notes.append("Some positions are large for their company size (" + ", ".join(f"{n} {c.lower()} cap" for c, n in big.items() if n)
                     + "). Buying that much at once can move the price: spread the buying over several days, or choose more stocks.")
    if o["exclude"]:
        notes.append(f"Sectors left out as you asked: {', '.join(o['exclude'])}.")
    n2 = sum(1 for h in holdings if h["x"]["tier"] == 2)
    if n2:
        notes.append(f"{n2} of the stocks have a trend that is still building (marked). They were added because not enough "
                     "stocks with a strong trend passed every check in their market-cap group.")
    picks = []
    for rank, h in enumerate(sorted(holdings, key=lambda h: (CAPS.index(h["cap"]), h["x"]["tier"], -h["x"]["score"])), 1):
        s, amt = h["x"]["s"], round(h["qty"] * h["x"]["s"]["p"], 2)
        zv = s["zv"]
        picks.append({"s": s["s"], "n": s["n"], "sec": s["sec"], "ind": s["ind"], "cap": h["cap"], "p": s["p"],
                      "qty": h["qty"], "amt": amt, "w": round(amt / amount * 100, 2), "st": h["x"]["st"],
                      "m": zv[2][2] if zv[2] else None, "q": zv[3][2] if zv[3] else None, "y": zv[4][2] if zv[4] else None,
                      "h": s["h"], "tier": h["x"]["tier"], "why": h["x"]["why"],
                      # days to buy at LIQ_PART of a normal day's trading (None = volume not known)
                      "days": round(days(h), 1) if days(h) is not None else None})
    by_cap = [{"k": c, "target": alloc[c], "amt": round(sum(p["amt"] for p in picks if p["cap"] == c), 2),
               "n": sum(1 for p in picks if p["cap"] == c)} for c in CAPS]
    by_cap.append({"k": "Cash", "target": alloc["Cash"], "amt": round(cash, 2), "n": 0})
    for r in by_cap:
        r["pct"] = round(r["amt"] / amount * 100, 2)
    secs = {}
    for p in picks:
        a = secs.setdefault(p["sec"], {"k": p["sec"], "amt": 0.0, "n": 0}); a["amt"] += p["amt"]; a["n"] += 1
    by_sec = sorted(({**v, "amt": round(v["amt"], 2), "pct": round(v["amt"] / invested * 100, 2) if invested else 0}
                     for v in secs.values()), key=lambda r: -r["amt"])
    return {"as_of": data.get("as_of"), "amount": amount, "count": count, "alloc": alloc, "reliability": sorted(rel), "opts": o,
            "sector_max": sector_max, "weighting": weighting, "invested": round(invested, 2), "cash": round(cash, 2),
            "cash_pct": round(cash / amount * 100, 2), "stocks": len(picks),
            "avg_st": round(sum(p["st"] for p in picks) / len(picks)) if picks else None,
            "by_cap": by_cap, "by_sec": by_sec, "picks": picks, "notes": notes,
            "checked": len(data.get("stocks", [])), "qualified": len(pool_),
            "strong": sum(1 for x in pool_ if x["tier"] == 1), "left_out": skip}
