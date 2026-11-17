"""
Buy on Zerodha (round 20, owner 2026-11-13: "push the script and quantity to Zerodha … our ticker and Zerodha's might be
different — the best way, with validation that the same ticker is used in Zerodha … no scraping from untrusted sources").

Kite Publisher, offsite basket (https://kite.trade/docs/connect/v3/basket/): the customer's OWN browser posts a form to
kite.zerodha.com/connect/basket with our Publisher api_key and the basket JSON; Kite signs them in when needed, shows the
orders and the customer confirms there. Hyperplane never places, sees or confirms an order, and keeps no Zerodha token.

Symbols: Zerodha's own instrument list (https://api.kite.trade/instruments/NSE — the documented dump, fetched once a day
after 08:30 as Zerodha advises, stored here) is the authority. A ChartInk / NSE symbol is:
  ✓ verified — the same tradingsymbol is on Zerodha's NSE list
  ⚠ series   — not as is, but exactly ONE "<symbol>-<series>" row (BE / BZ trade-to-trade, SM / ST SME) — shown, never silent
  ✓ manual   — the admin mapped it (Admin → Zerodha); the target must be on today's list
  ✗ missing / blocked — the line cannot be sent; research is not affected
Never a match by company name.

Orders: NSE · CNC (delivery) · LIMIT (MARKET is rejected in offsite baskets — market protection is not passed) at OUR latest
price ± 1 % (owner's choice: "last price +1 %, editable"), rounded to Zerodha's tick size; quantities in whole lots;
readonly false (the customer may change price / quantity on Kite). At most 10 lines a basket; 8-character tag.
"""
import csv
import gzip
import io
import json
import os
import re
import secrets
import string
import urllib.request
from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

IST = timezone(timedelta(hours=5, minutes=30))
INSTRUMENTS_URL = os.environ.get("ZERODHA_INSTRUMENTS_URL", "https://api.kite.trade/instruments/NSE")
BASKET_URL = "https://kite.zerodha.com/connect/basket"     # the browser posts here — fixed, never taken from a request
MAX_LINES = int(os.environ.get("ZERODHA_MAX_LINES", "10"))  # Kite Publisher: "maximum 10" a basket
TAG_LEN = 8                                                 # Publisher tags: alphanumeric, 8 characters at most
HEADER = ["instrument_token", "exchange_token", "tradingsymbol", "name", "last_price", "expiry", "strike", "tick_size",
          "lot_size", "instrument_type", "segment", "exchange"]
MIN_ROWS, MAX_DROP = 1500, 0.20                             # a list that is too short / shrank a lot is not taken
SYNC_AFTER = (8, 35)                                        # IST — Zerodha builds the dump around 08:30
STALE_DAYS = 5                                              # an older list is not trusted for orders
SERIES = {"BE": "trade-to-trade (BE): delivery only, intraday not allowed",
          "BZ": "trade-to-trade (BZ): delivery only, intraday not allowed",
          "SM": "SME platform (SM): sold in lots",
          "ST": "SME platform (ST): sold in lots"}
BUFFER = Decimal("0.01")                                    # the limit: our last price +1 % (BUY) / −1 % (SELL)
QTY_MAX = 10_000_000
SOURCES = ("sip", "msip", "builder", "etf", "order", "swap", "swaps")   # swaps = several swaps at once, one step (round 21b); etf = round 23
APP_OF = {"sip": "sip", "msip": "msip", "builder": "builder", "analyser": "portfolio", "etf": "etf"}   # saved kind → the application
SYM = re.compile(r"^[A-Z0-9&._-]{1,30}$")


# ── the instrument list ──
def parse(raw: bytes):
    """Zerodha's CSV (gzip or plain) → {tradingsymbol: row} of the NSE cash segment (stocks and ETFs: instrument_type EQ);
    raises ValueError when it is not the documented format"""
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    rd = csv.reader(io.StringIO(raw.decode("utf-8", "replace")))
    head = next(rd, None)
    if head != HEADER:
        raise ValueError("the file is not Zerodha's instrument list (unexpected columns)")
    out = {}
    for r in rd:
        if len(r) != len(HEADER):
            continue
        x = dict(zip(HEADER, r))
        if x["segment"] != "NSE" or x["exchange"] != "NSE" or x["instrument_type"] != "EQ" or not SYM.match(x["tradingsymbol"]):
            continue
        try:
            tick, lot = Decimal(x["tick_size"]), int(x["lot_size"] or 1)
            tok, etok = int(x["instrument_token"]), int(x["exchange_token"])
        except (ValueError, ArithmeticError):
            continue
        if tick <= 0 or lot < 1:
            continue
        out[x["tradingsymbol"]] = {"s": x["tradingsymbol"], "n": x["name"][:120], "tick": tick, "lot": lot, "tok": tok, "etok": etok}
    return out


def store(conn, rows, source=INSTRUMENTS_URL):
    """the sanity gate, then the whole list in one transaction (the old one stays when the new one does not pass)"""
    prev = conn.execute("SELECT count(*) AS n FROM zerodha_instruments").fetchone()["n"]
    if len(rows) < MIN_ROWS:
        raise ValueError(f"only {len(rows)} NSE stocks / ETFs in the file (at least {MIN_ROWS} expected)")
    if prev and len(rows) < prev * (1 - MAX_DROP):
        raise ValueError(f"{len(rows)} NSE stocks / ETFs against {prev} last time — more than {int(MAX_DROP * 100)}% fewer")
    day = datetime.now(IST).date()
    with conn.transaction():
        conn.execute("DELETE FROM zerodha_instruments")
        with conn.cursor().copy("COPY zerodha_instruments (tradingsymbol, name, tick_size, lot_size, instrument_token, exchange_token, synced_on) FROM STDIN") as cp:
            for x in rows.values():
                cp.write_row((x["s"], x["n"], x["tick"], x["lot"], x["tok"], x["etok"], day))
    return len(rows)


def _status(conn, value):
    conn.execute("INSERT INTO settings (key, value) VALUES ('zerodha_sync', %s::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                 (json.dumps(value),))


def sync(conn, url=None):
    """one GET of Zerodha's NSE instrument list → stored (or the reason it was not) — {ok, rows, at, error}"""
    at = datetime.now(timezone.utc).isoformat()
    try:
        req = urllib.request.Request(url or INSTRUMENTS_URL, headers={"User-Agent": "Hyperplane/1.0 (daily instrument list)", "Accept-Encoding": "gzip"})
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read(60_000_000)
        n = store(conn, parse(raw))
        out = {"ok": True, "rows": n, "at": at}
    except Exception as e:                                            # noqa: BLE001 — the old list stays; Admin shows why
        old = conn.execute("SELECT max(synced_on) AS d FROM zerodha_instruments").fetchone()["d"]
        out = {"ok": False, "at": at, "error": str(e)[:300], "kept": old.isoformat() if old else None}
    _status(conn, out)
    return out


def due(conn, now=None):
    """the worker syncs once a day after 08:35 IST, and at once when the list is missing or older than a day"""
    now = now or datetime.now(IST)
    d = conn.execute("SELECT max(synced_on) AS d FROM zerodha_instruments").fetchone()["d"]
    last = (conn.execute("SELECT value FROM settings WHERE key = 'zerodha_sync'").fetchone() or {}).get("value") or {}
    if last.get("at") and datetime.fromisoformat(last["at"]) > datetime.now(timezone.utc) - timedelta(hours=1):
        return False                                                  # tried within the hour (also after a failure)
    if d is None or d < now.date() - timedelta(days=1):
        return True
    return d < now.date() and (now.hour, now.minute) >= SYNC_AFTER


def list_day(conn):
    d = conn.execute("SELECT max(synced_on) AS d FROM zerodha_instruments").fetchone()["d"]
    return d


# ── symbols ──
def resolve(conn, syms):
    """{our symbol: {k: Zerodha tradingsymbol | None, st: verified | series | manual | missing | blocked | nolist, note, tick, lot, n}}"""
    syms = sorted({s for s in syms if SYM.match(s or "")})
    if not syms:
        return {}
    day = list_day(conn)
    over = {r["sym"]: r for r in conn.execute("SELECT sym, kite_symbol, status, note FROM zerodha_symbol_map WHERE sym = ANY(%s)", (syms,)).fetchall()}
    want = set(syms) | {f"{s}-{x}" for s in syms for x in SERIES} | {r["kite_symbol"] for r in over.values() if r["kite_symbol"]}
    have = {r["tradingsymbol"]: r for r in conn.execute(
        "SELECT tradingsymbol, name, tick_size, lot_size FROM zerodha_instruments WHERE tradingsymbol = ANY(%s)", (sorted(want),)).fetchall()}
    out = {}
    for s in syms:
        o = over.get(s)
        if day is None:
            out[s] = {"k": None, "st": "nolist", "note": "Zerodha's symbol list is not loaded yet"}
            continue
        if o and o["status"] == "blocked":
            out[s] = {"k": None, "st": "blocked", "note": o["note"] or "Not sent to Zerodha (set by the admin)"}
            continue
        if o and o["kite_symbol"]:
            r = have.get(o["kite_symbol"])
            out[s] = ({"k": r["tradingsymbol"], "st": "manual", "note": o["note"] or f"Matched by the admin to {r['tradingsymbol']}"} if r
                      else {"k": None, "st": "missing", "note": f"{o['kite_symbol']} (set by the admin) is not on Zerodha's list any more"})
        elif s in have:
            out[s] = {"k": s, "st": "verified", "note": None}
        else:
            alt = [f"{s}-{x}" for x in SERIES if f"{s}-{x}" in have]
            out[s] = ({"k": alt[0], "st": "series", "note": f"On Zerodha as {alt[0]} — {SERIES[alt[0].rsplit('-', 1)[1]]}"} if len(alt) == 1
                      else {"k": None, "st": "missing", "note": "More than one match on Zerodha — needs the admin's check" if alt
                            else "Not on Zerodha's NSE list (renamed, suspended or delisted?)"})
        r = have.get(out[s]["k"]) if out[s]["k"] else None
        if r:
            out[s].update(n=r["name"], tick=Decimal(r["tick_size"]), lot=int(r["lot_size"]))
    return out


def to_tick(x: Decimal, tick: Decimal) -> Decimal:
    return ((x / tick).quantize(Decimal(1), rounding=ROUND_HALF_UP) * tick).quantize(tick)


def limit_of(p, side, tick):
    """the limit price: our last price +1 % to buy, −1 % to sell, on Zerodha's tick"""
    base = Decimal(str(p)) * (1 + BUFFER if side == "BUY" else 1 - BUFFER)
    v = to_tick(base, tick)
    return v if v > 0 else tick


def whole(v):
    """a whole number of shares from the request (True / 2.5 / "3" / NaN are not)"""
    return v if type(v) is int and 0 < v <= QTY_MAX else None


def check(conn, lines, prices, caps=None, kinds=None):
    """each line [{s, qty, side}] resolved: Zerodha symbol, lot, our price → the limit, value, ok + why not.
    prices: {symbol: our latest price} (server data, never the browser's). caps: {symbol: most shares a SELL may have}."""
    res = resolve(conn, [str(x.get("s") or "") for x in lines])
    out = []
    for x in lines:
        s, side = str(x.get("s") or ""), x.get("side") or "BUY"
        r = res.get(s) or {"k": None, "st": "missing", "note": "Unknown stock"}
        q = whole(x.get("qty"))
        line = {"s": s, "side": side, "k": r["k"], "st": r["st"], "note": r.get("note"), "kn": r.get("n"), "kind": (kinds or {}).get(s, "stock"),
                "lot": r.get("lot", 1), "p": prices.get(s), "qty": q, "every": x.get("every") or 1, "ok": False}
        if r["k"] is None:
            out.append(line); continue
        if not prices.get(s):
            line["note"] = "No price in today's data"; out.append(line); continue
        line["price"] = float(limit_of(prices[s], side, r["tick"]))
        line["tick"] = float(r["tick"])
        if q is None:
            line["why"] = "Enter a whole number of shares"
        elif q % line["lot"]:
            line["why"] = f"Sold in lots of {line['lot']} on Zerodha"
        elif side == "SELL" and caps is not None and q > caps.get(s, 0):
            line["why"] = f"At most {caps.get(s, 0):,} — what this plan holds"
        else:
            line["ok"] = True
        line["value"] = round(line["price"] * (q or 0), 2)
        out.append(line)
    return out


def lots(q, lot):
    """a suggested quantity in whole lots (rounded down)"""
    return (q // lot) * lot if q else 0


def new_tag():
    return "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(TAG_LEN))


def basket(lines, tag):
    """the exact JSON the browser posts to Kite (one line per order; SELL lines first)"""
    rows = sorted(lines, key=lambda x: 0 if x["side"] == "SELL" else 1)
    return json.dumps([{"variety": "regular", "exchange": "NSE", "tradingsymbol": x["k"], "transaction_type": x["side"],
                        "product": "CNC", "order_type": "LIMIT", "quantity": x["qty"], "price": x["price"], "validity": "DAY",
                        "readonly": False, "tag": tag} for x in rows], separators=(",", ":"))


def coverage(conn, syms):
    """today's published stocks / ETFs that are not plainly ✓ on Zerodha (Admin → Zerodha)"""
    r = resolve(conn, syms)
    return sorted(({"s": s, **{k: v for k, v in x.items() if k in ("k", "st", "note", "lot")}} for s, x in r.items() if x["st"] != "verified"),
                  key=lambda x: (x["st"] != "missing", x["s"]))
