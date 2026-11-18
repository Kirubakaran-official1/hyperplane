"""Hyperplane Planner (round 22, owner 2026-11-14: "a complete journal app — personal notes, to-do, calendar view, like Notion / OneNote,
a proper knowledge graph; multi-purpose: one notebook for trading, one for office notes, to-do, the fitness plan; filters, date range,
topic search; paste images; download everything as a PDF / a document; merge and split; a mini project planner; mobile friendly").

Everything here belongs to ONE customer: every table carries customer_id, row-level security shows the customer service only the signed-in
customer's rows (hp.cid), and the composite foreign keys (customer_id, …) make the database itself refuse a note in someone else's
notebook. No admin route reads a note — the admin service has no Planner route at all.

  pl_notebooks  the notebooks (Trading, Office, To-do, Fitness … the customer's own)
  pl_pages      a page of a notebook: a note, a journal entry (a day) or a project. doc = the page as blocks (the editor's JSON, checked
                here against an allow-list — never HTML), body = its plain words (search), files = the images it shows
  pl_links      page → page links ([[…]] in a note) — the knowledge graph and "Linked from"
  pl_tasks      to-dos: status, priority, due day, repeat, optionally under a project page
  pl_files      pasted images (bytes; PNG / JPEG / WebP only, sniffed), served back only to their owner
  pl_prefs      per customer: the first-start mark and the daily Inbox digest switch

The functions take a connection already scoped to the customer (portal._own) and the customer id; the worker's daily digest / clean-up
take an admin connection."""
import base64
import binascii
import json
import re
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from fastapi.responses import Response

from .helpdesk import DATA_URL, _sniff

IST = ZoneInfo("Asia/Kolkata")
COLORS = ("blue", "orange", "teal", "pink", "green", "violet", "amber", "red", "sky")      # the notebook palette (order validated for colour-blind readers, light + dark)
ICONS = ("book", "chart", "briefcase", "check", "dumbbell", "heart", "star", "home", "bulb", "wallet", "plane", "code", "users", "leaf", "flag", "pen")
KINDS = ("note", "journal", "project")
P_STATUS = ("active", "hold", "done")
T_STATUS = ("todo", "doing", "hold", "done", "missed")  # a to-do: open · done · missed; a planner row: not started · in progress · on hold · done
CLOSED = ("done", "missed")
T_KINDS = ("todo", "plan")
MAX_LEVELS = 6                                          # a planner row can sit at most 5 levels under a top row
REPEATS = ("daily", "weekdays", "weekly", "monthly")

# limits — enforced here, whatever the screen sends
MAX_NOTEBOOKS, MAX_PAGES, MAX_TASKS = 30, 5000, 10000
MAX_DOC, MAX_TEXT, MAX_NODES, MAX_DEPTH, MAX_PAGE_IMAGES = 600_000, 400_000, 20_000, 24, 200
MAX_IMAGE, MAX_STORE, UPLOADS_DAY = 2_000_000, 250_000_000, 300
MAX_TAGS, TRASH_DAYS, MAX_MERGE = 12, 30, 50
MAX_PLANS = 200                                          # planners (tables of planned rows) per customer
SEED = (("Trading journal", "teal", "chart"),)            # owner 2026-11-14: one notebook to start with; the customer adds the rest

FILE_SRC = re.compile(r"^/app/api/planner/files/(\d{1,18})$")
HREF = re.compile(r"^(https?://|mailto:)[^\s<>\"'`]{1,2000}$", re.I)
BAD = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f​-‏‪-‮⁦-⁩]")
LANG = re.compile(r"^[A-Za-z0-9+#.-]{1,20}$")
SPACE = re.compile(r"\s+")
TAG_BAD = re.compile(r"[^\w\- ]", re.U)


def today():
    return datetime.now(IST).date()


def _bad(msg="This note has something that cannot be saved"):
    raise HTTPException(422, msg)


def _line(v, n):
    """one line of text: no control characters, single spaces, at most n characters"""
    return SPACE.sub(" ", BAD.sub("", str(v or ""))).strip()[:n]


def _text(v, n):
    return BAD.sub("", str(v or "")).replace("\r\n", "\n").replace("\r", "\n").strip()[:n]


def _tags(raw):
    out = []
    for t in raw or []:
        t = SPACE.sub(" ", TAG_BAD.sub("", str(t).lower())).strip()[:30]
        if t and t not in out:
            out.append(t)
    if len(out) > MAX_TAGS:
        raise HTTPException(422, f"Up to {MAX_TAGS} topics on one item")
    return out


def _time(v):
    """a time of day "HH:MM" (or none)"""
    if v in (None, ""):
        return None
    m = re.fullmatch(r"([01]\d|2[0-3]):([0-5]\d)", str(v))
    if not m:
        raise HTTPException(422, "That time could not be read")
    return time(int(m.group(1)), int(m.group(2)))


def _times(tf, tt, due):
    """a to-do's time: both ends or neither, on a day, the end after the start (the week view)"""
    if (tf is None) != (tt is None):
        raise HTTPException(422, "Give both the start and the end time")
    if tf is not None and due is None:
        raise HTTPException(422, "Give the to-do a date first")
    if tf is not None and tt <= tf:
        raise HTTPException(422, "The end time is before the start time")


def _day(v):
    if v in (None, ""):
        return None
    try:
        d = date.fromisoformat(str(v))
    except ValueError:
        raise HTTPException(422, "That date could not be read")
    if not 1990 <= d.year <= 2100:
        raise HTTPException(422, "That date could not be read")
    return d


# ─────────────────────────────── the page as blocks: an allow-list, never HTML ───────────────────────────────
BLOCKS = {"paragraph", "heading", "bulletList", "orderedList", "taskList", "blockquote", "codeBlock", "horizontalRule", "image", "table", "blockMath"}
INLINE = {"text", "hardBreak", "pageLink", "inlineMath"}
MATH = ("inlineMath", "blockMath")                         # round 22d: a formula — only its LaTeX is kept (drawn by KaTeX in the browser, no HTML)
MAX_LATEX = 4000
CHILDREN = {"doc": BLOCKS, "paragraph": INLINE, "heading": INLINE, "codeBlock": {"text"}, "bulletList": {"listItem"}, "orderedList": {"listItem"},
            "taskList": {"taskItem"}, "listItem": BLOCKS, "taskItem": BLOCKS, "blockquote": BLOCKS, "table": {"tableRow"},
            "tableRow": {"tableCell", "tableHeader"}, "tableCell": BLOCKS, "tableHeader": BLOCKS}
MARKS = {"bold", "italic", "strike", "underline", "code", "highlight", "link"}
TEXTBLOCK = {"paragraph", "heading", "codeBlock"}


def _int(v, lo, hi, default=None):
    return v if isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi else default


def _attrs(t, a, st):
    a = a if isinstance(a, dict) else {}
    if t == "heading":
        return {"level": _int(a.get("level"), 1, 3, 2)}
    if t == "orderedList":
        return {"start": _int(a.get("start"), 1, 99999, 1), "type": a.get("type") if a.get("type") in ("a", "A", "i", "I", "1") else None}
    if t == "taskItem":
        return {"checked": a.get("checked") is True}
    if t == "codeBlock":
        lang = a.get("language")
        return {"language": lang if isinstance(lang, str) and LANG.match(lang) else None}
    if t == "image":
        m = FILE_SRC.match(a.get("src")) if isinstance(a.get("src"), str) else None
        if not m:
            _bad("Only images you added here can be shown in a note")
        st["files"].append(int(m.group(1)))
        if len(st["files"]) > MAX_PAGE_IMAGES:
            _bad(f"Up to {MAX_PAGE_IMAGES} images in one note")
        return {"src": m.group(0), "alt": _line(a.get("alt"), 200) or None, "title": _line(a.get("title"), 200) or None,
                "width": _int(a.get("width"), 20, 4000), "height": _int(a.get("height"), 20, 8000)}
    if t in ("tableCell", "tableHeader"):
        cw = a.get("colwidth")
        cw = [w for w in cw if _int(w, 10, 4000)][:20] if isinstance(cw, list) else None
        return {"colspan": _int(a.get("colspan"), 1, 20, 1), "rowspan": _int(a.get("rowspan"), 1, 100, 1), "colwidth": cw or None}
    if t in MATH:
        latex = BAD.sub("", a.get("latex")).strip()[:MAX_LATEX] if isinstance(a.get("latex"), str) else ""
        return {"latex": latex}
    if t == "pageLink":
        pid = _int(a.get("id"), 1, 2 ** 62)
        if not pid:
            _bad()
        st["links"].append(pid)
        return {"id": pid, "label": _line(a.get("label"), 200) or "Untitled"}
    return None


def _marks(raw):
    out = []
    for m in raw if isinstance(raw, list) else []:
        t = m.get("type") if isinstance(m, dict) else None
        if t not in MARKS:
            _bad()
        if any(x["type"] == t for x in out):
            continue
        if t == "link":
            href = (m.get("attrs") or {}).get("href") if isinstance(m.get("attrs"), dict) else None
            if not isinstance(href, str) or not HREF.match(href.strip()):
                continue                                   # not a web / mail address → plain text
            out.append({"type": "link", "attrs": {"href": href.strip(), "target": "_blank", "rel": "noopener noreferrer nofollow", "class": None}})
        else:
            out.append({"type": t})
    return out


def _node(n, st, depth, allowed):
    if not isinstance(n, dict) or depth > MAX_DEPTH:
        _bad()
    t = n.get("type")
    if t not in allowed:
        _bad()
    st["n"] += 1
    if st["n"] > MAX_NODES:
        raise HTTPException(413, "This note is too long — split it into two notes")
    if t == "text":
        s = BAD.sub("", n.get("text")) if isinstance(n.get("text"), str) else ""
        if not s:
            return None
        st["chars"] += len(s)
        if st["chars"] > MAX_TEXT:
            raise HTTPException(413, "This note is too long — split it into two notes")
        st["line"].append(s)
        marks = _marks(n.get("marks")) if st["marks"] else []
        return {"type": "text", "text": s, **({"marks": marks} if marks else {})}
    out = {"type": t}
    a = _attrs(t, n.get("attrs"), st)
    if a is not None:
        out["attrs"] = a
    if t == "hardBreak":
        st["line"].append("\n")
    if t == "pageLink":
        st["line"].append(a["label"])
    if t in MATH:                                            # an empty formula is dropped; its LaTeX is searchable
        if not a["latex"]:
            return None
        st["chars"] += len(a["latex"])
        if st["chars"] > MAX_TEXT:
            raise HTTPException(413, "This note is too long — split it into two notes")
        (st["line"] if t == "inlineMath" else st["text"]).append(a["latex"])
    kids_ok = CHILDREN.get(t)
    if kids_ok:
        if t in TEXTBLOCK:
            st["line"] = []
            st["marks"] = t != "codeBlock"
        kids = [k for k in (_node(c, st, depth + 1, kids_ok) for c in (n.get("content") if isinstance(n.get("content"), list) else [])) if k]
        if t in TEXTBLOCK:
            line = "".join(st["line"]).strip()
            if line:
                st["text"].append(line)
            st["line"], st["marks"] = [], True
        if t in ("listItem", "taskItem") and (not kids or kids[0]["type"] != "paragraph"):
            kids.insert(0, {"type": "paragraph"})
        if t in ("blockquote", "tableCell", "tableHeader") and not kids:
            kids = [{"type": "paragraph"}]
        if t in ("bulletList", "orderedList", "taskList", "table", "tableRow") and not kids:
            return None
        if kids:
            out["content"] = kids
    return out


def clean_doc(raw):
    """the editor's JSON → (doc that holds only known blocks, its plain words, linked page ids, image ids, word count)"""
    if isinstance(raw, str):
        if len(raw) > MAX_DOC:
            raise HTTPException(413, "This note is too long — split it into two notes")
        try:
            raw = json.loads(raw)
        except ValueError:
            _bad()
    if not isinstance(raw, dict) or raw.get("type") != "doc":
        _bad()
    st = {"n": 0, "chars": 0, "links": [], "files": [], "text": [], "line": [], "marks": True}
    doc = _node(raw, st, 0, {"doc"})
    if not doc.get("content"):
        doc["content"] = [{"type": "paragraph"}]
    body = "\n".join(st["text"])[:MAX_TEXT]
    return doc, body, list(dict.fromkeys(st["links"])), list(dict.fromkeys(st["files"])), len(body.split())


EMPTY = {"type": "doc", "content": [{"type": "paragraph"}]}


def _p(text="", bold=False):
    return {"type": "paragraph", **({"content": [{"type": "text", "text": text, **({"marks": [{"type": "bold"}]} if bold else {})}]} if text else {})}


def _h(level, text):
    return {"type": "heading", "attrs": {"level": level}, "content": [{"type": "text", "text": text}]}


def _ul(items):
    return {"type": "bulletList", "content": [{"type": "listItem", "content": [_p(i)]} for i in items]}


WELCOME = {"type": "doc", "content": [
    _p("One place for your to-dos, notes and plans. Everything you write here is private to your account."),
    _h(2, "To-do"),
    _ul(["Type a to-do at the top of the dashboard and press Enter. Give it a date, or let it repeat every day, week or month."]),
    _h(2, "Notes"),
    _ul(["Type / on an empty line for headings, lists, check lists, tables, quotes and dividers.",
         "Paste or drop a picture (a chart, a screenshot) straight into a note.",
         "Type [[ to link this note to another note."]),
    _h(2, "Planner"),
    _ul(["A table of tasks with a start, an end and a status. Press Enter for the next row, Tab to put a row under the one above, "
         "Shift + Tab to bring it back."]),
    _h(2, "Calendar"),
    _ul(["Switch the view to Calendar to see every to-do and planned task by day — for all notebooks or the one you picked on the left."]),
]}


# ─────────────────────────────── rows → the screen ───────────────────────────────
PAGE_COLS = ("id, notebook_id, kind, title, left(regexp_replace(body, '\\s+', ' ', 'g'), 200) AS snip, tags, day, pinned, status, due, words, "
             "files, rev, created_at, updated_at, trashed_at")
TASK_COLS = ("id, notebook_id, page_id, kind, parent_id, start_on, title, note, status, priority, due, repeat, tags, sort, done_at, created_at, updated_at, "
             "progress, time_from, time_to, plan_id, archived_at")
PLAN_COLS = "id, notebook_id, name, sort, created_at" 


def _iso(v):
    return v.isoformat() if v else None


def page_meta(r):
    return {"id": r["id"], "nb": r["notebook_id"], "kind": r["kind"], "title": r["title"], "snip": r["snip"], "tags": list(r["tags"] or []),
            "day": _iso(r["day"]), "pinned": r["pinned"], "status": r["status"], "due": _iso(r["due"]), "words": r["words"],
            "imgs": len(r["files"] or []), "thumb": (r["files"] or [None])[0], "rev": r["rev"], "created": _iso(r["created_at"]),
            "updated": _iso(r["updated_at"]), "trashed": _iso(r["trashed_at"])}


def task_row(r):
    return {"id": r["id"], "nb": r["notebook_id"], "page": r["page_id"], "kind": r["kind"], "parent": r["parent_id"], "start": _iso(r["start_on"]),
            "progress": r["progress"], "plan": r["plan_id"], "archived": r["archived_at"] is not None,
            "tf": r["time_from"].strftime("%H:%M") if r["time_from"] else None,
            "tt": r["time_to"].strftime("%H:%M") if r["time_to"] else None,
            "title": r["title"], "note": r["note"], "status": r["status"],
            "priority": r["priority"], "due": _iso(r["due"]), "repeat": r["repeat"], "tags": list(r["tags"] or []), "sort": r["sort"],
            "done_at": _iso(r["done_at"]), "created": _iso(r["created_at"]), "updated": _iso(r["updated_at"])}


def plan_row(r):
    return {"id": r["id"], "nb": r["notebook_id"], "name": r["name"], "sort": r["sort"], "created": _iso(r["created_at"])}


def _plan(conn, cid, pid):
    r = conn.execute(f"SELECT {PLAN_COLS} FROM pl_plans WHERE id = %s AND customer_id = %s", (pid, cid)).fetchone()
    if not r:
        raise HTTPException(404, "Planner not found")
    return r


def _plan_name(conn, cid, nb, name, skip=None):
    name = _line(name, 80)
    if not name:
        raise HTTPException(422, "Give the planner a name")
    if conn.execute("SELECT 1 FROM pl_plans WHERE customer_id = %s AND notebook_id = %s AND lower(name) = lower(%s) AND id IS DISTINCT FROM %s",
                    (cid, nb, name, skip)).fetchone():
        raise HTTPException(409, "This notebook already has a planner with that name")
    return name


def plan_create(conn, cid, nb, name):
    _nb(conn, cid, nb)
    if conn.execute("SELECT count(*) AS n FROM pl_plans WHERE customer_id = %s", (cid,)).fetchone()["n"] >= MAX_PLANS:
        raise HTTPException(422, f"Up to {MAX_PLANS} planners")
    name = _plan_name(conn, cid, nb, name)
    r = conn.execute(f"INSERT INTO pl_plans (customer_id, notebook_id, name, sort) VALUES (%s, %s, %s, "
                     f"(SELECT COALESCE(max(sort), 0) + 1 FROM pl_plans WHERE customer_id = %s)) RETURNING {PLAN_COLS}", (cid, nb, name, cid)).fetchone()
    return plan_row(r)


def plan_patch(conn, cid, pid, name=None, nb=None, sort=None):
    r = _plan(conn, cid, pid)
    sets, vals = [], []
    if nb is not None and nb != r["notebook_id"]:            # the planner moves notebook → its rows go with it
        _nb(conn, cid, nb)
        sets.append("notebook_id = %s"); vals.append(nb)
        conn.execute("UPDATE pl_tasks SET notebook_id = %s, updated_at = now() WHERE customer_id = %s AND plan_id = %s", (nb, cid, pid))
    if name is not None:
        sets.append("name = %s"); vals.append(_plan_name(conn, cid, nb if nb is not None else r["notebook_id"], name, pid))
    if sort is not None:
        sets.append("sort = %s"); vals.append(float(sort))
    if sets:
        r = conn.execute(f"UPDATE pl_plans SET {', '.join(sets)}, updated_at = now() WHERE id = %s AND customer_id = %s RETURNING {PLAN_COLS}",
                         (*vals, pid, cid)).fetchone()
    return plan_row(r)


def plan_delete(conn, cid, pid):
    _plan(conn, cid, pid)
    n = conn.execute("SELECT count(*) AS n FROM pl_tasks WHERE customer_id = %s AND plan_id = %s", (cid, pid)).fetchone()["n"]
    conn.execute("DELETE FROM pl_plans WHERE id = %s AND customer_id = %s", (pid, cid))   # its rows go with it (foreign key)
    settle(conn, cid)
    return {"ok": True, "removed": n}


def _default_plan(conn, cid, nb):
    """the notebook's first planner (one called "Planner" is made when it has none)"""
    r = conn.execute("SELECT id FROM pl_plans WHERE customer_id = %s AND notebook_id = %s ORDER BY sort, id LIMIT 1", (cid, nb)).fetchone()
    return r["id"] if r else plan_create(conn, cid, nb, "Planner")["id"]


def nb_row(r):
    return {"id": r["id"], "name": r["name"], "color": r["color"], "icon": r["icon"], "sort": r["sort"]}


def _nb(conn, cid, nid):
    """the customer's own notebook, or 404 — the database checks it too (the composite foreign key)"""
    r = conn.execute("SELECT id, name, color, icon, sort FROM pl_notebooks WHERE id = %s AND customer_id = %s", (nid, cid)).fetchone()
    if not r:
        raise HTTPException(404, "Notebook not found")
    return r


def _page(conn, cid, pid, cols=PAGE_COLS):
    r = conn.execute(f"SELECT {cols} FROM pl_pages WHERE id = %s AND customer_id = %s", (pid, cid)).fetchone()
    if not r:
        raise HTTPException(404, "Note not found")
    return r


def _usage(conn, cid):
    return int(conn.execute("SELECT COALESCE(sum(size), 0) AS n FROM pl_files WHERE customer_id = %s", (cid,)).fetchone()["n"])


def state(conn, cid):
    """everything the screen needs at once (the notes' words stay on the server until a note is opened): no page-to-page loading"""
    if conn.execute("INSERT INTO pl_prefs (customer_id, prefs) VALUES (%s, %s) ON CONFLICT DO NOTHING RETURNING customer_id",
                    (cid, json.dumps({"digest": True}))).fetchone():
        first = None
        for i, (name, color, icon) in enumerate(SEED):
            r = conn.execute("INSERT INTO pl_notebooks (customer_id, name, color, icon, sort) VALUES (%s,%s,%s,%s,%s) RETURNING id",
                             (cid, name, color, icon, i)).fetchone()
            first = first or r["id"]
        doc, body, _, _, words = clean_doc(WELCOME)
        conn.execute("INSERT INTO pl_pages (customer_id, notebook_id, kind, title, doc, body, words, pinned, tags) VALUES (%s,%s,'note',%s,%s,%s,%s,true,%s)",
                     (cid, first, "Welcome to your Planner", json.dumps(doc), body, words, ["start here"]))
    nbs = conn.execute("SELECT id, name, color, icon, sort FROM pl_notebooks WHERE customer_id = %s ORDER BY sort, id", (cid,)).fetchall()
    pages = conn.execute(f"SELECT {PAGE_COLS} FROM pl_pages WHERE customer_id = %s ORDER BY updated_at DESC", (cid,)).fetchall()
    tasks = conn.execute(f"SELECT {TASK_COLS} FROM pl_tasks WHERE customer_id = %s ORDER BY sort, id", (cid,)).fetchall()
    plans = conn.execute(f"SELECT {PLAN_COLS} FROM pl_plans WHERE customer_id = %s ORDER BY sort, id", (cid,)).fetchall()
    links = conn.execute("SELECT src, dst FROM pl_links WHERE customer_id = %s", (cid,)).fetchall()
    prefs = conn.execute("SELECT prefs FROM pl_prefs WHERE customer_id = %s", (cid,)).fetchone()
    return {"notebooks": [nb_row(r) for r in nbs], "pages": [page_meta(r) for r in pages], "tasks": [task_row(r) for r in tasks], "plans": [plan_row(r) for r in plans],
            "links": [[r["src"], r["dst"]] for r in links], "prefs": {"digest": (prefs["prefs"] or {}).get("digest", True) is not False},
            "today": today().isoformat(), "usage": {"bytes": _usage(conn, cid), "limit": MAX_STORE},
            "limits": {"notebooks": MAX_NOTEBOOKS, "pages": MAX_PAGES, "tasks": MAX_TASKS, "plans": MAX_PLANS, "image": MAX_IMAGE, "tags": MAX_TAGS, "merge": MAX_MERGE,
                       "trash_days": TRASH_DAYS}}


def prefs_set(conn, cid, digest):
    conn.execute("UPDATE pl_prefs SET prefs = prefs || %s::jsonb, updated_at = now() WHERE customer_id = %s", (json.dumps({"digest": bool(digest)}), cid))
    if not digest:
        conn.execute("UPDATE customer_notifications SET status = 'done', done_at = now(), done_note = 'Reminders switched off', updated_at = now(), "
                     "read_at = COALESCE(read_at, now()) WHERE customer_id = %s AND kind IN ('planner_due', 'planner_soon') AND status = 'open'", (cid,))
    return {"digest": bool(digest)}


# ─────────────────────────────── notebooks ───────────────────────────────
def _nb_name(conn, cid, name, skip=None):
    name = _line(name, 40)
    if not name:
        raise HTTPException(422, "Give the notebook a name")
    if conn.execute("SELECT 1 FROM pl_notebooks WHERE customer_id = %s AND lower(name) = lower(%s) AND id IS DISTINCT FROM %s", (cid, name, skip)).fetchone():
        raise HTTPException(409, "You already have a notebook with that name")
    return name


def nb_create(conn, cid, name, color, icon):
    if conn.execute("SELECT count(*) AS n FROM pl_notebooks WHERE customer_id = %s", (cid,)).fetchone()["n"] >= MAX_NOTEBOOKS:
        raise HTTPException(422, f"Up to {MAX_NOTEBOOKS} notebooks")
    if color not in COLORS or icon not in ICONS:
        raise HTTPException(422, "Please check what you entered and try again.")
    r = conn.execute("INSERT INTO pl_notebooks (customer_id, name, color, icon, sort) VALUES (%s,%s,%s,%s, "
                     "(SELECT COALESCE(max(sort), -1) + 1 FROM pl_notebooks WHERE customer_id = %s)) RETURNING id, name, color, icon, sort",
                     (cid, _nb_name(conn, cid, name), color, icon, cid)).fetchone()
    return nb_row(r)


def nb_update(conn, cid, nid, name=None, color=None, icon=None, sort=None):
    r = _nb(conn, cid, nid)
    if color is not None and color not in COLORS or icon is not None and icon not in ICONS:
        raise HTTPException(422, "Please check what you entered and try again.")
    name = _nb_name(conn, cid, name, nid) if name is not None else r["name"]
    r = conn.execute("UPDATE pl_notebooks SET name = %s, color = %s, icon = %s, sort = %s WHERE id = %s AND customer_id = %s "
                     "RETURNING id, name, color, icon, sort",
                     (name, color or r["color"], icon or r["icon"], r["sort"] if sort is None else sort, nid, cid)).fetchone()
    return nb_row(r)


def nb_delete(conn, cid, nid, force=False):
    _nb(conn, cid, nid)
    n = conn.execute("SELECT (SELECT count(*) FROM pl_pages WHERE notebook_id = %s AND customer_id = %s) AS pages, "
                     "(SELECT count(*) FROM pl_tasks WHERE notebook_id = %s AND customer_id = %s) AS tasks", (nid, cid, nid, cid)).fetchone()
    if (n["pages"] or n["tasks"]) and not force:
        raise HTTPException(409, f"This notebook still has {n['pages']} page{'' if n['pages'] == 1 else 's'} and {n['tasks']} task{'' if n['tasks'] == 1 else 's'}")
    if conn.execute("SELECT count(*) AS n FROM pl_notebooks WHERE customer_id = %s", (cid,)).fetchone()["n"] <= 1:
        raise HTTPException(422, "Keep at least one notebook")
    conn.execute("DELETE FROM pl_notebooks WHERE id = %s AND customer_id = %s", (nid, cid))
    return {"ok": True, "pages": n["pages"], "tasks": n["tasks"]}


# ─────────────────────────────── pages ───────────────────────────────
def _files_ok(conn, cid, ids):
    if ids and conn.execute("SELECT count(*) AS n FROM pl_files WHERE customer_id = %s AND id = ANY(%s)", (cid, ids)).fetchone()["n"] != len(ids):
        _bad("A picture in this note could not be found — please add it again")


def _links_sync(conn, cid, pid, ids):
    conn.execute("DELETE FROM pl_links WHERE src = %s AND customer_id = %s", (pid, cid))
    if ids:
        conn.execute("INSERT INTO pl_links (customer_id, src, dst) SELECT %s, %s, id FROM pl_pages WHERE customer_id = %s AND id = ANY(%s) AND id <> %s "
                     "ON CONFLICT DO NOTHING", (cid, pid, cid, ids, pid))


def _room(conn, cid, extra=1):
    if conn.execute("SELECT count(*) AS n FROM pl_pages WHERE customer_id = %s", (cid,)).fetchone()["n"] + extra > MAX_PAGES:
        raise HTTPException(422, f"Up to {MAX_PAGES} pages — empty the trash or remove old pages first")


def _insert(conn, cid, nb, kind, title, raw, tags=(), day=None, status=None, due=None, pinned=False):
    doc, body, links, files, words = clean_doc(raw if raw is not None else EMPTY)
    _files_ok(conn, cid, files)
    r = conn.execute("INSERT INTO pl_pages (customer_id, notebook_id, kind, title, doc, body, tags, day, status, due, files, words, pinned) "
                     f"VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING {PAGE_COLS}",
                     (cid, nb, kind, title, json.dumps(doc), body, list(tags), day, status, due, files, words, pinned)).fetchone()
    _links_sync(conn, cid, r["id"], links)
    return r


def page_create(conn, cid, nb, kind="note", title="", doc=None, tags=None, day=None, status=None, due=None):
    _nb(conn, cid, nb)
    _room(conn, cid)
    if kind not in KINDS:
        raise HTTPException(422, "Please check what you entered and try again.")
    day = _day(day)
    if kind == "journal" and not day:
        day = today()
    status = (status if status in P_STATUS else "active") if kind == "project" else None
    r = _insert(conn, cid, nb, kind, _line(title, 200), doc, _tags(tags), day, status, _day(due) if kind == "project" else None)
    return page_meta(r)


def page_get(conn, cid, pid):
    r = _page(conn, cid, pid, PAGE_COLS + ", doc")
    back = conn.execute("SELECT l.src FROM pl_links l JOIN pl_pages p ON p.id = l.src WHERE l.dst = %s AND l.customer_id = %s AND p.trashed_at IS NULL "
                        "ORDER BY p.updated_at DESC", (pid, cid)).fetchall()
    return {**page_meta(r), "doc": r["doc"], "backlinks": [b["src"] for b in back]}


def page_save(conn, cid, pid, title, raw, rev):
    """the words of a page. rev = the version the screen started from: a page changed elsewhere meanwhile is not overwritten (409)."""
    doc, body, links, files, words = clean_doc(raw)
    _files_ok(conn, cid, files)
    r = conn.execute("UPDATE pl_pages SET title = %s, doc = %s, body = %s, files = %s, words = %s, rev = rev + 1, updated_at = now() "
                     f"WHERE id = %s AND customer_id = %s AND rev = %s RETURNING {PAGE_COLS}",
                     (_line(title, 200), json.dumps(doc), body, files, words, pid, cid, rev)).fetchone()
    if not r:
        cur = _page(conn, cid, pid, "rev")
        raise HTTPException(409, "This note was changed in another window. Reload it to see the latest version.", headers={"X-Rev": str(cur["rev"])})
    _links_sync(conn, cid, pid, links)
    return page_meta(r)


def page_patch(conn, cid, pid, ch):
    """the details of a page (not its words): notebook, kind, topics, day, pin, project status / due, trash, title"""
    r = _page(conn, cid, pid)
    sets, vals = [], []

    def put(col, v):
        sets.append(f"{col} = %s")
        vals.append(v)
    kind = r["kind"]
    if "notebook_id" in ch:
        _nb(conn, cid, ch["notebook_id"])
        put("notebook_id", ch["notebook_id"])
        conn.execute("UPDATE pl_tasks SET notebook_id = %s WHERE page_id = %s AND customer_id = %s", (ch["notebook_id"], pid, cid))
    if "kind" in ch:
        if ch["kind"] not in KINDS:
            raise HTTPException(422, "Please check what you entered and try again.")
        kind = ch["kind"]
        put("kind", kind)
        put("status", (r["status"] or "active") if kind == "project" else None)
        if kind == "journal" and not r["day"] and "day" not in ch:
            put("day", today())
    if "title" in ch:
        put("title", _line(ch["title"], 200))
    if "tags" in ch:
        put("tags", _tags(ch["tags"]))
    if "day" in ch:
        put("day", _day(ch["day"]))
    if "pinned" in ch:
        put("pinned", bool(ch["pinned"]))
    if "status" in ch and kind == "project":
        if ch["status"] not in P_STATUS:
            raise HTTPException(422, "Please check what you entered and try again.")
        put("status", ch["status"])
    if "due" in ch:
        put("due", _day(ch["due"]))
    if "trashed" in ch:
        put("trashed_at", datetime.now(IST) if ch["trashed"] else None)
        if ch["trashed"]:
            put("pinned", False)
    if not sets:
        return page_meta(r)
    r = conn.execute(f"UPDATE pl_pages SET {', '.join(sets)}, updated_at = now() WHERE id = %s AND customer_id = %s RETURNING {PAGE_COLS}",
                     (*vals, pid, cid)).fetchone()
    return page_meta(r)


def page_delete(conn, cid, pid):
    r = _page(conn, cid, pid)
    if not r["trashed_at"]:
        raise HTTPException(409, "Move the page to the trash first")
    conn.execute("DELETE FROM pl_pages WHERE id = %s AND customer_id = %s", (pid, cid))
    return {"ok": True}


def trash_empty(conn, cid):
    n = conn.execute("DELETE FROM pl_pages WHERE customer_id = %s AND trashed_at IS NOT NULL", (cid,)).rowcount
    return {"ok": True, "removed": n}


def page_copy(conn, cid, pid):
    r = _page(conn, cid, pid, PAGE_COLS + ", doc")
    _room(conn, cid)
    n = _insert(conn, cid, r["notebook_id"], r["kind"], _line(f"{r['title'] or 'Untitled'} (copy)", 200), r["doc"], r["tags"], r["day"], r["status"], r["due"])
    return page_meta(n)


def _title_of(blocks, fallback):
    for b in blocks:
        if b["type"] == "heading":
            t = "".join(c.get("text", c.get("attrs", {}).get("label", "")) for c in b.get("content", []) if c["type"] in ("text", "pageLink")).strip()
            if t:
                return _line(t, 200)
    return fallback


def _demote(b):
    if b.get("type") == "heading":
        return {**b, "attrs": {"level": min(3, ((b.get("attrs") or {}).get("level") or 1) + 1)}}
    return b


def pages_merge(conn, cid, ids, title, nb, trash_sources):
    """several pages → one new page, in the order given: each page becomes a section under its title. The originals stay (or go to the
    trash, where they can be restored) — nothing is lost."""
    ids = list(dict.fromkeys(ids))
    if not 2 <= len(ids) <= MAX_MERGE:
        raise HTTPException(422, f"Pick 2 to {MAX_MERGE} pages to merge")
    _nb(conn, cid, nb)
    _room(conn, cid)
    rows = {r["id"]: r for r in conn.execute("SELECT id, title, doc, tags, day FROM pl_pages WHERE customer_id = %s AND id = ANY(%s) AND trashed_at IS NULL",
                                              (cid, ids)).fetchall()}
    if len(rows) != len(ids):
        raise HTTPException(404, "One of those pages was not found")
    blocks, tags = [], []
    for i in ids:
        r = rows[i]
        if blocks:
            blocks.append({"type": "horizontalRule"})
        blocks.append(_h(1, r["title"] or "Untitled"))       # the page's title is its section heading; its own headings sit one level below
        blocks += [_demote(b) for b in (r["doc"] or {}).get("content") or []]
        tags += [t for t in r["tags"] or [] if t not in tags]
    title = _line(title, 200) or "Merged notes"
    n = _insert(conn, cid, nb, "note", title, {"type": "doc", "content": blocks}, tags[:MAX_TAGS], today())
    if trash_sources:
        conn.execute("UPDATE pl_pages SET trashed_at = now(), pinned = false WHERE customer_id = %s AND id = ANY(%s)", (cid, ids))
    return {"page": page_meta(n), "trashed": ids if trash_sources else []}


def page_split(conn, cid, pid, mode, level=1, index=0, trash_source=False):
    """one page → several. mode "heading": a new page at every heading of that level (what comes before the first one keeps the page's
    title). mode "at": everything from block number `index` moves to a new page and the page keeps the rest."""
    r = _page(conn, cid, pid, PAGE_COLS + ", doc")
    blocks = (r["doc"] or {}).get("content") or []
    if mode == "at":
        if not 0 < index < len(blocks):
            raise HTTPException(422, "Put the cursor where the new page should start")
        _room(conn, cid)
        head, tail = blocks[:index], blocks[index:]
        new = _insert(conn, cid, r["notebook_id"], "note" if r["kind"] == "project" else r["kind"], _title_of(tail[:1], _line(f"{r['title'] or 'Untitled'} (part 2)", 200)),
                      {"type": "doc", "content": tail}, r["tags"], r["day"])
        doc, body, links, files, words = clean_doc({"type": "doc", "content": head})
        old = conn.execute("UPDATE pl_pages SET doc = %s, body = %s, files = %s, words = %s, rev = rev + 1, updated_at = now() "
                           f"WHERE id = %s AND customer_id = %s RETURNING {PAGE_COLS}", (json.dumps(doc), body, files, words, pid, cid)).fetchone()
        _links_sync(conn, cid, pid, links)
        return {"pages": [page_meta(new)], "source": page_meta(old)}
    if mode != "heading" or level not in (1, 2, 3):
        raise HTTPException(422, "Please check what you entered and try again.")
    parts, cur = [], {"title": r["title"] or "Untitled", "blocks": [], "lead": True}
    for b in blocks:
        if b["type"] == "heading" and (b.get("attrs") or {}).get("level") == level:
            if cur["blocks"] or not cur.get("lead"):             # what stands before the first heading counts only when it has words
                parts.append(cur)
            cur = {"title": _title_of([b], "Untitled"), "blocks": []}
        else:
            cur["blocks"].append(b)
    if cur["blocks"] or not cur.get("lead"):
        parts.append(cur)
    if len(parts) < 2:
        raise HTTPException(422, "There is nothing to split here — add headings first, or split at the cursor")
    if len(parts) > MAX_MERGE:
        raise HTTPException(422, f"That would make {len(parts)} pages — up to {MAX_MERGE} at a time")
    _room(conn, cid, len(parts))
    made = [_insert(conn, cid, r["notebook_id"], "note" if r["kind"] == "project" else r["kind"], p["title"],
                    {"type": "doc", "content": p["blocks"] or [{"type": "paragraph"}]}, r["tags"], r["day"]) for p in parts]
    src = r
    if trash_source:
        src = conn.execute(f"UPDATE pl_pages SET trashed_at = now(), pinned = false WHERE id = %s AND customer_id = %s RETURNING {PAGE_COLS}", (pid, cid)).fetchone()
    return {"pages": [page_meta(m) for m in made], "source": page_meta(src)}


def pages_docs(conn, cid, ids):
    """the full pages for a download (PDF / Word): as many as fit in one answer, the rest named in `more`"""
    ids = list(dict.fromkeys(ids))[:500]
    out, size, more = [], 0, []
    rows = {r["id"]: r for r in conn.execute("SELECT id, notebook_id, kind, title, doc, tags, day, created_at, updated_at, octet_length(doc::text) AS n "
                                              "FROM pl_pages WHERE customer_id = %s AND id = ANY(%s)", (cid, ids)).fetchall()}
    for i in ids:
        r = rows.get(i)
        if not r:
            continue
        if out and size + r["n"] > 6_000_000:
            more.append(i)
            continue
        size += r["n"]
        out.append({"id": r["id"], "nb": r["notebook_id"], "kind": r["kind"], "title": r["title"], "doc": r["doc"], "tags": list(r["tags"] or []),
                    "day": _iso(r["day"]), "created": _iso(r["created_at"]), "updated": _iso(r["updated_at"])})
    return {"pages": out, "more": more}


def _like(s):
    return "%" + s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def search(conn, cid, q):
    """every word must be somewhere in the page (title, words or topics); the answer carries the lines around the first hit"""
    words = [w for w in _line(q, 120).lower().split(" ") if w][:8]
    if not words:
        return {"hits": []}
    cond = " AND ".join(["(title ILIKE %s OR body ILIKE %s OR array_to_string(tags, ' ') ILIKE %s)"] * len(words))
    args = [a for w in words for a in (_like(w),) * 3]
    rows = conn.execute(f"SELECT id, title, body FROM pl_pages WHERE customer_id = %s AND {cond} ORDER BY updated_at DESC LIMIT 300", (cid, *args)).fetchall()
    hits = []
    for r in rows:
        body, low = r["body"] or "", (r["body"] or "").lower()
        at = min((p for p in (low.find(w) for w in words) if p >= 0), default=-1)
        snip = ""
        if at >= 0:
            a = max(0, at - 60)
            snip = ("…" if a else "") + SPACE.sub(" ", body[a:at + 140]).strip() + ("…" if at + 140 < len(body) else "")
        hits.append({"id": r["id"], "snip": snip, "in_title": all(w in (r["title"] or "").lower() for w in words)})
    return {"hits": hits}


# ─────────────────────────────── tasks ───────────────────────────────
def _next_due(due, repeat, now):
    d = due or now
    while True:
        if repeat == "daily":
            d += timedelta(days=1)
        elif repeat == "weekdays":
            d += timedelta(days=1)
            while d.weekday() > 4:
                d += timedelta(days=1)
        elif repeat == "weekly":
            d += timedelta(days=7)
        else:                                                # monthly: the same day of the next month (the last day when it has none)
            y, m = (d.year, d.month + 1) if d.month < 12 else (d.year + 1, 1)
            want = (due or now).day
            last = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).day
            d = date(y, m, min(want, last))
        if d > now:                                          # ticked today → it comes back tomorrow at the earliest, never in the past
            return d


def _task_page(conn, cid, page_id, nb):
    """a task under a project / page: the page must be the customer's own; the task then lives in that page's notebook"""
    if page_id is None:
        return nb
    return _page(conn, cid, page_id, "notebook_id")["notebook_id"]


def _task(conn, cid, tid):
    r = conn.execute(f"SELECT {TASK_COLS} FROM pl_tasks WHERE id = %s AND customer_id = %s", (tid, cid)).fetchone()
    if not r:
        raise HTTPException(404, "Task not found")
    return r


def _level(conn, cid, tid):
    """how deep a planner row sits (a top row = 1)"""
    return conn.execute("WITH RECURSIVE up AS (SELECT id, parent_id, 1 AS n FROM pl_tasks WHERE id = %s AND customer_id = %s "
                        "UNION ALL SELECT t.id, t.parent_id, up.n + 1 FROM pl_tasks t JOIN up ON t.id = up.parent_id AND t.customer_id = %s WHERE up.n < 50) "
                        "SELECT max(n) AS n FROM up", (tid, cid, cid)).fetchone()["n"] or 1


def _height(conn, cid, tid):
    """how many levels a row and the rows under it take (a row alone = 1)"""
    return conn.execute("WITH RECURSIVE dn AS (SELECT id, 1 AS n FROM pl_tasks WHERE id = %s AND customer_id = %s "
                        "UNION ALL SELECT t.id, dn.n + 1 FROM pl_tasks t JOIN dn ON t.parent_id = dn.id AND t.customer_id = %s WHERE dn.n < 50) "
                        "SELECT max(n) AS n FROM dn", (tid, cid, cid)).fetchone()["n"] or 1


def _sibs(conn, cid, r):
    """the rows beside this one, in order: the same parent (top rows: the same notebook) and the same kind"""
    if r["kind"] == "plan" and r["parent_id"] is None:
        return conn.execute(f"SELECT {TASK_COLS} FROM pl_tasks WHERE customer_id = %s AND kind = 'plan' AND parent_id IS NULL AND plan_id = %s ORDER BY sort, id",
                            (cid, r["plan_id"])).fetchall()
    return conn.execute(f"SELECT {TASK_COLS} FROM pl_tasks WHERE customer_id = %s AND kind = %s AND parent_id IS NOT DISTINCT FROM %s "
                        "AND (parent_id IS NOT NULL OR notebook_id = %s) ORDER BY sort, id", (cid, r["kind"], r["parent_id"], r["notebook_id"])).fetchall()


def _dates(start, end):
    if start and end and end < start:
        raise HTTPException(422, "The end date is before the start date")


def task_create(conn, cid, nb, title, note="", status="todo", priority=0, due=None, repeat=None, tags=None, page_id=None,
                kind="todo", start=None, parent_id=None, after_id=None, progress=0, time_from=None, time_to=None, plan_id=None):
    title = _line(title, 300)
    if not title:
        raise HTTPException(422, "Write what needs to be done")
    if kind not in T_KINDS or status not in T_STATUS or priority not in (0, 1, 2, 3) or repeat not in (None, *REPEATS):
        raise HTTPException(422, "Please check what you entered and try again.")
    if (kind == "todo" and (status == "hold" or parent_id is not None or start)) or (kind == "plan" and status == "missed"):
        raise HTTPException(422, "Please check what you entered and try again.")
    if kind == "plan" and repeat:
        raise HTTPException(422, "Planner rows do not repeat — use a to-do for that")
    start, due = _day(start), _day(due)
    _dates(start, due)
    tf, tt = _time(time_from), _time(time_to)
    if not isinstance(progress, int) or not 0 <= progress <= 100 or (kind == "todo" and progress) or (kind == "plan" and tf):
        raise HTTPException(422, "Please check what you entered and try again.")
    _times(tf, tt, due)
    if status == "done":
        progress = 100 if kind == "plan" else 0
    if parent_id is not None:                                # under a planner row: the customer's own, a planner row, not too deep
        p = _task(conn, cid, parent_id)
        if p["kind"] != "plan":
            raise HTTPException(422, "Please check what you entered and try again.")
        if _level(conn, cid, parent_id) + 1 > MAX_LEVELS:
            raise HTTPException(422, f"Up to {MAX_LEVELS} levels")
        nb, plan_id = p["notebook_id"], p["plan_id"]
    elif kind == "plan":                                     # a top row: in the planner asked for (or the notebook's first)
        if plan_id is not None:
            nb = _plan(conn, cid, plan_id)["notebook_id"]
        else:
            _nb(conn, cid, nb)
            plan_id = _default_plan(conn, cid, nb)
    if kind == "todo":
        plan_id = None
    nb = _task_page(conn, cid, page_id, nb)
    _nb(conn, cid, nb)
    if conn.execute("SELECT count(*) AS n FROM pl_tasks WHERE customer_id = %s", (cid,)).fetchone()["n"] >= MAX_TASKS:
        raise HTTPException(422, f"Up to {MAX_TASKS} tasks — remove finished ones first")
    sibs = _sibs(conn, cid, {"kind": kind, "parent_id": parent_id, "notebook_id": nb, "plan_id": plan_id})
    sort = (sibs[-1]["sort"] + 1) if sibs else 1.0
    if after_id is not None:                                 # straight after a row (Enter in the planner): between it and the next one
        i = next((k for k, s in enumerate(sibs) if s["id"] == after_id), None)
        if i is not None:
            sort = (sibs[i]["sort"] + sibs[i + 1]["sort"]) / 2 if i + 1 < len(sibs) else sibs[i]["sort"] + 1
    r = conn.execute("INSERT INTO pl_tasks (customer_id, notebook_id, page_id, kind, parent_id, start_on, title, note, status, priority, due, repeat, tags, sort, done_at, "
                     f"progress, time_from, time_to, plan_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING {TASK_COLS}",
                     (cid, nb, page_id, kind, parent_id, start, title, _text(note, 4000), status, priority, due, repeat, _tags(tags), sort,
                      datetime.now(IST) if status == "done" else None, progress, tf, tt, plan_id)).fetchone()
    return task_row(r)


def task_move(conn, cid, tid, action):
    """the planner's keyboard: indent (under the row above), outdent (back beside its parent), up / down (among the rows beside it).
    Returns every row that changed."""
    r = _task(conn, cid, tid)
    if r["kind"] != "plan" or action not in ("indent", "outdent", "up", "down"):
        raise HTTPException(422, "Please check what you entered and try again.")
    sibs = _sibs(conn, cid, r)
    i = next(k for k, s in enumerate(sibs) if s["id"] == tid)
    changed = []

    def upd(row_id, **kv):
        cols = ", ".join(f"{k} = %s" for k in kv)
        changed.append(conn.execute(f"UPDATE pl_tasks SET {cols}, updated_at = now() WHERE id = %s AND customer_id = %s RETURNING {TASK_COLS}",
                                    (*kv.values(), row_id, cid)).fetchone())
    if action == "indent":
        if i == 0:
            raise HTTPException(422, "There is no row above to put it under")
        new = sibs[i - 1]
        if _level(conn, cid, new["id"]) + _height(conn, cid, tid) > MAX_LEVELS:
            raise HTTPException(422, f"Up to {MAX_LEVELS} levels")
        kids = conn.execute("SELECT COALESCE(max(sort), 0) AS s FROM pl_tasks WHERE customer_id = %s AND parent_id = %s", (cid, new["id"])).fetchone()["s"]
        upd(tid, parent_id=new["id"], sort=kids + 1)
    elif action == "outdent":
        if r["parent_id"] is None:
            raise HTTPException(422, "It is already a top row")
        p = _task(conn, cid, r["parent_id"])
        ps = _sibs(conn, cid, p)
        j = next(k for k, s in enumerate(ps) if s["id"] == p["id"])
        sort = (p["sort"] + ps[j + 1]["sort"]) / 2 if j + 1 < len(ps) else p["sort"] + 1
        upd(tid, parent_id=p["parent_id"], sort=sort)
    else:
        j = i - 1 if action == "up" else i + 1
        if not 0 <= j < len(sibs):
            return {"tasks": []}
        o = sibs[j]
        a, b = (r["sort"], o["sort"]) if r["sort"] != o["sort"] else (r["sort"], r["sort"] + (-0.5 if action == "up" else 0.5))
        upd(tid, sort=b)
        upd(o["id"], sort=a)
    return {"tasks": [task_row(x) for x in changed]}


def task_patch(conn, cid, tid, ch):
    r = conn.execute(f"SELECT {TASK_COLS} FROM pl_tasks WHERE id = %s AND customer_id = %s", (tid, cid)).fetchone()
    if not r:
        raise HTTPException(404, "Task not found")
    sets, vals, spawned = [], [], None

    def put(col, v):
        sets.append(f"{col} = %s")
        vals.append(v)
    ch = dict(ch)
    if "progress" in ch:                                     # a planner row: progress and status follow each other
        p = ch["progress"]
        if r["kind"] != "plan" or not isinstance(p, int) or not 0 <= p <= 100:
            raise HTTPException(422, "Please check what you entered and try again.")
        if "status" not in ch:
            st_ = "done" if p == 100 else "doing" if p > 0 and r["status"] in ("todo", "done") else "todo" if p == 0 and r["status"] == "done" else r["status"]
            if st_ != r["status"]:
                ch["status"] = st_
        put("progress", p)
    elif "status" in ch and r["kind"] == "plan" and ch["status"] != r["status"]:
        if ch["status"] == "done":
            put("progress", 100)
        elif r["progress"] == 100:
            put("progress", 0 if ch["status"] == "todo" else 90)
    if "time_from" in ch or "time_to" in ch or ("due" in ch and r["time_from"] is not None):
        tf = _time(ch["time_from"]) if "time_from" in ch else r["time_from"]
        tt = _time(ch["time_to"]) if "time_to" in ch else r["time_to"]
        due = _day(ch["due"]) if "due" in ch else r["due"]
        if due is None:
            tf = tt = None                                   # no day → no time either
        if tf is not None and r["kind"] != "todo":
            raise HTTPException(422, "Please check what you entered and try again.")
        _times(tf, tt, due)
        put("time_from", tf)
        put("time_to", tt)
    if "title" in ch:
        t = _line(ch["title"], 300)
        if not t:
            raise HTTPException(422, "Write what needs to be done")
        put("title", t)
    if "note" in ch:
        put("note", _text(ch["note"], 4000))
    if "priority" in ch:
        if ch["priority"] not in (0, 1, 2, 3):
            raise HTTPException(422, "Please check what you entered and try again.")
        put("priority", ch["priority"])
    if "due" in ch:
        put("due", _day(ch["due"]))
    if "start" in ch:
        if r["kind"] != "plan" and ch["start"]:
            raise HTTPException(422, "Please check what you entered and try again.")
        put("start_on", _day(ch["start"]))
    _dates(_day(ch["start"]) if "start" in ch else r["start_on"], _day(ch["due"]) if "due" in ch else r["due"])
    if "repeat" in ch:
        if ch["repeat"] not in (None, *REPEATS) or (ch["repeat"] and r["kind"] == "plan"):
            raise HTTPException(422, "Please check what you entered and try again.")
        put("repeat", ch["repeat"])
    if "tags" in ch:
        put("tags", _tags(ch["tags"]))
    if "sort" in ch:
        put("sort", float(ch["sort"]))
    if "page_id" in ch:
        put("page_id", ch["page_id"])
        if ch["page_id"] is not None:
            put("notebook_id", _task_page(conn, cid, ch["page_id"], r["notebook_id"]))
    if "plan_id" in ch and ch["plan_id"] != r["plan_id"]:
        if r["kind"] != "plan" or r["parent_id"] is not None or ch["plan_id"] is None:
            raise HTTPException(422, "Move the top row — the rows under it go with it")
        pl_ = _plan(conn, cid, ch["plan_id"])
        put("plan_id", pl_["id"]); put("notebook_id", pl_["notebook_id"])
        put("sort", (conn.execute("SELECT COALESCE(max(sort), 0) AS s FROM pl_tasks WHERE customer_id = %s AND plan_id = %s AND parent_id IS NULL",
                                  (cid, pl_["id"])).fetchone()["s"]) + 1)
        conn.execute("WITH RECURSIVE dn AS (SELECT id FROM pl_tasks WHERE parent_id = %s AND customer_id = %s "
                     "UNION ALL SELECT t.id FROM pl_tasks t JOIN dn ON t.parent_id = dn.id AND t.customer_id = %s) "
                     "UPDATE pl_tasks SET plan_id = %s, notebook_id = %s, updated_at = now() WHERE customer_id = %s AND id IN (SELECT id FROM dn)",
                     (tid, cid, cid, pl_["id"], pl_["notebook_id"], cid))
    if "notebook_id" in ch and ch.get("page_id", r["page_id"]) is None and ch["notebook_id"] != r["notebook_id"]:
        if r["kind"] == "plan":                              # a planner row lives in its planner's notebook
            raise HTTPException(422, "Move the row to another planner — or move the planner")
        if r["parent_id"] is not None:                       # a row under another lives in its top row's notebook
            raise HTTPException(422, "Move the top row — the rows under it go with it")
        _nb(conn, cid, ch["notebook_id"])
        put("notebook_id", ch["notebook_id"])
        conn.execute("WITH RECURSIVE dn AS (SELECT id FROM pl_tasks WHERE parent_id = %s AND customer_id = %s "
                     "UNION ALL SELECT t.id FROM pl_tasks t JOIN dn ON t.parent_id = dn.id AND t.customer_id = %s) "
                     "UPDATE pl_tasks SET notebook_id = %s, updated_at = now() WHERE customer_id = %s AND id IN (SELECT id FROM dn)",
                     (tid, cid, cid, ch["notebook_id"], cid))
    if "status" in ch and ch["status"] != r["status"]:
        if ch["status"] not in T_STATUS or (ch["status"] == "hold" and r["kind"] != "plan") or (ch["status"] == "missed" and r["kind"] != "todo"):
            raise HTTPException(422, "Please check what you entered and try again.")
        put("status", ch["status"])
        put("done_at", datetime.now(IST) if ch["status"] in CLOSED else None)      # when it was done / marked missed
        if ch["status"] not in CLOSED:
            put("archived_at", None)                         # open again → back on the dashboard
        repeat = ch.get("repeat", r["repeat"]) if "repeat" in ch else r["repeat"]
        if ch["status"] in CLOSED and r["status"] not in CLOSED and repeat:   # a repeating to-do: done or missed, the next one comes
            due = _day(ch["due"]) if "due" in ch else r["due"]
            nxt = conn.execute("INSERT INTO pl_tasks (customer_id, notebook_id, page_id, title, note, status, priority, due, repeat, tags, sort, time_from, time_to) "
                               f"VALUES (%s,%s,%s,%s,%s,'todo',%s,%s,%s,%s,%s,%s,%s) RETURNING {TASK_COLS}",
                               (cid, r["notebook_id"], r["page_id"], r["title"], r["note"], r["priority"], _next_due(due, repeat, today()),
                                repeat, list(r["tags"] or []), r["sort"], r["time_from"], r["time_to"])).fetchone()
            spawned = task_row(nxt)
            put("repeat", None)                              # the finished one is history; only the new one repeats
    if sets:
        r = conn.execute(f"UPDATE pl_tasks SET {', '.join(sets)}, updated_at = now() WHERE id = %s AND customer_id = %s RETURNING {TASK_COLS}",
                         (*vals, tid, cid)).fetchone()
    settle(conn, cid)
    return {"task": task_row(r), "next": spawned}


def task_delete(conn, cid, tid):
    n = conn.execute("WITH RECURSIVE dn AS (SELECT id FROM pl_tasks WHERE id = %s AND customer_id = %s "
                     "UNION ALL SELECT t.id FROM pl_tasks t JOIN dn ON t.parent_id = dn.id AND t.customer_id = %s) SELECT count(*) AS n FROM dn",
                     (tid, cid, cid)).fetchone()["n"]
    if not conn.execute("DELETE FROM pl_tasks WHERE id = %s AND customer_id = %s", (tid, cid)).rowcount:
        raise HTTPException(404, "Task not found")
    settle(conn, cid)
    return {"ok": True, "removed": n}                        # a planner row takes the rows under it along


def tasks_clear_done(conn, cid, nb=None, status="done"):
    if status not in CLOSED:
        raise HTTPException(422, "Please check what you entered and try again.")
    n = conn.execute("UPDATE pl_tasks SET archived_at = now() WHERE customer_id = %s AND kind = 'todo' AND status = %s AND archived_at IS NULL "
                     "AND (%s::bigint IS NULL OR notebook_id = %s)", (cid, status, nb, nb)).rowcount
    return {"ok": True, "removed": n, "cleared": n}


# ─────────────────────────────── pictures ───────────────────────────────
def file_add(conn, cid, src):
    m = DATA_URL.match(src) if isinstance(src, str) and len(src) < MAX_IMAGE * 4 // 3 + 64 else None
    if not m:
        raise HTTPException(422, "Only PNG, JPEG or WebP pictures up to 2 MB can be added")
    try:
        data = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "That picture could not be read")
    mime = _sniff(data)
    if not mime or not 64 <= len(data) <= MAX_IMAGE:
        raise HTTPException(422, "Only PNG, JPEG or WebP pictures up to 2 MB can be added")
    u = conn.execute("SELECT COALESCE(sum(size), 0) AS bytes, count(*) FILTER (WHERE created_at > now() - interval '1 day') AS today "
                     "FROM pl_files WHERE customer_id = %s", (cid,)).fetchone()
    if u["bytes"] + len(data) > MAX_STORE:
        raise HTTPException(422, "Your picture space is full — remove old notes with pictures and empty the trash")
    if u["today"] >= UPLOADS_DAY:
        raise HTTPException(429, "That is a lot of pictures for one day — please add more tomorrow")
    r = conn.execute("INSERT INTO pl_files (customer_id, mime, data, size) VALUES (%s,%s,%s,%s) RETURNING id", (cid, mime, data, len(data))).fetchone()
    return {"id": r["id"], "src": f"/app/api/planner/files/{r['id']}", "size": len(data)}


def file_get(conn, cid, fid):
    r = conn.execute("SELECT mime, data FROM pl_files WHERE id = %s AND customer_id = %s", (fid, cid)).fetchone()
    if not r:
        raise HTTPException(404, "Picture not found")
    return Response(content=bytes(r["data"]), media_type=r["mime"],
                    headers={"Cache-Control": "private, max-age=604800, immutable", "X-Content-Type-Options": "nosniff",
                             "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "inline"})


# ─────────────────────────────── the Inbox: one daily summary of what is due ───────────────────────────────
DUE_SQL = ("SELECT id, title, due FROM pl_tasks WHERE customer_id = %s AND status NOT IN ('done', 'missed') AND due IS NOT NULL AND due <= %s "
           "ORDER BY due, priority DESC, id LIMIT 200")


def _due_body(rows, day):
    late = [r for r in rows if r["due"] < day]
    now = [r for r in rows if r["due"] == day]
    parts = [f"{len(now)} task{'' if len(now) == 1 else 's'} due today" if now else "", f"{len(late)} overdue" if late else ""]
    title = "Planner: " + " · ".join(p for p in parts if p)
    return title, {"planner": True, "day": day.isoformat(), "today": [{"id": r["id"], "t": r["title"][:120]} for r in now[:20]],
                   "late": [{"id": r["id"], "t": r["title"][:120], "d": r["due"].isoformat()} for r in late[:20]], "n_today": len(now), "n_late": len(late)}


def settle(conn, cid):
    """after a task changes: the day summary closes by itself once nothing is left, and a "starts in 15 min" reminder closes once its
    to-do / plan is ticked, moved to another day or deleted"""
    it = conn.execute("SELECT id FROM customer_notifications WHERE customer_id = %s AND kind = 'planner_due' AND status = 'open' ORDER BY id DESC LIMIT 1",
                      (cid,)).fetchone()
    if it and not conn.execute(LEFT_SQL + " LIMIT 1", (cid, today(), today())).fetchone():
        conn.execute("UPDATE customer_notifications SET status = 'done', done_at = now(), done_note = 'All caught up — nothing due', updated_at = now(), "
                     "read_at = COALESCE(read_at, now()) WHERE id = %s", (it["id"],))
    for n in conn.execute("SELECT id, ref_id, body FROM customer_notifications WHERE customer_id = %s AND kind = 'planner_soon' AND status = 'open'",
                          (cid,)).fetchall():
        t = conn.execute("SELECT status, due, start_on, archived_at FROM pl_tasks WHERE customer_id = %s AND id = %s",
                         (cid, n["ref_id"] or 0)).fetchone()
        on = date.fromisoformat(((n["body"] or {}).get("soon") or {}).get("day") or today().isoformat())
        if not t or t["status"] in CLOSED or t["archived_at"] or not (t["due"] and (t["start_on"] or t["due"]) <= on <= t["due"]):
            conn.execute("UPDATE customer_notifications SET status = 'done', done_at = now(), updated_at = now(), read_at = COALESCE(read_at, now()), "
                         "done_note = %s WHERE id = %s", ("Done" if t and t["status"] == "done" else "No longer due", n["id"]))


def run_digest(conn, now=None):
    """the worker, once a day (admin connection): for every customer who holds the Planner, has the summary on and has something due today
    or late — ONE open Inbox item (yesterday's is updated, not repeated); nothing due → an open one closes. Returns the number written."""
    day = (now or datetime.now(IST)).date()
    made = 0
    who = conn.execute("SELECT DISTINCT t.customer_id FROM pl_tasks t JOIN effective_permissions e ON e.customer_id = t.customer_id AND e.key = 'planner:view' "
                       "LEFT JOIN pl_prefs p ON p.customer_id = t.customer_id "
                       "WHERE t.status NOT IN ('done', 'missed') AND t.due IS NOT NULL AND t.due <= %s AND COALESCE(p.prefs->>'digest', 'true') <> 'false'", (day,)).fetchall()
    have = {r["customer_id"] for r in who}
    for cid in have:
        rows = conn.execute(DUE_SQL, (cid, day)).fetchall()
        title, body = _due_body(rows, day)
        it = conn.execute("SELECT id FROM customer_notifications WHERE customer_id = %s AND kind = 'planner_due' AND status = 'open' ORDER BY id DESC LIMIT 1",
                          (cid,)).fetchone()
        if it:
            conn.execute("UPDATE customer_notifications SET title = %s, body = %s, updated_at = now(), read_at = NULL WHERE id = %s", (title, json.dumps(body), it["id"]))
        else:
            conn.execute("INSERT INTO customer_notifications (customer_id, kind, title, body, app, type) VALUES (%s, 'planner_due', %s, %s, 'planner', 'info')",
                         (cid, title, json.dumps(body)))
        made += 1
    stale = conn.execute("SELECT id, customer_id FROM customer_notifications WHERE kind = 'planner_due' AND status = 'open'").fetchall()
    for s in stale:
        if s["customer_id"] not in have:
            conn.execute("UPDATE customer_notifications SET status = 'done', done_at = now(), done_note = 'All caught up — nothing due', updated_at = now(), "
                         "read_at = COALESCE(read_at, now()) WHERE id = %s", (s["id"],))
    return made


# ─────── round 28: reminders in the Inbox and on the phone (owner 2026-11-18: "like Teams — 15 min before; a day-only to-do at 8 am, then
# 12, 4 and 7 for what is left; notes nothing") ───────
SOON_MIN = 15                                            # a to-do / plan with a time: one reminder this many minutes before
SLOTS = (8, 12, 16, 19)                                  # day-only to-dos and plans: 8 am, then 12 · 4 pm · 7 pm only while something is left
# what is still left on a day: day-only (no time) to-dos due that day or earlier, and planner rows running that day or overdue
LEFT_SQL = ("SELECT id, kind, title, due FROM pl_tasks WHERE customer_id = %s AND status NOT IN ('done', 'missed') AND archived_at IS NULL "
            "AND time_from IS NULL AND due IS NOT NULL AND (due <= %s OR (kind = 'plan' AND COALESCE(start_on, due) <= %s)) "
            "ORDER BY due, priority DESC, id")
ON_SQL = ("JOIN effective_permissions e ON e.customer_id = t.customer_id AND e.key = 'planner:view' "
          "LEFT JOIN pl_prefs p ON p.customer_id = t.customer_id WHERE COALESCE(p.prefs->>'digest', 'true') <> 'false' ")


def _hm(t):
    return f"{t.hour % 12 or 12}:{t.minute:02d} {'am' if t.hour < 12 else 'pm'}"


SLOT_NAME = {8: "8 am", 12: "12 pm", 16: "4 pm", 19: "7 pm"}


def _once(conn, cid, key):
    """True the first time only — pl_reminders remembers each reminder sent, so a restart never repeats one"""
    return conn.execute("INSERT INTO pl_reminders (customer_id, key) VALUES (%s, %s) ON CONFLICT DO NOTHING RETURNING key", (cid, key)).fetchone() is not None


def run_reminders(conn, now=None, push_queue=None):
    """the worker, every few seconds (admin connection). Returns (timed reminders, day reminders) written."""
    from . import push
    send = push_queue or push.queue
    now = (now or datetime.now(IST)).astimezone(IST)
    day, at = now.date(), now.time().replace(second=0, microsecond=0)
    soon_n = day_n = 0
    # the Planner taken away (Access manager): its open reminders close (switched off: prefs_set closes them; nothing left: settle)
    conn.execute("UPDATE customer_notifications n SET status = 'done', done_at = now(), updated_at = now(), read_at = COALESCE(read_at, now()), "
                 "done_note = 'The Planner is no longer on your plan' WHERE n.kind IN ('planner_due', 'planner_soon') AND n.status = 'open' "
                 "AND NOT EXISTS (SELECT 1 FROM effective_permissions e WHERE e.customer_id = n.customer_id AND e.key = 'planner:view')")
    # ── a time is set: one reminder in the 15 minutes before it, on its day (a planner row: every day it runs) ──
    until = (datetime.combine(day, at) + timedelta(minutes=SOON_MIN)).time() if at < time(23, 45) else time(23, 59, 59)
    rows = conn.execute("SELECT t.customer_id, t.id, t.kind, t.title, t.note, t.time_from, t.time_to FROM pl_tasks t " + ON_SQL +
                        "AND t.status NOT IN ('done', 'missed') AND t.archived_at IS NULL AND t.time_from IS NOT NULL AND t.time_from > %s "
                        "AND t.time_from <= %s AND t.due IS NOT NULL AND COALESCE(t.start_on, t.due) <= %s AND t.due >= %s "
                        "AND (t.kind = 'plan' OR t.due = %s) ORDER BY t.time_from LIMIT 2000", (at, until, day, day, day)).fetchall()
    for r in rows:
        if not _once(conn, r["customer_id"], f"t{r['id']}@{day.isoformat()}T{r['time_from']:%H%M}"):
            continue
        mins = max(1, round((datetime.combine(day, r["time_from"]) - datetime.combine(day, at)).total_seconds() / 60))
        when = _hm(r["time_from"]) + (f" – {_hm(r['time_to'])}" if r["time_to"] else "")
        note = re.sub(r"\s+", " ", r["note"] or "").strip()[:160]
        body = {"planner": True, "day": day.isoformat(), "soon": {"id": r["id"], "t": r["title"][:120], "at": when, "in": mins, "note": note,
                "kind": r["kind"], "day": day.isoformat()}, "today": [{"id": r["id"], "t": r["title"][:120]}], "late": [], "n_today": 1, "n_late": 0}
        nid = conn.execute("INSERT INTO customer_notifications (customer_id, kind, title, body, app, type, ref_id) "
                           "VALUES (%s, 'planner_soon', %s, %s, 'planner', 'info', %s) RETURNING id",
                           (r["customer_id"], f"In {mins} min · {when}: {r['title'][:100]}", json.dumps(body), r["id"])).fetchone()["id"]
        send(conn, r["customer_id"], r["title"][:100], f"{when} · in {mins} min" + (f"\n{note}" if note else ""), url=f"/app/inbox?n={nid}", tag=f"pl-t{r['id']}")
        soon_n += 1
    # ── day-only: 8 am, then 12 · 4 pm · 7 pm while something is left (the latest slot reached; earlier missed ones are not sent late) ──
    slot = max([h for h in SLOTS if now.hour >= h], default=None)
    if slot is not None and now.hour < slot + 3:
        who = conn.execute("SELECT DISTINCT t.customer_id FROM pl_tasks t " + ON_SQL +
                           "AND t.status NOT IN ('done', 'missed') AND t.archived_at IS NULL AND t.time_from IS NULL AND t.due IS NOT NULL "
                           "AND (t.due <= %s OR (t.kind = 'plan' AND COALESCE(t.start_on, t.due) <= %s))", (day, day)).fetchall()
        for w in who:
            cid = w["customer_id"]
            if not _once(conn, cid, f"d{day.isoformat()}@{slot}"):
                continue
            for h in SLOTS:
                if h < slot:
                    _once(conn, cid, f"d{day.isoformat()}@{h}")
            rows = conn.execute(LEFT_SQL + " LIMIT 200", (cid, day, day)).fetchall()
            if not rows:
                continue
            late = [r for r in rows if r["due"] < day]
            now_ = [r for r in rows if r["due"] >= day]
            todo = [r for r in now_ if r["kind"] == "todo"]
            plans = [r for r in now_ if r["kind"] == "plan"]
            parts = [p for p in (f"{len(todo)} to-do{'' if len(todo) == 1 else 's'}" if todo else "",
                                 f"{len(plans)} plan{'' if len(plans) == 1 else 's'}" if plans else "", f"{len(late)} overdue" if late else "") if p]
            head = "Today in your Planner" if slot == SLOTS[0] else "Still to do today"
            title = f"{head} · {SLOT_NAME[slot]}: " + " · ".join(parts)
            body = {"planner": True, "day": day.isoformat(), "slot": slot, "today": [{"id": r["id"], "t": r["title"][:120]} for r in now_[:20]],
                    "late": [{"id": r["id"], "t": r["title"][:120], "d": r["due"].isoformat()} for r in late[:20]], "n_today": len(now_), "n_late": len(late)}
            it = conn.execute("SELECT id FROM customer_notifications WHERE customer_id = %s AND kind = 'planner_due' AND status = 'open' "
                              "ORDER BY id DESC LIMIT 1", (cid,)).fetchone()
            if it:                                           # one summary item, brought up to date and shown as new again
                conn.execute("UPDATE customer_notifications SET title = %s, body = %s, updated_at = now(), read_at = NULL WHERE id = %s",
                             (title, json.dumps(body), it["id"]))
                nid = it["id"]
            else:
                nid = conn.execute("INSERT INTO customer_notifications (customer_id, kind, title, body, app, type) "
                                   "VALUES (%s, 'planner_due', %s, %s, 'planner', 'info') RETURNING id", (cid, title, json.dumps(body))).fetchone()["id"]
            first = ", ".join(r["title"][:40] for r in (now_ + late)[:3])
            send(conn, cid, f"{head} · {SLOT_NAME[slot]}", " · ".join(parts) + (f"\n{first}" if first else ""), url=f"/app/inbox?n={nid}", tag="pl-day")
            day_n += 1
    return soon_n, day_n


def forget_reminders(conn):
    """the worker, once a day: what was sent more than 3 days ago is no longer needed to stop a repeat"""
    return conn.execute("DELETE FROM pl_reminders WHERE sent_at < now() - interval '3 days'").rowcount


def cleanup(conn):
    """the worker, once a day (admin connection): the trash is emptied after TRASH_DAYS, and pictures no page shows any more are removed"""
    pages = conn.execute("DELETE FROM pl_pages WHERE trashed_at < now() - make_interval(days => %s)", (TRASH_DAYS,)).rowcount
    files = conn.execute("DELETE FROM pl_files f WHERE f.created_at < now() - interval '2 days' "
                         "AND NOT EXISTS (SELECT 1 FROM pl_pages p WHERE p.customer_id = f.customer_id AND f.id = ANY(p.files))").rowcount
    return {"pages": pages, "files": files}
