"""Unified inbox (owner 2026-11-08, round 19: "a unified inbox, grouped by application — for inform or approval — portfolio changes
properly segregated, not random messages"). One row of customer_notifications = one inbox item:
  app     the application it belongs to (portfolio · builder · sip · msip · hyperplane = announcements); helpdesk tickets are merged
          in by the customer service at read time (never copied)
  type    action — something to do (stocks to change, an order to place)  ·  info — something to know (announcements)
  status  open → done. An action closes by itself: each stock of it is settled when it is swapped / removed (portal, at the swap)
          or when its long-term trend recovers (monitor, after a publish); an order closes when the next one is ready.
          The customer may also mark an item done (with a note) or reopen it.
  items_done  {symbol: {"how": "swapped" | "removed" | "recovered", "in": new symbol, "d": day}} — the Activity tab of the item.
settle() runs inside the caller's transaction, so on the customer service it obeys row-level security (own rows only)."""
import json
from datetime import datetime
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
APP_OF_KIND = {"analyser": "portfolio", "portfolio": "portfolio", "builder": "builder", "sip": "sip", "msip": "msip", "announce": "hyperplane",
               "mention": "community"}


def app_of(kind):
    return APP_OF_KIND.get(kind, "hyperplane")


def _note(done):
    sw = sum(1 for v in done.values() if v.get("how") == "swapped")
    rc = sum(1 for v in done.values() if v.get("how") == "recovered")
    rm = sum(1 for v in done.values() if v.get("how") == "removed")
    parts = [f"{sw} swapped" if sw else "", f"{rm} removed" if rm else "", f"{rc} recovered — no change needed" if rc else ""]
    return "Done: " + ", ".join(p for p in parts if p) if any(parts) else "Done"


def settle(conn, cid, kind, ref, done):
    """mark the stocks in `done` ({symbol: {how, in?}}) as handled in the customer's open action items of that portfolio;
    an item whose every stock is handled closes. Returns the number of items closed."""
    if not done:
        return 0
    day = datetime.now(IST).date().isoformat()
    rows = conn.execute("SELECT id, body, items_done FROM customer_notifications WHERE customer_id = %s AND kind = %s "
                        "AND ref_id IS NOT DISTINCT FROM %s AND status = 'open' AND type = 'action' AND body ? 'items'",
                        (cid, kind, ref)).fetchall()
    closed = 0
    for r in rows:
        syms = [x.get("s") for x in (r["body"] or {}).get("items") or [] if x.get("s")]
        have = dict(r["items_done"] or {})
        add = {s: {**v, "d": day} for s, v in done.items() if s in syms and s not in have}
        if not add:
            continue
        have.update(add)
        if all(s in have for s in syms):
            conn.execute("UPDATE customer_notifications SET items_done = %s, status = 'done', done_at = now(), done_note = %s, "
                         "read_at = COALESCE(read_at, now()) WHERE id = %s", (json.dumps(have), _note(have), r["id"]))
            closed += 1
        else:
            conn.execute("UPDATE customer_notifications SET items_done = %s WHERE id = %s", (json.dumps(have), r["id"]))
    return closed


def close_orders(conn, cid, kind, ref):
    """a new instalment order replaces the open one of the same SIP"""
    conn.execute("UPDATE customer_notifications SET status = 'done', done_at = now(), done_note = 'A newer order replaced this one' "
                 "WHERE customer_id = %s AND kind = %s AND ref_id IS NOT DISTINCT FROM %s AND status = 'open' AND body ? 'order'",
                 (cid, kind, ref))
