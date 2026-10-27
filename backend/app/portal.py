"""
Hyperplane customer edition (/app) — a separate service from the admin / user API.

It logs in to the database as the restricted role `hp_portal`: it can read the published customer view and the
customers table, insert sign-ups (always 'pending') and update login counters — nothing else. It never sees
collections, signals, settings or config.ini, and it uses its own secret and cookie.

Access manager: what a customer may open comes from their roles (Admin → 🔐 Access manager); the service only reads
them. Each sign-in is a row in customer_sessions (Admin can sign a device out); events and minutes per application go
to the activity log, which this service can write but never read.
"""
import hashlib
import os
import re
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from pydantic import BaseModel

from . import activity as act
from . import helpdesk as hd
from .security import DUMMY_HASH, hash_password, verify_password

IST = timezone(timedelta(hours=5, minutes=30))          # day open / day end are judged on Indian time

DB_URL = os.environ.get("PORTAL_DATABASE_URL", "")
SECRET = os.environ.get("PORTAL_SECRET_KEY", "")
COOKIE, SESSION_SECONDS = "qf_session", 7 * 24 * 3600
DEV_COOKIE = "qf_dev"                                   # one id per browser / system (Activity log: devices per account)
SEEN_EVERY = 60                                         # seconds between session "last active" updates
DATA_APPS = ("research", "simple", "portfolio")         # applications that read the published data
NO_ACCESS = "This application is not part of your plan. Please contact QuantFriday through the Helpdesk."
MAX_FAILS, LOCK_MINUTES = 5, 15

app = FastAPI(title="Hyperplane", docs_url=None, redoc_url=None, openapi_url=None)
pool = ConnectionPool(DB_URL, min_size=1, max_size=4, kwargs={"row_factory": dict_row}, open=False)


@app.on_event("startup")
def _startup():
    if not DB_URL or len(SECRET) < 32:
        raise RuntimeError("Set PORTAL_DB_PASSWORD and PORTAL_SECRET_KEY (32+ characters) in .env")
    deadline = time.time() + 180                     # the API creates the role on its first start
    while True:
        try:
            pool.open(wait=True, timeout=20)
            with pool.connection() as c:
                c.execute("SELECT 1 FROM published LIMIT 1")
            return
        except Exception:                            # noqa: BLE001
            if time.time() > deadline:
                raise
            time.sleep(5)


@app.middleware("http")
async def _headers(request: Request, call_next):
    # body-size cap (Caddy also caps it): helpdesk messages may carry images, everything else is tiny
    limit = 8_500_000 if request.url.path.startswith("/app/api/helpdesk") else 64_000
    try:
        too_big = int(request.headers.get("content-length") or 0) > limit
    except ValueError:
        too_big = True
    if too_big:
        return JSONResponse({"detail": "This request is too large"}, status_code=413)
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers.setdefault("Cache-Control", "no-store")
    return resp


def _ip(request: Request):
    return request.client.host if request.client else "?"


_hits = defaultdict(deque)


def _rate(bucket, key, limit, window):
    q = _hits[(bucket, key)]
    now = time.time()
    while q and q[0] < now - window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many attempts — please wait a few minutes and try again")
    q.append(now)


def _signer():
    return URLSafeTimedSerializer(SECRET, salt="qf-customer")


EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$", re.I)
PHONE_RE = re.compile(r"^\+\d{1,4} \d{5,13}$")             # "+<country code> <number>" from the sign-up form
IN_MOBILE_RE = re.compile(r"^\+91 [6-9]\d{9}$")             # India: 10 digits starting 6-9


class RegisterIn(BaseModel):
    name: str
    email: str
    phone: str
    country: str
    state: str
    city: str = ""
    password: str
    accept: bool = False


class LoginIn(BaseModel):
    email: str
    password: str


def _ua(request: Request):
    return (request.headers.get("user-agent") or "")[:400]


def _set_token(request: Request, response: Response, r, sid):
    token = _signer().dumps({"id": r["id"], "v": r["session_ver"], "s": sid})
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, samesite="strict", secure=secure, path="/app")


def _start_session(request: Request, response: Response, r, event):
    """A new session row (= one signed-in device) and the cookie that carries it."""
    dev, _ = act.device_id(request, DEV_COOKIE)
    act.set_device_cookie(request, response, DEV_COOKIE, dev, "/app")      # refreshed on every sign-in
    sid, ua = act.new_id(), _ua(request)
    label = act.device_label(ua)
    with pool.connection() as c:
        c.execute("INSERT INTO customer_sessions (id, customer_id, device_id, device, user_agent, ip, last_ip) "
                  "VALUES (%s,%s,%s,%s,%s,%s,%s)", (sid, r["id"], dev, label, ua, _ip(request), _ip(request)))
        act.log(c, actor_kind="customer", actor_id=r["id"], actor_name=r["name"], session_id=sid, device_id=dev,
                device=label, ip=_ip(request), app="customer", event=event)
    _set_token(request, response, r, sid)


def _log_attempt(request: Request, event, r=None, email=None, **detail):
    """Failed / blocked sign-in attempts (no session exists yet)."""
    dev = request.cookies.get(DEV_COOKIE) or ""
    with pool.connection() as c:
        act.log(c, actor_kind="customer", actor_id=r["id"] if r else None, actor_name=r["name"] if r else (email or "")[:120],
                device_id=dev if act.DEV_RE.match(dev) else None, device=act.device_label(_ua(request)),
                ip=_ip(request), app="customer", event=event, detail=detail or None)


@app.post("/app/api/register")
def register(body: RegisterIn, request: Request, response: Response):
    _rate("register", _ip(request), 5, 3600)
    email = body.email.strip().lower()
    name, country, state = body.name.strip(), body.country.strip(), body.state.strip()
    if not 2 <= len(name) <= 80:
        raise HTTPException(422, "Please enter your full name")
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Please enter a valid email address")
    phone = body.phone.strip()
    if not PHONE_RE.match(phone) or (phone.startswith("+91 ") and not IN_MOBILE_RE.match(phone)):
        raise HTTPException(422, "Please enter a valid WhatsApp number — choose the country code and type the number (10 digits for India)")
    if not country or not state:
        raise HTTPException(422, "Please choose your country and state")
    if not 8 <= len(body.password) <= 128:
        raise HTTPException(422, "Password must be at least 8 characters")
    if not body.accept:
        raise HTTPException(422, "Please accept the terms to continue")
    with pool.connection() as c:
        # the database approves it right away when Admin has switched on automatic approval (trigger, see db.py)
        r = c.execute("INSERT INTO customers (email, name, phone, country, state, city, pw_hash, signup_ip) "
                      "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (email) DO NOTHING "
                      "RETURNING id, name, status, session_ver",
                      (email, name, phone, country[:60], state[:60], body.city.strip()[:60],
                       hash_password(body.password), _ip(request))).fetchone()
        if r and r["status"] == "approved":
            c.execute("UPDATE customers SET last_login = now(), login_count = login_count + 1 WHERE id = %s", (r["id"],))
        elif r:                                          # waiting for approval: still worth a line in the log
            act.log(c, actor_kind="customer", actor_id=r["id"], actor_name=r["name"], device=act.device_label(_ua(request)),
                    ip=_ip(request), app="customer", event="signup", detail={"status": r["status"]})
    if r and r["status"] == "approved":
        _start_session(request, response, r, "signup")
        return {"ok": True, "signed_in": True, "name": r["name"], "message": "Welcome to Hyperplane! Your account is ready."}
    # same answer whether or not the email already existed
    return {"ok": True, "message": "Thank you! Your account will be active once QuantFriday approves it."}


@app.get("/app/api/signup-info")
def signup_info(request: Request):
    _rate("signup-info", _ip(request), 60, 60)
    with pool.connection() as c:
        return {"auto_approve": bool(c.execute("SELECT portal_auto_approve() AS v").fetchone()["v"])}


def _blocked_reason(r):
    if r["status"] == "pending":
        return "Your account is waiting for approval. We'll let you know once it is active."
    if r["status"] != "approved":
        return "This account is not active. Please contact QuantFriday."
    if r["expires_on"] and r["expires_on"] < date.today():
        return "Your access has expired. Please contact QuantFriday to renew."
    return None


@app.post("/app/api/login")
def login(body: LoginIn, request: Request, response: Response):
    _rate("login", _ip(request), 10, 900)
    email = body.email.strip().lower()
    with pool.connection() as c:
        r = c.execute("SELECT id, name, pw_hash, status, expires_on, session_ver, failed_logins, locked_until "
                      "FROM customers WHERE email = %s", (email,)).fetchone()
    now = datetime.now(timezone.utc)
    if r and r["locked_until"] and r["locked_until"] > now:
        _log_attempt(request, "login_failed", r, reason="locked")
        raise HTTPException(429, "Too many wrong passwords — please try again in 15 minutes")
    ok = verify_password(body.password, r["pw_hash"] if r else DUMMY_HASH) and bool(r)
    if not ok:
        if r:                                        # counted and committed before the error is returned
            fails = r["failed_logins"] + 1
            lock = now + timedelta(minutes=LOCK_MINUTES) if fails >= MAX_FAILS else None
            with pool.connection() as c:
                c.execute("UPDATE customers SET failed_logins = %s, locked_until = %s WHERE id = %s",
                          (0 if lock else fails, lock, r["id"]))
        _log_attempt(request, "login_failed", r, email, reason="wrong_password" if r else "unknown_email")
        if r and lock:
            _log_attempt(request, "locked", r, minutes=LOCK_MINUTES)
        time.sleep(0.6)
        raise HTTPException(401, "Email or password is wrong")
    reason = _blocked_reason(r)
    if reason:
        _log_attempt(request, "login_failed", r, reason=r["status"] if r["status"] != "approved" else "expired")
        raise HTTPException(403, reason)
    with pool.connection() as c:
        c.execute("UPDATE customers SET failed_logins = 0, locked_until = NULL, last_login = now(), "
                  "login_count = login_count + 1 WHERE id = %s", (r["id"],))
    _start_session(request, response, r, "login")
    return {"name": r["name"]}


MODULES_SQL = ("SELECT m.key, m.name, m.description FROM app_modules m WHERE m.enabled AND EXISTS ("
               "SELECT 1 FROM customer_roles cr JOIN role_modules rm ON rm.role_id = cr.role_id "
               "WHERE cr.customer_id = %s AND rm.module = m.key) ORDER BY m.sort, m.key")


def _session(request: Request, response: Response | None = None):
    """The signed-in customer, their session (= device) and the applications their roles allow."""
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Please sign in")
    try:
        data = _signer().loads(token, max_age=SESSION_SECONDS)
    except (BadSignature, SignatureExpired):
        raise HTTPException(401, "Please sign in again")
    sid = data.get("s")
    with pool.connection() as c:
        r = c.execute("SELECT c.id, c.name, c.email, c.status, c.expires_on, c.session_ver, "
                      "s.id AS sid, s.ended_at, s.end_reason, s.last_seen, s.last_ip, s.device_id "
                      "FROM customers c LEFT JOIN customer_sessions s ON s.id = %s AND s.customer_id = c.id WHERE c.id = %s",
                      (sid or "", data.get("id"))).fetchone()
        if not r or r["session_ver"] != data.get("v"):
            raise HTTPException(401, "Please sign in again")
        if sid and (r["sid"] is None or r["ended_at"]):
            raise HTTPException(401, "You were signed out on this device. Please sign in again."
                                if r["end_reason"] == "revoked" else "Please sign in again")
        reason = _blocked_reason(r)
        if reason:
            raise HTTPException(403, reason)
        if not sid:
            # signed in before sessions existed: one session row per old cookie, then the new cookie carries it
            sid = "legacy-" + hashlib.sha256(token.encode()).hexdigest()[:24]
            dev, _ = act.device_id(request, DEV_COOKIE)
            c.execute("INSERT INTO customer_sessions (id, customer_id, device_id, device, user_agent, ip, last_ip) "
                      "VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
                      (sid, r["id"], dev, act.device_label(_ua(request)), _ua(request), _ip(request), _ip(request)))
            if response is not None:
                act.set_device_cookie(request, response, DEV_COOKIE, dev, "/app")
                _set_token(request, response, r, sid)
            r["sid"], r["device_id"] = sid, dev
        elif (datetime.now(timezone.utc) - r["last_seen"]).total_seconds() > SEEN_EVERY or r["last_ip"] != _ip(request):
            c.execute("UPDATE customer_sessions SET last_seen = now(), last_ip = %s WHERE id = %s", (_ip(request), sid))
        r["apps"] = c.execute(MODULES_SQL, (r["id"],)).fetchall()
    r["modules"] = {a["key"] for a in r["apps"]}
    return r


def customer(request: Request, response: Response):
    return _session(request, response)


def need(*mods):
    """Dependency: the customer must hold at least one of these applications (their roles — Admin → Access manager)."""
    def dep(c=Depends(customer)):
        if not c["modules"] & set(mods):
            raise HTTPException(403, NO_ACCESS, headers={"X-Access": "denied"})
        return c
    return dep


@app.post("/app/api/logout")
def logout(request: Request, response: Response):
    try:
        c = _session(request)
    except HTTPException:
        c = None
    if c:
        with pool.connection() as conn:
            conn.execute("UPDATE customer_sessions SET ended_at = now(), end_reason = 'signed_out' WHERE id = %s AND ended_at IS NULL",
                         (c["sid"],))
            act.log(conn, actor_kind="customer", actor_id=c["id"], actor_name=c["name"], session_id=c["sid"],
                    device_id=c["device_id"], device=act.device_label(_ua(request)), ip=_ip(request), app="customer", event="logout")
    response.delete_cookie(COOKIE, path="/app")
    return {"ok": True}


MAX_PINS = 6                                             # applications pinned to the side menu; the rest are under "More apps"


def _pins(conn, c):
    """The customer's pinned applications that their plan still allows; None = never chose (the app pins the first 6)."""
    r = conn.execute("SELECT pins FROM customer_prefs WHERE customer_id = %s", (c["id"],)).fetchone()
    return None if r is None else [k for k in r["pins"] if k in c["modules"]][:MAX_PINS]


@app.get("/app/api/me")
def me(c=Depends(customer)):
    with _own(c) as conn:
        roles = [x["name"] for x in conn.execute("SELECT r.name FROM customer_roles cr JOIN roles r ON r.id = cr.role_id "
                                                 "WHERE cr.customer_id = %s ORDER BY r.name", (c["id"],)).fetchall()]
        pins = _pins(conn, c)
    return {"name": c["name"], "email": c["email"], "expires_on": c["expires_on"].isoformat() if c["expires_on"] else None,
            "apps": [dict(a) for a in c["apps"]], "roles": roles, "pins": pins, "max_pins": MAX_PINS}


class PinsIn(BaseModel):
    pins: list[str]


@app.put("/app/api/pins")
def set_pins(body: PinsIn, request: Request, c=Depends(customer)):
    """Pin up to 6 of the customer's own applications to the side menu (order kept)."""
    _rate("pins", str(c["id"]), 60, 60)
    pins = list(dict.fromkeys(str(k) for k in body.pins))
    if any(k not in c["modules"] for k in pins):
        raise HTTPException(403, NO_ACCESS, headers={"X-Access": "denied"})
    if len(pins) > MAX_PINS:
        raise HTTPException(422, f"You can pin up to {MAX_PINS} apps — unpin one first")
    with _own(c) as conn:
        conn.execute("INSERT INTO customer_prefs (customer_id, pins, updated_at) VALUES (%s, %s, now()) "
                     "ON CONFLICT (customer_id) DO UPDATE SET pins = EXCLUDED.pins, updated_at = now()", (c["id"], pins))
    return {"pins": pins}


class ActivityIn(BaseModel):
    module: str
    kind: str = "open"                                   # open = the customer opened it · ping = still on it (every 60 s)


IST_DAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date"


@app.post("/app/api/activity")
def activity(body: ActivityIn, request: Request, c=Depends(customer)):
    """Which application the customer uses and for how long (Admin → Activity log)."""
    _rate("activity", str(c["id"]), 120, 60)
    if body.module not in c["modules"] or body.kind not in ("open", "ping"):
        raise HTTPException(403, NO_ACCESS, headers={"X-Access": "denied"})
    with pool.connection() as conn:
        if body.kind == "open":
            # the same application on the same device within 10 minutes counts as one visit
            seen = conn.execute("SELECT 1 FROM module_usage WHERE session_id = %s AND module = %s AND last_at > now() - interval '10 minutes'",
                                (c["sid"], body.module)).fetchone()
            if not seen:
                act.log(conn, actor_kind="customer", actor_id=c["id"], actor_name=c["name"], session_id=c["sid"],
                        device_id=c["device_id"], device=act.device_label(_ua(request)), ip=_ip(request),
                        app="customer", module=body.module, event="open")
            conn.execute(f"INSERT INTO module_usage (session_id, customer_id, module, day) VALUES (%s,%s,%s,{IST_DAY}) "
                         "ON CONFLICT (session_id, module, day) DO UPDATE SET last_at = now()", (c["sid"], c["id"], body.module))
        else:                                            # still on it: +1 minute, at most once every 50 s
            conn.execute(f"INSERT INTO module_usage (session_id, customer_id, module, day) VALUES (%s,%s,%s,{IST_DAY}) "
                         "ON CONFLICT (session_id, module, day) DO UPDATE SET last_at = now(), minutes = module_usage.minutes + 1 "
                         "WHERE module_usage.last_at < now() - interval '50 seconds'", (c["sid"], c["id"], body.module))
    return {"ok": True}


def _history_days(conn):
    """{date: {"open": row, "end": row}} — first scheduled run of the day = Day open, last = Day end
    (a day with one run: before noon = open, otherwise end)."""
    days = {}
    for r in conn.execute("SELECT snapshot_id, trade_date, taken_at FROM customer_history ORDER BY taken_at").fetchall():
        days.setdefault(r["trade_date"].isoformat(), []).append(r)
    out = {}
    for d, rows in days.items():
        if len(rows) == 1:
            local = rows[0]["taken_at"].astimezone(IST)
            out[d] = {"open" if local.hour < 12 else "end": rows[0]}
        else:
            out[d] = {"open": rows[0], "end": rows[-1]}
    return out


@app.get("/app/api/history")
def history(request: Request, c=Depends(need(*DATA_APPS))):
    """Past days the customer may pick (only when the admin has switched it on)."""
    _rate("history", _ip(request), 60, 60)
    with pool.connection() as conn:
        if not conn.execute("SELECT portal_history_enabled() AS v").fetchone()["v"]:
            return {"enabled": False, "days": []}
        days = _history_days(conn)
    return {"enabled": True, "days": [{"d": d, **{k: r["taken_at"].astimezone(IST).isoformat() for k, r in parts.items()}}
                                      for d, parts in sorted(days.items())]}


@app.get("/app/api/data")
def data(request: Request, date: str | None = None, part: str | None = None, c=Depends(need(*DATA_APPS))):
    if date or part:                                       # a past day, chosen in the date picker
        _rate("data-history", _ip(request), 60, 60)
        if part not in ("open", "end") or not date or len(date) != 10:
            raise HTTPException(422, "Pick a date and Day open or Day end")
        with pool.connection() as conn:
            if not conn.execute("SELECT portal_history_enabled() AS v").fetchone()["v"]:
                raise HTTPException(403, "Past days are not available right now.")
            row = _history_days(conn).get(date, {}).get(part)
            r = row and conn.execute("SELECT data_gz FROM customer_history WHERE snapshot_id = %s", (row["snapshot_id"],)).fetchone()
        if not r:
            raise HTTPException(404, "No data for that day — markets may have been closed.")
        return Response(content=bytes(r["data_gz"]), media_type="application/json",
                        headers={"Content-Encoding": "gzip", "Cache-Control": "private, no-store"})
    with pool.connection() as conn:
        r = conn.execute("SELECT data_gz, published_at FROM published ORDER BY id DESC LIMIT 1").fetchone()
    if not r:
        raise HTTPException(404, "No data has been published yet — please check back soon.")
    return Response(content=bytes(r["data_gz"]), media_type="application/json",
                    headers={"Content-Encoding": "gzip", "X-Published-At": r["published_at"].isoformat(),
                             "Cache-Control": "private, no-cache"})


PF_MAX = 500                                          # stocks per portfolio ("any number" — capped against abuse)
PF_SYM = re.compile(r"^[A-Z0-9&._-]{1,30}$")


class PortfolioIn(BaseModel):
    symbols: list[str]


@contextmanager
def _own(c):
    """One transaction with row-level security switched to this customer."""
    with pool.connection() as conn:
        conn.execute("SELECT set_config('hp.cid', %s, true)", (str(c["id"]),))
        yield conn


@app.get("/app/api/portfolio")
def portfolio_get(request: Request, c=Depends(need("portfolio"))):
    _rate("portfolio", _ip(request), 120, 60)
    with _own(c) as conn:
        r = conn.execute("SELECT symbols, updated_at FROM customer_portfolio WHERE customer_id = %s", (c["id"],)).fetchone()
    return {"symbols": list(r["symbols"]) if r else [], "updated_at": r["updated_at"].isoformat() if r else None}


@app.put("/app/api/portfolio")
def portfolio_put(body: PortfolioIn, request: Request, c=Depends(need("portfolio"))):
    _rate("portfolio", _ip(request), 120, 60)
    syms, seen = [], set()
    for s in body.symbols:
        s = str(s).strip().upper()
        if not PF_SYM.match(s):
            raise HTTPException(422, f"'{s[:30]}' is not a valid stock symbol")
        if s not in seen:
            seen.add(s); syms.append(s)
    if len(syms) > PF_MAX:
        raise HTTPException(422, f"A portfolio can hold up to {PF_MAX} stocks")
    with _own(c) as conn:
        conn.execute("INSERT INTO customer_portfolio (customer_id, symbols, updated_at) VALUES (%s, %s, now()) "
                     "ON CONFLICT (customer_id) DO UPDATE SET symbols = EXCLUDED.symbols, updated_at = now()", (c["id"], syms))
    return {"symbols": syms}


@app.get("/app/api/health")
def health():
    return {"ok": True}


# ─────────────────────────────── helpdesk ───────────────────────────────
def hd_customer(request: Request):
    hd.guard_ip(_ip(request))                     # before the session check and before any database work
    c = _session(request)
    return {"kind": "customer", "id": str(c["id"]), "name": c["name"], "staff": False}


@contextmanager
def _hd(actor):
    """One transaction with row-level security switched to this customer (see db._setup_portal_role)."""
    with pool.connection() as c:
        c.execute("SELECT set_config('hp.cid', %s, true)", (actor["id"],))
        yield c


class TicketIn(BaseModel):
    subject: str
    severity: str
    body: list


class MessageIn(BaseModel):
    body: list


@app.get("/app/api/helpdesk/tickets")
def hd_list(status: str = "open", a=Depends(hd_customer)):
    with _hd(a) as c:
        return hd.list_tickets(c, a, status)


@app.post("/app/api/helpdesk/tickets")
def hd_create(body: TicketIn, a=Depends(hd_customer)):
    with _hd(a) as c:
        return hd.create_ticket(c, a, body.subject, body.severity, body.body)


@app.get("/app/api/helpdesk/tickets/{tid}")
def hd_get(tid: int, a=Depends(hd_customer)):
    with _hd(a) as c:
        return hd.get_ticket(c, a, tid)


@app.post("/app/api/helpdesk/tickets/{tid}/messages")
def hd_reply(tid: int, body: MessageIn, a=Depends(hd_customer)):
    with _hd(a) as c:
        return hd.add_message(c, a, tid, body.body)


@app.post("/app/api/helpdesk/tickets/{tid}/close")
def hd_close(tid: int, a=Depends(hd_customer)):
    with _hd(a) as c:
        return hd.set_status(c, a, tid, "closed")


@app.get("/app/api/helpdesk/unread")
def hd_unread(a=Depends(hd_customer)):
    with _hd(a) as c:
        return hd.unread(c, a)


@app.get("/app/api/helpdesk/images/{iid}")
def hd_image(iid: int, a=Depends(hd_customer)):
    with _hd(a) as c:
        return hd.image(c, a, iid)
