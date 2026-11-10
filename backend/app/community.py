"""Hyperplane Community — one group chat for every customer and the owner (owner 2026-11-08, round 19: "a group chat inside the customer
application as the community forum — free text and image upload — the complete, most professional group message app — default to all
the users"; 2026-11-09: "only show them the name, not the mail id or number").

Shared by the admin API (main.py, actor kind "admin") and the customer service (portal.py, actor kind "customer"; there it runs under
row-level security with hp.cid set, see db._setup_portal_role, so a bug here cannot post as somebody else or delete their messages).

What a customer ever receives about a person: the NAME and an opaque colour number — never an email, phone, customer id or city
(_out). The admin also gets the customer's email and id, for moderation.

Messages: plain blocks [{"t":"text","v":…}, {"t":"img","id":7}] (the helpdesk format, never HTML); up to 4 images (PNG / JPEG / WebP,
checked by their bytes, ≤ 1.2 MB each after the browser shrinks them) and 2 000 characters. reply_to = a quoted message; thread_id = the
room message a thread hangs under (replies live only in the thread; the room message shows "N replies"). Pins, deleting anybody's
message, mutes and the reports list are admin only. Links in a customer's message are shown as plain text by the page.

Round 19b (owner 2026-11-09): member TAGS — the owner's labels beside a name ("Mentor", "Pro member"…), created and given in the admin
app only, shown to everyone; FAVOURITES — each person's own starred messages (a Favourites view).

Round 19d (owner 2026-11-11: "remove the groups — the user can only tag the admins: those marked Customer Admin in the admin app; show
their name with the Admin tag; the tagged people are notified in the Inbox; a date search instead of a message search"):
  @MENTIONS go to Community admins only = approved customers holding the role "Customer Admin" (Admin → Access manager; the database
  function cm_admins()). Their messages carry the Admin badge (role_admin). The picker offers their names only, by an opaque handle;
  the database turns a mention into an Inbox "Update" for that person (trigger cm_notify_mentions). Stored: {"t":"at","cid":…,"n":name};
  the page gets {"t":"at","n":name,"me":bool} — never the id.
  DATE SEARCH (19e: a From — To range): ?dfrom=YYYY-MM-DD&dto=YYYY-MM-DD lists the room between the two days (Indian time), oldest
  first, 300 at a time (cursor), with the total; it reads the partial index cm_messages_room_day (created_at of room messages), so a
  range two years back is as quick as today.

Abuse guard-rails: Caddy caps the body (8 MB); per IP 600 requests / min (guard_ip, before the session); per account 10 posts /
min and 300 / day, 30 images / day, 60 reactions / min; a muted customer is refused by the DATABASE (cm_can_post in the insert policy),
so a script that skips this code is refused too."""
import hashlib
import os
import re

from fastapi import HTTPException, Response
from psycopg.types.json import Jsonb

from . import helpdesk as hd

MAX_TEXT, MAX_IMAGES, MAX_BLOCKS, MAX_MENTIONS = 2000, 4, 60, 10
POST_PER_MIN, POST_PER_DAY, IMG_PER_DAY = 10, 300, 30
EMOJI = ("👍", "❤️", "😂", "😮", "🙏", "🔥")
ADMIN_NAME = "Hyperplane"
PAGE = 50
_SALT = (os.environ.get("PORTAL_SECRET_KEY") or os.environ.get("SECRET_KEY") or "hyperplane-community")[:64]
limiter = hd.Limiter()


def guard_ip(ip):
    """per address, before the session check: the open page polls every 4 s and people in one office share an address"""
    limiter.take(("ip", ip), 600, 60, hd.SLOW)


def hue(cid):
    """an avatar colour (0–11) that says nothing about who the person is"""
    return int(hashlib.sha256(f"{_SALT}:{cid}".encode()).hexdigest()[:6], 16) % 12 if cid else 0


def handle(cid):
    """the opaque key a member is mentioned by (never the customer id)"""
    return hashlib.sha256(f"{_SALT}:m:{cid}".encode()).hexdigest()[:12]


def admins(c):
    """the Community admins: approved customers holding the role "Customer Admin" (Admin → Access manager) — {customer id: name}"""
    return {r["customer_id"]: r["name"] for r in c.execute("SELECT customer_id, name FROM cm_admins()").fetchall()}


def _tags(c, cids):
    out = {}
    if cids:
        for r in c.execute("SELECT mt.customer_id, t.name, t.color FROM cm_member_tags mt JOIN cm_tags t ON t.id = mt.tag_id "
                           "WHERE mt.customer_id = ANY(%s) ORDER BY t.name", (list(cids),)).fetchall():
            out.setdefault(r["customer_id"], []).append({"n": r["name"], "c": r["color"]})
    return out


def people(c, actor, q=""):
    """the mention picker: the Community admins (Customer Admin role) — names and tags only, never oneself"""
    q = " ".join(hd.CTRL.sub("", q or "").split()).lower()[:40]
    me = actor.get("cid")
    rows = sorted(((cid, n) for cid, n in admins(c).items() if cid != me and (not q or q in n.lower())),
                  key=lambda x: (not x[1].lower().startswith(q), x[1].lower()))[:10]
    tags = _tags(c, [cid for cid, _ in rows])
    return [{"k": handle(cid), "n": n, "admin": True, "hue": hue(cid), "tags": tags.get(cid, [])} for cid, n in rows]


def _who(actor):
    return "a" if actor["kind"] == "admin" else f"c:{actor['cid']}"


def parse(raw, resolve=None):
    """client blocks -> (clean blocks with image placeholders, [(mime, bytes)]); resolve(handle) -> a stored mention block or None"""
    if not isinstance(raw, list) or len(raw) > MAX_BLOCKS:
        raise HTTPException(422, "This message could not be read")
    out, imgs, total, ats = [], [], 0, 0
    for b in raw:
        t = b.get("t") if isinstance(b, dict) else None
        if t == "text":
            v = hd.CTRL.sub("", str(b.get("v") or "")).replace("\r\n", "\n").replace("\r", "\n")
            if not v:
                continue
            total += len(v)
            if out and out[-1]["t"] == "text":
                out[-1]["v"] += v
            else:
                out.append({"t": "text", "v": v})
        elif t == "at":
            m = resolve(str(b.get("k") or "")[:40]) if resolve else None
            if not m:
                raise HTTPException(422, "That person cannot be mentioned")
            ats += 1
            if ats > MAX_MENTIONS:
                raise HTTPException(422, f"Up to {MAX_MENTIONS} mentions per message")
            out.append(m)
        elif t == "img":
            if len(imgs) >= MAX_IMAGES:
                raise HTTPException(422, f"Up to {MAX_IMAGES} images per message")
            imgs.append(hd._image(b.get("src")))
            out.append({"t": "img", "k": len(imgs) - 1})
        else:
            raise HTTPException(422, "Only text and images can be sent")
    if total > MAX_TEXT:
        raise HTTPException(422, f"Please keep a message under {MAX_TEXT:,} characters")
    out = [{**b, "v": re.sub(r"\n{3,}", "\n\n", b["v"])} if b["t"] == "text" else b for b in out]
    if out and out[0]["t"] == "text":                     # trim only the very start / end (a space next to a mention stays)
        out[0]["v"] = out[0]["v"].lstrip()
    if out and out[-1]["t"] == "text":
        out[-1]["v"] = out[-1]["v"].rstrip()
    out = [b for b in out if b["t"] != "text" or b["v"]]
    if not any(b["t"] != "text" or b["v"].strip() for b in out):
        raise HTTPException(422, "Please write a message")
    if not out:
        raise HTTPException(422, "Please write a message")
    return out, imgs


def _snip(body):
    t = "".join(b.get("v", "") if b.get("t") == "text" else f"@{b.get('n', '')}" if b.get("t") == "at" else "" for b in body or [])
    if t.strip():
        return " ".join(t.split())[:120]
    return "📷 Photo" if any(b.get("t") == "img" for b in body or []) else ""


def _body_out(body, actor):
    """what the page gets of a body: a mention shows the name (and whether it is the reader) — never the id"""
    staff = actor["kind"] == "admin"
    return [{"t": "at", "n": b.get("n"), "me": bool((b.get("adm") and staff) or (not staff and b.get("cid") == actor.get("cid"))), "adm": bool(b.get("adm"))}
            if b.get("t") == "at" else b for b in body or []]


COLS = ("m.id, m.author_kind, m.customer_id, m.author_name, m.body, m.reply_to, m.thread_id, m.reply_count, m.last_reply_at, "
        "m.pinned_at, m.deleted_at, m.created_at")


def _out(c, actor, rows):
    """messages as the page sees them (quotes and reactions in two extra queries, never one per message)"""
    ids = [r["id"] for r in rows]
    quotes = {}
    qids = list({r["reply_to"] for r in rows if r["reply_to"]})
    if qids:
        for q in c.execute(f"SELECT {COLS} FROM cm_messages m WHERE m.id = ANY(%s)", (qids,)).fetchall():
            quotes[q["id"]] = {"id": q["id"], "name": ADMIN_NAME if q["author_kind"] == "admin" else q["author_name"],
                               "admin": q["author_kind"] == "admin", "text": "Message removed" if q["deleted_at"] else _snip(q["body"]),
                               "deleted": bool(q["deleted_at"])}
    reacts = {}
    if ids:
        for r in c.execute("SELECT message_id, emoji, count(*) AS n, bool_or(who = %s) AS mine FROM cm_reactions WHERE message_id = ANY(%s) "
                           "GROUP BY message_id, emoji", (_who(actor), ids)).fetchall():
            reacts.setdefault(r["message_id"], []).append({"e": r["emoji"], "n": r["n"], "mine": r["mine"]})
    staff = actor["kind"] == "admin"
    favs = {r["message_id"] for r in c.execute("SELECT message_id FROM cm_favs WHERE who = %s AND message_id = ANY(%s)", (_who(actor), ids)).fetchall()} if ids else set()
    role_adm = set(admins(c)) if rows else set()
    tags = _tags(c, {r["customer_id"] for r in rows if r["customer_id"]})
    emails = {}
    if staff:
        cids = list({r["customer_id"] for r in rows if r["customer_id"]})
        if cids:
            emails = {r["id"]: r["email"] for r in c.execute("SELECT id, email FROM customers WHERE id = ANY(%s)", (cids,)).fetchall()}
    out = []
    for r in rows:
        adm = r["author_kind"] == "admin"
        gone = bool(r["deleted_at"])
        m = {"id": r["id"], "name": ADMIN_NAME if adm else r["author_name"], "admin": adm, "hue": 0 if adm else hue(r["customer_id"]),
             "mine": (adm and staff) or (not adm and not staff and str(r["customer_id"]) == str(actor.get("cid"))),
             "body": [] if gone else _body_out(r["body"], actor), "role_admin": r["customer_id"] in role_adm, "deleted": gone, "at": r["created_at"].isoformat(),
             "tags": [] if adm else tags.get(r["customer_id"], []), "fav": r["id"] in favs,
             "quote": quotes.get(r["reply_to"]), "thread": r["thread_id"], "replies": r["reply_count"],
             "last_reply": r["last_reply_at"] and r["last_reply_at"].isoformat(), "pinned": bool(r["pinned_at"]) and not gone,
             "reactions": [] if gone else sorted(reacts.get(r["id"], []), key=lambda x: EMOJI.index(x["e"]) if x["e"] in EMOJI else 99)}
        if staff:
            m.update(customer_id=r["customer_id"], email=emails.get(r["customer_id"]))
        out.append(m)
    return out


def member(c, actor):
    """the customer's own member row (made on first visit)"""
    if actor["kind"] == "admin":
        return None
    # a new member starts "caught up" (no 99+ badge on the first day); from then on every new message counts
    c.execute("INSERT INTO cm_members (customer_id, last_read_id) SELECT %s, COALESCE(max(id), 0) FROM cm_messages ON CONFLICT DO NOTHING", (actor["cid"],))
    return c.execute("SELECT last_read_id, muted_until, mute_reason, rules_ok_at, thread_reads FROM cm_members WHERE customer_id = %s",
                     (actor["cid"],)).fetchone()


def _mine_at(actor):
    return Jsonb([{"t": "at", "adm": True}] if actor["kind"] == "admin" else [{"t": "at", "cid": actor["cid"]}])


DAY = "((%s::date)::timestamp AT TIME ZONE 'Asia/Kolkata')"             # the start of a day in Indian time, as a timestamptz


RANGE_PAGE = 300


def by_range(c, actor, dfrom, dto=None, cursor=None):
    """the room between two dates, Indian time, both days included (owner 2026-11-11: "a proper date picker, from — to"):
    oldest first, RANGE_PAGE at a time (cursor = "<created_at>|<id>" of the last one shown), with the total.
    Every query is a range on the partial index cm_messages_room_day — fast whatever the age of the dates."""
    from datetime import date as _d, datetime as _dt
    try:
        a = _d.fromisoformat(str(dfrom)[:10])
        b = _d.fromisoformat(str(dto)[:10]) if dto else a
    except ValueError:
        raise HTTPException(422, "Pick the dates again")
    if b < a:
        raise HTTPException(422, "The 'To' date is before the 'From' date")
    live = "m.thread_id IS NULL AND (m.deleted_at IS NULL OR m.reply_count > 0)"
    span = f"m.created_at >= {DAY} AND m.created_at < {DAY} + interval '1 day'"
    args, after = [a, b], ""
    if cursor:
        try:
            ts, cid = str(cursor).rsplit("|", 1)
            args += [_dt.fromisoformat(ts), int(cid)]
        except ValueError:
            raise HTTPException(422, "Pick the dates again")
        after = " AND (m.created_at, m.id) > (%s, %s)"
    rows = c.execute(f"SELECT {COLS} FROM cm_messages m WHERE {live} AND {span}{after} ORDER BY m.created_at, m.id LIMIT {RANGE_PAGE + 1}", args).fetchall()
    more = len(rows) > RANGE_PAGE
    rows = rows[:RANGE_PAGE]
    total = c.execute(f"SELECT count(*) AS n FROM cm_messages m WHERE {live} AND {span}", (a, b)).fetchone()["n"] if not cursor else None
    return {"from": a.isoformat(), "to": b.isoformat(), "items": _out(c, actor, rows), "more": more, "total": total,
            "cursor": f"{rows[-1]['created_at'].isoformat()}|{rows[-1]['id']}" if more and rows else None}


def listing(c, actor, after=None, before=None, thread=None, dfrom=None, view=None, dto=None, cursor=None):
    me = member(c, actor)
    if dfrom:
        return by_range(c, actor, dfrom, dto, cursor)
    if view in ("fav", "mentions", "pinned"):
        if view == "fav":
            rows = c.execute(f"SELECT {COLS} FROM cm_favs f JOIN cm_messages m ON m.id = f.message_id WHERE f.who = %s AND m.deleted_at IS NULL "
                             f"ORDER BY f.created_at DESC LIMIT 200", (_who(actor),)).fetchall()
        elif view == "mentions":
            rows = c.execute(f"SELECT {COLS} FROM cm_messages m WHERE m.deleted_at IS NULL AND m.body @> %s ORDER BY m.id DESC LIMIT 200",
                             (_mine_at(actor),)).fetchall()
        else:
            rows = c.execute(f"SELECT {COLS} FROM cm_messages m WHERE m.pinned_at IS NOT NULL AND m.deleted_at IS NULL ORDER BY m.pinned_at DESC LIMIT 50").fetchall()
        return {"items": _out(c, actor, rows), "view": view}
    live = "AND (m.deleted_at IS NULL OR m.reply_count > 0)"            # a removed message stays only as the head of a thread
    if thread:
        root = c.execute(f"SELECT {COLS} FROM cm_messages m WHERE m.id = %s AND m.thread_id IS NULL", (thread,)).fetchone()
        if not root:
            raise HTTPException(404, "This conversation is no longer here")
        rows = c.execute(f"SELECT {COLS} FROM cm_messages m WHERE m.thread_id = %s AND m.id > %s {live.replace(' OR m.reply_count > 0', '')} "
                         f"ORDER BY m.id LIMIT 300", (thread, after or 0)).fetchall()
        return {"root": _out(c, actor, [root])[0], "items": _out(c, actor, rows)}
    if after:
        rows = c.execute(f"SELECT {COLS} FROM cm_messages m WHERE m.thread_id IS NULL AND m.id > %s {live} ORDER BY m.id LIMIT 200",
                         (after,)).fetchall()
    else:
        rows = c.execute(f"SELECT {COLS} FROM cm_messages m WHERE m.thread_id IS NULL {live} "
                         f"{'AND m.id < %s' if before else ''} ORDER BY m.id DESC LIMIT {PAGE}", ((before,) if before else ())).fetchall()[::-1]
    out = {"items": _out(c, actor, rows), "more": len(rows) == PAGE and not after}
    if not after and not before:
        pins = c.execute(f"SELECT {COLS} FROM cm_messages m WHERE m.pinned_at IS NOT NULL AND m.deleted_at IS NULL ORDER BY m.pinned_at DESC LIMIT 10").fetchall()
        out["pinned"] = _out(c, actor, pins)
        out["members"] = c.execute("SELECT portal_member_count() AS n").fetchone()["n"]
        out["counts"] = counts(c, actor)
        first = c.execute("SELECT ((m.created_at AT TIME ZONE 'Asia/Kolkata')::date) AS d FROM cm_messages m WHERE m.thread_id IS NULL ORDER BY m.created_at LIMIT 1").fetchone()
        out["first_day"] = first and first["d"].isoformat()                 # the date search starts here
    if me:
        out["me"] = {"last_read": me["last_read_id"], "muted_until": me["muted_until"] and me["muted_until"].isoformat(),
                     "mute_reason": me["mute_reason"], "rules_ok": bool(me["rules_ok_at"])}
    return out


def counts(c, actor):
    """the numbers beside Favourites · Mentions · Pinned (round 19f: re-read every 16 s, so a number never outlives its messages)"""
    return c.execute("SELECT (SELECT count(*) FROM cm_favs f JOIN cm_messages m ON m.id = f.message_id WHERE f.who = %s AND m.deleted_at IS NULL) AS fav, "
                     "(SELECT count(*) FROM cm_messages m WHERE m.deleted_at IS NULL AND m.body @> %s) AS mentions, "
                     "(SELECT count(*) FROM cm_messages m WHERE m.pinned_at IS NOT NULL AND m.deleted_at IS NULL) AS pinned",
                     (_who(actor), _mine_at(actor))).fetchone()


def refresh(c, actor, ids, with_counts=False):
    """the current state (reactions, replies, removed, pinned) of messages already on the screen; with_counts: the menu numbers too"""
    ids = [int(i) for i in ids[:200]]
    out = {"items": _out(c, actor, c.execute(f"SELECT {COLS} FROM cm_messages m WHERE m.id = ANY(%s)", (ids,)).fetchall()) if ids else []}
    if with_counts:
        out["counts"] = counts(c, actor)
        out["pinned"] = _out(c, actor, c.execute(f"SELECT {COLS} FROM cm_messages m WHERE m.pinned_at IS NOT NULL AND m.deleted_at IS NULL "
                                                 f"ORDER BY m.pinned_at DESC LIMIT 10").fetchall())
    return out


def post(c, actor, raw, reply_to=None, thread=None):
    au = None

    def resolve(k):                                      # only a Community admin (Customer Admin role) can be mentioned
        nonlocal au
        if au is None:
            au = {handle(cid): (cid, n) for cid, n in admins(c).items()}
        hit = au.get(k)
        return {"t": "at", "cid": hit[0], "n": hit[1]} if hit and hit[0] != actor.get("cid") else None
    blocks, imgs = parse(raw, resolve)
    if actor["kind"] != "admin":
        me = member(c, actor)
        if not me["rules_ok_at"]:
            raise HTTPException(403, "Please accept the community rules first")
        if me["muted_until"] and c.execute("SELECT %s > now() AS m", (me["muted_until"],)).fetchone()["m"]:
            raise HTTPException(403, "You can read the Community, but posting is paused for your account for now")
        limiter.take(("post", actor["cid"]), POST_PER_MIN, 60, "You are posting very quickly — please wait a minute")
        n = c.execute("SELECT count(*) AS d FROM cm_messages WHERE customer_id = %s AND created_at > now() - interval '1 day'", (actor["cid"],)).fetchone()["d"]
        if n >= POST_PER_DAY:
            raise HTTPException(429, "You have reached today's limit of messages — please continue tomorrow")
        if imgs:
            k = c.execute("SELECT count(*) AS n FROM cm_images WHERE uploader = %s AND created_at > now() - interval '1 day'", (_who(actor),)).fetchone()["n"]
            if k + len(imgs) > IMG_PER_DAY:
                raise HTTPException(429, f"You can share up to {IMG_PER_DAY} images a day — please send text only for now")
    limiter.take(("post-all",), 600, 60, "The Community is busy right now — please try again in a minute")
    if thread:
        t = c.execute("SELECT id FROM cm_messages WHERE id = %s AND thread_id IS NULL AND deleted_at IS NULL", (thread,)).fetchone()
        if not t:
            raise HTTPException(404, "That conversation is no longer here")
    if reply_to:
        q = c.execute("SELECT id, thread_id FROM cm_messages WHERE id = %s AND deleted_at IS NULL", (reply_to,)).fetchone()
        # a quote stays where it is: in the room a room message, in a thread its head or one of its replies
        if not q or not ((not thread and q["thread_id"] is None) or (thread and (q["id"] == thread or q["thread_id"] == thread))):
            raise HTTPException(404, "The message you are replying to is no longer here")
    ids = [c.execute("INSERT INTO cm_images (uploader, mime, data, size) VALUES (%s, %s, %s, %s) RETURNING id",
                     (_who(actor), mime, data, len(data))).fetchone()["id"] for mime, data in imgs]
    body = [{"t": "img", "id": ids[b["k"]]} if b["t"] == "img" else b for b in blocks]
    adm = actor["kind"] == "admin"
    if adm:                                              # admin_user is not a column the customer service may write
        r = c.execute("INSERT INTO cm_messages (author_kind, author_name, admin_user, body, reply_to, thread_id) VALUES ('admin', %s, %s, %s, %s, %s) "
                      "RETURNING id", (ADMIN_NAME, actor["name"], Jsonb(body), reply_to, thread)).fetchone()
    else:
        r = c.execute("INSERT INTO cm_messages (author_kind, customer_id, author_name, body, reply_to, thread_id) VALUES ('customer', %s, %s, %s, %s, %s) "
                      "RETURNING id", (actor["cid"], actor["name"][:80], Jsonb(body), reply_to, thread)).fetchone()
    if ids:
        c.execute("UPDATE cm_images SET message_id = %s WHERE id = ANY(%s)", (r["id"], ids))
    if not adm:                                          # one's own message is read
        if thread:
            c.execute("UPDATE cm_members SET thread_reads = thread_reads || jsonb_build_object(%s::text, %s::bigint) WHERE customer_id = %s",
                      (str(thread), r["id"], actor["cid"]))
        else:
            c.execute("UPDATE cm_members SET last_read_id = GREATEST(last_read_id, %s) WHERE customer_id = %s", (r["id"], actor["cid"]))
    row = c.execute(f"SELECT {COLS} FROM cm_messages m WHERE m.id = %s", (r["id"],)).fetchone()
    return _out(c, actor, [row])[0]


def remove(c, actor, mid):
    if actor["kind"] == "admin":
        n = c.execute("UPDATE cm_messages SET deleted_at = now(), deleted_by = %s, pinned_at = NULL WHERE id = %s AND deleted_at IS NULL",
                      (actor["name"], mid)).rowcount
    else:
        n = c.execute("UPDATE cm_messages SET deleted_at = now(), deleted_by = 'author' WHERE id = %s AND customer_id = %s AND deleted_at IS NULL",
                      (mid, actor["cid"])).rowcount
    if not n:
        raise HTTPException(404, "Message not found")
    return {"ok": True}


def react(c, actor, mid, emoji):
    if emoji not in EMOJI:
        raise HTTPException(422, "Pick one of the reactions shown")
    limiter.take(("react", _who(actor)), 60, 60, "Too many reactions — please wait a minute")
    if not c.execute("SELECT 1 FROM cm_messages WHERE id = %s AND deleted_at IS NULL", (mid,)).fetchone():
        raise HTTPException(404, "Message not found")
    if not c.execute("DELETE FROM cm_reactions WHERE message_id = %s AND who = %s AND emoji = %s", (mid, _who(actor), emoji)).rowcount:
        c.execute("INSERT INTO cm_reactions (message_id, who, emoji) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (mid, _who(actor), emoji))
    return refresh(c, actor, [mid])["items"][0]


def report(c, actor, mid, reason):
    reason = " ".join(hd.CTRL.sub("", reason or "").split())[:300]
    m = c.execute("SELECT customer_id, author_kind FROM cm_messages WHERE id = %s AND deleted_at IS NULL", (mid,)).fetchone()
    if not m:
        raise HTTPException(404, "Message not found")
    if m["author_kind"] == "admin" or str(m["customer_id"]) == str(actor["cid"]):
        raise HTTPException(422, "This message cannot be reported")
    limiter.take(("report", actor["cid"]), 10, 3600, "You have reported many messages — the team will look at them first")
    c.execute("INSERT INTO cm_reports (message_id, customer_id, reason) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (mid, actor["cid"], reason or None))
    return {"ok": True}


def read(c, actor, last_id, thread=None):
    if actor["kind"] == "admin":
        return {"ok": True}
    member(c, actor)
    if thread:
        c.execute("UPDATE cm_members SET thread_reads = thread_reads || jsonb_build_object(%s::text, %s::bigint) WHERE customer_id = %s",
                  (str(int(thread)), int(last_id), actor["cid"]))
    else:
        c.execute("UPDATE cm_members SET last_read_id = GREATEST(last_read_id, %s) WHERE customer_id = %s", (int(last_id), actor["cid"]))
    return {"ok": True}


def unread(c, actor, since=None):
    """new messages for the badge: the room after the last one read, plus new replies in threads the customer took part in;
    admin = whether any of them is from Hyperplane (the badge shows the admin mark)"""
    if actor["kind"] == "admin":
        r = c.execute("SELECT count(*) AS n, false AS admin FROM cm_messages WHERE author_kind = 'customer' AND deleted_at IS NULL AND id > %s",
                      (since or 0,)).fetchone()
        return {"n": r["n"], "admin": False}
    me = member(c, actor)
    r = c.execute("""
        SELECT count(*) AS n, coalesce(bool_or(m.author_kind = 'admin'), false) AS admin FROM cm_messages m
        WHERE m.deleted_at IS NULL AND (m.customer_id IS NULL OR m.customer_id <> %(cid)s) AND (
              (m.thread_id IS NULL AND m.id > %(last)s)
           OR (m.thread_id IS NOT NULL AND m.id > COALESCE((%(tr)s::jsonb ->> m.thread_id::text)::bigint, 0)
               AND EXISTS (SELECT 1 FROM cm_messages o WHERE o.customer_id = %(cid)s AND (o.id = m.thread_id OR o.thread_id = m.thread_id))))""",
                  {"cid": actor["cid"], "last": me["last_read_id"], "tr": Jsonb(me["thread_reads"] or {})}).fetchone()
    return {"n": r["n"], "admin": r["admin"]}


def rules_ok(c, actor):
    member(c, actor)
    c.execute("UPDATE cm_members SET rules_ok_at = now() WHERE customer_id = %s AND rules_ok_at IS NULL", (actor["cid"],))
    return {"ok": True}


def image(c, actor, iid):
    r = c.execute("SELECT i.mime, i.data FROM cm_images i JOIN cm_messages m ON m.id = i.message_id WHERE i.id = %s AND m.deleted_at IS NULL",
                  (iid,)).fetchone()
    if not r:
        raise HTTPException(404, "Image not found")
    return Response(content=bytes(r["data"]), media_type=r["mime"],
                    headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff",
                             "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "inline"})


def fav(c, actor, mid):
    """star / unstar a message for oneself (a Favourites view per person)"""
    limiter.take(("fav", _who(actor)), 60, 60, "Too many changes — please wait a minute")
    if not c.execute("SELECT 1 FROM cm_messages WHERE id = %s AND deleted_at IS NULL", (mid,)).fetchone():
        raise HTTPException(404, "Message not found")
    if not c.execute("DELETE FROM cm_favs WHERE who = %s AND message_id = %s", (_who(actor), mid)).rowcount:
        c.execute("INSERT INTO cm_favs (who, message_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (_who(actor), mid))
    return refresh(c, actor, [mid])["items"][0]
