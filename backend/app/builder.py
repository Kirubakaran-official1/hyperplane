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
  Volume (owner 2026-11-01, liquidity.py): every pick gets a volume reading — how much it really trades a day, the
    most it can carry at the chosen buying pace (5 / 10 / 20 % of a normal day, thin or erratic stocks slower; 5 days
    of buying = also sellable within 10 days if trading halves), the days to buy, the % of a day and the price push.
    "Size by trading volume" ON: no stock above what it supports (the rest goes to the other stocks in its group) and
    a stock that supports < 30 % of its share is replaced by the next; OFF: the plan stays, every over-sized stock is
    warned. A day-by-day buying plan (which stock, how many shares, which day) comes with every build.
  Free float (owner 2026-11-02, liquidity.FLOAT_CAP): the shares the public can trade (all shares − promoters).
    "Size by free float" ON: no stock above 1 % of its free float (the rest goes to the others, a stock that can take
    < 30 % of its share is replaced); OFF: the plan stays, and a holding from 0.25 % of the free float is shown in the
    stock's details (above 1 % warned), with the SEBI line it reaches on all the company's shares.
Customers receive the plan and plain reasons — never the weights above.
"""
import math

from . import liquidity as L

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
LIQ_PART, LIQ_DAYS = 0.10, L.BUILD_DAYS          # (older fields; the volume analyser's standard pace and window)
PLAN_DAYS_SHOWN = 30                             # the buying plan lists the first 30 days one by one, the rest in one line


# Builder plans (owner, 2026-11-01): three permissions — builder:customer (every role, the default), builder:trader and
# builder:admin (given in Admin → Access manager only). The SERVER enforces them (a request made with Postman / Burp gets
# the same limits): amount, stock count, reliability, and whether More options / sector limit / weighting may differ
# from the standard settings below. Customer = up to ₹1 lakh, 20 stocks, High reliability, standard settings;
# Trader = up to ₹10,000 crore and 1,000 stocks, High / Medium, every option; Admin = any amount, every option.
DEFAULT_OPTS = {"horizon": "long", "quality": "good", "confirmed": True, "stock_max": 5, "run_up": 30, "fno_only": False,
                "exclude": [], "by_volume": False, "pace": "standard", "by_float": False}
DEFAULT_SECTOR, DEFAULT_WEIGHTING = 10, "equal"          # owner 2026-11-01: the standard settings for every plan
ADMIN_AMOUNT_CEIL = 1e15                                 # admin: no business limit, only a sanity bound on the number
TIERS = {
    "customer": {"name": "Customer", "min_amount": 10_000, "max_amount": 100_000, "max_stocks": 20, "reliability": ("S",), "options": False},
    "trader": {"name": "Trader", "min_amount": 10_000, "max_amount": 100_000_000_000, "max_stocks": 1000, "reliability": ("S", "M"), "options": True},
    "admin": {"name": "Admin", "min_amount": 1_000, "max_amount": None, "max_stocks": 1000, "reliability": ("S", "M"), "options": True},
}


class BuildError(ValueError):
    """A customer input that cannot be used (shown to the customer as is)."""


class PlanError(BuildError):
    """Allowed on a higher builder plan only (the customer service answers 403)."""


def plan_info(tier):
    """what the form may offer this customer (the server checks the same limits on every request)"""
    t = TIERS[tier]
    return {"tier": tier, **t, "reliability": list(t["reliability"]),
            "defaults": {"opts": dict(DEFAULT_OPTS), "sector_max": DEFAULT_SECTOR, "weighting": DEFAULT_WEIGHTING}}


def _inr(v):
    return f"₹{v / 1e7:,.0f} crore" if v >= 1e7 else f"₹{v / 1e5:,.0f} lakh" if v >= 1e5 else f"₹{v:,.0f}"


def check_plan(tier, reliability=None, opts=None, sector_max=None, weighting=None):
    """the parts of a request that depend on the builder plan (PlanError = not on this plan)"""
    t = TIERS.get(tier)
    if not t:
        raise PlanError("No builder access")
    if reliability is not None and any(r not in t["reliability"] for r in reliability):
        raise PlanError("Your access uses High reliability stocks only")
    if not t["options"]:
        if (check_options(opts) != check_options(DEFAULT_OPTS) or (sector_max is not None and sector_max != DEFAULT_SECTOR)
                or (weighting is not None and weighting != DEFAULT_WEIGHTING)):
            raise PlanError("More options are fixed to the standard settings for your access")


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
    d = DEFAULT_OPTS
    out = {"horizon": o.get("horizon", d["horizon"]), "quality": o.get("quality", d["quality"]), "confirmed": bool(o.get("confirmed", d["confirmed"])),
           "stock_max": o.get("stock_max", d["stock_max"]), "run_up": o.get("run_up", d["run_up"]), "fno_only": bool(o.get("fno_only", False)),
           "exclude": sorted(str(x) for x in (o.get("exclude") or []))[:100], "by_volume": bool(o.get("by_volume", d["by_volume"])),
           "pace": o.get("pace", d["pace"]), "by_float": bool(o.get("by_float", d["by_float"]))}
    if out["horizon"] not in HORIZONS:
        raise BuildError("Choose a time horizon")
    if out["quality"] not in QUALITY:
        raise BuildError("Choose how strong the trends must be")
    if out["stock_max"] not in STOCK_LIMITS:
        raise BuildError("Choose a single-stock limit")
    if out["run_up"] not in RUN_UP_LIMITS:
        raise BuildError("Choose the 'already ran up' limit")
    if out["pace"] not in L.PACES:
        raise BuildError("Choose a buying pace")
    return out


def check_inputs(amount, count, alloc, reliability, sector_max, weighting, tier="customer"):
    t = TIERS.get(tier) or TIERS["customer"]
    try:
        amount = float(amount)
        count = int(count)
    except (TypeError, ValueError):
        raise BuildError("Enter the amount and the number of stocks")
    if not math.isfinite(amount) or amount < t["min_amount"]:
        raise BuildError(f"Enter an amount of at least {_inr(t['min_amount'])}")
    if amount > (t["max_amount"] or ADMIN_AMOUNT_CEIL):
        raise (PlanError if t["max_amount"] and t["max_amount"] < MAX_AMOUNT else BuildError)(
            f"Your access allows amounts up to {_inr(t['max_amount'] or ADMIN_AMOUNT_CEIL)}")
    if count < MIN_STOCKS:
        raise BuildError(f"Choose at least {MIN_STOCKS} stocks")
    if count > t["max_stocks"]:
        raise (PlanError if t["max_stocks"] < MAX_STOCKS else BuildError)(f"Your access allows up to {t['max_stocks']} stocks")
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
        for t, k, word in ((y, "Y", "years"), (q, "Q", "quarters"), (m, "M", "months")):
            if t and len(t) > 5 and t[5] > 0:
                why.append(f"Broke out after {t[5]} {word}")
        if has_regime:
            why.append("Long-term regime up" + (", confirmed" if weekly == 1 else ", but it has started changing" if weekly == -1 else ""))
        why.append(f"{REL_WORD[s['h']]} reliability")
        if ind is not None and ind >= 61:
            why.append("Strong industry")
        out.append({"s": s, "tier": tier, "st": st, "score": round(score, 2), "why": why})
    return out, skip


def preview(data, reliability, opts=None, tier="customer"):
    """What the form shows while the customer types: how many stocks pass every check today, per market cap, and the
    sectors they can leave out. Counts only — no stock names."""
    rel = list(dict.fromkeys(reliability or ["S"]))
    if "W" in rel or not rel or any(r not in ("S", "M") for r in rel):
        raise BuildError("Choose High reliability, or High and Medium")
    check_plan(tier, rel, opts)
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


def build(data, amount, count, alloc, reliability, sector_max=DEFAULT_SECTOR, weighting=DEFAULT_WEIGHTING, opts=None, tier="customer"):
    amount, count, alloc, rel, sector_max, weighting = check_inputs(amount, count, alloc, reliability, sector_max, weighting, tier)
    check_plan(tier, sorted(rel), opts, sector_max, weighting)
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

    vol = {}

    def volcap(s):
        """the most money the stock's trading supports at the chosen pace (None = volume not known)"""
        if s["s"] not in vol:
            v = L.unpack(s.get("vl"))
            vol[s["s"]] = L.capacity(v, s["p"], o["pace"])[2] if v and v["dep"] else None
        return vol[s["s"]]

    def floatcap(s):
        """the most money within FLOAT_CAP of the stock's free float (None = free float not known)"""
        ff = s.get("ff")
        return L.FLOAT_CAP * ff[0] * s["p"] if ff else None

    def capof(s):
        """the most money one stock may take: the single-stock limit, with 'size by volume' its trading volume too, and
        with 'size by free float' its free float"""
        cap, vc, fc = stock_cap, volcap(s), floatcap(s)
        if o["by_volume"] and vc is not None:
            cap = min(cap, vc)
        if o["by_float"] and fc is not None:
            cap = min(cap, fc)
        return cap

    thin = []                                                # size by volume: replaced because they support too little
    small_float = []                                         # size by free float: replaced, too few shares to trade

    def fits(s, slice_):
        if o["by_volume"] and volcap(s) is not None and volcap(s) < L.MIN_USEFUL * slice_:
            if s["s"] not in [t[0] for t in thin]:
                thin.append((s["s"], volcap(s), slice_))
            return False
        if o["by_float"] and floatcap(s) is not None and floatcap(s) < L.MIN_USEFUL * slice_:
            if s["s"] not in [t[0] for t in small_float]:
                small_float.append((s["s"], floatcap(s), slice_))
            return False
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
                     + (f", and no more than {L.FLOAT_CAP * 100:g}% of a stock's free float" if o["by_float"] else "")
                     + "), or one share costs more than its share of the money.")
    per = amount * (1 - alloc["Cash"] / 100) / count
    if per < 5000:
        notes.append(f"Each stock gets about ₹{per:,.0f}. Stocks priced above their share are left out; fewer stocks or a larger amount gives a wider choice.")
    if "M" not in rel and len(holdings) < count:
        notes.append("Adding Medium reliability gives the builder more stocks to choose from.")
    for h in holdings:
        h["liq"] = _liq(h, o, stock_cap, volcap(h["x"]["s"]))
        h["ff"] = _float(h, o, stock_cap)
    f_over = [h for h in holdings if h["ff"]["status"] == "over"]
    if f_over:
        notes.append(f"{len(f_over)} stock{'s are' if len(f_over) > 1 else ' is'} more than {L.FLOAT_CAP * 100:g}% of the shares "
                     "the public can trade (free float) — see the stock details. Turn on 'Size by free float' to keep each within it.")
    if small_float:
        names = ", ".join(f"{sym} (up to ₹{_words(fc)})" for sym, fc, _ in small_float[:6])
        notes.append(f"Replaced by the next best stock because too few of their shares are traded by the public: {names}"
                     + (f" and {len(small_float) - 6} more" if len(small_float) > 6 else "") + ".")
    days = lambda h: h["liq"].get("days")
    over = [h for h in holdings if h["liq"]["status"] == "over"]
    if over:
        notes.append(f"{len(over)} stock{'s are bigger than their' if len(over) > 1 else ' is bigger than its'} trading supports "
                     f"(₹{_words(sum(h['qty'] * h['x']['s']['p'] for h in over))} in total) — see the warnings in the table. "
                     "Turn on 'Size by trading volume' to keep every stock within what it can carry.")
    capped = [h for h in holdings if h["liq"]["status"] == "capped"]
    if capped:
        notes.append(f"{len(capped)} stock{'s were kept to the most their' if len(capped) > 1 else ' was kept to the most its'} trading supports; "
                     "the rest of the money went to the other stocks in the same group.")
    if thin:
        names = ", ".join(f"{sym} (up to ₹{_words(vc)})" for sym, vc, _ in thin[:6])
        notes.append(f"Replaced by the next best stock because they trade too little to take a useful share: {names}"
                     + (f" and {len(thin) - 6} more" if len(thin) > 6 else "") + ".")
    if o["by_volume"] and (capped or thin) and extra >= 2:
        absorb = sum(min(h["qty"] * h["x"]["s"]["p"], h["liq"].get("most_amt") or 0) for h in holdings)
        notes.append(f"Trading volume is the limit at this amount: the stocks that passed can take about ₹{_words(absorb)} at the "
                     f"{o['pace']} buying pace. Choose more stocks (each then needs less), a faster pace, or keep the rest as cash.")
    big = {c: sum(1 for h in holdings if h["cap"] == c and h["liq"]["status"] == "unknown" and h["qty"] * h["x"]["s"]["p"] > LIQ_WARN[c]) for c in CAPS}
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
                      "days": days(h), "liq": h["liq"], "ff": h["ff"]})
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
    return {"as_of": data.get("as_of"), "tier": tier, "amount": amount, "count": count, "alloc": alloc, "reliability": sorted(rel), "opts": o,
            "sector_max": sector_max, "weighting": weighting, "invested": round(invested, 2), "cash": round(cash, 2),
            "cash_pct": round(cash / amount * 100, 2), "stocks": len(picks),
            "avg_st": round(sum(p["st"] for p in picks) / len(picks)) if picks else None,
            "by_cap": by_cap, "by_sec": by_sec, "picks": picks, "notes": notes,
            "checked": len(data.get("stocks", [])), "qualified": len(pool_),
            "strong": sum(1 for x in pool_ if x["tier"] == 1), "left_out": skip,
            "volume": _volume_summary(picks, amount, o, thin), "float": _float_summary(picks, o, small_float),
            "plan": buying_plan(picks)}


def _words(n):
    return f"{n / 1e7:,.2f} Cr" if n >= 1e7 else f"{n / 1e5:,.2f} L" if n >= 1e5 else f"{n:,.0f}"


def _liq(h, o, stock_cap, vcap):
    """the volume reading of one position: what the stock trades, what it supports at the pace, how long buying
    takes, the price push, and plain warnings"""
    s, qty = h["x"]["s"], h["qty"]
    amt = qty * s["p"]
    v = L.unpack(s.get("vl"))
    if not v or not v["dep"]:
        return {"status": "unknown", "days": None, "warn": ["Trading volume is not known for this stock — buy in small parts over a few days."]}
    pace = L.pace_for(v, o["pace"])
    per_day, most, most_amt = L.capacity(v, s["p"], o["pace"])
    per_int = max(1, math.floor(per_day))                                  # whole shares a day
    days = max(1, math.ceil(qty / per_int))
    exit_days = max(1, math.ceil(qty / max(math.floor(pace * v["dep"] * 0.5), 1)))   # selling when trading halves
    status = "fits" if qty <= most * 1.0001 else "over"
    share = qty / v["dep"]                                                  # the position as a share of ONE day's trading
    light = status == "fits" and share < L.LIGHT_SHARE                       # tiny next to its trading: nothing to manage
    if o["by_volume"] and status == "fits" and most_amt < stock_cap and amt >= most_amt * 0.97 - s["p"]:
        status = "capped"
    warn = []
    if light:
        return {"status": status, "light": True, "grade": v["grade"], "grade_word": L.GRADE_WORD[v["grade"]], "dep": v["dep"],
                "norm": v["norm"], "value": round(v["dep"] * s["p"]), "pace": pace, "per_day": per_int, "most": math.floor(most),
                "most_amt": round(most_amt), "days": 1, "exit_days": 1, "share": round(share * 100, 4),
                "push": L.price_push(v, qty), "swing": v["swing"], "trend": v["trend"], "spike": v["spike"], "erratic": v["erratic"], "wk": v["wk"], "mo": v["mo"],
                "warn": ["Unusually heavy trading today or this week (often news): avoid buying in a rush today."] if v["spike"] else []}
    if status == "over":
        warn.append(f"₹{_words(amt)} is {amt / most_amt:.1f}× what this stock's trading supports (₹{_words(most_amt)}). "
                    f"Buying it takes {days} days at {pace * 100:g}% of a normal day; selling in a hurry could take {exit_days} days.")
    if v["grade"] <= 2:
        warn.append(f"Thin trading (about ₹{_words(v['dep'] * s['p'])} a day): buy slowly, never more than {pace * 100:g}% of a day.")
    if v["erratic"]:
        warn.append("Trading jumps around from month to month: counted at half the usual pace.")
    if v["spike"]:
        warn.append("Unusually heavy trading today or this week (often news): not counted — don't buy in a rush on such a day.")
    if v["trend"] == -1:
        warn.append("Trading has been falling for weeks: the lower, recent level is used.")
    return {"status": status, "grade": v["grade"], "grade_word": L.GRADE_WORD[v["grade"]], "dep": v["dep"], "norm": v["norm"],
            "value": round(v["dep"] * s["p"]), "pace": pace, "per_day": per_int, "most": math.floor(most),
            "most_amt": round(most_amt), "days": days, "exit_days": exit_days, "share": round(share * 100, 4), "light": False,
            "push": L.price_push(v, min(qty, per_int)), "swing": v["swing"], "trend": v["trend"], "spike": v["spike"], "erratic": v["erratic"],
            "wk": v["wk"], "mo": v["mo"], "warn": warn}


def _float(h, o, stock_cap):
    """one position against the stock's free float: how much of the tradable shares it takes, the most within the
    standard, the SEBI line it reaches on all the company's shares; `show` = worth showing in the stock's details"""
    s, qty = h["x"]["s"], h["qty"]
    ff = s.get("ff")
    if not ff:
        return {"status": "unknown", "show": bool(o["by_float"])}
    free, total = ff
    held, held_total = qty / free, qty / total
    most = math.floor(L.FLOAT_CAP * free)
    most_amt = most * s["p"]
    if o["by_float"] and most_amt < stock_cap and qty >= most * 0.97 - 1:
        status = "capped"
    elif held > L.FLOAT_CAP * 1.0001:
        status = "over"
    elif held >= L.FLOAT_WATCH:
        status = "watch"
    else:
        status = "light"
    line = ("More shares than the company has in total: this amount cannot be bought at all." if held_total >= 1
            else "More than every share the public can trade (the promoters hold the rest): this amount cannot be bought."
            if held >= 1 else L.sebi_line(held_total))
    return {"status": status, "show": status != "light" or bool(line), "free": free, "total": total,
            "free_pct": round(free / total * 100, 2), "held": round(held * 100, 4), "held_total": round(held_total * 100, 4),
            "most": most, "most_amt": round(most_amt), "cap_pct": L.FLOAT_CAP * 100, "line": line}


def _float_summary(picks, o, small_float):
    st = lambda k: [p for p in picks if p["ff"]["status"] == k]
    return {"by_float": o["by_float"], "cap_pct": L.FLOAT_CAP * 100, "watch_pct": L.FLOAT_WATCH * 100,
            "known": sum(1 for p in picks if p["ff"]["status"] != "unknown"), "unknown": len(st("unknown")),
            "over": len(st("over")), "over_amt": round(sum(p["amt"] for p in st("over")), 2), "capped": len(st("capped")),
            "watch": len(st("watch")), "max_held": max((p["ff"].get("held", 0) for p in picks), default=0),
            "replaced": [{"s": sym, "most_amt": round(fc)} for sym, fc, _ in small_float]}


def _volume_summary(picks, amount, o, thin):
    known = [p for p in picks if p["liq"]["status"] != "unknown"]
    inv = sum(p["amt"] for p in picks) or 1
    push = [p for p in known if p["liq"].get("push") is not None]
    return {"pace": o["pace"], "pace_pct": L.PACES[o["pace"]] * 100, "build_days": L.BUILD_DAYS, "by_volume": o["by_volume"],
            "high_share": round(sum(p["amt"] for p in known if p["liq"]["grade"] >= 4) / inv * 100, 1),
            "days": max((p["liq"]["days"] or 1 for p in picks), default=0),
            "fits": sum(1 for p in picks if p["liq"]["status"] == "fits"), "capped": sum(1 for p in picks if p["liq"]["status"] == "capped"),
            "over": sum(1 for p in picks if p["liq"]["status"] == "over"), "unknown": sum(1 for p in picks if p["liq"]["status"] == "unknown"),
            "over_amt": round(sum(p["amt"] for p in picks if p["liq"]["status"] == "over"), 2),
            "push": round(sum(p["liq"]["push"] * p["amt"] for p in push) / sum(p["amt"] for p in push), 2) if push else None,
            "grades": {L.GRADE_WORD[g]: round(sum(p["amt"] for p in known if p["liq"]["grade"] == g) / inv * 100, 1) for g in (5, 4, 3, 2, 1)},
            "replaced": [{"s": sym, "most_amt": round(vc)} for sym, vc, _ in thin],
            # every position is tiny next to its stock's trading: the app shows one short line instead of the analysis
            "light": bool(known) and all(p["liq"].get("light") for p in known) and not any(p["liq"]["status"] == "unknown" for p in picks)}


def buying_plan(picks):
    """Day-by-day order to buy (owner: "exact output and a better order to proceed"): every stock gets its daily
    share count (the pace); day 1 buys the one-day stocks in full and the first slice of each multi-day stock; the slow
    ones continue on the following days, the longest first, best-ranked first within a day. The first PLAN_DAYS_SHOWN
    days are listed one by one, the rest as one line."""
    items = [{"s": p["s"], "p": p["p"], "qty": p["qty"], "rank": i, "per_day": p["liq"].get("per_day") or p["qty"]} for i, p in enumerate(picks)]
    for x in items:
        x["days"] = max(1, math.ceil(x["qty"] / x["per_day"]))
    order = sorted(items, key=lambda x: (-x["days"], x["rank"]))
    total_days = max((x["days"] for x in items), default=0)
    bought = lambda x, d: min(x["qty"], x["per_day"] * d)                  # shares bought by the end of day d
    days, spent = [], 0.0
    for d in range(1, min(total_days, PLAN_DAYS_SHOWN) + 1):
        buys = [{"s": x["s"], "qty": q, "amt": round(q * x["p"], 2), "done": bought(x, d) == x["qty"]}
                for x in order if (q := bought(x, d) - bought(x, d - 1)) > 0]
        spent += sum(b["amt"] for b in buys)
        days.append({"day": d, "buys": buys, "amt": round(sum(b["amt"] for b in buys), 2), "total": round(spent, 2)})
    more = None
    if total_days > PLAN_DAYS_SHOWN:
        rest = [{"s": x["s"], "qty": x["qty"] - bought(x, PLAN_DAYS_SHOWN), "per_day": x["per_day"], "days": x["days"]}
                for x in order if x["qty"] > bought(x, PLAN_DAYS_SHOWN)]
        more = {"from": PLAN_DAYS_SHOWN + 1, "to": total_days, "stocks": rest,
                "amt": round(sum(r["qty"] * next(x["p"] for x in items if x["s"] == r["s"]) for r in rest), 2)}
    return {"days": days, "more": more, "total_days": total_days,
            "one_day": sum(1 for x in items if x["days"] <= 1), "multi_day": sum(1 for x in items if x["days"] > 1)}
