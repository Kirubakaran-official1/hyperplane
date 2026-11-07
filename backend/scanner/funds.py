"""
Funds & indices wall (owner, 2026-11-06: "remove the wall … add the wall before sending to the current application …
keep the ETF as a separate section … I don't want ETF to be a part of my admin and customer applications").

Chartink reports index ETFs, gold / silver ETFs, debt ETFs AND plain indices (NIFTY500, India VIX …) as sector "Indices"
with a meaningless "Smallcap" market cap. The scanner (chartink_fast.attempt_scraping) splits them off right after the
raw tables are read: every existing sheet, the Excel, Telegram, the admin screens and the customer apps see stocks only;
the tradable ETFs go through the same calculations into their own file for the ETF analyser (backend/app/etf.py).
publish.py uses the same rule, so the two can never disagree. No heavy imports here (the API service imports it).
"""
import re

FUND_SYM = re.compile(r"NIFTY|SENSEX|BEES|ETF$")
FUND_NAME = re.compile(r"\bETF\b|\bindex fund\b|\bfund of funds?\b", re.I)
# debt / cash-like funds: their price barely moves, so a trend reading means nothing (owner: "don't use the bonds")
DEBT = re.compile(r"BOND|GILT|G-?SEC|\bSDL\b|LIQUID|1D\s*RATE|OVERNIGHT|MONEY\s*MARKET|\bDEBT\b|TREASURY|T-?BILL|"
                  r"CONSTANT\s*MATURITY|CASHIETF|LIQUIDCASE|\bCASH\b", re.I)


def is_fund_or_index(sym, sector="", name="", add=(), keep=()):
    """True for an ETF, index fund or plain index (kept out of every stock screen). Admin lists win: `keep` = always a
    stock, `add` = always a fund (Admin → settings → Indices & ETFs)."""
    s = str(sym or "").replace("NSE:", "").replace(",", "").strip().upper()
    if s in keep:
        return False
    return (s in add or str(sector or "").strip().lower() == "indices"
            or bool(FUND_SYM.search(s)) or bool(FUND_NAME.search(str(name or ""))))


def is_tradable_etf(sym, name="", traded=False):
    """An ETF worth a trend reading: it trades (plain indices such as NIFTY500 or India VIX report no volume) and it is
    not a debt / cash-like fund."""
    s = str(sym or "").upper()
    return bool(traded) and not DEBT.search(s) and not DEBT.search(str(name or ""))
