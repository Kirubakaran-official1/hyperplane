"""
Volume analyser (owner, 2026-11-01: "I added the volume for the quarterly and yearly too, and the last few weeks,
months, quarters and years … a lakh of volume does not mean we can acquire all of it — there should be some standard
… detail analysis, exact output and a better order to proceed").

Two halves:
  analyse()   at publish time, per stock, from the master screener's volumes (current candle + the last 4 weekly /
              monthly / quarterly / yearly candles, chartink_fast.VOLUME_FIELDS) and the daily price swing (D_ATR):
                · per-day volume of every COMPLETED period = its volume ÷ its weekdays (real calendar; the current candle
                  is unfinished — the run may be at 11:15 — so it only serves to spot a spike)
                · normal daily volume  = median of { median of the last 4 weeks, median of the last 4 months, last quarter }
                · dependable volume    = the lower of normal and the last-4-weeks median (falling volume counts at once,
                                         a spike never counts)
                · trend (last 4 weeks vs the last 4 months), spike (today or this week > 3× normal), erratic (the months
                  differ a lot), grade by the money traded a day
  acquisition standards, used by the builder (builder.py): buy at most PACE of a normal day's volume (participation
              rate — the common institutional rule), thin or erratic stocks slower; a position is "supported" while it
              can be bought within BUILD_DAYS days at that pace — the same amount can then be sold within 2 × BUILD_DAYS
              days even if trading halves; the price push of buying at that pace ≈ daily swing × √pace (the square-root
              rule used for trading-cost estimates).
Customers only see plain words and numbers (no method names).
"""
import math
import statistics
from datetime import date, timedelta

GRADES = ((50e7, 5), (10e7, 4), (2e7, 3), (5e6, 2), (0, 1))     # ₹ traded a day → 5 Very high … 1 Very low
GRADE_WORD = {5: "Very high", 4: "High", 3: "Moderate", 2: "Low", 1: "Very low"}
RISE, FALL, SPIKE, ERRATIC = 1.3, 0.7, 3.0, 0.6
PACES = {"careful": 0.05, "standard": 0.10, "fast": 0.20}
THIN_PACE = 0.05                    # Low / Very low liquidity: never faster than 5 % of a day
BUILD_DAYS = 5                      # a position the stock "supports" = 5 days of buying at the pace
MIN_USEFUL = 0.30                   # size by volume: a stock that supports < 30 % of its planned money is replaced


def _weekdays(a, b):
    """Monday–Friday days in [a, b)"""
    n, d = 0, a
    while d < b:
        n += d.weekday() < 5
        d += timedelta(days=1)
    return n


def _month_start(d, back=0):
    y, m = d.year, d.month - back
    while m < 1:
        y, m = y - 1, m + 12
    return date(y, m, 1)


def periods(day):
    """{field: (start, end)} of every candle the screener reports, as of the collection day (end exclusive)"""
    out, nxt = {}, day + timedelta(days=1)
    ws = day - timedelta(days=day.weekday())
    for k in range(5):
        a = ws - timedelta(days=7 * k)
        out["Weekly_Volume" + (f"_{k}" if k else "")] = (a, nxt if k == 0 else a + timedelta(days=7))
    for k in range(5):
        a = _month_start(day, k)
        out["Monthly_Volume" + (f"_{k}" if k else "")] = (a, nxt if k == 0 else _month_start(day, k - 1))
    q0 = _month_start(day, (day.month - 1) % 3)
    for k in range(5):
        a = _month_start(q0, 3 * k)
        out["Quarterly_Volume" + (f"_{k}" if k else "")] = (a, nxt if k == 0 else _month_start(q0, 3 * (k - 1)))
    for k in range(5):
        out["Yearly_Volume" + (f"_{k}" if k else "")] = (date(day.year - k, 1, 1), nxt if k == 0 else date(day.year - k + 1, 1, 1))
    return out


def _num(v):
    try:
        f = float(str(v).replace(",", ""))
        return f if f == f and f > 0 else None
    except (TypeError, ValueError):
        return None


def analyse(m, price, atr, day):
    """The volume reading of one stock → dict, or None when the screener gave no volume at all."""
    if not m:
        return None
    per = periods(day)
    rate = lambda f: (lambda v, n: v / n if v and n else None)(_num(m.get(f)), _weekdays(*per[f]))
    wk = [r for r in (rate(f"Weekly_Volume_{k}") for k in range(1, 5)) if r]
    mo = [r for r in (rate(f"Monthly_Volume_{k}") for k in range(1, 5)) if r]
    qt = [r for r in (rate(f"Quarterly_Volume_{k}") for k in range(1, 3)) if r]
    yr = [r for r in (rate("Yearly_Volume_1"),) if r]
    parts = [statistics.median(x) for x in (wk, mo) if x] + qt[:1]
    now = [r for r in (rate("Weekly_Volume"), rate("Monthly_Volume")) if r]           # unfinished candles
    today = _num(m.get("Volume"))
    if parts:
        normal = statistics.median(parts)
        recent = statistics.median(wk) if wk else normal
        dependable = min(normal, recent)
        n_used = len(wk) + len(mo) + len(qt[:1])
    elif now or today:                                    # older collections: only this week / month so far, or today
        normal = dependable = min(now) if now else today
        n_used = 0
    else:
        return None
    ref = statistics.median(mo) if mo else (yr[0] if yr else None)
    trend = 0
    if wk and ref:
        r = statistics.median(wk) / ref
        trend = 1 if r >= RISE else -1 if r <= FALL else 0
    spike = int(bool(parts) and any(x and x > SPIKE * normal for x in (today, rate("Weekly_Volume"))))
    erratic = int(len(mo) >= 3 and statistics.pstdev(mo) / statistics.mean(mo) > ERRATIC)
    value = dependable * (price or 0)
    grade = next(g for cut, g in GRADES if value >= cut)
    swing = round(atr / price * 100, 2) if atr and price else None
    return {"dep": round(dependable), "norm": round(normal), "trend": trend, "spike": spike, "erratic": erratic,
            "grade": grade, "swing": swing, "n": n_used,
            "wk": [round(r) if r else None for r in (rate(f"Weekly_Volume_{k}") for k in range(4, 0, -1))],
            "mo": [round(r) if r else None for r in (rate(f"Monthly_Volume_{k}") for k in range(4, 0, -1))],
            "yr": round(yr[0]) if yr else None, "today": round(today) if today else None}


def pack(v):
    """compact form for the published view: [dep, normal, trend, spike, erratic, grade, swing %, n, [4 weeks], [4 months], year]"""
    return [v["dep"], v["norm"], v["trend"], v["spike"], v["erratic"], v["grade"], v["swing"], v["n"], v["wk"], v["mo"], v["yr"]] if v else None


def unpack(a):
    if not a:
        return None
    keys = ("dep", "norm", "trend", "spike", "erratic", "grade", "swing", "n", "wk", "mo", "yr")
    return dict(zip(keys, a))


def pace_for(v, pace):
    """the share of a normal day's volume to buy: the chosen pace, slower for thin or erratic stocks"""
    p = PACES[pace]
    if v["grade"] <= 2:
        p = min(p, THIN_PACE)
    if v["erratic"]:
        p /= 2
    return p


def capacity(v, price, pace):
    """(shares a day, most shares the stock supports, most money) at the pace"""
    per_day = max(1, math.floor(pace_for(v, pace) * v["dep"]))          # whole shares a day
    most = per_day * BUILD_DAYS
    return per_day, most, most * price


LIGHT_SHARE = 0.01                  # a position under 1 % of one day's trading: no volume concern at all


# ─── Free float (owner, 2026-11-02: "is there such an amount of shares to trade? … calculate the free float … don't go to
# the max, only some amount is possible — check how much an institution can buy … the option to size by free float,
# else show it in the stock's details once the share count is alarming").
# free float = total shares − foreign promoter & group − Indian promoter & group (master screener columns
# grand_total_number, total_foreign_promoter_and_group_number, indian_promoter_and_group_number).
# Standard (Claude's proposal, owner may tune): one portfolio holds at most FLOAT_CAP of a stock's free float — small
# enough to sell later without trouble, and always below the line where SEBI's rules start to apply (below).
FLOAT_CAP = 0.01                    # at most 1 % of the free float in one stock ("size by free float")
FLOAT_WATCH = 0.0025                # from 0.25 % of the free float the holding is shown in the stock's details
# SEBI lines, on ALL the company's shares (paid-up capital); the highest one reached is shown
SEBI_LINES = (
    (0.25, "25% or more of all the company's shares: SEBI's takeover rules require an open offer to buy shares from "
           "every other shareholder."),
    (0.10, "10% or more of all the company's shares: the most a mutual fund house may own of one company, and the line "
           "above which a foreign investor counts as a direct (FDI) investor."),
    (0.05, "5% or more of all the company's shares: SEBI requires you to tell the company and the stock exchanges within "
           "2 working days, and again with every 2% change."),
    (0.01, "More than 1% of all the company's shares: holders above 1% are named in the company's quarterly "
           "shareholding report."),
)


def free_float(m):
    """[free-float shares, total shares] from a Master_Stock_Data row, or None when the screener did not give them
    (blank total, both promoter counts blank, or numbers that do not add up)"""
    total = _num((m or {}).get("Total_Shares"))
    fp, ip = (m or {}).get("Promoter_Foreign_Shares"), (m or {}).get("Promoter_Indian_Shares")
    if not total or all(str(x if x is not None else "").strip() == "" for x in (fp, ip)):
        return None
    promoters = (_num(fp) or 0) + (_num(ip) or 0)
    ff = total - promoters
    return [round(ff), round(total)] if 0 < ff <= total else None


def sebi_line(share_of_total):
    """the plain SEBI note for a holding that is this share of ALL the company's shares, or None"""
    for cut, txt in SEBI_LINES:
        if share_of_total > cut or (share_of_total == cut and cut > 0.01):    # 1 %: "more than"; the others: "or more"
            return txt
    return None


def price_push(v, shares_a_day):
    """estimated % the price moves while buying `shares_a_day` shares a day: daily swing × √(share of the day's volume)
    — one share of a stock trading lakhs a day moves nothing; buying 10 % of a day moves it about a third of a swing"""
    if not v or not v.get("swing") or not v.get("dep"):
        return None
    return round(v["swing"] * min(1.0, shares_a_day / v["dep"]) ** 0.5, 3)
