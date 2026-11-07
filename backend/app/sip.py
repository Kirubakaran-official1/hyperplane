"""
Hyperplane AI Momentum SIP (owner, 2026-11-06). History: v1 "stocks and ETFs combined … ₹5,000 to ₹1 crore per month or
quarter … the long-term engine"; v2 "reliability buttons, step-up, saved SIP, PDF, a details page"; v3 "three sliders —
stock, index and commodity, gold 10 % by default for diversification … the index part always covers the Nifty large,
mid and small caps, themes spread out, never a huge lot in one ETF … stock SIP is secondary … High / Medium / Low as a
multi-select, the stock mix as sliders … brand it as the Momentum SIP … a momentum check + portfolio adjuster: stocks are
checked every week and exit when the regime or the strength goes down; Nifty index ETFs are never removed; a theme or
strategy ETF is flagged only in the worst case, with an alternative".

Pure functions on the PUBLISHED data (the stock view + the ETF summary), run by the customer service and by the worker's
alert check (monitor.py). Rules (Claude's proposal; the owner may tune the constants):
  index      CORE markets always (the recommended ETF of each, whatever its trend): Nifty 50 40 %, Nifty Next 50 15 %,
             Midcap 150 25 %, Smallcap 250 20 % of the core; then MORE ETFs for diversification (owner 2026-11-06:
             "increase the ETF split for the diversification"): THEMES (Sector & theme / Strategy / International
             recommended ETFs in a long-term uptrend, direction up) and DIVERSIFIERS (recommended Strategy — low
             volatility, equal weight, value, quality… — and International ETFs that are NOT falling) share up to
             EXTRA_SHARE of the index money, each at most EXTRA_CAP, at most EXTRA_MAX of them — never a big lot in one
  commodity  the recommended Gold ETF; from 20 % also the recommended Silver ETF (30 % of the commodity money)
  stock      builder.candidates() with the chosen reliability (High / Medium / Low, any mix) and the standard long-term
             options (regime up + confirmed, not run up, the stability score in the ranking); quotas per cap by the
             Large / Mid / Small sliders, best conviction first; ≤ max(2, 25 %) per sector, ≤ 2 per industry
  units      whole units every instalment, or 1 unit every k ≤ 3 instalments; ONLY WHEN NEEDED up to OVER_MAX above the
             amount so a holding is bought every instalment — never one that would then cost more than UPGRADE_MAX_X its
             share (the split chosen stays true); a whole-unit top-up never goes past the amount
  check      saved plans (a "momentum check", also run for alerts): a stock that no longer passes the long-term checks
             (regime down, strength weak, reliability, ran up) → exit + the best replacement; core index ETFs and gold are
             always kept; a theme / strategy / international ETF in the worst case (long-term downtrend, or direction down
             and strength below 0) → remove + the best theme in an uptrend
Two applications use this engine (owner 2026-11-06: "split into 2 apps"):
  sip   AI ETF SIP Builder (Reliable) — ETFs only: build_etf(), with ETF filters (gold share, the index cap mix, themes /
        diversifiers / international on or off, easy-to-trade only, how many extra ETFs)
  msip  AI Momentum SIP (Risk) — stocks only: build_stock(), widely spread even at ₹10,000 (MSIP_RULE; amount-based, a
        costly share bought every few instalments up to MSIP_MAX_EVERY)
Customers receive the plan and plain reasons — never the weights.
"""
import math

from . import builder

MIN_AMOUNT, MAX_AMOUNT = 5_000, 10_000_000          # ₹ per instalment
FREQS = {"month": ("month", 12), "quarter": ("quarter", 4)}
ALLOC_DEFAULT = {"index": 60, "stock": 30, "commodity": 10}
MIX_DEFAULT = {"Large": 70, "Mid": 15, "Small": 15}
COUNTS = (3, 5, 10, 15, 20, 25)                     # stocks
STOCK_RULE = ((5_000, 3), (15_000, 5), (40_000, 10), (100_000, 15), (500_000, 20))   # stock money below → stocks; else 25
MIN_SLICE = 1_000                                    # ₹ per stock per instalment, at least
MAX_EVERY = 3
OVER_MAX = 0.10                                      # up to 10 % above the amount, only when needed
DRIFT = 0.05                                         # a saved plan keeps its units while prices move ≤ 5 %
UPGRADE_MAX_X = 2.0                                  # …to buy a holding every instalment that costs at most 2× its share
ETF_UP = 24
CORE = (("Nifty 50", 40, ()), ("Nifty Next 50", 15, ()), ("Midcap 150", 25, ("Midcap 100", "Midcap")),
        ("Smallcap 250", 20, ("Smallcap",)))
THEME_KINDS = ("Sector & theme", "Strategy", "International")
EXTRA_SHARE, EXTRA_CAP, EXTRA_MAX = 0.40, 0.06, 10  # themes + diversifiers: ≤ 40 % of the index money, ≤ 6 % each, ≤ 10 ETFs
EXTRA_MIN = 300                                      # ₹ per extra ETF per instalment, at least (sets how many fit)
DIVERSIFY = ("Low volatility", "Alpha low volatility", "Equal weight", "Value", "Quality")
STEPUPS = (0, 5, 10, 15, 20)
# AI ETF SIP Builder (ETFs only)
# owner 2026-11-06: no ETF on/off switches — ask how many ETFs (6 … 20); the slots beyond the core index and gold go to the
# strongest ETFs today (themes in an uptrend, steady strategy / international ETFs not falling), easy to trade only
# round 7 (owner 2026-11-07): the number of ETFs is replaced by a STYLE — focus (only what is going up, the core only when it
# is going up too), standard (the core index + what is going up), more diversified (standard + some diversifiers). A
# diversifier is never added to focus / standard: the core index already diversifies.
ETF_STYLES = ("focus", "standard", "diverse")
ETF_OPTS_DEFAULT = {"gold": 10, "caps": {"Large": 55, "Mid": 25, "Small": 20}, "style": "standard"}
STYLE_EXTRA = {"focus": (8, 0.15), "standard": (5, EXTRA_CAP), "diverse": (10, EXTRA_CAP)}   # most extra ETFs, most of the index money in one
EASY = ("Very high", "High", "Moderate")
# AI Momentum SIP (stocks only)
MSIP_COUNTS = (10, 12, 15, 20, 25, 30, 40)
MSIP_RULE = ((10_000, 15), (25_000, 20), (50_000, 20))               # the floor: a SIP is spread wide even at ₹10,000
MSIP_MIN_SLICE, MSIP_MAX_EVERY = 300, 6
# AI Momentum SIP levels (owner 2026-11-06 round 6: "customer can choose only High reliability … up to ₹50k a month …
# up to 50 stocks, admin any number … bring the same advanced settings as the AI Portfolio Builder"). msip:admin (the
# Customer Admin role, given in Admin → Access manager only) = admin, everyone else = customer. The SERVER enforces it
# (a request made with Postman / Burp gets the same limits).
MSIP_TIERS = {
    "customer": {"name": "Customer", "max_amount": 50_000, "min_count": 10, "max_count": 50, "reliability": ("S",), "options": False},
    "admin": {"name": "Admin", "max_amount": 1_000_000_000_000, "min_count": 5, "max_count": 2000, "reliability": ("S", "M", "W"), "options": True},
}
MSIP_OPT_KEYS = ("horizon", "quality", "confirmed", "run_up", "fno_only", "exclude")      # the Builder's More options that fit a SIP
MSIP_SECTORS, MSIP_SECTOR_DEFAULT = (10, 15, 20, 25, 30, 40, 100), 10                   # most of the stocks in one sector, %
MAX_SAVED = 50                                       # per kind (owner: "save any number"; a cap against abuse)
REL_WORD = {"S": "High", "M": "Medium", "W": "Low"}
SKIP_WHY = {"view": "has no long-term reading right now", "new": "is too new for a long-term reading",
            "reliability": "its reliability is now {rel}", "regime": "its long-term direction turned down",
            "moved": "it has already run up a lot", "weak": "its long-term strength has weakened", "cap": "it left the market-cap groups",
            "sector": "its sector is left out", "fno": "it is not in F&O"}


class SipError(ValueError):
    """A customer input that cannot be used (shown to the customer as is)."""


class SipPlanError(SipError):
    """allowed on a higher level only (the customer service answers 403)"""


def _inr(v):
    return f"₹{v / 1e7:,.2f} crore".replace(".00 ", " ") if v >= 1e7 else f"₹{v / 1e5:,.2f} lakh".replace(".00 ", " ") if v >= 1e5 else f"₹{v:,.0f}"


def recommended_stocks(stock_money):
    return next((n for cut, n in STOCK_RULE if stock_money < cut), 25)


def info(data, etf_data):
    """the form: limits, defaults, how many stocks pass today per reliability, and the index ETFs available"""
    pass_n = {"S": 0, "M": 0, "W": 0}                                 # per level: the form adds up the levels ticked
    for x in builder.candidates(data, {"S", "M", "W"}, builder.DEFAULT_OPTS)[0]:
        if x["tier"] == 1 and x["s"].get("h") in pass_n:
            pass_n[x["s"]["h"]] += 1
    return {"min_amount": MIN_AMOUNT, "max_amount": MAX_AMOUNT, "counts": list(COUNTS), "stock_rule": [[c, n] for c, n in STOCK_RULE] + [[None, 25]],
            "alloc": ALLOC_DEFAULT, "mix": MIX_DEFAULT, "min_slice": MIN_SLICE, "over_max": OVER_MAX, "stepups": list(STEPUPS),
            "stocks": pass_n["S"], "by_rel": pass_n,
            "core": [{"u": u, "s": (e or {}).get("s"), "st": (e or {}).get("st")} for u, e in ((u, _core_etf(etf_data, u, alts)) for u, _, alts in CORE)],
            "themes": len(_themes(etf_data)), "divers": len(_diversifiers(etf_data)),
            "etf_opts": ETF_OPTS_DEFAULT, "etf_styles": list(ETF_STYLES), "etf_pool": _etf_pool(etf_data),
            "msip_counts": list(MSIP_COUNTS), "msip_rule": msip_rule(), "msip_min_slice": MSIP_MIN_SLICE,
            "spread": [[None if c == float("inf") else c, lo, hi] for c, lo, hi in builder.SPREAD],
            "as_of": (data or {}).get("as_of") or (data or {}).get("asOf")}


def _ints(d, keys, label):
    try:
        out = {k: int(round(float((d or {}).get(k, 0)))) for k in keys}
    except (TypeError, ValueError):
        raise SipError(f"Set the {label}")
    if any(v < 0 or v > 100 for v in out.values()) or sum(out.values()) != 100:
        raise SipError(f"The {label} must add up to 100%")
    return out


def check(amount, freq, alloc=None, rel=("S",), mix=None, count=None, stepup=0, years=10):
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        raise SipError("Enter the SIP amount")
    if not math.isfinite(amount) or amount < MIN_AMOUNT:
        raise SipError(f"Enter at least {_inr(MIN_AMOUNT)} per instalment")
    if amount > MAX_AMOUNT:
        raise SipError(f"A SIP can be up to {_inr(MAX_AMOUNT)} per instalment")
    if freq not in FREQS:
        raise SipError("Choose monthly or quarterly")
    alloc = _ints(alloc or ALLOC_DEFAULT, ("index", "stock", "commodity"), "index / stock / commodity split")
    rel = [r for r in ("S", "M", "W") if r in set(rel or [])]
    if alloc["stock"] and not rel:
        raise SipError("Choose at least one reliability level")
    mix = _ints(mix or MIX_DEFAULT, ("Large", "Mid", "Small"), "stock mix") if alloc["stock"] else dict(MIX_DEFAULT)
    if count is not None and count not in COUNTS:
        raise SipError("Choose 3, 5, 10, 15, 20 or 25 stocks")
    if stepup not in STEPUPS:
        raise SipError("Choose a yearly step-up of 0, 5, 10, 15 or 20 %")
    try:
        years = int(years)
    except (TypeError, ValueError):
        raise SipError("Enter the number of years")
    if not 1 <= years <= 40:
        raise SipError("Plan between 1 and 40 years")
    return amount, freq, alloc, rel, mix, count, stepup, years


def _base(amount, freq, years, max_amount=MAX_AMOUNT):
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        raise SipError("Enter the SIP amount")
    if not math.isfinite(amount) or amount < MIN_AMOUNT:
        raise SipError(f"Enter at least {_inr(MIN_AMOUNT)} per instalment")
    if amount > max_amount:
        raise (SipPlanError if max_amount < MAX_AMOUNT else SipError)(
            f"{'Your access allows' if max_amount < MAX_AMOUNT else 'A SIP can be'} up to {_inr(max_amount)} per instalment")
    if freq not in FREQS:
        raise SipError("Choose monthly or quarterly")
    try:
        years = int(years)
    except (TypeError, ValueError):
        raise SipError("Enter the number of years")
    if not 1 <= years <= 40:
        raise SipError("Plan between 1 and 40 years")
    return amount, freq, years


def check_etf(amount, freq, opts=None, years=10):
    """AI ETF SIP Builder inputs → (amount, freq, opts, years)"""
    amount, freq, years = _base(amount, freq, years)
    o = {**ETF_OPTS_DEFAULT, **(opts or {})}
    try:
        gold = int(o["gold"])
    except (TypeError, ValueError):
        raise SipError("Set the gold share")
    if gold not in range(0, 55, 5):
        raise SipError("Gold can be 0 to 50 %, in steps of 5")
    caps = _ints(o.get("caps"), ("Large", "Mid", "Small"), "index market-cap mix")
    if o.get("style") not in ETF_STYLES:
        raise SipError("Choose focus, standard or more diversified")
    return amount, freq, {"gold": gold, "caps": caps, "style": o["style"]}, years


def msip_plan(tier):
    """what the Momentum SIP form may offer this customer (the server checks the same limits on every request)"""
    t = MSIP_TIERS.get(tier) or MSIP_TIERS["customer"]
    return {"tier": tier if tier in MSIP_TIERS else "customer", **t, "reliability": list(t["reliability"]), "min_amount": MIN_AMOUNT,
            "opt_keys": list(MSIP_OPT_KEYS), "sectors": list(MSIP_SECTORS),
            "defaults": {"opts": {k: builder.DEFAULT_OPTS[k] for k in MSIP_OPT_KEYS}, "sector_max": MSIP_SECTOR_DEFAULT}}


def msip_options(opts, sector_max=None):
    """the Builder's More options a Momentum SIP uses (checked by builder.check_options) + the sector limit"""
    o = builder.check_options({k: (opts or {}).get(k, builder.DEFAULT_OPTS[k]) for k in MSIP_OPT_KEYS})
    sm = MSIP_SECTOR_DEFAULT if sector_max is None else sector_max
    if sm not in MSIP_SECTORS:
        raise SipError(f"Choose {', '.join(map(str, MSIP_SECTORS))} % for one sector")
    return {k: o[k] for k in MSIP_OPT_KEYS}, sm


def check_stock(amount, freq, rel=("S",), mix=None, count=None, years=10, opts=None, sector_max=None, tier="customer"):
    """AI Momentum SIP inputs → (amount, freq, rel, mix, count, years, opts, sector_max), within the customer's level"""
    t = MSIP_TIERS.get(tier) or MSIP_TIERS["customer"]
    amount, freq, years = _base(amount, freq, years, t["max_amount"])
    rel = [r for r in ("S", "M", "W") if r in set(rel or [])]
    if not rel:
        raise SipError("Choose at least one reliability level")
    if any(r not in t["reliability"] for r in rel):
        raise SipPlanError("Your access uses High reliability stocks only")
    mix = _ints(mix or MIX_DEFAULT, ("Large", "Mid", "Small"), "stock mix")
    if count is not None:
        try:
            count = int(count)
        except (TypeError, ValueError):
            raise SipError("Enter the number of stocks as a whole number")
        if count < t["min_count"]:
            raise SipError(f"Choose at least {t['min_count']} stocks")
        if count > t["max_count"]:
            raise (SipPlanError if t["max_count"] < MSIP_TIERS["admin"]["max_count"] else SipError)(f"Your access allows up to {t['max_count']} stocks")
    o, sm = msip_options(opts, sector_max)
    if not t["options"] and (o != msip_options(None)[0] or sm != MSIP_SECTOR_DEFAULT):
        raise SipPlanError("More options are fixed to the standard settings for your access")
    return amount, freq, rel, mix, count, years, o, sm


def msip_recommended(amount):
    """stocks to suggest: the AI Portfolio Builder's own advice for the amount (builder.spread_best), never below the floor
    of MSIP_RULE (so a small SIP is still spread wide)"""
    floor = next((n for cut, n in MSIP_RULE if amount < cut), MSIP_RULE[-1][1])
    return max(floor, builder.spread_best(amount, MSIP_MIN_SLICE))


def msip_rule():
    """the advice as [[amount below, stocks], …, [None, stocks]] for the form (it adds up the same way as msip_recommended)"""
    cuts = sorted({c for c, _ in MSIP_RULE} | {c + 1 for c, _, _ in builder.SPREAD if c != float("inf")})     # the Builder's bands include their top
    return [[c, msip_recommended(c - 1)] for c in cuts] + [[None, msip_recommended(1e12)]]


def build_etf(data, etf_data, amount, freq, opts=None, years=10):
    """AI ETF SIP Builder (Reliable): ETFs only — core Nifty markets by the cap mix, themes / diversifiers as chosen, gold"""
    amount, freq, opts, years = check_etf(amount, freq, opts, years)
    alloc = {"index": 100 - opts["gold"], "stock": 0, "commodity": opts["gold"]}
    eo = {**opts, "easy": True}
    r = _build(data, etf_data, amount, freq, alloc, [], dict(MIX_DEFAULT), None, 0, years, etf_opts=eo)
    r["app"] = "sip"
    r["inputs"] = {"amount": amount, "freq": freq, "opts": opts, "stepup": 0, "years": years, "alloc": alloc}
    return r


def build_stock(data, amount, freq, rel=("S",), mix=None, count=None, years=10, opts=None, sector_max=None, tier="customer"):
    """AI Momentum SIP (Risk): stocks only, spread wide — each stock the same ₹ every instalment"""
    amount, freq, rel, mix, count, years, opts, sector_max = check_stock(amount, freq, rel, mix, count, years, opts, sector_max, tier)
    alloc = {"index": 0, "stock": 100, "commodity": 0}
    cfg = {"rec": msip_recommended(amount), "min_slice": MSIP_MIN_SLICE, "max_every": MSIP_MAX_EVERY,
           "opts": {**builder.DEFAULT_OPTS, **opts}, "sector_max": sector_max}
    r = _build(data, None, amount, freq, alloc, rel, mix, count, 0, years, stock_cfg=cfg)
    r["app"] = "msip"
    r["inputs"] = {"amount": amount, "freq": freq, "rel": rel, "mix": mix, "count": count, "stepup": 0, "years": years, "alloc": alloc,
                   "opts": opts, "sector_max": sector_max}
    return r


# ── ETFs ──
def _etfs(etf_data):
    return [e for e in (etf_data or {}).get("etfs", []) if e.get("p")]


def _core_etf(etf_data, u, alts=()):
    """the recommended ETF of a core market (or its fallback market)"""
    for name in (u, *alts):
        e = next((x for x in _etfs(etf_data) if x.get("r") and x["k"] == "Broad market" and x["u"] == name), None)
        if e:
            return e
    return None


def _themes(etf_data):
    return sorted([e for e in _etfs(etf_data) if e.get("r") and e["k"] in THEME_KINDS and e.get("st") is not None
                   and e["st"] >= ETF_UP and e.get("rg") == 1], key=lambda e: -e["st"])


def _metal(etf_data, u):
    return next((x for x in _etfs(etf_data) if x.get("r") and x["k"] == u and x["u"] == u), None)


def _diversifiers(etf_data, skip=()):
    """recommended Strategy (low volatility, equal weight, value, quality…) and International ETFs that are not falling"""
    ok = lambda e: (e["k"] == "International" or (e["k"] == "Strategy" and any(w.lower() in e["u"].lower() for w in DIVERSIFY)))
    return sorted([e for e in _etfs(etf_data) if e.get("r") and ok(e) and e["s"] not in skip and e.get("st") is not None
                   and e["st"] > -ETF_UP and e.get("rg") != -1], key=lambda e: -e["st"])


def _up(e):
    """going up: the long-term regime is up and the strength is above the uptrend line"""
    return e.get("rg") == 1 and e.get("st") is not None and e["st"] >= ETF_UP


def _extras(etf_data, style="standard", skip_u=()):
    """the ETFs beyond the core index, best first, one per market, easy to trade only. Every style: what is going up (a
    sector or theme, a strategy, an international or another broad index ETF in a long-term uptrend). More diversified adds,
    after them, the diversifiers: steady strategy ETFs (low volatility, equal weight …), international ETFs not falling,
    sector ETFs whose regime is up but not strong yet, and other broad indices."""
    easy = lambda e: e.get("lq") in EASY
    core_u = {u for u, _, alts in CORE} | set(skip_u)
    ups = sorted([e for e in _etfs(etf_data) if e.get("r") and e["k"] in THEME_KINDS + ("Broad market",) and _up(e) and easy(e) and e["u"] not in core_u],
                 key=lambda e: -e["st"])
    divs = steady = broad = []
    if style == "diverse":
        divs = [e for e in _diversifiers(etf_data, {e["s"] for e in ups}) if easy(e)]
        steady = sorted([e for e in _etfs(etf_data) if e.get("r") and e["k"] == "Sector & theme" and e.get("st") is not None and 0 < e["st"] < ETF_UP
                         and e.get("rg") == 1 and easy(e)], key=lambda e: -e["st"])
        broad = sorted([e for e in _etfs(etf_data) if e.get("r") and e["k"] == "Broad market" and e["u"] not in core_u and easy(e)], key=lambda e: -(e.get("v") or 0))
    out, seen = [], set(skip_u)
    for e, role in [(e, "theme") for e in ups] + [(e, "diversifier") for e in divs + steady + broad]:
        if e["u"] not in seen:                                      # one ETF per market
            seen.add(e["u"]); out.append((e, role))
    return out


def _etf_pool(etf_data):
    """how many ETFs each style holds today (for the form): core ETFs going up / all four core, the others going up, diversifiers"""
    cores = [e for u, _, alts in CORE if (e := _core_etf(etf_data, u, alts))]
    ups = _extras(etf_data, "standard", {e["u"] for e in cores}); more = _extras(etf_data, "diverse", {e["u"] for e in cores})
    n_up_core = sum(1 for e in cores if _up(e))
    return {"core": len(cores), "core_up": n_up_core, "up": len(ups), "div": len(more) - len(ups),
            "focus": n_up_core + min(len(ups), STYLE_EXTRA["focus"][0]),
            "standard": len(cores) + min(len(ups), STYLE_EXTRA["standard"][0]),
            "diverse": len(cores) + min(len(more), STYLE_EXTRA["diverse"][0])}


def etf_role(e):
    return "core" if e.get("k") == "Broad market" else "commodity" if e.get("k") in ("Gold", "Silver") else "theme"


def _units(slice_amt, price, max_every=MAX_EVERY):
    if price <= slice_amt:
        return int(slice_amt // price), 1
    k = math.ceil(price / slice_amt)
    return (1, k) if k <= max_every else None


def _etf_holding(e, sl, u, etf_data, sleeve, role=None):
    peers = sorted([x for x in _etfs(etf_data) if x["k"] == e["k"] and x["u"] == e["u"] and x["s"] != e["s"]], key=lambda x: -(x.get("v") or 0))[:4]
    role = role or etf_role(e)
    why = [e.get("why") or "Recommended ETF of its market"]
    why.append("Another broad index: spreads the money over more companies, kept to a small share" if role == "diversifier" and e.get("k") == "Broad market"
               else "A theme whose long-term regime is up, kept to a small share" if role == "theme" and (e.get("st") or 0) < ETF_UP
               else {"core": "A core index: kept in every market, whatever the trend", "commodity": "Gold: steadies the portfolio, moves differently from shares",
                     "theme": "A theme in a long-term uptrend, kept to a small share",
                     "diversifier": "Spreads the risk: a different kind of market, not falling, kept to a small share"}[role])
    return {"kind": "etf", "sleeve": sleeve, "role": role, "s": e["s"], "n": e["n"], "grp": e["u"], "cls": e["k"], "p": e["p"], "st": e.get("st"),
            "units": u[0], "every": u[1], "slice": sl, "score": e.get("st") or 0, "why": why, "tf": e.get("tf"), "rg": e.get("rg"),
            "lq": e.get("lq"), "v": e.get("v"), "e": e.get("e"), "y": e.get("y"), "u": e["u"], "k": e["k"],
            "peers": [{"s": x["s"], "st": x.get("st"), "lq": x.get("lq"), "r": x.get("r")} for x in peers]}


# ── stocks ──
def _stock_order(cands, n, mix):
    want = {c: mix[c] / 100 * n for c in builder.CAPS}
    quota = {c: int(want[c]) for c in builder.CAPS}
    for c in sorted(builder.CAPS, key=lambda c: (-(want[c] - quota[c]), -mix[c]))[:n - sum(quota.values())]:
        quota[c] += 1
    groups = {c: sorted([x for x in cands if x["s"].get("cap") == c], key=lambda x: (x["tier"], -x["score"])) for c in builder.CAPS}
    first = sorted([x for c in builder.CAPS for x in groups[c][:quota[c]]], key=lambda x: (x["tier"], -x["score"]))
    rest = sorted([x for c in builder.CAPS for x in groups[c][quota[c]:]], key=lambda x: (x["tier"], -mix[x["s"]["cap"]], -x["score"]))
    return first + rest


def _group_strength(data):
    return builder._group_index(data.get("sectors"), False), builder._group_index(data.get("industries"), True)


def _stock_holding(x, sl, u, secs, inds):
    s = x["s"]
    zv = s.get("zv") or [None, None, None, None, None]
    return {"kind": "stock", "sleeve": "stock", "s": s["s"], "n": s.get("n") or s["s"], "grp": f"{s.get('cap')} cap", "cap": s.get("cap"),
            "sec": s.get("sec"), "ind": s.get("ind"), "p": s["p"], "st": x["st"], "units": u[0], "every": u[1], "slice": sl,
            "score": x["score"], "why": x["why"], "kp": x["kp"], "rel": s.get("h"), "rs": s.get("rs"), "sf": s.get("sf"),
            "tf": [(t[2] if t else None) for t in zv[2:5]], "rp": s.get("rp"),
            "sec_st": round(secs[s.get("sec")]) if secs.get(s.get("sec")) is not None else None,
            "ind_st": round(inds[(s.get("sec"), s.get("ind"))]) if inds.get((s.get("sec"), s.get("ind"))) is not None else None}


def build(data, etf_data, amount, freq, alloc=None, rel=("S",), mix=None, count=None, stepup=0, years=10):
    """the combined plan (index + stocks + gold) — kept for saved plans made before the split"""
    amount, freq, alloc, rel, mix, count, stepup, years = check(amount, freq, alloc, rel, mix, count, stepup, years)
    return _build(data, etf_data, amount, freq, alloc, rel, mix, count, stepup, years)


def _build(data, etf_data, amount, freq, alloc, rel, mix, count, stepup, years, etf_opts=None, stock_cfg=None):
    word, per_year = FREQS[freq]
    eo = etf_opts or {}
    max_every = (stock_cfg or {}).get("max_every", MAX_EVERY)
    money = {k: amount * v / 100 for k, v in alloc.items()}
    notes, holdings = [], []

    # index: by style — focus: only what is going up; standard: the core index + what is going up; more diversified: + diversifiers
    if money["index"]:
        style = eo.get("style") or "standard"
        core_w = dict((u, w) for u, w, _ in CORE)
        if eo.get("caps"):                                          # the index market-cap mix chosen (AI ETF SIP Builder)
            c = eo["caps"]
            core_w = {"Nifty 50": c["Large"] * 40 / 55, "Nifty Next 50": c["Large"] * 15 / 55, "Midcap 150": c["Mid"], "Smallcap 250": c["Small"]}
        core = [(e, core_w[u]) for (u, _, alts) in CORE if core_w[u] > 0 and (e := _core_etf(etf_data, u, alts))]
        if style == "focus":                                        # no forced core: only the core markets that are going up
            kept = [(e, w) for e, w in core if _up(e)]
            if len(kept) < len(core):
                notes.append("Focus keeps only the markets going up today: " + (", ".join(e["u"] for e, _ in kept) or "no core index") + ".")
            core = kept
        extras = _extras(etf_data, style, {e["u"] for e, _ in core})
        most, cap_each = STYLE_EXTRA[style]
        n_th = min(most, len(extras), max(0, int(money["index"] * (1.0 if style == "focus" else 0.6) // EXTRA_MIN)))
        if style == "focus":
            th_share = (1.0 if not core else min(0.8, n_th * cap_each)) if n_th else 0.0
            if not core and not n_th:                               # nothing is going up: never leave the index part empty
                fb = _core_etf(etf_data, "Nifty 50", ())
                if fb:
                    core = [(fb, 1.0)]
                    notes.append("Nothing is going up strongly today, so the index part stays in the Nifty 50 until something does.")
        else:
            th_share = min(0.4 if style == "standard" else 0.6, n_th * cap_each) if n_th else 0.0
        core_money, wsum = money["index"] * (1 - th_share), sum(w for _, w in core) or 1
        for e, w in core:
            sl = core_money * w / wsum
            if (u := _units(sl, e["p"])):
                holdings.append(_etf_holding(e, sl, u, etf_data, "index"))
        for e, role in extras[:n_th]:
            sl = money["index"] * th_share / n_th
            if (u := _units(sl, e["p"])):
                holdings.append(_etf_holding(e, sl, u, etf_data, "index", role))
        if not core:
            notes.append("No core index ETF is available today — the index part is left empty for now.")
        elif not n_th and style != "focus":
            notes.append("Nothing outside the core index is going up today, so the index money stays in the core Nifty markets.")

    # commodity: gold (and silver from 20 %)
    if money["commodity"]:
        gold, silver = _metal(etf_data, "Gold"), _metal(etf_data, "Silver") if alloc["commodity"] >= 20 else None
        if silver and ((silver.get("st") or 0) <= -ETF_UP or silver.get("rg") == -1):
            silver = None                                          # silver only when it is not falling
        parts = [(gold, 0.7 if silver else 1.0), (silver, 0.3)] if silver else [(gold, 1.0)]
        for e, w in parts:
            if e and (u := _units(money["commodity"] * w, e["p"])):
                holdings.append(_etf_holding(e, money["commodity"] * w, u, etf_data, "commodity"))
        if not gold:
            notes.append("No gold ETF is available today — the commodity part is left empty for now.")

    # stocks (secondary): the momentum picks, within the reliability and mix chosen
    n_st, pricey, rec = 0, 0, None
    if money["stock"]:
        rec = (stock_cfg or {}).get("rec") or recommended_stocks(money["stock"])
        n_st = count or rec
        fit = max(1, int(money["stock"] // (stock_cfg or {}).get("min_slice", MIN_SLICE)))
        if n_st > fit:
            notes.append(f"{_inr(money['stock'])} for stocks buys about {fit} stocks well — {n_st} would leave {_inr(money['stock'] / n_st)} each, so Hyperplane AI used {fit}.")
            n_st = fit
        cands, _ = builder.candidates(data, set(rel) | ({"S"} if rel else set()), (stock_cfg or {}).get("opts") or builder.DEFAULT_OPTS)
        cands = [x for x in cands if x["s"].get("h") in rel]
        cands = [x for x in cands if x["tier"] == 1] or cands
        secs, inds = _group_strength(data)
        sl = money["stock"] / n_st
        per_sec, per_ind, picked = {}, {}, 0
        sec_cap = max(2, math.ceil(n_st * (stock_cfg or {}).get("sector_max", 25) / 100))
        for x in _stock_order(cands, n_st, mix):
            if picked >= n_st:
                break
            s = x["s"]
            if per_sec.get(s.get("sec"), 0) >= sec_cap or per_ind.get((s.get("sec"), s.get("ind")), 0) >= 2:
                continue
            u = _units(sl, s["p"], max_every)
            if not u:                                          # one share costs more than max_every instalments' share
                pricey += 1
                continue
            holdings.append(_stock_holding(x, sl, u, secs, inds))
            per_sec[s.get("sec")] = per_sec.get(s.get("sec"), 0) + 1
            per_ind[(s.get("sec"), s.get("ind"))] = per_ind.get((s.get("sec"), s.get("ind")), 0) + 1
            picked += 1
        if picked < n_st:
            notes.append(f"Only {picked} stock{'s' if picked != 1 else ''} passed every momentum check at this reliability"
                         + (f" at a price this SIP can buy ({pricey} cost more than {max_every} instalments' share)." if pricey else "."))

    if not holdings:
        raise SipError("Nothing passes the long-term checks for this SIP today — try another split or reliability.")

    cost = lambda h: h["units"] * h["p"] / h["every"]
    spent = sum(cost(h) for h in holdings)
    cap = amount * (1 + OVER_MAX)
    upgraded = []
    theme_max = money["index"] * STYLE_EXTRA[(eo.get("style") or "standard")][1]     # one theme / diversifier never takes more than this
    for h in sorted([h for h in holdings if h["every"] > 1], key=lambda h: -h["score"]):      # only when needed
        extra = h["p"] - cost(h)
        if spent + extra <= cap and h["p"] <= h["slice"] * UPGRADE_MAX_X and not (h.get("role") in ("theme", "diversifier") and h["p"] > theme_max):
            h["units"], h["every"] = 1, 1
            spent += extra; upgraded.append(h["s"])
    for h in sorted([h for h in holdings if h["every"] == 1], key=lambda h: -h["score"]):    # top-up within the amount
        while spent + h["p"] <= amount and cost(h) + h["p"] <= h["slice"] * 1.5 and not (h.get("role") in ("theme", "diversifier") and cost(h) + h["p"] > theme_max):
            h["units"] += 1; spent += h["p"]
    invested = sum(cost(h) for h in holdings)
    over = round(max(0.0, invested - amount), 2)
    for h in holdings:
        h["amt"] = round(cost(h), 2)
        h["w"] = round(cost(h) / invested * 100, 1) if invested else 0
        h["slice"] = round(h["slice"], 2)
        h["year"] = round(cost(h) * per_year)
    order = {"index": 0, "commodity": 1, "stock": 2}
    holdings.sort(key=lambda h: (order[h["sleeve"]], h.get("role") != "core", -(h["st"] or 0)))
    known = [h for h in holdings if h["st"] is not None]
    st_avg = round(sum(h["st"] * h["amt"] for h in known) / max(1, sum(h["amt"] for h in known)))
    sleeves = {k: round(sum(h["amt"] for h in holdings if h["sleeve"] == k) / invested * 100, 1) if invested else 0 for k in order}
    n_s, n_e = sum(h["kind"] == "stock" for h in holdings), sum(h["kind"] == "etf" for h in holdings)
    unused = round(max(0.0, amount - invested), 2)
    over_note = None
    if over > 0:
        what = f"to buy {', '.join(upgraded[:3])}{' and others' if len(upgraded) > 3 else ''} every {word}"
        over_note = f"Needs {_inr(invested)} a {word} — {over / amount * 100:.1f}% above your {_inr(amount)} — {what}."
    cores = [h["grp"] for h in holdings if h.get("role") == "core"]
    lines = [
        ["good", f"{_inr(amount)} a {word} into " + (f"{n_s} momentum stocks." if not n_e else f"{n_e} ETFs." if not n_s else f"{len(holdings)} holdings: {n_e} ETFs and {n_s} momentum stocks.")],
        cores and ["good", f"The index part covers {', '.join(cores)} — large, mid and small companies together."],
        any(h["sleeve"] == "commodity" for h in holdings) and ["info", f"{alloc['commodity']}% in gold steadies the SIP: it moves differently from shares."],
        n_s and ["good" if st_avg >= 24 else "mid", f"Every stock passed the momentum checks ({' / '.join(REL_WORD[r] for r in rel)} reliability); "
                                                  "Hyperplane AI re-checks them after every update."],
        n_s and stock_cfg and ["info", f"{n_s} stocks across {len({h.get('sec') for h in holdings if h['kind'] == 'stock'})} sectors: "
                                       "each gets the same money every instalment; a costly share is bought every few instalments."],
        unused >= 1 and ["info", f"About {_inr(unused)} of each instalment stays with you (whole units only)."],
    ]
    return {"amount": amount, "freq": freq, "per_year": per_year, "alloc": alloc, "rel": rel, "mix": mix if n_s else None,
            "stepup": stepup, "years_plan": years, "count_asked": count, "count_rec": rec, "count": len(holdings), "holdings": holdings,
            "invested": round(invested, 2), "unused": unused, "over": over, "over_note": over_note, "st_avg": st_avg, "sleeves": sleeves,
            "stepup_table": _stepup(invested, per_year, stepup, years), "insights": _insights(holdings),
            "summary": [l for l in lines if l], "notes": notes,
            "inputs": {"amount": amount, "freq": freq, "alloc": alloc, "rel": rel, "mix": mix, "count": count, "stepup": stepup, "years": years},
            "as_of": (data or {}).get("as_of") or (data or {}).get("asOf")}


def _stepup(invested, per_year, stepup, years):
    """year by year: the instalment that year, put in that year, put in so far — plain sums, never a forecast"""
    rows, total = [], 0.0
    for y in range(1, years + 1):
        inst = invested * (1 + stepup / 100) ** (y - 1)
        total += inst * per_year
        rows.append({"y": y, "inst": round(inst), "year": round(inst * per_year), "total": round(total)})
    return rows


def _insights(holdings):
    tot = sum(h["amt"] for h in holdings) or 1
    def acc(key):
        out = {}
        for h in holdings:
            k = key(h)
            if k:
                out[k] = out.get(k, 0) + h["amt"]
        return sorted(((k, round(v / tot * 100, 1)) for k, v in out.items()), key=lambda kv: -kv[1])
    spread = {"Strong": 0, "Good": 0, "Building": 0, "Steady": 0}
    for h in holdings:
        st = h["st"] if h["st"] is not None else 0
        spread["Strong" if st >= 60 else "Good" if st >= 40 else "Building" if st >= 24 else "Steady"] += 1
    return {"type": acc(lambda h: {"index": "Index ETFs", "commodity": "Gold & silver", "stock": "Momentum stocks"}[h["sleeve"]]),
            "market": acc(lambda h: h["grp"] if h["kind"] == "etf" else None)[:10],
            "cap": acc(lambda h: f"{h['cap']} cap" if h["kind"] == "stock" else None),
            "sector": acc(lambda h: h.get("sec") if h["kind"] == "stock" else None)[:8], "spread": spread}


# ── checks of saved plans: the momentum check / portfolio adjuster / alerts ──
def stock_status(data, sym, rel):
    """None = keep; else the plain reason to swap it (its long-term regime turned down, or it left the data)"""
    s = next((x for x in data.get("stocks", []) if x["s"] == sym), None)
    if not s:
        return "it is no longer in the data"
    # owner 2026-11-06: ask for a swap ONLY when the long-term regime turns down — never for an ordinary pullback
    return "its long-term regime turned down" if (s.get("rp") or [0])[0] == -1 else None


def etf_status(etf_data, sym):
    """None = keep; else the reason to remove (themes / strategy / international only, in the worst case)"""
    e = next((x for x in (etf_data or {}).get("etfs", []) if x["s"] == sym), None)
    if not e:
        return "it is no longer in the data"
    if etf_role(e) != "theme":
        return None                                                    # core index and gold: always kept
    st, rg = e.get("st"), e.get("rg")
    if st is not None and (st <= -ETF_UP or (rg == -1 and st < 0)):
        return "its theme turned into a long-term downtrend"
    return None


def check_holdings(data, etf_data, holdings, rel, mix=None, kind="sip"):
    """keep / exit (with the reason) / new (one replacement per exit, same kind; a theme gets a theme in an uptrend)"""
    have = {h["s"] for h in holdings}
    me = MSIP_MAX_EVERY if kind == "msip" else MAX_EVERY
    prices = {x["s"]: x.get("p") for x in data.get("stocks", [])}
    prices.update({x["s"]: x.get("p") for x in (etf_data or {}).get("etfs", [])})
    keep, exits = [], []
    for h in holdings:
        why = stock_status(data, h["s"], rel) if h["kind"] == "stock" else etf_status(etf_data, h["s"])
        if why:
            exits.append({**h, "why": why})
            continue
        p = prices.get(h["s"]) or h.get("p")
        if kind == "builder":                                          # a one-time portfolio: the same shares at today's price
            keep.append({**h, "p": p, **({"amt": round(h["qty"] * p, 2)} if p and h.get("qty") else {})})
            continue
        budget = max(h.get("slice") or 0, h.get("amt") or 0)               # what the saved plan spends on it (top-ups included)
        u = _units(budget * (1 + DRIFT), p, me) if p and budget else None
        keep.append({**h, "p": p, **({"units": u[0], "every": u[1], "amt": round(u[0] * p / u[1], 2)} if u else {})})
    new = []
    if any(h["kind"] == "stock" for h in exits):
        cands, _ = builder.candidates(data, set(rel) | {"S"}, builder.DEFAULT_OPTS)
        cands = sorted([x for x in cands if x["tier"] == 1 and x["s"].get("h") in rel and x["s"]["s"] not in have], key=lambda x: -x["score"])
        secs, inds = _group_strength(data)
        used = set()
        for h in [h for h in exits if h["kind"] == "stock"]:
            pick = next((x for x in cands if x["s"]["s"] not in used and x["s"].get("cap") == h.get("cap")), None) or \
                next((x for x in cands if x["s"]["s"] not in used), None)
            if pick:
                used.add(pick["s"]["s"])
                sl = max(h.get("slice") or 0, h.get("amt") or 0) or pick["s"]["p"]
                u = _units(sl, pick["s"]["p"], me) or (1, 1)
                nh = _stock_holding(pick, sl, u, secs, inds)
                nh.update(amt=round(u[0] * pick["s"]["p"] / u[1], 2), replaces=h["s"])
                if kind == "builder":                                  # the money of the stock sold buys whole shares of the new one
                    q = max(1, int((h.get("amt") or pick["s"]["p"]) // pick["s"]["p"]))
                    nh.update(qty=q, units=q, every=1, amt=round(q * pick["s"]["p"], 2))
                new.append(nh)
    for h in [h for h in exits if h["kind"] == "etf"]:
        alt = next((e for e in _themes(etf_data) if e["s"] not in have and e["s"] not in {n["s"] for n in new}), None)
        if alt:
            sl = h.get("slice") or h.get("amt") or alt["p"]
            u = _units(sl, alt["p"]) or (1, 1)
            nh = _etf_holding(alt, sl, u, etf_data, "index")
            nh.update(amt=round(u[0] * alt["p"] / u[1], 2), replaces=h["s"])
            new.append(nh)
    total = sum(h.get("amt") or 0 for h in keep) + sum(h["amt"] for h in new)
    return {"keep": keep, "exit": exits, "new": new, "total": round(total, 2)}


def apply_changes(holdings, result):
    """the portfolio adjuster: the saved holdings with every exit replaced by its suggested replacement"""
    repl = {n["replaces"]: n for n in result["new"]}
    out = []
    for h in holdings:
        if any(e["s"] == h["s"] for e in result["exit"]):
            if h["s"] in repl:
                out.append(repl[h["s"]])
        else:
            k = next((x for x in result["keep"] if x["s"] == h["s"]), h)
            out.append(k)
    return out
