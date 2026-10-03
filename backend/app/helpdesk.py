"""
Helpdesk — queries ("tickets") and the conversation on each one, between the people who raise them
(customers on /app, dashboard users) and the admins who answer.

Shared by the admin / user API (main.py) and the customer service (portal.py). It never reads config.ini or
settings. Every query is scoped to its owner in SQL; the customer service additionally runs under row-level
security (see db._setup_portal_role), so even a bug here cannot show one customer another customer's query.

Message bodies are stored as plain blocks — [{"t":"text","v":"..."}, {"t":"img","id":7}] — never HTML, and the
pages render them as text, so nothing a user types can run as code. Images are re-checked by their magic bytes,
stored in the database and served back only to someone allowed to read that query.

Abuse guard-rails (for scripted floods such as Burp Intruder), cheapest first:
  Caddy      request bodies to the helpdesk are capped at 8 MB
  memory     per IP 120 requests / min on every helpdesk endpoint (checked before the session or the database),
             per account 10 writes / min, all accounts together 300 writes / min, image bytes per day per process
  database   per account: 5 new queries / hour, 20 / day, 10 open at once, 20 messages / 10 min,
             300 messages per query, 30 images / day; 3 images and 8 000 characters per message
"""
import base64
import binascii
import re
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Response
from psycopg.types.json import Jsonb

SEVERITIES = ("high", "medium", "low")
MAX_SUBJECT, MAX_TEXT, MAX_BLOCKS = 150, 8000, 80
MAX_IMAGES, MAX_IMAGE_BYTES = 3, 1_200_000
NEW_PER_HOUR, NEW_PER_DAY, OPEN_MAX = 5, 20, 10
MSG_PER_10MIN, MSG_PER_TICKET, IMG_PER_DAY = 20, 300, 30
IMG_BYTES_PER_DAY = 300_000_000                     # all accounts together, per service process
STAFF_NAME = "QuantFriday Helpdesk"                  # what customers / users see instead of an admin's login ID


# ─────────────────────────────── in-memory rate limits ───────────────────────────────
class Limiter:
    """Sliding-window counters. Thread-safe (FastAPI runs sync endpoints in a thread pool) and self-pruning,
    so a flood of random IPs cannot grow it without bound."""

    def __init__(self):
        self.hits = defaultdict(deque)
        self.lock = threading.Lock()
        self.pruned = time.time()

    def take(self, key, limit, window, msg, amount=1):
        now = time.time()
        with self.lock:
            if len(self.hits) > 20000 or now - self.pruned > 300:
                for k in [k for k, q in self.hits.items() if not q or q[-1][0] < now - 86400]:
                    del self.hits[k]
                self.pruned = now
            q = self.hits[key]
            while q and q[0][0] <= now - window:
                q.popleft()
            if sum(a for _, a in q) + amount > limit:
                raise HTTPException(429, msg, headers={"Retry-After": "60"})
            q.append((now, amount))


limiter = Limiter()
SLOW = "Too many requests — please wait a minute and try again"


def guard_ip(ip):
    limiter.take(("ip", ip), 120, 60, SLOW)


def _actor_key(actor):
    return f"{actor['kind'][0]}:{actor['id']}"


def _guard_write(actor, images=0, image_bytes=0):
    limiter.take(("w", _actor_key(actor)), 10, 60, SLOW)
    limiter.take(("w-all",), 300, 60, "The helpdesk is busy right now — please try again in a minute")
    if image_bytes:
        limiter.take(("img-bytes",), IMG_BYTES_PER_DAY, 86400, "Image uploads are paused for today — please send text only",
                     amount=image_bytes)


# ─────────────────────────────── message bodies ───────────────────────────────
CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁦-⁩]")
DATA_URL = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$")


def _sniff(b):
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if b[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "image/webp"
    return None


def _image(src):
    m = DATA_URL.match(src or "") if isinstance(src, str) and len(src) < MAX_IMAGE_BYTES * 4 // 3 + 64 else None
    if not m:
        raise HTTPException(422, "Only PNG, JPEG or WebP images up to 1 MB can be added — files are not allowed")
    try:
        data = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "That image could not be read")
    mime = _sniff(data)
    if not mime or len(data) > MAX_IMAGE_BYTES or len(data) < 64:
        raise HTTPException(422, "Only PNG, JPEG or WebP images up to 1 MB can be added — files are not allowed")
    return mime, data


def parse_body(raw):
    """Client blocks -> (clean blocks with image placeholders, [(mime, bytes)])."""
    if not isinstance(raw, list) or len(raw) > MAX_BLOCKS:
        raise HTTPException(422, "This message could not be read")
    out, imgs, total = [], [], 0
    for b in raw:
        t = b.get("t") if isinstance(b, dict) else None
        if t == "text":
            v = CTRL.sub("", str(b.get("v") or "")).replace("\r\n", "\n").replace("\r", "\n")
            if not v:
                continue
            total += len(v)
            if out and out[-1]["t"] == "text":
                out[-1]["v"] += v
            else:
                out.append({"t": "text", "v": v})
        elif t == "img":
            if len(imgs) >= MAX_IMAGES:
                raise HTTPException(422, f"Up to {MAX_IMAGES} images per message")
            imgs.append(_image(b.get("src")))
            out.append({"t": "img", "k": len(imgs) - 1})
        else:
            raise HTTPException(422, "Only text and images can be sent — files are not allowed")
    if total > MAX_TEXT:
        raise HTTPException(422, f"Please keep a message under {MAX_TEXT:,} characters")
    if out and out[0]["t"] == "text":                    # trim blank lines at the very start / end
        out[0]["v"] = out[0]["v"].lstrip()
    if out and out[-1]["t"] == "text":
        out[-1]["v"] = out[-1]["v"].rstrip()
    out = [b for b in out if b["t"] == "img" or b["v"]]
    if not any(b["t"] == "img" or b["v"].strip() for b in out):
        raise HTTPException(422, "Please write a message")
    return out, imgs


def _snippet(body):
    for b in body or []:
        if b.get("t") == "text" and b.get("v", "").strip():
            return " ".join(b["v"].split())[:140]
    return "📷 Image" if any(b.get("t") == "img" for b in body or []) else ""


# ─────────────────────────────── scope ───────────────────────────────
# actor = {"kind": "customer" | "user" | "admin", "id": str, "name": str, "staff": bool}
def _owner_kind(actor):
    return "customer" if actor["kind"] == "customer" else "user"


def _scope(actor):
    if actor["staff"]:
        return "TRUE", {}
    return "t.owner_kind = %(ok)s AND t.owner_id = %(oid)s", {"ok": _owner_kind(actor), "oid": actor["id"]}


def _side(actor):
    return "staff" if actor["staff"] else "owner"


def _seen_col(actor):
    return "COALESCE(t.staff_seen_at, '-infinity'::timestamptz)" if actor["staff"] else "t.owner_seen_at"


def _iso(d):
    return d.isoformat() if d else None


def _ticket_out(r, actor):
    out = {"id": r["id"], "subject": r["subject"], "severity": r["severity"], "status": r["status"],
           "created_at": _iso(r["created_at"]), "updated_at": _iso(r["updated_at"]), "closed_at": _iso(r["closed_at"]),
           "unread": r.get("unread", 0), "messages": r.get("n_msgs"), "snippet": _snippet(r.get("last_body"))}
    if actor["staff"]:
        out.update(owner_kind=r["owner_kind"], owner_name=r["owner_name"], owner_email=r.get("owner_email"),
                   closed_by=r.get("closed_by"))
    return out


def _msg_out(m, actor):
    name = m["author_name"]
    if m["side"] == "staff" and not actor["staff"]:
        name = STAFF_NAME
    return {"id": m["id"], "side": m["side"], "kind": m["author_kind"], "name": name, "body": m["body"],
            "at": _iso(m["created_at"]), "mine": m["side"] == _side(actor)}


def _get_ticket_row(c, actor, tid, lock=False):
    where, args = _scope(actor)
    r = c.execute(f"SELECT t.* FROM hd_tickets t WHERE t.id = %(tid)s AND {where}" + (" FOR UPDATE" if lock else ""),
                  {**args, "tid": tid}).fetchone()
    if not r:
        raise HTTPException(404, "Query not found")
    return r


def _store_message(c, actor, tid, blocks, imgs, kind=None):
    ids = [c.execute("INSERT INTO hd_images (ticket_id, uploader, mime, data, size) VALUES (%s,%s,%s,%s,%s) RETURNING id",
                     (tid, _actor_key(actor), mime, data, len(data))).fetchone()["id"] for mime, data in imgs]
    body = [{"t": "img", "id": ids[b["k"]]} if b["t"] == "img" else b for b in blocks]
    c.execute("INSERT INTO hd_messages (ticket_id, side, author_kind, author_name, body) VALUES (%s,%s,%s,%s,%s)",
              (tid, _side(actor), kind or actor["kind"], actor["name"][:80], Jsonb(body)))
    seen = "staff_seen_at" if actor["staff"] else "owner_seen_at"
    c.execute(f"UPDATE hd_tickets SET updated_at = now(), {seen} = now() WHERE id = %s", (tid,))


def _check_owner_quota(c, actor, images):
    """Database-backed limits for people raising queries (they survive restarts and count every device)."""
    if actor["staff"]:
        return
    args = {"ok": _owner_kind(actor), "oid": actor["id"]}
    msgs = c.execute("SELECT count(*) AS n FROM hd_messages m JOIN hd_tickets t ON t.id = m.ticket_id "
                     "WHERE t.owner_kind = %(ok)s AND t.owner_id = %(oid)s AND m.side = 'owner' AND m.author_kind <> 'system' "
                     "AND m.created_at > now() - interval '10 minutes'", args).fetchone()["n"]
    if msgs >= MSG_PER_10MIN:
        raise HTTPException(429, "You are sending messages very quickly — please wait a few minutes")
    if images:
        n = c.execute("SELECT count(*) AS n FROM hd_images WHERE uploader = %s AND created_at > now() - interval '1 day'",
                      (_actor_key(actor),)).fetchone()["n"]
        if n + images > IMG_PER_DAY:
            raise HTTPException(429, f"You can add up to {IMG_PER_DAY} images a day — please send text only for now")


# ─────────────────────────────── operations ───────────────────────────────
def list_tickets(c, actor, status="open", limit=300):
    where, args = _scope(actor)
    if status in ("open", "closed"):
        where += " AND t.status = %(st)s"; args["st"] = status
    other = "owner" if actor["staff"] else "staff"
    join = (" LEFT JOIN customers cu ON t.owner_kind = 'customer' AND cu.id::text = t.owner_id" if actor["staff"] else "")
    rows = c.execute(f"""
        SELECT t.*, {"cu.email AS owner_email," if actor["staff"] else ""}
          (SELECT count(*) FROM hd_messages m WHERE m.ticket_id = t.id AND m.side = %(other)s AND m.created_at > {_seen_col(actor)}) AS unread,
          (SELECT count(*) FROM hd_messages m WHERE m.ticket_id = t.id AND m.author_kind <> 'system') AS n_msgs,
          (SELECT m.body FROM hd_messages m WHERE m.ticket_id = t.id AND m.author_kind <> 'system' ORDER BY m.id DESC LIMIT 1) AS last_body
        FROM hd_tickets t{join} WHERE {where} ORDER BY t.updated_at DESC LIMIT %(lim)s""",
                     {**args, "other": other, "lim": min(limit, 500)}).fetchall()
    counts = c.execute(f"SELECT t.status, count(*) AS n FROM hd_tickets t WHERE {_scope(actor)[0]} GROUP BY t.status",
                       _scope(actor)[1]).fetchall()
    return {"tickets": [_ticket_out(r, actor) for r in rows],
            "counts": {r["status"]: r["n"] for r in counts}}


def create_ticket(c, actor, subject, severity, raw_body):
    if actor["staff"]:
        raise HTTPException(403, "Admins answer queries — they are raised by users and customers")
    subject = " ".join(CTRL.sub("", subject or "").split())
    if not 3 <= len(subject) <= MAX_SUBJECT:
        raise HTTPException(422, f"Please write a subject (3–{MAX_SUBJECT} characters)")
    if severity not in SEVERITIES:
        raise HTTPException(422, "Please choose a severity: high, medium or low")
    blocks, imgs = parse_body(raw_body)
    _guard_write(actor, len(imgs), sum(len(d) for _, d in imgs))
    args = {"ok": _owner_kind(actor), "oid": actor["id"]}
    q = c.execute("SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS h, count(*) AS d, "
                  "count(*) FILTER (WHERE status = 'open') AS o FROM hd_tickets "
                  "WHERE owner_kind = %(ok)s AND owner_id = %(oid)s AND (created_at > now() - interval '1 day' OR status = 'open')",
                  args).fetchone()
    if q["o"] >= OPEN_MAX:
        raise HTTPException(429, f"You already have {OPEN_MAX} open queries — please close one before raising another")
    if q["h"] >= NEW_PER_HOUR or q["d"] >= NEW_PER_DAY:
        raise HTTPException(429, "You have raised many queries recently — please continue in an existing one or try later")
    _check_owner_quota(c, actor, len(imgs))
    tid = c.execute("INSERT INTO hd_tickets (owner_kind, owner_id, owner_name, subject, severity) "
                    "VALUES (%s,%s,%s,%s,%s) RETURNING id",
                    (args["ok"], args["oid"], actor["name"][:80], subject, severity)).fetchone()["id"]
    _store_message(c, actor, tid, blocks, imgs)
    return {"id": tid}


def get_ticket(c, actor, tid):
    t = _get_ticket_row(c, actor, tid)
    msgs = c.execute("SELECT * FROM hd_messages WHERE ticket_id = %s ORDER BY id", (tid,)).fetchall()
    seen = "staff_seen_at" if actor["staff"] else "owner_seen_at"
    c.execute(f"UPDATE hd_tickets SET {seen} = now() WHERE id = %s", (tid,))
    if actor["staff"] and t["owner_kind"] == "customer":
        e = c.execute("SELECT email FROM customers WHERE id::text = %s", (t["owner_id"],)).fetchone()
        t = {**t, "owner_email": e["email"] if e else None}
    return {"ticket": _ticket_out(t, actor), "messages": [_msg_out(m, actor) for m in msgs]}


def add_message(c, actor, tid, raw_body):
    blocks, imgs = parse_body(raw_body)
    _guard_write(actor, len(imgs), sum(len(d) for _, d in imgs))
    t = _get_ticket_row(c, actor, tid, lock=True)
    if t["status"] != "open":
        raise HTTPException(409, "This query is closed" + (" — reopen it to reply" if actor["staff"] else " — please raise a new one"))
    n = c.execute("SELECT count(*) AS n FROM hd_messages WHERE ticket_id = %s", (tid,)).fetchone()["n"]
    if n >= MSG_PER_TICKET:
        raise HTTPException(429, "This conversation is very long — please raise a new query")
    _check_owner_quota(c, actor, len(imgs))
    _store_message(c, actor, tid, blocks, imgs)
    return {"ok": True}


def set_status(c, actor, tid, status):
    _guard_write(actor)
    t = _get_ticket_row(c, actor, tid, lock=True)
    if status == "open" and not actor["staff"]:
        raise HTTPException(403, "Only the helpdesk can reopen a query — please raise a new one")
    if t["status"] == status:
        return {"ok": True}
    if status == "closed":
        c.execute("UPDATE hd_tickets SET status = 'closed', closed_at = now(), closed_by = %s WHERE id = %s",
                  (actor["name"][:80], tid))
    else:
        c.execute("UPDATE hd_tickets SET status = 'open', closed_at = NULL, closed_by = NULL WHERE id = %s", (tid,))
    _store_message(c, actor, tid, [{"t": "event", "v": "closed" if status == "closed" else "reopened"}], [], kind="system")
    return {"ok": True}


def unread(c, actor):
    where, args = _scope(actor)
    other = "owner" if actor["staff"] else "staff"
    rows = c.execute(f"""
        SELECT t.id, t.subject, t.severity, count(m.id) AS n, max(m.created_at) AS last
        FROM hd_tickets t JOIN hd_messages m ON m.ticket_id = t.id
        WHERE {where} AND m.side = %(other)s AND m.created_at > {_seen_col(actor)}
        GROUP BY t.id ORDER BY last DESC LIMIT 20""", {**args, "other": other}).fetchall()
    return {"total": sum(r["n"] for r in rows),
            "items": [{"id": r["id"], "subject": r["subject"], "severity": r["severity"], "n": r["n"], "at": _iso(r["last"])}
                      for r in rows]}


def image(c, actor, iid):
    where, args = _scope(actor)
    r = c.execute(f"SELECT i.mime, i.data FROM hd_images i JOIN hd_tickets t ON t.id = i.ticket_id "
                  f"WHERE i.id = %(iid)s AND {where}", {**args, "iid": iid}).fetchone()
    if not r:
        raise HTTPException(404, "Image not found")
    return Response(content=bytes(r["data"]), media_type=r["mime"],
                    headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff",
                             "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "inline"})


def delete_ticket(c, actor, tid):
    if not actor["staff"]:
        raise HTTPException(403, "Admins only")
    if not c.execute("DELETE FROM hd_tickets WHERE id = %s RETURNING id", (tid,)).fetchone():
        raise HTTPException(404, "Query not found")
    return {"ok": True}
