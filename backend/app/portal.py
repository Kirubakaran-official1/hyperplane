"""
Hyperplane customer edition (/app) — a separate service from the admin / user API.

It logs in to the database as the restricted role `hp_portal`: it can read the published customer view and the
customers table, insert sign-ups (always 'pending') and update login counters — nothing else. It never sees
collections, signals, settings or config.ini, and it uses its own secret and cookie.
"""
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

from . import helpdesk as hd
from .security import DUMMY_HASH, hash_password, verify_password

DB_URL = os.environ.get("PORTAL_DATABASE_URL", "")
SECRET = os.environ.get("PORTAL_SECRET_KEY", "")
COOKIE, SESSION_SECONDS = "qf_session", 7 * 24 * 3600
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


def _start_session(request: Request, response: Response, r):
    token = _signer().dumps({"id": r["id"], "v": r["session_ver"]})
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, samesite="strict", secure=secure, path="/app")


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
    if r and r["status"] == "approved":
        _start_session(request, response, r)
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
        raise HTTPException(429, "Too many wrong passwords — please try again in 15 minutes")
    ok = verify_password(body.password, r["pw_hash"] if r else DUMMY_HASH) and bool(r)
    if not ok:
        if r:                                        # counted and committed before the error is returned
            fails = r["failed_logins"] + 1
            lock = now + timedelta(minutes=LOCK_MINUTES) if fails >= MAX_FAILS else None
            with pool.connection() as c:
                c.execute("UPDATE customers SET failed_logins = %s, locked_until = %s WHERE id = %s",
                          (0 if lock else fails, lock, r["id"]))
        time.sleep(0.6)
        raise HTTPException(401, "Email or password is wrong")
    reason = _blocked_reason(r)
    if reason:
        raise HTTPException(403, reason)
    with pool.connection() as c:
        c.execute("UPDATE customers SET failed_logins = 0, locked_until = NULL, last_login = now(), "
                  "login_count = login_count + 1 WHERE id = %s", (r["id"],))
    _start_session(request, response, r)
    return {"name": r["name"]}


def customer(request: Request):
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Please sign in")
    try:
        data = _signer().loads(token, max_age=SESSION_SECONDS)
    except (BadSignature, SignatureExpired):
        raise HTTPException(401, "Please sign in again")
    with pool.connection() as c:
        r = c.execute("SELECT id, name, email, status, expires_on, session_ver FROM customers WHERE id = %s",
                      (data.get("id"),)).fetchone()
    if not r or r["session_ver"] != data.get("v"):
        raise HTTPException(401, "Please sign in again")
    reason = _blocked_reason(r)
    if reason:
        raise HTTPException(403, reason)
    return r


@app.post("/app/api/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/app")
    return {"ok": True}


@app.get("/app/api/me")
def me(c=Depends(customer)):
    return {"name": c["name"], "email": c["email"], "expires_on": c["expires_on"].isoformat() if c["expires_on"] else None}


@app.get("/app/api/data")
def data(c=Depends(customer)):
    with pool.connection() as conn:
        r = conn.execute("SELECT data_gz, published_at FROM published ORDER BY id DESC LIMIT 1").fetchone()
    if not r:
        raise HTTPException(404, "No data has been published yet — please check back soon.")
    return Response(content=bytes(r["data_gz"]), media_type="application/json",
                    headers={"Content-Encoding": "gzip", "X-Published-At": r["published_at"].isoformat(),
                             "Cache-Control": "private, no-cache"})


@app.get("/app/api/health")
def health():
    return {"ok": True}


# ─────────────────────────────── helpdesk ───────────────────────────────
def hd_customer(request: Request):
    hd.guard_ip(_ip(request))                     # before the session check and before any database work
    c = customer(request)
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
