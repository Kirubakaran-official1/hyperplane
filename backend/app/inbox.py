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
APP_OF_KIND = {"analyser": "portfolio", "portfolio": "portfolio", "builder": "builder", "sip": "sip", "msip": "msip", "etf": "etf", "announce": "hyperplane",
               "mention": "community", "planner_due": "planner", "planner_soon": "planner"}


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
            conn.execute("UPDATE customer_notifications SET items_done = %s, status = 'done', done_at = now(), done_note = %s, updated_at = now(), "
                         "read_at = COALESCE(read_at, now()) WHERE id = %s", (json.dumps(have), _note(have), r["id"]))
            closed += 1
        else:
            conn.execute("UPDATE customer_notifications SET items_done = %s, updated_at = now() WHERE id = %s", (json.dumps(have), r["id"]))
    return closed


def _title(base, n):
    return f"{base}: {n} stock{'s' if n != 1 else ''} to change"


OPEN_CHANGE = ("SELECT id, title, body, items_done, read_at FROM customer_notifications WHERE customer_id = %s AND kind = %s "
               "AND ref_id IS NOT DISTINCT FROM %s AND status = 'open' AND type = 'action' AND body ? 'items' ORDER BY id DESC")


def sync_changes(conn, cid, kind, ref, base, current, fresh, what="portfolio"):
    """ONE open "stocks to change" item per portfolio (round 19k, owner 2026-11-13: "one portfolio, one inbox message — check every day;
    merge the new swap in and remove the swap that is not needed any more"). current = {symbol: item} flagged today; fresh = symbols
    flagged for the first time (a new item is opened only for them, so a stock the customer marked done does not come back every day).
      · still flagged → stays (its reason / suggestion refreshed) · newly flagged → merged in, and the item is unread again
      · no longer flagged and not swapped → removed from the list (Activity keeps "trend recovered") · swapped → stays as "Swapped → X"
      · nothing left to change → the item closes by itself. Returns 1 when a new item was opened."""
    day = datetime.now(IST).date().isoformat()
    row = conn.execute(OPEN_CHANGE + " LIMIT 1", (cid, kind, ref)).fetchone()
    if not row:
        new = [current[s] for s in current if s in fresh]
        if not new:
            return 0
        conn.execute("INSERT INTO customer_notifications (customer_id, kind, ref_id, title, body, app, type) VALUES (%s, %s, %s, %s, %s, %s, 'action')",
                     (cid, kind, ref, _title(base, len(new)), json.dumps({"items": new, "what": what}), app_of(kind)))
        return 1
    body, done = dict(row["body"] or {}), dict(row["items_done"] or {})
    items, keep = body.get("items") or [], []
    for x in items:
        s = x.get("s")
        if s in done and done[s].get("how") != "recovered":
            keep.append(x)                                          # swapped / removed: stays as history
        elif s in current:
            done.pop(s, None)
            keep.append({**x, **current[s]})                        # still flagged: today's reason and suggestion
        else:
            done[s] = {"how": "recovered", "d": day}                # not needed any more: off the list
    have = {x.get("s") for x in keep}
    gone = {s for s, v in done.items() if v.get("how") in ("swapped", "removed")}           # already handled here
    added = [current[s] for s in current if s not in have and s not in gone]
    keep += added
    left = [x for x in keep if x.get("s") not in done]
    body["items"] = keep
    if not left:
        conn.execute("UPDATE customer_notifications SET body = %s, items_done = %s, status = 'done', done_at = now(), done_note = %s, updated_at = now(), "
                     "read_at = COALESCE(read_at, now()) WHERE id = %s", (json.dumps(body), json.dumps(done), _note(done), row["id"]))
        return 0
    changed = bool(added) or len(keep) != len(items) or body["items"] != items
    conn.execute("UPDATE customer_notifications SET body = %s, items_done = %s, title = %s" + (", updated_at = now()" if changed else "")
                 + (", read_at = NULL, pushed_at = NULL" if added else "") + " WHERE id = %s", (json.dumps(body), json.dumps(done), _title(base, len(left)), row["id"]))
    return 0


def consolidate(conn):
    """once per start, cheap: older duplicates (several open "stocks to change" items of one portfolio, from before round 19k) are merged
    into the newest one, which keeps every stock (newest reason first) and every settled mark"""
    groups = conn.execute("SELECT customer_id, kind, ref_id, array_agg(id ORDER BY id DESC) AS ids FROM customer_notifications "
                          "WHERE status = 'open' AND type = 'action' AND body ? 'items' GROUP BY customer_id, kind, ref_id HAVING count(*) > 1").fetchall()
    for g in groups:
        rows = {r["id"]: r for r in conn.execute("SELECT id, title, body, items_done FROM customer_notifications WHERE id = ANY(%s)", (g["ids"],)).fetchall()}
        top = rows[g["ids"][0]]
        items, done, seen = [], {}, set()
        for i in g["ids"]:                                          # newest first
            for x in (rows[i]["body"] or {}).get("items") or []:
                if x.get("s") not in seen:
                    seen.add(x.get("s")); items.append(x)
            for s, v in (rows[i]["items_done"] or {}).items():
                done.setdefault(s, v)
        body = {**(top["body"] or {}), "items": items}
        base = (top["title"] or "").split(":")[0] or "Your portfolio"
        left = [x for x in items if x.get("s") not in done]
        conn.execute("UPDATE customer_notifications SET body = %s, items_done = %s, title = %s, updated_at = now() WHERE id = %s",
                     (json.dumps(body), json.dumps(done), _title(base, len(left) or len(items)), top["id"]))
        conn.execute("UPDATE customer_notifications SET status = 'done', done_at = now(), done_note = %s, read_at = COALESCE(read_at, now()) "
                     "WHERE id = ANY(%s)", (f"Merged into #{top['id']} — one item per portfolio", g["ids"][1:]))
        if not left:
            conn.execute("UPDATE customer_notifications SET status = 'done', done_at = now(), done_note = %s WHERE id = %s", (_note(done), top["id"]))
    return len(groups)


def settle_order(conn, cid, kind, ref, note):
    """round 21: the customer checked in this instalment as placed on Zerodha → its open "order" item is done"""
    conn.execute("UPDATE customer_notifications SET status = 'done', done_at = now(), done_note = %s, updated_at = now(), read_at = COALESCE(read_at, now()) "
                 "WHERE customer_id = %s AND kind = %s AND ref_id IS NOT DISTINCT FROM %s AND status = 'open' AND body ? 'order'",
                 (note, cid, kind, ref))


def close_orders(conn, cid, kind, ref):
    """a new instalment order replaces the open one of the same SIP"""
    conn.execute("UPDATE customer_notifications SET status = 'done', done_at = now(), done_note = 'A newer order replaced this one' "
                 "WHERE customer_id = %s AND kind = %s AND ref_id IS NOT DISTINCT FROM %s AND status = 'open' AND body ? 'order'",
                 (cid, kind, ref))
