"""
ETF analyser (owner, 2026-11-06: "keep the ETF as a separate section … only the tradable ones, not the bonds … in the
admin panel an ETF section that shows all the real data and why it is picked … in the customer app only the strength
and additionally the recommended one").

Input: the scanner's ETF bundle (scanner/funds.py + chartink_fast.build_etf_bundle), stored per collection in
etf_collections. The SAME engines as the stocks read it: zone_engine (long-term strength, regime squeeze, mother
candle), publish.regimes (Supertrend regime), liquidity.analyse (average daily volume), Price_Health (years of history).

  class / underlying   keyword rules on the ETF's name + symbol (RULES, first match wins); every gold ETF → "Gold",
                       every Nifty 50 ETF → "Nifty 50" …; no match → "Other" with the cleaned name
  Recommended          one per underlying: the most traded ETF (average ₹ a day) among those trading at least REC_MIN_VALUE
                       a day and not erratic; within REC_TIE of the top, the longer history wins ("famous, reliable to buy")

Two outputs: admin_rows() — every number and the Recommended checklist (Admin → Control Tower → ETF analyser);
customer_payload() — name, symbol, class, underlying, strength and the Recommended flag + one plain reason (published).
Constants are Claude's proposal — the owner may tune them.
"""
import gzip
import json
import re
from datetime import date, datetime, timedelta, timezone

from . import liquidity
from . import zone_engine as Z
from .db import pool

REC_MIN_VALUE = 1e7          # ₹1 crore traded a day, at least
REC_TIE = 0.90               # within 10 % of the most traded one → the longer history wins
CLASSES = ("Gold", "Silver", "Broad market", "Sector & theme", "Strategy", "International", "Other")

_S, _B, _ST, _I = "Sector & theme", "Broad market", "Strategy", "International"
RULES = (                                    # (pattern on "NAME SYMBOL" upper-case, class, underlying) — order matters
    (r"GOLD", "Gold", "Gold"),
    (r"SILVER|SLVR", "Silver", "Silver"),
    (r"NASDAQ\s*Q\s*50|MONQ50", _I, "Nasdaq Q-50"),
    (r"NASDAQ|MON100|\bN100\b", _I, "Nasdaq 100"),
    (r"HANG\s*SENG|HNGSNG", _I, "Hang Seng"),
    (r"FANG", _I, "NYSE FANG+"),
    (r"S\s*&\s*P\s*500|SP\s*500|MASPTOP50", _I, "S&P 500"),
    (r"MSCI\s*INDIA", _B, "MSCI India"),
    (r"FTSE\s*INDIA|FTSEINDIA", _B, "FTSE India"),
    (r"MSCI|\bGLOBAL\b|\bWORLD\b|JAPAN|CHINA|TAIWAN|EUROPE|\bUS\b", _I, None),
    (r"SHARIAH", _ST, "Shariah"),
    (r"ALPHA\s*LOW\s*VOL", _ST, "Alpha low volatility"),
    (r"LOW\s*VOL", _ST, "Low volatility"),
    (r"MOMENTUM|MIDMOM", _ST, "Momentum"),
    (r"\bALPHA\b|ALPHAETF", _ST, "Alpha"),
    (r"QUALITY|QUAL30", _ST, "Quality"),
    (r"\bVALUE\b|VALUEAXIS|VAL20|\bNV20\b", _ST, "Value"),
    (r"EQUAL\s*WEIGHT|EQUAL\b|\bEQL", _ST, "Equal weight"),
    (r"DIVIDEND|DIVOPP", _ST, "Dividend"),
    (r"\bESG\b", _ST, "ESG"),
    (r"SECTOR\s*LEADERS", _ST, "Sector leaders"),
    (r"GROWTH\s*SECTORS", _ST, "Growth sectors"),
    (r"PSU\s*BANK|PSUBANK|PSUBNK|PSUBK", _S, "PSU Bank"),
    (r"PRIVATE\s*BANK|PVT\s*BANK|PVTBAN", _S, "Private Bank"),
    (r"TOP\s*10\s*BANK|10\s*BANK", _S, "Top 10 Banks"),
    (r"BANK", _S, "Bank"),
    (r"CAPITAL\s*MARKET|CAPM|MOCAPITAL", _S, "Capital markets"),
    (r"INSURANCE|INSURE", _S, "Insurance"),
    (r"FIN\w*\s*SERV|FINANCIAL|FINIETF|BFSI", _S, "Financial services"),
    (r"\bIT\b|INFO\w*\s*TECH|ITBEES|^TECH\b|\bTECH\b", _S, "IT"),
    (r"PHARMA", _S, "Pharma"),
    (r"HEALTH|HOSPI", _S, "Healthcare"),
    (r"FMCG", _S, "FMCG"),
    (r"CONSUM", _S, "Consumption"),
    (r"\bEV\b|EVINDIA|NEW\s*AGE\s*AUTO", _S, "EV & new-age auto"),
    (r"AUTO", _S, "Auto"),
    (r"METAL", _S, "Metal"),
    (r"ENERGY|OIL|\bGAS\b", _S, "Energy"),
    (r"INFRA", _S, "Infrastructure"),
    (r"REALTY|REAL\s*ESTATE|HOUSING", _S, "Realty"),
    (r"DEFEN[CS]E|DEFNC", _S, "Defence"),
    (r"RAIL", _S, "Railways"),
    (r"CPSE|BHARAT\s*22|\bPSE\b|GROWWPSE|\bPSU\b", _S, "Public sector (PSE)"),
    (r"MANUFACTUR|\bMFG\b|MANUFG", _S, "Manufacturing"),
    (r"CHEMICAL", _S, "Chemicals"),
    (r"TOURISM", _S, "Tourism"),
    (r"MEDIA|DIGITAL|INTERNET", _S, "Digital & media"),
    (r"COMMODIT", _S, "Commodities"),
    (r"\bMNC\b", _S, "MNC"),
    (r"\bPOWER\b|GROWWPOWER", _S, "Power"),
    (r"\bIPO\b", _S, "IPO"),
    (r"NEXT\s*50|JUNIOR|NXT50|NEXT50", _B, "Nifty Next 50"),
    (r"MIDCAP\s*150|MID\s*150|MID150", _B, "Midcap 150"),
    (r"SMALL\s*CAP\s*250|SMALL\s*250|SML\s*250", _B, "Smallcap 250"),
    (r"LARGE\s*MID|LARGEMID", _B, "LargeMidcap 250"),
    (r"MIDCAP\s*100|MID\s*100|MOM100", _B, "Midcap 100"),
    (r"MIDCAP\s*50\b|MID\s*50\b", _B, "Midcap 50"),
    (r"MIDCAP|\bMID\b|MIDSELIETF", _B, "Midcap"),
    (r"SMALLCAP|SMALL", _B, "Smallcap"),
    (r"TOTAL\s*MARKET|\bTOTAL\b|AONETOTAL|BIRLATOTAL", _B, "Total market"),
    (r"\b500\b|NIF500|BSE500", _B, "500 index"),
    (r"\b200\b|N200", _B, "Nifty 200"),
    (r"\b100\b|NIF100", _B, "Nifty 100"),
    (r"SENSEX", _B, "Sensex"),
    (r"NIFTY|\bM50\b|\b50\b", _B, "Nifty 50"),
)
_RULES = [(re.compile(p), c, u) for p, c, u in RULES]
_AMC = re.compile(r"^(Nippon India|ICICI Prudential|Motilal Oswal|Mirae Asset|Kotak|HDFC|SBI|UTI|Axis|Aditya Birla Sun Life|"
                  r"ABSL|DSP|Edelweiss|Bandhan|Zerodha|Groww|Angel One|Tata|Invesco India|LIC (Nomura )?MF|Bajaj Finserv|"
                  r"Baroda BNP Paribas|HSBC|Quantum|Navi|360 ONE|Shriram|Union|Choice|Canara Robeco|WhiteOak|Sundaram|"
                  r"PGIM|Helios|Unifi|Samco|IDFC|Franklin|Mahindra Manulife|Bank of India|JM)\s+", re.I)
_NOISE = re.compile(r"\b(ETF|BeES|Bees|Fund|Exchange Traded|Growth|Option|Plan|Regular|Index|Direct)\b|[-–]", re.I)


def _sym(v):
    return str(v or "").replace("NSE:", "").replace(",", "").strip().upper()


def _num(v):
    try:
        f = float(str(v).replace(",", ""))
        return None if f != f else f
    except (TypeError, ValueError):
        return None


def clean_name(name):
    return " ".join(_NOISE.sub(" ", _AMC.sub("", str(name or ""))).split()) or None


def classify(sym, name):
    """(class, underlying) from the ETF's name and symbol."""
    text = f"{name or ''} {sym}".upper()
    for rx, cls, und in _RULES:
        if rx.search(text):
            return cls, und or clean_name(name) or sym
    return "Other", clean_name(name) or sym


def _day(as_of):
    try:
        return datetime.fromisoformat(str(as_of)).astimezone(timezone(timedelta(hours=5, minutes=30))).date()
    except (TypeError, ValueError):
        return date.today()


def analyse(bundle, as_of):
    """Every tradable ETF with all its numbers, the class / underlying and the Recommended pick (with its checklist)."""
    from .publish import regimes                                      # late: publish imports this module
    if not bundle or not bundle.get("Zone_Levels"):
        return []
    day = _day(as_of)
    master = {_sym(r.get("Symbol")): r for r in bundle.get("Master_Stock_Data", [])}
    zh = {_sym(r.get("Symbol")): r for r in bundle.get("Zone_History", [])}
    health = {_sym(r.get("Symbol")): r for r in bundle.get("Price_Health", [])}
    atr = {_sym(r.get("Symbol")): _num(r.get("D_ATR")) for r in bundle.get("Technicals", [])}
    zv, reg, nrs = Z.read_all(bundle), regimes(bundle), Z.nr_map(bundle)
    rows = []
    for z in bundle["Zone_Levels"]:
        sym = _sym(z.get("Symbol"))
        m = master.get(sym, {})
        name = str(m.get("Stock_Name") or z.get("Stock_Name") or sym)
        price = _num(z.get("Price"))
        cls, und = classify(sym, name if name != sym else "")
        rw, rd, rm = reg.get(sym, (None, None, None))
        raw = zv.get(sym)
        v, held = Z.apply_regime(raw, rm)
        liq = liquidity.analyse(m, price, atr.get(sym), day) if price else None
        h = health.get(sym, {})
        tfs = {}
        for tf in "MQY":
            sh = Z.shifts([(_num((zh.get(sym) or {}).get(f"{tf}{k}_Bottom")), _num((zh.get(sym) or {}).get(f"{tf}{k}_Top"))) for k in range(5)])
            bottom, top = _num(z.get(f"{tf}_Bottom_Zone")), _num(z.get(f"{tf}_Top_Zone"))
            t = Z.trend(None, sh)
            p, _ = Z.position(price, bottom, top)
            tfs[tf] = {"bottom": bottom, "top": top, "place": z.get(f"{tf}_Position"), "steps": [round(x, 3) for x in sh],
                       "T": None if t is None else round(t, 3), "P": None if p is None else round(p, 3),
                       "raw": raw[2 + "MQY".index(tf)][2] if raw and raw[2 + "MQY".index(tf)] else None,
                       "st": v[2 + "MQY".index(tf)][2] if v and v[2 + "MQY".index(tf)] else None,
                       "nr": (nrs.get(sym) or {}).get(tf, 0)}
        rows.append({
            "s": sym, "n": name[:90], "cls": cls, "u": und, "p": price, "c": _num(m.get("Change_Pct") if m else z.get("Change_Pct")),
            "st": v[1] if v else None, "colour": v[0] if v else None, "st_raw": raw[1] if raw else None, "held": held,
            "reg_w": rw, "reg_m": rm, "tf": tfs,
            "years": _num(h.get("Years_Of_History")), "health": h.get("Health"),
            "dep": liq and liq["dep"], "norm": liq and liq["norm"], "value": round(liq["dep"] * price) if liq and price else None,
            "grade": liq and liquidity.GRADE_WORD[liq["grade"]], "erratic": bool(liq and liq["erratic"]), "spike": bool(liq and liq["spike"]),
            "vtrend": liq and liq["trend"], "wk": liq and liq["wk"], "mo": liq and liq["mo"], "qt": liq and liq["qt"], "yrs": liq and liq["yrs"],
        })
    _recommend(rows)
    return rows


def _inr(v):
    return f"₹{v / 1e7:,.1f} Cr" if v >= 1e7 else f"₹{v / 1e5:,.1f} L" if v >= 1e5 else f"₹{v:,.0f}"


def _recommend(rows):
    """Marks one Recommended ETF per underlying and writes every ETF's checklist (why it is or is not the pick)."""
    groups = {}
    for r in rows:
        groups.setdefault((r["cls"], r["u"]), []).append(r)
    for (cls, und), g in groups.items():
        by_value = sorted(g, key=lambda r: -(r["value"] or 0))
        for i, r in enumerate(by_value):
            r["rank"], r["peers"] = i + 1, len(g)
            r["checks"] = [
                {"k": "value", "ok": (r["value"] or 0) >= REC_MIN_VALUE, "label": f"Trades at least {_inr(REC_MIN_VALUE)} a day",
                 "v": _inr(r["value"]) if r["value"] else "not known"},
                {"k": "steady", "ok": r["value"] is not None and not r["erratic"], "label": "Trading is steady month to month",
                 "v": "not known" if r["value"] is None else "erratic" if r["erratic"] else "steady"},
                {"k": "rank", "ok": i == 0, "label": f"Most traded of the {len(g)} {und} ETF{'s' if len(g) > 1 else ''}", "v": f"#{i + 1}"},
                {"k": "years", "ok": (r["years"] or 0) >= 3, "label": "At least 3 years of history",
                 "v": f"{r['years']:g} years" if r["years"] else "not known"},
            ]
            r["rec"], r["why"] = False, None
        ok = [r for r in by_value if (r["value"] or 0) >= REC_MIN_VALUE and not r["erratic"]]
        if not ok:
            for r in g:
                r["why_not"] = f"No {und} ETF trades at least {_inr(REC_MIN_VALUE)} a day steadily, so none is recommended yet"
            continue
        top = ok[0]["value"]
        pick = max((r for r in ok if r["value"] >= top * REC_TIE), key=lambda r: ((r["years"] or 0), r["value"]))
        pick["rec"] = True
        yrs = f" · {int(pick['years'])}+ years of history" if pick["years"] else ""
        pick["why"] = (f"Most traded {und} ETF · {_inr(pick['value'])} a day{yrs}" if pick is ok[0]
                       else f"Long history among the most traded {und} ETFs · {_inr(pick['value'])} a day{yrs}")
        for r in g:
            if r is not pick:
                r["why_not"] = (f"{pick['s']} is recommended for {und}: " + ("it is traded more every day" if (pick["value"] or 0) > (r["value"] or 0)
                                                                              else "a longer track record at a similar volume"))


def customer_payload(rows, as_of):
    """Published (owner, 2026-11-06: "long-term model, like the portfolio builder … the best ETF … easy to understand"):
    per ETF its long-term strength, the trend per timeframe (after the regime), the long-term direction, how easy it is to
    buy (grade, ₹ a day, steady), years of history and the Recommended flag + reason / why another one is preferred.
    No prices, zones or formulas. groups = every underlying, by class, then the most traded first."""
    tot = {}
    for r in rows:
        tot[(r["cls"], r["u"])] = tot.get((r["cls"], r["u"]), 0) + (r["value"] or 0)
    groups = sorted(tot, key=lambda g: (CLASSES.index(g[0]), -tot[g]))
    return {"as_of": as_of, "classes": [c for c in CLASSES if any(r["cls"] == c for r in rows)],
            "groups": [{"k": k, "u": u, "n": sum(1 for r in rows if r["cls"] == k and r["u"] == u)} for k, u in groups],
            "etfs": [{"s": r["s"], "n": r["n"], "k": r["cls"], "u": r["u"], "st": r["st"], "c": r["colour"],
                      "p": r["p"],                     # price: used by the AI ETF SIP Builder for whole units (not shown by the ETF app)
                      "tf": [(r["tf"].get(tf) or {}).get("st") for tf in "MQY"], "rg": r["reg_m"],
                      "lq": r["grade"], "v": r["value"], "e": 1 if r["erratic"] else 0, "y": r["years"],
                      **({"r": 1, "why": r["why"]} if r["rec"] else {"wn": r.get("why_not")})} for r in rows]}


def bundle_of(snapshot_id):
    with pool.connection() as c:
        r = c.execute("SELECT data_gz FROM etf_collections WHERE snapshot_id = %s", (snapshot_id,)).fetchone()
    return json.loads(gzip.decompress(bytes(r["data_gz"]))) if r else None


_cache = {}


def admin_rows(snapshot_id, as_of):
    """Admin → Control Tower → ETF analyser (cached per collection; None = no ETF data in that collection)."""
    if snapshot_id not in _cache:
        b = bundle_of(snapshot_id)
        if len(_cache) >= 4:
            _cache.pop(next(iter(_cache)))
        _cache[snapshot_id] = analyse(b, as_of) if b else None
    return _cache[snapshot_id]


def store(snapshot_id, path):
    """The worker: keep the scanner's ETF file with its collection (admin side only — the customer service has no grant)."""
    with open(path, encoding="utf-8") as fh:
        bundle = json.load(fh)
    gz = gzip.compress(json.dumps(bundle, separators=(",", ":"), ensure_ascii=False).encode(), compresslevel=6)
    with pool.connection() as c:
        c.execute("INSERT INTO etf_collections (snapshot_id, etfs, data_gz) VALUES (%s, %s, %s) "
                  "ON CONFLICT (snapshot_id) DO UPDATE SET etfs = EXCLUDED.etfs, data_gz = EXCLUDED.data_gz",
                  (snapshot_id, len(bundle.get("Zone_Levels", [])), gz))
    return len(bundle.get("Zone_Levels", []))
