"""
Customer view (/app) — turns one stored collection into plain labels.

Per stock and timeframe (D W M Q Y) the rating is Good / Moderate / Weak:
    score = that timeframe's zone + NR signal direction (same weights as the Control Tower's Focus score, capped ±2)
          + where price sits in that timeframe's zone (above top +1, top band +0.5, inside 0, bottom band −0.5, below −1)
          + that timeframe's technicals (when switched on in Admin)
    Good if score ≥ 0.5, Weak if ≤ −0.5, otherwise Moderate; "-" when there is no data for that timeframe.
    Customers see direction + strength: signed value round(100 · tanh(score / 2)) in −100..100 — plus = uptrend strength,
    minus = downtrend strength; |value| < 24 (score between −0.5 and 0.5) = sideways. Same cut as Good / Weak.
Sector / industry numbers per timeframe = the Control Tower's (`sector_stats`, a port of tfSectorIndustry): the
scanner's sheets for "All", recomputed per D..Y (and for "All" too when technicals are on).
Only labels and these numbers leave this module — never signals, signal names or the method.
"""
import gzip
import json
import math
import re

from .db import get_settings, pool

TFS = "DWMQY"
TF_WEIGHT = {"D": 1, "W": 2, "M": 3, "Q": 4, "Y": 5}
EVENT_W = {"BREAKOUT": 1.0, "BREAKDOWN": 1.0, "CROSS": 1.0, "VIRGIN": 1.2, "FLAG": 0.9, "STATE": 0.6,
           "PULLBACK": 0.5, "RECLAIM": 0.7, "NEAR": 0.35}
TF_WORDS = {"daily": "D", "weekly": "W", "monthly": "M", "quarterly": "Q", "quaterly": "Q", "yearly": "Y"}
POS_SCORE = {"ABOVE_TOP": 1.0, "IN_TOP_BAND": 0.5, "INSIDE": 0.0, "IN_BOTTOM_BAND": -0.5, "BELOW_BOTTOM": -1.0}
_TF_RE = re.compile(r"(daily|weekly|monthly|quarterly|quaterly|yearly)|(?:^|_)([dwmqy])_?z(?=_|$|[hl])")
_IDX_SYM = re.compile(r"NIFTY|SENSEX|BEES|ETF$")
_IDX_NAME = re.compile(r"\bETF\b|\bindex fund\b|\bfund of funds?\b", re.I)
CAP = {"largecap": "Large", "midcap": "Mid", "smallcap": "Small"}
KEEP_PUBLISHED = 30


def _sym(v):
    return str(v or "").replace("NSE:", "").replace(",", "").strip().upper()


def _num(v):
    try:
        f = float(str(v).replace(",", "").replace("%", ""))
        return None if f != f else f
    except (TypeError, ValueError):
        return None


def _tf_refs(s):
    return [TF_WORDS[m.group(1)] if m.group(1) else m.group(2).upper() for m in _TF_RE.finditer(s)]


def classify(row):
    """(timeframe, direction, weight) of one signal — same reading as the dashboard's classifySignal."""
    name, typ = str(row.get("Signal_Name") or ""), str(row.get("Signal_Type") or "")
    nl, cat = name.lower(), row.get("Signal_Category")
    if cat == "NR_PATTERN":
        tf = {"Daily": "D", "Weekly": "W", "Monthly": "M", "Quarterly": "Q", "Yearly": "Y"}.get(row.get("Timeframe")) \
            or (nl[:1].upper() if nl[:1].upper() in TFS else "D")
        ev = {"Breakout": ("BREAKOUT", 1), "Breakdown": ("BREAKDOWN", -1), "Near High": ("NEAR", 1),
              "Near Low": ("NEAR", -1), "Back to NR": ("RECLAIM", 1)}.get(typ, ("STATE", 0))
        return tf, ev[1], EVENT_W[ev[0]]
    if "virgin" in nl:
        tf = "Y" if "year" in nl else "Q" if "quarter" in nl else "M" if "month" in nl else "W"
        return tf, 1 if "breakout" in nl else -1, EVENT_W["VIRGIN"]
    if nl.startswith("last_"):
        tf = "M" if "mon" in nl else "W" if "wk" in nl else "D"
        if "nearto" in nl:
            return tf, 1 if "up_trend" in nl else -1, EVENT_W["PULLBACK"]
        return tf, 1 if ("broakup" in nl or "breakup" in nl) else -1, EVENT_W["FLAG"]
    i = nl.find("close")
    refs = _tf_refs(nl[i + 5:] if i >= 0 else nl)
    tf = (max(refs, key=lambda t: TF_WEIGHT[t]) if "overlap" in nl else refs[0]) if refs else "D"
    if typ == "RETRACEMENT":
        up = re.search(r"near(_and)?_abv", nl) or re.search(r"near_[dwmqy]z_low", nl)
        return tf, 1 if up else -1, EVENT_W["PULLBACK"]
    d = 1 if typ == "LONG" else -1 if typ == "SHORT" else 0
    ev = "CROSS" if ("cro" in nl or "csd" in nl) else "NEAR" if "near" in nl else "STATE"
    return tf, d, EVENT_W[ev]


def _tech_net(row, tf, price, c):
    """(bullish − bearish) / 6 for one timeframe's indicators, with the Admin levels."""
    g = lambda k: _num(row.get(f"{tf}_{k}"))
    rsi, macd, cci, st, bbu, bbl, adx = (g(k) for k in ("RSI", "MACD", "CCI", "Supertrend", "BB_Upper", "BB_Lower", "ADX"))
    dirs = []
    if rsi is not None:
        dirs.append(1 if rsi >= c["rsi_bull"] else -1 if rsi <= c["rsi_bear"] else 0)
    if macd is not None:
        dirs.append(1 if macd > c["macd_bull"] else -1 if macd < c["macd_bear"] else 0)
    if cci is not None:
        dirs.append(1 if cci >= c["cci_bull"] else -1 if cci <= c["cci_bear"] else 0)
    st_dir = 0 if price is None or st is None else (1 if price > st else -1 if price < st else 0)
    dirs.append(st_dir)
    if price is not None:
        dirs.append(1 if bbu is not None and price > bbu else -1 if bbl is not None and price < bbl else 0)
    if adx is not None and st_dir:
        ok = adx > c["adx_value"] if c.get("adx_mode") == "above" else adx < c["adx_value"]
        dirs.append(st_dir if ok else 0)
    return sum(dirs) / 6


def build_public(sheets, settings, as_of):
    flat = sheets.get("Flat_Data_For_Slicers", [])
    zl = {_sym(r.get("Symbol")): r for r in sheets.get("Zone_Levels", [])}
    master = {_sym(r.get("Symbol")): r for r in sheets.get("Master_Stock_Data", [])}
    health = {_sym(r.get("Symbol")): str(r.get("Health") or "").upper() for r in sheets.get("Price_Health", [])}
    stretched = {_sym(r.get("Symbol")) for r in sheets.get("Price_Health", []) if str(r.get("Stretched") or "") == "Yes"}
    tech = {_sym(r.get("Symbol")): r for r in sheets.get("Technicals", [])} if settings.get("tech_enabled") else {}
    tech_w = float(settings.get("tech_weight") or 0)
    tech_cfg = settings.get("tech") or {}
    add, keep = set(settings.get("index_add") or []), set(settings.get("index_keep") or [])

    sig = {}
    for r in flat:
        if r.get("Signal_Category") not in ("ZONE", "NR_PATTERN"):
            continue
        tf, d, w = classify(r)
        if d:
            per = sig.setdefault(_sym(r.get("Symbol")), {})
            per[tf] = per.get(tf, 0) + d * w

    def is_index(sym, z, m):
        if sym in keep:
            return False
        sector = str((m or {}).get("Sector") or (z or {}).get("Sector") or "").lower()
        name = str((m or {}).get("Stock_Name") or (z or {}).get("Stock_Name") or "")
        return sym in add or sector == "indices" or bool(_IDX_SYM.search(sym)) or bool(_IDX_NAME.search(name))

    stocks, scored, index_syms = [], [], set()
    for sym, z in zl.items():
        m = master.get(sym, {})
        price = _num(z.get("Price"))
        if sym and is_index(sym, z, m):
            index_syms.add(sym)
            continue
        if not sym or price is None:
            continue
        rating, raw_total, sc = "", 0.0, []
        for tf in TFS:
            pos = POS_SCORE.get(str(z.get(f"{tf}_Position") or ""))
            s_net = sig.get(sym, {}).get(tf)
            t_net = _tech_net(tech[sym], tf, price, tech_cfg.get(tf, {})) * tech_w if sym in tech and tf in tech_cfg else None
            if pos is None and s_net is None and not t_net:
                rating += "-"
                sc.append(None)
                continue
            score = max(-2.0, min(2.0, s_net or 0.0)) + (pos or 0.0) + (t_net or 0.0)
            raw_total += score * TF_WEIGHT[tf]
            sc.append(round(100 * math.tanh(score / 2)))
            rating += "G" if score >= 0.5 else "W" if score <= -0.5 else "M"
        have = [(TF_WEIGHT[tf], v) for tf, v in zip(TFS, sc) if v is not None]
        overall_sc = round(sum(w * v for w, v in have) / sum(w for w, _ in have)) if have else None
        g, w = rating.count("G"), rating.count("W")
        overall = ("Strong" if g >= 4 and w == 0 else "Weak" if w >= 4 and g == 0
                   else "Leaning strong" if g > w else "Leaning weak" if w > g else "Mixed")
        cap = CAP.get(str(m.get("Marketcap") or "").replace(" ", "").lower(), "")
        stocks.append({"s": sym, "n": str(m.get("Stock_Name") or z.get("Stock_Name") or sym)[:80],
                       "sec": str(m.get("Sector") or z.get("Sector") or "Other") or "Other",
                       "ind": str(m.get("Industry") or z.get("Industry") or "Other") or "Other",
                       "cap": cap, "f": 1 if str(z.get("Is_FNO") or "") == "Yes" else 0,
                       "p": round(price, 2), "c": _num(m.get("Change_Pct") if m else z.get("Change_Pct")),
                       "r": rating, "sc": sc, "os": overall_sc, "o": overall,
                       # background (Price_Health): S = Healthy, M = Weak or unrated (as the Control Tower), W = Poor
                       "h": ({"HEALTHY": "S", "POOR": "W"}.get(health.get(sym), "M") if health else None),
                       # stretched: ≥ 3x its 1-year low (Price_Health "Stretched") — shown as a warning, never chase
                       "x": 1 if sym in stretched else 0})
        if "-" not in rating and health.get(sym) != "POOR":
            weighted = sum(TF_WEIGHT[tf] * (1 if ch == "G" else -1 if ch == "W" else 0) for tf, ch in zip(TFS, rating))
            if weighted > 0:
                scored.append((weighted, raw_total, sym))
    scored.sort(reverse=True)
    for s in stocks:
        if s["c"] is not None:
            s["c"] = round(s["c"], 2)
    stocks.sort(key=lambda s: s["s"])
    sectors, industries = sector_stats(sheets, flat, master, zl, sig_types(flat), tech, tech_cfg, tech_w,
                                       bool(settings.get("tech_enabled")), index_syms)
    return {"v": 3, "as_of": as_of, "stocks": stocks, "top": [sym for _, _, sym in scored[:10]],
            "sectors": sectors, "industries": industries}


# ─── sector / industry strength per timeframe (same as the Control Tower) ─────────────────
SIG_TYPES = ("LONG", "SHORT", "RETRACEMENT", "MIXED", "Breakout", "Breakdown", "Near High", "Near Low", "Back to NR")


def sig_types(flat):
    """symbol -> timeframe -> {signal type: count} for zone + NR signals."""
    out = {}
    for r in flat:
        if r.get("Signal_Category") not in ("ZONE", "NR_PATTERN"):
            continue
        typ = str(r.get("Signal_Type") or "")
        if typ not in SIG_TYPES:
            continue
        tf = classify(r)[0]
        per = out.setdefault(_sym(r.get("Symbol")), {}).setdefault(tf, {})
        per[typ] = per.get(typ, 0) + 1
    return out


def _attach_strength(rows):
    def norm(v, vals):
        lo, hi = min(vals), max(vals)
        return 50.0 if hi == lo else (v - lo) / (hi - lo) * 100
    nb, ch = [r["nb"] for r in rows], [r["avg"] for r in rows]
    for r in rows:
        r["st"] = round(0.4 * norm(r["nb"], nb) + 0.3 * r["ad"] * 100 + 0.3 * norm(r["avg"], ch), 1)
    rows.sort(key=lambda r: -r["st"])
    return rows


def sector_stats(sheets, flat, master, zl, types, tech, tech_cfg, tech_w, tech_on, index_syms):
    """{"A"|"D".."Y": [rows]} for sectors and industries. Row: k (name), sec (industries), st (strength 0–100),
    nb (net bias), n (stocks), sig (signals), adv, dec, avg (average % move)."""
    sec_of, ind_of = {}, {}
    for sym, m in master.items():
        sec_of[sym], ind_of[sym] = str(m.get("Sector") or "Unknown") or "Unknown", str(m.get("Industry") or "Unknown") or "Unknown"
    for r in flat:
        sym = _sym(r.get("Symbol"))
        if sym and sym not in sec_of:
            sec_of[sym], ind_of[sym] = "Unknown", "Unknown"
    syms = [s for s in sec_of if s not in index_syms and sec_of[s].lower() not in ("indices", "unknown")]
    prev_col = {"W": "Prev_Week_Close", "M": "Prev_Month_Close", "Q": "Prev_Quarter_Close", "Y": "Prev_Year_Close"}

    def change(sym, tf):
        z = zl.get(sym)
        if tf in ("D", "A"):
            v = _num(master.get(sym, {}).get("Change_Pct"))
            return v if v is not None else (_num(z.get("Change_Pct")) if z else None)
        if not z:
            return None
        p, prev = _num(z.get("Price")), _num(z.get(prev_col[tf]))
        return (p / prev - 1) * 100 if p is not None and prev else None

    def tech_bias(sym, tf):
        if not (tech_on and tech_w and sym in tech and sym in types):    # technicals weigh stocks that have signals
            return 0.0, 0.0
        price = _num((zl.get(sym) or {}).get("Price"))
        b = r = 0.0
        for t in (TFS if tf == "A" else tf):
            net = _tech_net(tech[sym], t, price, tech_cfg.get(t, {})) * 6
            if net > 0:
                b += tech_w * net / 6
            elif net < 0:
                r += tech_w * -net / 6
        return b, r

    def metrics(group, tf):
        adv = dec = n_ch = 0
        tot_ch = bull = bear = total = 0.0
        for sym in group:
            c = change(sym, tf)
            if c is not None:
                n_ch += 1; tot_ch += c
                adv += c > 0; dec += c < 0
            per = types.get(sym, {})
            for t in (TFS if tf == "A" else tf):
                k = per.get(t, {})
                bull += k.get("LONG", 0) + k.get("Breakout", 0)
                bear += k.get("SHORT", 0) + k.get("Breakdown", 0)
                total += sum(k.values())
            tb, tr = tech_bias(sym, tf)
            bull += tb; bear += tr
        return {"n": len(group), "sig": int(total), "adv": adv, "dec": dec,
                "avg": round(tot_ch / n_ch, 2) if n_ch else 0.0,
                "ad": round(adv / (adv + dec), 3) if adv + dec else 0.5, "nb": round(bull - bear, 1)}

    def from_sheet(rows, industry):
        out = []
        for r in rows:
            sec = str(r.get("Sector") or "")
            if sec.lower() in ("indices", "unknown", ""):
                continue
            out.append({"k": str(r.get("Industry") if industry else sec), **({"sec": sec} if industry else {}),
                        "st": round(_num(r.get("Strength_Score")) or 0, 1), "nb": _num(r.get("Net_Bias_Score")) or 0,
                        "n": int(_num(r.get("Total_Stocks")) or 0), "sig": int(_num(r.get("Total_Signal_Count")) or 0),
                        "adv": int(_num(r.get("Advancing")) or 0), "dec": int(_num(r.get("Declining")) or 0),
                        "avg": _num(r.get("Avg_Change_Pct")) or 0})
        return sorted(out, key=lambda r: -r["st"])

    sec_groups, ind_groups = {}, {}
    for sym in syms:
        sec_groups.setdefault(sec_of[sym], []).append(sym)
        ind_groups.setdefault((sec_of[sym], ind_of[sym]), []).append(sym)
    sectors, industries = {}, {}
    for tf in ("A",) + tuple(TFS):
        if tf == "A" and not tech_on and sheets.get("Sector_Analysis"):
            sectors[tf] = from_sheet(sheets.get("Sector_Analysis", []), False)
            industries[tf] = from_sheet(sheets.get("Industry_Analysis", []), True)
            continue
        sectors[tf] = _attach_strength([{"k": sec, **metrics(g, tf)} for sec, g in sec_groups.items()])
        industries[tf] = _attach_strength([{"k": ind, "sec": sec, **metrics(g, tf)} for (sec, ind), g in ind_groups.items()])
        for row in sectors[tf] + industries[tf]:
            row.pop("ad", None)
    return sectors, industries


def publish(snapshot_id=None, mode="manual", by=None, dry_run=False):
    """Build the customer view from a collection (latest when snapshot_id is None) and store it."""
    with pool.connection() as c:
        q = "SELECT id, taken_at, data_gz FROM snapshots " + ("WHERE id = %s" if snapshot_id else "ORDER BY taken_at DESC LIMIT 1")
        snap = c.execute(q, (snapshot_id,) if snapshot_id else ()).fetchone()
    if not snap:
        raise ValueError("no collection to publish")
    sheets = json.loads(gzip.decompress(bytes(snap["data_gz"])))
    payload = build_public(sheets, get_settings(), snap["taken_at"].isoformat())
    if dry_run:
        return payload
    gz = gzip.compress(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode(), compresslevel=6)
    with pool.connection() as c:
        r = c.execute("INSERT INTO published (snapshot_id, data_as_of, mode, published_by, stocks, data_gz) "
                      "VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, published_at",
                      (snap["id"], snap["taken_at"], mode, by, len(payload["stocks"]), gz)).fetchone()
        c.execute("DELETE FROM published WHERE id NOT IN (SELECT id FROM published ORDER BY id DESC LIMIT %s)", (KEEP_PUBLISHED,))
    return {"id": r["id"], "published_at": r["published_at"].isoformat(), "snapshot_id": snap["id"],
            "as_of": snap["taken_at"].isoformat(), "stocks": len(payload["stocks"]), "mode": mode, "by": by}
