"""
Hyperplane customer edition (/app) — a separate service from the admin / user API.

It logs in to the database as the restricted role `hp_portal`: it can read the published customer view and the
customers table, insert sign-ups (always 'pending') and update login counters — nothing else. It never sees
collections, signals, settings or config.ini, and it uses its own secret and cookie.

Access manager: what a customer may open comes from their roles (Admin → 🔐 Access manager); the service only reads
them. Each sign-in is a row in customer_sessions (Admin can sign a device out); events and minutes per application go
to the activity log, which this service can write but never read.
"""
import gzip
import hashlib
import json
import logging
import math
import os
import re
import secrets
import time
import contextvars
from collections import OrderedDict, defaultdict, deque
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from pydantic import Field

from .safe import SafeModel

from . import activity as act
from . import adoption
from . import builder
from . import monitor
from . import signup_guard
from . import sip
from . import tracking
from . import helpdesk as hd
from . import inbox
from . import community as cm
from . import zerodha as zr
from . import planner as pl
from . import push
from . import vault
from .detail import DETAIL_DAYS
from .security import DUMMY_HASH, hash_password, verify_password

IST = timezone(timedelta(hours=5, minutes=30))          # day open / day end are judged on Indian time

DB_URL = os.environ.get("PORTAL_DATABASE_URL", "")
SECRET = os.environ.get("PORTAL_SECRET_KEY", "")
COOKIE, SESSION_SECONDS = "qf_session", 7 * 24 * 3600
DEV_COOKIE = "qf_dev"                                   # one id per browser / system (Activity log: devices per account)
SEEN_EVERY = 60                                         # seconds between session "last active" updates
DATA_APPS = ("research", "simple", "portfolio", "builder")   # applications that read the published data
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


# Past data (owner 2026-11-07, round 16): the day picked in the app travels as "X-HP-Day: YYYY-MM-DD.open|end". This holder is made
# per request here; _session() checks the customer holds research:history and finds the stored day (403 / 404 otherwise); then every
# _latest_view() / _latest_etf_view() of that request answers with that day's data. Changes to saved portfolios always use today's.
_DAY = contextvars.ContextVar("hp_day", default=None)
DAY_HDR = re.compile(r"^(\d{4}-\d{2}-\d{2})\.(open|end)$")
HIST_PERM = "research:history"
_hist = OrderedDict()                                            # snapshot_id → (stock view, ETF view)


@app.middleware("http")
async def _day(request: Request, call_next):
    tok = _DAY.set({"hdr": request.headers.get("x-hp-day"), "row": None})
    try:
        return await call_next(request)
    finally:
        _DAY.reset(tok)


def _check_day(c):
    """the day picked, checked for this customer (None = the latest published data)"""
    h = _DAY.get()
    if not h or not h["hdr"]:
        return None
    m = DAY_HDR.match(h["hdr"])
    if not m:
        raise HTTPException(422, "Pick a date and Day open or Day end")
    if HIST_PERM not in c["perms"]:
        raise HTTPException(403, "Past data is not part of your access.", headers={"X-Access": "denied"})
    with pool.connection() as conn:
        row = _history_days(conn).get(m[1], {}).get(m[2])
    if not row:
        raise HTTPException(404, "No data for that day — markets may have been closed.")
    h["row"] = row
    return row


def _day_row():
    h = _DAY.get()
    return h and h["row"]


def _hist_views(row):
    sid = (row["snapshot_id"], row.get("score_ver"))                 # round 24: a rescored day is a new entry
    if sid not in _hist:
        with pool.connection() as conn:
            r = conn.execute("SELECT data_gz, etf_gz FROM customer_history WHERE snapshot_id = %s", (sid[0],)).fetchone()
        if not r:
            raise HTTPException(404, "No data for that day")
        _hist[sid] = (json.loads(gzip.decompress(bytes(r["data_gz"]))), json.loads(gzip.decompress(bytes(r["etf_gz"]))) if r["etf_gz"] else None)
        while len(_hist) > 12:
            _hist.popitem(last=False)
    _hist.move_to_end(sid)
    return _hist[sid]


def _day_caps(row):
    """what a stored past day can serve: every day has the stock view (AI Mode, Deep Research, Analyser); the Builder and the SIP
    Builders need the zone view (stored from late Oct 2026 on); the ETF apps need that day's ETF file"""
    v, e = _hist_views(row)
    return {"zones": any(x.get("zv") for x in v.get("stocks", [])[:400]), "etf": bool(e)}


def _need_day(zones=False, etf=False):
    """a past day picked that cannot serve this application → a clear 422 (never an empty result)"""
    row = _day_row()
    if not row:
        return
    cap = _day_caps(row)
    if zones and not cap["zones"]:
        raise HTTPException(422, f"The data of {row['trade_date']:%d %b %Y} was collected before the zone view was stored, so this "
                                 "application cannot work on it. Pick 29 Oct 2026 or later.")
    if etf and not cap["etf"]:
        raise HTTPException(422, f"No ETF data is stored for {row['trade_date']:%d %b %Y}. Pick a day that has it.")


@app.exception_handler(RequestValidationError)
async def _bad_request(request: Request, exc: RequestValidationError):
    """a body that fails its type / length checks: one plain sentence (never the raw list of errors)"""
    return JSONResponse({"detail": "Please check what you entered and try again."}, status_code=422)


@app.middleware("http")
async def _headers(request: Request, call_next):
    # body-size cap (Caddy also caps it): helpdesk messages may carry images, everything else is tiny
    path = request.url.path                              # the Planner: a long note, or one pasted picture (≤ 2 MB) per request
    limit = 8_500_000 if path.startswith(("/app/api/helpdesk", "/app/api/community")) else 3_500_000 if path.startswith("/app/api/planner") else 64_000
    try:
        too_big = int(request.headers.get("content-length") or 0) > limit
    except ValueError:
        too_big = True
    if too_big:
        return JSONResponse({"detail": "This request is too large"}, status_code=413)
    t0 = time.perf_counter()
    resp = await call_next(request)
    ms = (time.perf_counter() - t0) * 1000
    if ms > 400 and request.url.path.startswith("/app/api"):          # round 18: which click was slow → docker compose logs portal | grep SLOW
        print(f"SLOW {ms:.0f} ms {request.method} {request.url.path}", flush=True)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers.setdefault("Cache-Control", "no-store")
    return resp


def _ip(request: Request):
    return request.client.host if request.client else "?"


_hits = defaultdict(deque)


_rate_calls = [0]


def _rate(bucket, key, limit, window):
    _rate_calls[0] += 1
    if _rate_calls[0] % 2000 == 0:                      # forget keys with nothing in the last hour (one per address / email ever seen would pile up)
        cut = time.time() - 3600
        for k in [k for k, v in _hits.items() if not v or v[-1] < cut]:
            _hits.pop(k, None)
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


class RegisterIn(SafeModel):
    name: str = Field("", max_length=200)
    email: str = Field("", max_length=400)
    phone: str = Field("", max_length=60)
    country: str = Field("", max_length=120)
    state: str = Field("", max_length=120)
    city: str = Field("", max_length=120)
    password: str = Field("", max_length=400)
    accept: bool = False


class LoginIn(SafeModel):
    email: str = Field("", max_length=400)
    password: str = Field("", max_length=400)


def _safe_email(raw):
    """an email typed on a sign-in / reset form → trimmed lower case, or None when it holds control / hidden characters or is absurdly long
    (a NUL byte would make the database driver fail with a 500; nothing like that reaches a query)"""
    v = (raw or "").strip().lower() if isinstance(raw, str) else ""
    return v if v and len(v) <= 254 and not signup_guard._bad_chars(v) and "@" in v else None


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
    # round 17c: every value is checked here, whatever the page did (signup_guard.validate_signup): Gmail only, no numbers in the name,
    # letters-only places, a real password, no hidden / control characters
    try:
        v = signup_guard.validate_signup(body.model_dump(), COUNTRIES, IN_STATES)
    except signup_guard.Invalid as e:
        raise HTTPException(422, str(e), headers={"X-Field": e.field})
    email, name, phone, country, state, city = v["email"], v["name"], v["phone"], v["country"], v["state"], v["city"]
    if not PHONE_RE.match(phone) or (phone.startswith("+91 ") and not IN_MOBILE_RE.match(phone)):
        raise HTTPException(422, "Please enter a valid mobile number — choose the country code and type the number (10 digits for India)",
                            headers={"X-Field": "phone"})
    if not body.accept:
        raise HTTPException(422, "Please accept the terms to continue", headers={"X-Field": "accept"})
    why = signup_guard.refuse(email, phone)                   # round 17: throw-away mail / impossible numbers are refused at once
    if why:
        raise HTTPException(422, why, headers={"X-Field": "phone" if "mobile" in why else "email"})
    flags = signup_guard.screen(name, email, phone)           # …look-alike-fake ones wait for the owner after the email is confirmed
    with pool.connection() as c:
        # always PENDING at insert (db trigger no longer approves): the account opens when its email is confirmed (mailer.py)
        r = c.execute("INSERT INTO customers (email, name, phone, country, state, city, pw_hash, signup_ip) "
                      "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (email) DO NOTHING "
                      "RETURNING id, name, status, session_ver",
                      (email, name, phone, country, state, city, hash_password(v["password"]), _ip(request))).fetchone()             if not _gmail_taken(c, email) else None
        if r:
            c.execute("SELECT portal_signup_start(%s, %s, %s)", (r["id"], secrets.token_urlsafe(32), flags))
            act.log(c, actor_kind="customer", actor_id=r["id"], actor_name=r["name"], device=act.device_label(_ua(request)),
                    ip=_ip(request), app="customer", event="signup", detail={"status": r["status"], "flags": flags} if flags else {"status": r["status"]})
    # same answer whether or not the email already existed
    return {"ok": True, "verify": True, "message": SIGNUP_SENT}


def _gmail_taken(c, email):
    """Gmail ignores dots: an address that differs only by dots is the same inbox — one account for it (the answer to the person stays the same)"""
    canon = signup_guard.canonical_gmail(email)
    return bool(c.execute("SELECT 1 FROM customers WHERE lower(replace(split_part(email, '@', 1), '.', '')) || '@' || split_part(email, '@', 2) = %s LIMIT 1",
                          (canon,)).fetchone())


COUNTRIES = ["India", "United Arab Emirates", "United States", "United Kingdom", "Singapore", "Saudi Arabia", "Qatar", "Kuwait", "Oman", "Bahrain",
             "Canada", "Australia", "Malaysia", "Germany", "Other"]
IN_STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
             "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand",
             "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
             "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"]
SIGNUP_SENT = ("Almost there! We've sent a link to your email — open it to confirm the address. Your account opens right after "
               "(we email you again). Check the spam folder too.")
VERIFY_DEAD = "This confirmation link has expired or was already used. Sign in to get a new one."


class VerifyIn(SafeModel):
    token: str = Field("", max_length=200)


class ResendIn(SafeModel):
    email: str = Field("", max_length=400)


@app.post("/app/api/signup/verify")
def signup_verify(body: VerifyIn, request: Request):
    """the link in the confirmation email (opened from /app/#verify=<token>; a POST, so a mail scanner's prefetch cannot use it up)"""
    _rate("verify", _ip(request), 20, 3600)
    if not TOKEN_RE.match(body.token or ""):
        raise HTTPException(422, VERIFY_DEAD)
    with pool.connection() as c:
        res = c.execute("SELECT portal_verify_email(%s) AS r", (body.token,)).fetchone()["r"]
    if res == "invalid":
        raise HTTPException(422, VERIFY_DEAD)
    if res == "approved":
        return {"ok": True, "status": "approved", "message": "Your email is confirmed and your account is ready. Sign in to start."}
    return {"ok": True, "status": "review", "message": "Your email is confirmed. We check every new account before it opens — "
                                                       "we'll email you as soon as yours is approved."}


@app.post("/app/api/signup/resend")
def signup_resend(body: ResendIn, request: Request):
    """send the confirmation link again (same answer whether or not the address has a waiting account)"""
    _rate("resend", _ip(request), 5, 3600)
    email = _safe_email(body.email)
    if not email:
        return {"ok": True, "message": "If this address is waiting to be confirmed, we've sent the link again. Check the spam folder too."}
    _rate("resend-mail", email, 3, 3600)
    if EMAIL_RE.match(email):
        with pool.connection() as c:
            c.execute("SELECT portal_signup_resend(%s, %s)", (email, secrets.token_urlsafe(32)))
    return {"ok": True, "message": "If this address is waiting to be confirmed, we've sent the link again. Check the spam folder too."}


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
    email = _safe_email(body.email)
    if email is None or not body.password or signup_guard._bad_chars(body.password):
        time.sleep(0.6)                                       # a refused value costs as much time as a wrong password
        time.sleep(0.6)
        raise HTTPException(401, "Email or password is wrong")
    with pool.connection() as c:
        r = c.execute("SELECT id, name, pw_hash, status, expires_on, session_ver, failed_logins, locked_until, email_verified_at "
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
        if r["status"] == "pending" and not r["email_verified_at"]:        # round 17: not confirmed yet → say so, with the resend button
            raise HTTPException(403, "Please confirm your email first — open the link we sent you. Didn't get it? Send it again.",
                                headers={"X-Verify": "1"})
        raise HTTPException(403, reason)
    with pool.connection() as c:
        c.execute("UPDATE customers SET failed_logins = 0, locked_until = NULL, last_login = now(), "
                  "login_count = login_count + 1 WHERE id = %s", (r["id"],))
    _start_session(request, response, r, "login")
    return {"name": r["name"]}


# ─── Forgot password (owner, 2026-11-02; mailer.py has the whole design). This service only calls three database
# functions; the worker sends the email. Every answer is the same whether or not the email has an account.
class ForgotIn(SafeModel):
    email: str = Field("", max_length=400)


class ResetCheckIn(SafeModel):
    token: str = Field("", max_length=200)


class ResetIn(SafeModel):
    token: str = Field("", max_length=200)
    password: str = Field("", max_length=400)


FORGOT_SENT = ("If an account exists for this email, we've sent a link to choose a new password. It works once and expires "
               "in 30 minutes. Check your spam folder too.")
RESET_DEAD = "This link has expired or was already used. Ask for a new one."
TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{30,64}$")


@app.post("/app/api/password/forgot")
def password_forgot(body: ForgotIn, request: Request):
    _rate("forgot", _ip(request), 5, 900)
    email = _safe_email(body.email)
    if not email or not EMAIL_RE.match(email):
        raise HTTPException(422, "Please enter a valid email address")
    _rate("forgot-email", email, 3, 3600)
    with pool.connection() as c:
        res = c.execute("SELECT portal_password_forgot(%s, %s, %s) AS r", (email, secrets.token_urlsafe(32), _ip(request))).fetchone()["r"]
    _log_attempt(request, "reset_requested", None, email, result=res)
    return {"ok": True, "message": FORGOT_SENT}


@app.post("/app/api/password/check")
def password_check(body: ResetCheckIn, request: Request):
    """is a reset link still usable (shown before the customer types a new password)"""
    _rate("reset-check", _ip(request), 20, 900)
    if not TOKEN_RE.match(body.token):
        return {"valid": False, "message": RESET_DEAD}
    with pool.connection() as c:
        who = c.execute("SELECT portal_password_check(%s) AS e", (body.token,)).fetchone()["e"]
    return {"valid": True, "email": who} if who else {"valid": False, "message": RESET_DEAD}


@app.post("/app/api/password/reset")
def password_reset(body: ResetIn, request: Request):
    _rate("reset", _ip(request), 10, 900)
    if (e := signup_guard.password_error(body.password)):
        raise HTTPException(422, e, headers={"X-Field": "password"})
    if not TOKEN_RE.match(body.token or ""):
        raise HTTPException(400, RESET_DEAD)
    with pool.connection() as c:
        r = c.execute("SELECT * FROM portal_password_reset(%s, %s)", (body.token, hash_password(body.password))).fetchone()
        if r:
            act.log(c, actor_kind="customer", actor_id=r["customer_id"], actor_name=r["name"], device=act.device_label(_ua(request)),
                    ip=_ip(request), app="customer", event="password_reset", detail={"by": "email link", "devices": r["devices"]})
    if not r:
        raise HTTPException(400, RESET_DEAD)
    return {"ok": True, "message": "Your password has been changed. Sign in with your new password."}


# what a customer may use = permissions.effective (roles + direct grants, on, not retired, requirement met):
# applications = their "<app>:view" permissions, perms = the extra actions inside them ("portfolio:detail" …)
MODULES_SQL = ("SELECT m.key, m.name, m.description FROM app_modules m WHERE EXISTS (SELECT 1 FROM effective_permissions e "
               "WHERE e.customer_id = %s AND e.key = m.key || ':view') ORDER BY m.sort, m.key")
PERMS_SQL = ("SELECT e.key, p.module FROM effective_permissions e JOIN app_permissions p ON p.key = e.key "
             "WHERE e.customer_id = %s AND p.action <> 'view'")


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
        perms = c.execute(PERMS_SQL, (r["id"],)).fetchall()
    r["modules"] = {a["key"] for a in r["apps"]}
    r["perms"] = {p["key"] for p in perms if p["module"] in r["modules"]}
    _check_day(r)                                                 # a past day picked: allowed for this customer?
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


def need_perm(perm):
    """Dependency: the customer's roles must hold this permission (application:action) and its application."""
    def dep(c=Depends(customer)):
        if perm not in c["perms"]:
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


MAX_PINS = 8                                             # applications pinned to the side menu (owner 2026-11-06: 8); the rest are under "More apps"


def _pins(conn, c):
    """The customer's pinned applications that their plan still allows; None = never chose (the app pins the first 6)."""
    r = conn.execute("SELECT pins FROM customer_prefs WHERE customer_id = %s", (c["id"],)).fetchone()
    return None if r is None else [k for k in r["pins"] if k in c["modules"]][:MAX_PINS]


@app.get("/app/api/me")
def me(c=Depends(customer)):
    with _own(c) as conn:
        roles = [x["name"] for x in conn.execute("SELECT r.name FROM customer_roles cr JOIN roles r ON r.id = cr.role_id "
                                                 "WHERE cr.customer_id = %s ORDER BY r.name", (c["id"],)).fetchall()]
        # direct grants (Admin → Access manager): shown in the account window as "extra access"
        grants = [{"name": g["name"], "app": g["app"], "until": g["expires_on"].isoformat() if g["expires_on"] else None}
                  for g in conn.execute("SELECT p.name, m.name AS app, g.expires_on FROM customer_permissions g "
                                        "JOIN app_permissions p ON p.key = g.permission JOIN app_modules m ON m.key = p.module "
                                        "WHERE g.customer_id = %s AND (g.expires_on IS NULL OR g.expires_on >= (now() AT TIME ZONE "
                                        "'Asia/Kolkata')::date) ORDER BY m.sort, p.sort", (c["id"],)).fetchall()]
        pins = _pins(conn, c)
        zr_key = conn.execute("SELECT key_fp, saved_at FROM zerodha_keys WHERE customer_id = %s", (c["id"],)).fetchone() \
            if any(p.endswith(":zerodha") for p in c["perms"]) else None
    return {"name": c["name"], "email": c["email"], "expires_on": c["expires_on"].isoformat() if c["expires_on"] else None,
            "apps": [dict(a) for a in c["apps"]], "roles": roles, "grants": grants, "perms": sorted(c["perms"]), "pins": pins, "max_pins": MAX_PINS,
            "zerodha": {"id": zr_key["key_fp"], "saved": zr_key["saved_at"].isoformat()} if zr_key else None}


class PinsIn(SafeModel):
    pins: list[str]


@app.put("/app/api/pins")
def set_pins(body: PinsIn, request: Request, c=Depends(customer)):
    """Pin up to MAX_PINS (8) of the customer's own applications to the side menu (order kept)."""
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


class ActivityIn(SafeModel):
    module: str
    kind: str = "open"                                   # open = the customer opened it · ping = still on it (every 60 s)
    action: str | None = None                            # kind "action": a key action (adoption.ACTIONS), e.g. "stock_card"


IST_DAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date"


@app.post("/app/api/activity")
def activity(body: ActivityIn, request: Request, c=Depends(customer)):
    """Which application the customer uses and for how long (Admin → Activity log)."""
    _rate("activity", str(c["id"]), 120, 60)
    if body.module not in c["modules"] or body.kind not in ("open", "ping", "action"):
        raise HTTPException(403, NO_ACCESS, headers={"X-Access": "denied"})
    if body.kind == "action":                            # adoption: only the known key actions of that application
        if body.action not in adoption.ACTIONS.get(body.module, {}) or (body.module, body.action) in adoption.SERVER_ACTIONS:
            raise HTTPException(403, "Unknown action")
        with pool.connection() as conn:
            adoption.action(conn, c["id"], body.module, body.action)
        return {"ok": True}
    with pool.connection() as conn:
        if body.kind == "open":
            # the same application on the same device within 10 minutes counts as one visit
            seen = conn.execute("SELECT 1 FROM module_usage WHERE session_id = %s AND module = %s AND last_at > now() - interval '10 minutes'",
                                (c["sid"], body.module)).fetchone()
            if not seen:
                act.log(conn, actor_kind="customer", actor_id=c["id"], actor_name=c["name"], session_id=c["sid"],
                        device_id=c["device_id"], device=act.device_label(_ua(request)), ip=_ip(request),
                        app="customer", module=body.module, event="open")
                adoption.visit(conn, c["id"], body.module)
            new = conn.execute(f"INSERT INTO module_usage (session_id, customer_id, module, day) VALUES (%s,%s,%s,{IST_DAY}) "
                               "ON CONFLICT (session_id, module, day) DO UPDATE SET last_at = now() RETURNING (xmax = 0) AS inserted",
                               (c["sid"], c["id"], body.module)).fetchone()
            if new and new["inserted"]:                  # a new usage row starts at 1 minute: adoption counts it the same way
                adoption.minute(conn, c["id"], body.module)
        else:                                            # still on it: +1 minute, at most once every 50 s
            counted = conn.execute(f"INSERT INTO module_usage (session_id, customer_id, module, day) VALUES (%s,%s,%s,{IST_DAY}) "
                                   "ON CONFLICT (session_id, module, day) DO UPDATE SET last_at = now(), minutes = module_usage.minutes + 1 "
                                   "WHERE module_usage.last_at < now() - interval '50 seconds' RETURNING 1",
                                   (c["sid"], c["id"], body.module)).fetchone()
            if counted:
                adoption.minute(conn, c["id"], body.module)
    return {"ok": True}


def _history_days(conn):
    """{date: {"open": row, "end": row}} — first scheduled run of the day = Day open, last = Day end
    (a day with one run: before noon = open, otherwise end)."""
    days = {}
    for r in conn.execute("SELECT snapshot_id, trade_date, taken_at, score_ver FROM customer_history ORDER BY taken_at").fetchall():
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
    if HIST_PERM not in c["perms"]:                                # round 16: a permission (Customer Admin), not the admin switch
        return {"enabled": False, "days": []}
    with pool.connection() as conn:
        days = _history_days(conn)
    return {"enabled": True, "days": [{"d": d, **{k: r["taken_at"].astimezone(IST).isoformat() for k, r in parts.items()},
                                       **_day_caps(parts.get("end") or parts.get("open"))} for d, parts in sorted(days.items())]}


@app.get("/app/api/data")
def data(request: Request, date: str | None = None, part: str | None = None, c=Depends(need(*DATA_APPS))):
    if not (date or part) and _day_row():                         # the day picked travels in the header too (round 16)
        date, part = _DAY.get()["hdr"].split(".")
    if date or part:                                       # a past day, chosen in the date picker
        _rate("data-history", _ip(request), 60, 60)
        if part not in ("open", "end") or not date or len(date) != 10:
            raise HTTPException(422, "Pick a date and Day open or Day end")
        if HIST_PERM not in c["perms"]:
            raise HTTPException(403, "Past data is not part of your access.", headers={"X-Access": "denied"})
        with pool.connection() as conn:
            row = _history_days(conn).get(date, {}).get(part)
            htag = row and f'W/"h{row["snapshot_id"]}-{row["score_ver"]}"'
            if row and request.headers.get("if-none-match") == htag:
                return Response(status_code=304, headers={"ETag": htag, "Cache-Control": "private, no-cache"})
            r = row and conn.execute("SELECT data_gz FROM customer_history WHERE snapshot_id = %s", (row["snapshot_id"],)).fetchone()
        if not r:
            raise HTTPException(404, "No data for that day — markets may have been closed.")
        return Response(content=bytes(r["data_gz"]), media_type="application/json",
                        headers={"Content-Encoding": "gzip", "ETag": htag, "Cache-Control": "private, no-cache"})
    # latest view: a browser that already holds this publish gets "304 Not Modified" (no 180 KB download again)
    with pool.connection() as conn:
        head = conn.execute("SELECT id, published_at, rev FROM published ORDER BY id DESC LIMIT 1").fetchone()
        if not head:
            raise HTTPException(404, "No data has been published yet — please check back soon.")
        etag = f'W/"p{head["id"]}-{head["rev"]}"'
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "private, no-cache"})
        r = conn.execute("SELECT data_gz FROM published WHERE id = %s", (head["id"],)).fetchone()
    return Response(content=bytes(r["data_gz"]), media_type="application/json",
                    headers={"Content-Encoding": "gzip", "X-Published-At": head["published_at"].isoformat(),
                             "ETag": etag, "Cache-Control": "private, no-cache"})


@app.get("/app/api/etf")
def etf_data(request: Request, c=Depends(need("etf"))):
    if _day_row():                                                # a past day picked (round 16): that day's ETF view
        e = _hist_views(_day_row())[1]
        if not e:
            raise HTTPException(404, "No ETF data is stored for that day.")
        return e
    """ETF analyser (owner, 2026-11-06): the latest published ETF summary — strength + Recommended only (app/etf.py)."""
    with pool.connection() as conn:
        head = conn.execute("SELECT id, published_at, rev FROM published WHERE etf_gz IS NOT NULL ORDER BY id DESC LIMIT 1").fetchone()
        if not head:
            raise HTTPException(404, "ETF data will appear after the next update — please check back soon.")
        etag = f'W/"e{head["id"]}-{head["rev"]}"'
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "private, no-cache"})
        r = conn.execute("SELECT etf_gz FROM published WHERE id = %s", (head["id"],)).fetchone()
    return Response(content=bytes(r["etf_gz"]), media_type="application/json",
                    headers={"Content-Encoding": "gzip", "ETag": etag, "Cache-Control": "private, no-cache"})


PF_MAX = 500                                         # stocks per portfolio ("any number" — capped against abuse)
PF_SYM = re.compile(r"^[A-Z0-9&._-]{1,30}$")


class PortfolioIn(SafeModel):
    symbols: list[str]


@contextmanager
def _own(c):
    """One transaction with row-level security switched to this customer."""
    with pool.connection() as conn:
        conn.execute("SELECT set_config('hp.cid', %s, true)", (str(c["id"]),))
        yield conn


# ── ETF Analyser basket (round 23, owner 2026-11-15: "move the ETF to the basket, then the basket to the analyser like the AI stock
# analyser"): the customer's own list of ETFs (symbols only), kept on the server like the Analyser list — own row only (RLS)
ETF_BASKET_MAX = 30


class EtfBasketIn(SafeModel):
    symbols: list[str]


@app.get("/app/api/etf/basket")
def etf_basket_get(c=Depends(need("etf"))):
    _rate("etf-basket", str(c["id"]), 120, 60)
    with _own(c) as conn:
        r = conn.execute("SELECT symbols, updated_at FROM customer_etf_basket WHERE customer_id = %s", (c["id"],)).fetchone()
    return {"symbols": list(r["symbols"]) if r else [], "updated_at": r["updated_at"].isoformat() if r else None, "max": ETF_BASKET_MAX}


@app.put("/app/api/etf/basket")
def etf_basket_put(body: EtfBasketIn, c=Depends(need("etf"))):
    """the basket, replaced as a whole: today's ETFs only, each once, at most ETF_BASKET_MAX"""
    _rate("etf-basket", str(c["id"]), 120, 60)
    known = {x["s"] for x in (_latest_etf_view(today=True) or {}).get("etfs", [])}
    syms = list(dict.fromkeys(str(s or "").strip().upper() for s in body.symbols))
    if len(syms) > ETF_BASKET_MAX:
        raise HTTPException(422, f"A basket holds up to {ETF_BASKET_MAX} ETFs")
    bad = next((s for s in syms if not PF_SYM.match(s) or s not in known), None)
    if bad is not None:
        raise HTTPException(422, f"{bad[:30] or 'That'} is not an ETF in today's data")
    with _own(c) as conn:
        conn.execute("INSERT INTO customer_etf_basket (customer_id, symbols, updated_at) VALUES (%s, %s, now()) "
                     "ON CONFLICT (customer_id) DO UPDATE SET symbols = EXCLUDED.symbols, updated_at = now()", (c["id"], syms))
        if syms:
            adoption.action(conn, c["id"], "etf", "basket")
    return {"symbols": syms, "max": ETF_BASKET_MAX}


class EtfSipIn(SafeModel):
    symbols: list[str]
    amount: float
    freq: str = "month"
    years: int = 10
    weights: dict | None = None                                  # {symbol: whole %} adding up to 100; None = an equal share each


@app.post("/app/api/etf/basket/sip")
def etf_basket_sip(body: EtfSipIn, c=Depends(need("etf"))):
    """round 23: a SIP of the basket (sip.build_basket) — saved as an AI ETF SIP, so it needs that application too"""
    if "sip" not in c["modules"]:
        raise HTTPException(403, NO_ACCESS, headers={"X-Access": "denied"})
    _need_day(etf=True)
    _rate("sip", str(c["id"]), 30, 60)
    try:
        return sip.build_basket(_latest_etf_view(), body.amount, body.freq, body.years, body.symbols, body.weights)
    except sip.SipError as e:
        raise HTTPException(422, str(e))


@app.get("/app/api/portfolio")
def portfolio_get(request: Request, c=Depends(need("portfolio"))):
    _rate("portfolio", _ip(request), 120, 60)
    with _own(c) as conn:
        r = conn.execute("SELECT symbols, updated_at, alerts FROM customer_portfolio WHERE customer_id = %s", (c["id"],)).fetchone()
    return {"symbols": list(r["symbols"]) if r else [], "updated_at": r["updated_at"].isoformat() if r else None,
            "alerts": bool(r and r["alerts"])}


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
        old = conn.execute("SELECT symbols FROM customer_portfolio WHERE customer_id = %s", (c["id"],)).fetchone()
        gone = [s for s in (old["symbols"] if old else []) if s not in seen]
        came = [s for s in syms if s not in set(old["symbols"] if old else [])]
        if gone:                                                    # inbox: a flagged stock taken off the list is settled
            inbox.settle(conn, c["id"], "portfolio", None,
                         {s: ({"how": "swapped", "in": came[0]} if len(gone) == 1 and len(came) == 1 else {"how": "removed"}) for s in gone})
        conn.execute("INSERT INTO customer_portfolio (customer_id, symbols, updated_at) VALUES (%s, %s, now()) "
                     "ON CONFLICT (customer_id) DO UPDATE SET symbols = EXCLUDED.symbols, updated_at = now()", (c["id"], syms))
        if syms:
            adoption.action(conn, c["id"], "portfolio", "list_saved")          # adoption: the Analyser list was saved
    return {"symbols": syms}


class BuilderIn(SafeModel):
    amount: float
    count: int
    alloc: dict
    reliability: list[str]
    sector_max: int = builder.DEFAULT_SECTOR
    weighting: str = builder.DEFAULT_WEIGHTING
    opts: dict = {}                                       # "More options": horizon, quality, confirmed, stock_max, …


class PreviewIn(SafeModel):
    reliability: list[str] = ["S"]
    opts: dict = {}


_latest = {"id": None, "data": None}                   # the latest published view, parsed once per publish


def _latest_view(today=False):
    """the stock view: the day picked (past data, round 16) unless today=True, else the latest publish"""
    if not today and _day_row():
        return _hist_views(_day_row())[0]
    with pool.connection() as conn:
        r = conn.execute("SELECT id, rev FROM published ORDER BY id DESC LIMIT 1").fetchone()
        if not r:
            raise HTTPException(404, "No data has been published yet — please check back soon.")
        if (r["id"], r["rev"]) != _latest["id"]:                         # round 24: rescored in place = rev + 1
            g = conn.execute("SELECT data_gz FROM published WHERE id = %s", (r["id"],)).fetchone()
            _latest.update(id=(r["id"], r["rev"]), data=json.loads(gzip.decompress(bytes(g["data_gz"]))))
    return _latest["data"]


DETAIL_SYM = re.compile(r"^[A-Z0-9&._-]{1,30}$")


@app.get("/app/api/detail/{symbol}")
def stock_detail(symbol: str, request: Request, response: Response, app_key: str = "portfolio", date: str | None = None,
                 part: str | None = None):
    """Stock detail view (customer admin): everything behind one stock's result for the day on screen. Permission
    "<application>:detail" (portfolio / builder), checked here AND by the database (row-level security on stock_detail).
    Every look is written to the activity log."""
    if app_key not in ("portfolio", "builder", "msip"):                # round 19k: the Momentum SIP has its own detail permission
        raise HTTPException(422, "Unknown application")
    c = need_perm(f"{app_key}:detail")(_session(request, response))
    _rate("detail", str(c["id"]), 120, 60)
    sym = symbol.strip().upper()
    if not DETAIL_SYM.match(sym):
        raise HTTPException(422, "Not a stock symbol")
    with _own(c) as conn:
        if date or part:
            row = _history_days(conn).get(date or "", {}).get(part or "")
            sid = row and row["snapshot_id"]
        else:
            head = conn.execute("SELECT snapshot_id FROM published ORDER BY id DESC LIMIT 1").fetchone()
            sid = head and head["snapshot_id"]
        rows = {r["symbol"]: json.loads(gzip.decompress(bytes(r["data_gz"]))) for r in conn.execute(
            "SELECT symbol, data_gz FROM stock_detail WHERE snapshot_id = %s AND symbol IN (%s, '~meta')", (sid, sym)).fetchall()} if sid else {}
        act.log(conn, actor_kind="customer", actor_id=c["id"], actor_name=c["name"], session_id=c["sid"], device_id=c["device_id"],
                device=act.device_label(_ua(request)), ip=_ip(request), app="customer", module=app_key, event="detail",
                detail={"symbol": sym, **({"date": date, "part": part} if date else {})})
    if "~meta" not in rows:
        raise HTTPException(404, f"The detail view is not stored for this day (it is kept for the last {DETAIL_DAYS} days).")
    if sym not in rows:
        raise HTTPException(404, f"{sym} has no detail for this day.")
    return {"meta": rows["~meta"], "stock": rows[sym]}


def builder_tier(c):
    """the customer's builder plan from their permissions (Access manager): admin > trader > customer (everyone)"""
    return "admin" if "builder:admin" in c["perms"] else "trader" if "builder:trader" in c["perms"] else "customer"


@app.get("/app/api/builder/plan")
def portfolio_builder_plan(c=Depends(need("builder"))):
    """the limits and standard settings of the customer's builder plan (the form shows them; the server enforces them)"""
    return builder.plan_info(builder_tier(c))


@app.post("/app/api/builder")
def portfolio_builder(body: BuilderIn, request: Request, c=Depends(need("builder"))):
    """Hyperplane AI Portfolio Builder: a model portfolio from the latest published data (builder.py), within the
    customer's builder plan — checked here whatever the client sends."""
    _need_day(zones=True)
    _rate("builder", str(c["id"]), 30, 60)
    tier = builder_tier(c)
    try:
        res = builder.build(_latest_view(), body.amount, body.count, body.alloc, body.reliability, body.sector_max, body.weighting,
                            body.opts, tier=tier)
    except builder.PlanError as e:
        raise HTTPException(403, str(e), headers={"X-Plan": tier})
    except builder.BuildError as e:
        raise HTTPException(422, str(e))
    with pool.connection() as conn:
        adoption.action(conn, c["id"], "builder", "build")                      # adoption: a portfolio was built
    return res


_latest_etf = {"id": None, "data": None}               # the latest published ETF summary, parsed once per publish


def _latest_etf_view(today=False):
    """the ETF summary of the latest publish that has one (None when ETFs were never published); the day picked when there is one"""
    if not today and _day_row():
        return _hist_views(_day_row())[1]
    with pool.connection() as conn:
        r = conn.execute("SELECT id, rev FROM published WHERE etf_gz IS NOT NULL ORDER BY id DESC LIMIT 1").fetchone()
        if not r:
            return None
        if (r["id"], r["rev"]) != _latest_etf["id"]:
            g = conn.execute("SELECT etf_gz FROM published WHERE id = %s", (r["id"],)).fetchone()
            _latest_etf.update(id=(r["id"], r["rev"]), data=json.loads(gzip.decompress(bytes(g["etf_gz"]))))
    return _latest_etf["data"]


class SipIn(SafeModel):                                          # AI ETF SIP Builder (Reliable): ETFs only
    amount: float
    freq: str = "month"
    opts: dict = {}                                              # gold %, index cap mix, number of ETFs (6 … 20)
    years: int = 10


class MsipIn(SafeModel):                                         # AI Momentum SIP (Risk): stocks only
    amount: float
    freq: str = "month"
    rel: list[str] = ["S"]
    mix: dict = {"Large": 70, "Mid": 15, "Small": 15}
    count: int | None = None
    years: int = 10
    opts: dict | None = None                                     # the Builder's More options (Admin level only)
    sector_max: int | None = None


def msip_tier(c):
    """the customer's Momentum SIP level from their permissions (Access manager): admin > customer (everyone)"""
    return "admin" if "msip:admin" in c["perms"] else "customer"


class SavedIn(SafeModel):
    kind: str = "sip"                                            # sip | msip | builder | analyser | etf
    name: str
    inputs: dict
    holdings: list
    alerts: bool = False


class SavedPatch(SafeModel):
    alerts: bool | None = None
    name: str | None = None
    visibility: str | None = None                                # private | public (public needs the application's :share permission)
    reminder_day: int | None = Field(None, ge=0, le=28)          # round 21: a SIP's monthly reminder day (0 = off)


@app.get("/app/api/sip/info")
def sip_info(c=Depends(need("sip"))):
    """AI ETF SIP Builder form: limits, defaults, the core index ETFs, how many themes / diversifiers qualify today"""
    _need_day(zones=True, etf=True)
    return sip.info(_latest_view(), _latest_etf_view())


@app.get("/app/api/msip/info")
def msip_info(c=Depends(need("msip"))):
    """AI Momentum SIP form: limits of the customer's level, how many stocks pass today per reliability, the recommended
    count rule"""
    _need_day(zones=True)
    view = _latest_view()
    return {**sip.info(view, _latest_etf_view()), "plan": sip.msip_plan(msip_tier(c)),
            "sectors": sorted({x["sec"] for x in view.get("stocks", []) if x.get("sec")})}


@app.post("/app/api/msip")
def msip_build(body: MsipIn, c=Depends(need("msip"))):
    """AI Momentum SIP (sip.build_stock) on the latest published stock view — limits checked here"""
    _need_day(zones=True)
    _rate("sip", str(c["id"]), 30, 60)
    try:
        res = sip.build_stock(_latest_view(), body.amount, body.freq, body.rel, body.mix, body.count, body.years, body.opts,
                              body.sector_max, msip_tier(c))
    except sip.SipPlanError as e:
        raise HTTPException(403, str(e))
    except sip.SipError as e:
        raise HTTPException(422, str(e))
    with pool.connection() as conn:
        adoption.action(conn, c["id"], "msip", "build")
    return res


@app.post("/app/api/sip")
def sip_build(body: SipIn, c=Depends(need("sip"))):
    """AI ETF SIP Builder (sip.build_etf) on the latest published ETF summary — ETFs only, limits checked here"""
    _need_day(zones=True, etf=True)
    _rate("sip", str(c["id"]), 30, 60)
    try:
        res = sip.build_etf(_latest_view(), _latest_etf_view(), body.amount, body.freq, body.opts, body.years)
    except sip.SipError as e:
        raise HTTPException(422, str(e))
    with pool.connection() as conn:
        adoption.action(conn, c["id"], "sip", "build")
    return res


# ── saved plans: Momentum SIPs and Portfolio Builder portfolios (owner 2026-11-06: save, check, adjust, alerts) ──
SAVED_KINDS = {"sip": "sip", "msip": "msip", "builder": "builder", "analyser": "portfolio", "etf": "etf"}   # kind → the application it needs
SAVED_TAG = {"sip": "AI ETF SIP Builder", "msip": "AI Momentum SIP Builder", "builder": "Portfolio Builder", "analyser": "AI Portfolio Analyser",
             "etf": "ETF Analyser"}
BASKET_SIP_TAG = "ETF Analyser · SIP"                            # round 23: a SIP made from an ETF Analyser basket (kind sip, inputs.src etf)
SAVED_COLS = "id, kind, name, inputs, holdings, alerts, state, created_at, refreshed_at, saved_on, versions, share_id, visibility, reminder_day"
SHARE_PERM = {"sip": "sip:share", "msip": "msip:share", "builder": "builder:share", "analyser": "portfolio:share", "etf": "etf:share"}   # who may make one public
SHARE_CODE = re.compile(r"^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$")       # db.hp_share_id()
SAVED_KEEP = ("kind", "sleeve", "role", "s", "n", "grp", "cap", "sec", "k", "u", "units", "every", "slice", "p", "amt", "qty")


HOLD_MAX = {"sip": 60, "msip": 2000, "builder": 1000, "analyser": 1000, "etf": 60}
HOLD_NUM = (("units", 0, 1e7), ("qty", 0, 1e9), ("every", 1, 12), ("slice", 0, 1e13), ("amt", 0, 1e13))
HOLD_ROLE, HOLD_SLEEVE = (None, "core", "theme", "diversifier", "commodity"), (None, "index", "stock", "commodity")


def _clean_holdings(kind, holdings, inputs, c, legacy=False):
    """the holdings of a saved portfolio, as the server accepts them: known symbols only (today's published stocks / ETFs), each once,
    the right kind for the application, numbers that are finite and in range, names and prices from the server (never the client),
    and the total inside the plan's amount (and so inside the customer's level, checked on the inputs)"""
    if not isinstance(holdings, list) or not holdings or len(holdings) > HOLD_MAX.get(kind, 1000):
        raise HTTPException(422, "That plan cannot be saved")
    stocks = {x["s"]: x for x in _latest_view().get("stocks", [])}
    etfs = {x["s"]: x for x in (_latest_etf_view() or {}).get("etfs", [])} if kind in ("sip", "etf") else {}
    kinds = ("etf", "stock") if legacy else {"sip": ("etf",), "msip": ("stock",), "builder": ("stock",), "analyser": ("stock",), "etf": ("etf",)}[kind]
    out, seen = [], set()
    for h in holdings:
        if not isinstance(h, dict) or h.get("kind") not in kinds:
            raise HTTPException(422, "That plan cannot be saved")
        sym = str(h.get("s") or "")
        ref = (stocks if h["kind"] == "stock" else etfs).get(sym)
        if not PF_SYM.match(sym) or sym in seen or not ref:
            raise HTTPException(422, f"{sym[:30] or 'A holding'} is not in today's data")
        seen.add(sym)
        row = {k: h.get(k) for k in SAVED_KEEP if isinstance(h.get(k), (str, int, float)) and not isinstance(h.get(k), bool) or h.get(k) is None}
        for k, lo, hi in HOLD_NUM:
            v = row.get(k)
            if v is not None and (not isinstance(v, (int, float)) or not math.isfinite(v) or not lo <= v <= hi):
                raise HTTPException(422, "That plan cannot be saved")
        if row.get("role") not in HOLD_ROLE or row.get("sleeve") not in HOLD_SLEEVE:
            raise HTTPException(422, "That plan cannot be saved")
        row.update(s=sym, kind=h["kind"], n=ref.get("n"), p=ref.get("p"))
        if h["kind"] == "stock":
            row.update(cap=ref.get("cap"), sec=ref.get("sec"))
        else:
            row.update(u=ref.get("u"), k=ref.get("k"))
        row["grp"] = str(row.get("grp") or "")[:40] or None
        out.append(row)
    amount = float((inputs or {}).get("amount") or 0)
    if kind in ("sip", "msip") and sum(float(r.get("amt") or 0) for r in out) > amount * 1.25 + 1:
        raise HTTPException(422, "The holdings add up to more than the plan's amount")
    if kind == "builder" and sum(float(r.get("qty") or 0) * float(r.get("p") or 0) for r in out) > amount * 1.10 + max(float(r.get("p") or 0) for r in out):
        raise HTTPException(422, "The holdings add up to more than the plan's amount")
    return out


def _saved_need(c, kind):
    if kind not in SAVED_KINDS or SAVED_KINDS[kind] not in c["modules"]:
        raise HTTPException(403, NO_ACCESS, headers={"X-Access": "denied"})


def _saved_row(conn, c, sid):
    r = conn.execute(f"SELECT {SAVED_COLS} FROM customer_sips WHERE id = %s AND customer_id = %s", (sid, c["id"])).fetchone()
    if not r:
        raise HTTPException(404, "That saved plan was not found")
    _saved_need(c, r["kind"])
    return r


def _tag_of(r):
    return BASKET_SIP_TAG if r["kind"] == "sip" and (r["inputs"] or {}).get("src") == "etf" else SAVED_TAG.get(r["kind"])


def _saved_out(r, c=None):
    return {"id": r["id"], "kind": r["kind"], "tag": _tag_of(r), "name": r["name"], "inputs": r["inputs"], "holdings": r["holdings"],
            "code": r["share_id"], "visibility": r["visibility"],
            "can_share": bool(c) and SHARE_PERM.get(r["kind"]) in c["perms"],
            "alerts": r["alerts"], "reminder_day": r.get("reminder_day"), "created_at": r["created_at"].isoformat(), "saved_on": r["saved_on"].isoformat() if r["saved_on"] else None,
            "changes": max(0, len(r["versions"] or []) - 1),
            "refreshed_at": r["refreshed_at"].isoformat() if r["refreshed_at"] else None}


def _rel_of(r):
    i = r["inputs"] or {}
    return i.get("rel") or i.get("reliability") or ["S"]


@app.get("/app/api/saved")
def saved_list(kind: str = "sip", spark: bool = False, c=Depends(customer)):
    """the customer's saved portfolios of one kind, or kind=all (every kind their applications allow), newest first;
    spark=1 adds today's return and a small line per portfolio (tracking.spark, cached)"""
    kinds = [k for k, m in SAVED_KINDS.items() if m in c["modules"]] if kind == "all" else [kind]
    if kind != "all":
        _saved_need(c, kind)
    if not kinds:
        return []
    _rate("saved-list", str(c["id"]), 60, 60)
    basket = kind == "etf" and "sip" in c["modules"]                 # round 23: the ETF Analyser's list holds its basket SIPs too
    with _own(c) as conn:
        rows = conn.execute(f"SELECT {SAVED_COLS} FROM customer_sips WHERE customer_id = %s AND (kind = ANY(%s) "
                            "OR (%s AND kind = 'sip' AND inputs->>'src' = 'etf')) ORDER BY id DESC", (c["id"], kinds, basket)).fetchall()
        out = [_saved_out(r, c) for r in rows]
        for o, r in zip(out, rows):
            o["watch"] = len(_watch_syms(r))
        if spark:
            for o, r in zip(out, rows):
                try:
                    o["track"] = tracking.spark(conn, r)
                except Exception:                                  # noqa: BLE001 — a card without its line, never a failed list
                    o["track"] = None
    return out


@app.post("/app/api/saved")
def saved_add(body: SavedIn, c=Depends(customer)):
    """save a SIP or a Builder portfolio (up to sip.MAX_SAVED of each); the holdings are kept as plain values"""
    _saved_need(c, body.kind)
    _rate("saved", str(c["id"]), 20, 60)
    name = " ".join(str(body.name or "").split())[:60] or ("My SIP" if body.kind in ("sip", "msip") else "My portfolio")
    i = body.inputs or {}
    try:
        if body.kind == "sip" and i.get("basket"):                # round 23: a SIP of an ETF Analyser basket (equal / chosen shares)
            a, f, y, syms, w = sip.check_basket(i.get("amount"), i.get("freq"), i.get("years", 10),
                                                [h.get("s") for h in body.holdings if isinstance(h, dict)], i.get("weights"))
            if "etf" not in c["modules"]:
                raise HTTPException(403, NO_ACCESS, headers={"X-Access": "denied"})
            g = round(sum(float(h.get("amt") or 0) for h in body.holdings if isinstance(h, dict) and h.get("role") == "commodity")
                      / max(1.0, sum(float(h.get("amt") or 0) for h in body.holdings if isinstance(h, dict))) * 100)
            inputs = {"amount": a, "freq": f, "years": y, "stepup": 0, "basket": True, "src": "etf",
                      "alloc": {"index": 100 - g, "stock": 0, "commodity": g}, **({"weights": w} if w else {})}
        elif body.kind == "sip" and "opts" in i:                  # AI ETF SIP Builder (ETFs)
            a, f, o, y = sip.check_etf(i.get("amount"), i.get("freq"), i.get("opts"), i.get("years", 10))
            inputs = {"amount": a, "freq": f, "opts": o, "stepup": 0, "years": y, "alloc": {"index": 100 - o["gold"], "stock": 0, "commodity": o["gold"]}}
        elif body.kind == "sip":                                  # a combined plan from before the split
            args = sip.check(i.get("amount"), i.get("freq"), i.get("alloc"), i.get("rel", ["S"]), i.get("mix"), i.get("count"),
                             i.get("stepup", 0), i.get("years", 10))
            inputs = dict(zip(("amount", "freq", "alloc", "rel", "mix", "count", "stepup", "years"), args))
        elif body.kind == "msip":                                 # AI Momentum SIP (stocks)
            a, f, r_, m_, n_, y, o_, sm = sip.check_stock(i.get("amount"), i.get("freq"), i.get("rel", ["S"]), i.get("mix"), i.get("count"),
                                                          i.get("years", 10), i.get("opts"), i.get("sector_max"), msip_tier(c))
            inputs = {"amount": a, "freq": f, "rel": r_, "mix": m_, "count": n_, "stepup": 0, "years": y, "opts": o_, "sector_max": sm}
    except sip.SipPlanError as e:
        raise HTTPException(403, str(e))
    except sip.SipError as e:
        raise HTTPException(422, str(e))
    if body.kind == "builder":                                    # inside the customer's builder level, like a build
        t = builder.TIERS[builder_tier(c)]
        try:
            amt_, cnt_ = float(i.get("amount") or 0), int(i.get("count") or 0)
        except (TypeError, ValueError):
            raise HTTPException(422, "That portfolio cannot be saved")
        if not math.isfinite(amt_) or amt_ < t["min_amount"] or amt_ > (t["max_amount"] or builder.ADMIN_AMOUNT_CEIL) or not 1 <= cnt_ <= t["max_stocks"]:
            raise HTTPException(403, "That portfolio is outside your access")
        rel = [r for r in (i.get("reliability") or ["S"]) if r in t["reliability"]] or ["S"]
        inputs = {"amount": amt_, "count": cnt_, "reliability": rel}
    elif body.kind == "etf":                                       # round 23: an ETF Analyser basket, tracked as 1 unit of each ETF
        inputs = {"src": "basket"}
        body.holdings = [{"kind": "etf", "s": h.get("s"), "qty": 1} for h in body.holdings if isinstance(h, dict)]
    elif body.kind == "analyser":                                  # AI Portfolio Analyser: tracked as 1 share of each stock
        inputs = {"reliability": ["S", "M", "W"]}
        body.holdings = [{"kind": "stock", "s": h.get("s"), "n": h.get("n"), "cap": h.get("cap"), "sec": h.get("sec"),
                          "grp": f"{h.get('cap')} cap" if h.get("cap") else None, "qty": 1} for h in body.holdings if isinstance(h, dict)]
    if not body.holdings:
        raise HTTPException(422, "Nothing to save")
    hold = _clean_holdings(body.kind, body.holdings, inputs, c, legacy=body.kind == "sip" and "opts" not in i and not i.get("basket"))
    if body.kind == "etf":
        for h in hold:
            h["grp"] = h.get("u")
    with _own(c) as conn:
        n = conn.execute("SELECT count(*) AS n FROM customer_sips WHERE customer_id = %s AND kind = %s", (c["id"], body.kind)).fetchone()["n"]
        if n >= sip.MAX_SAVED:
            raise HTTPException(422, f"You can keep up to {sip.MAX_SAVED} saved {'SIPs' if body.kind == 'sip' else 'portfolios'} — delete one first")
        today = datetime.now(IST).date()
        if _day_row():                                            # built on a past day's data: back-tested from that day, then live
            today = _day_row()["trade_date"]
            inputs = {**inputs, "as_of": _day_row()["taken_at"].isoformat()}
        r = conn.execute("INSERT INTO customer_sips (customer_id, kind, name, inputs, holdings, alerts, saved_on, versions) "
                         "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                         (c["id"], body.kind, name, json.dumps(inputs), json.dumps(hold), bool(body.alerts), today,
                          json.dumps([{"d": today.isoformat(), "holdings": hold}]))).fetchone()
        out = _saved_out(_saved_row(conn, c, r["id"]), c)
    return out


@app.patch("/app/api/saved/{sid}")
def saved_patch(sid: int, body: SavedPatch, c=Depends(customer)):
    """turn alerts on / off, rename"""
    with _own(c) as conn:
        r = _saved_row(conn, c, sid)
        if body.alerts is not None:
            conn.execute("UPDATE customer_sips SET alerts = %s WHERE id = %s AND customer_id = %s", (body.alerts, sid, c["id"]))
        if body.name is not None:
            conn.execute("UPDATE customer_sips SET name = %s WHERE id = %s AND customer_id = %s", (" ".join(body.name.split())[:60] or "My plan", sid, c["id"]))
        if body.visibility is not None:                          # private / public: going public needs the share permission, going private never does
            if body.visibility not in ("private", "public"):
                raise HTTPException(422, "Choose private or public")
            if body.visibility == "public" and SHARE_PERM.get(r["kind"]) not in c["perms"]:
                raise HTTPException(403, NO_ACCESS, headers={"X-Access": "denied"})
            conn.execute("UPDATE customer_sips SET visibility = %s WHERE id = %s AND customer_id = %s", (body.visibility, sid, c["id"]))
        if body.reminder_day is not None:                        # round 21: SIPs only
            if r["kind"] not in ("sip", "msip"):
                raise HTTPException(422, "Reminders are for SIPs")
            conn.execute("UPDATE customer_sips SET reminder_day = %s WHERE id = %s AND customer_id = %s", (body.reminder_day or None, sid, c["id"]))
        return _saved_out(_saved_row(conn, c, sid), c)


# ── a public portfolio by its ID (owner 2026-11-07: "no login for this link … replicate the whole page in the share — every data, the
# chart, how much per month, the step-up"): no session is read or made; the data come only from shared_portfolio() (SECURITY DEFINER —
# the portal role still cannot read anyone's rows) and the owner is never named. What the owner made public is shown in full: the plan
# (amount, frequency, holdings) and its tracking. A wrong / private / missing ID gets the same 404; an address may ask 60 times a minute
# and 600 times an hour (guessing a 16-character ID is out of reach anyway).
PUB_PLAN_KEYS = ("s", "n", "kind", "grp", "cap", "sec", "role", "sleeve", "u", "units", "every", "amt", "qty", "p")


def _public_row(code, request):
    ip = _ip(request)
    _rate("public-min", ip, 60, 60)
    _rate("public-hour", ip, 600, 3600)
    _rate("public-all", "*", 3000, 60)                           # a flood from many addresses is cut too
    code = (code or "").strip().upper()
    d = None
    if SHARE_CODE.match(code):
        with pool.connection() as conn:
            d = conn.execute("SELECT shared_portfolio(%s) AS d", (code,)).fetchone()["d"]
    if not d:
        raise HTTPException(404, "This portfolio is private, or the link is not right")
    d["saved_on"] = date.fromisoformat(d["saved_on"]) if d.get("saved_on") else None
    return d


def _public_headers(response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"


@app.get("/app/api/public/portfolio/{code}")
def public_portfolio(code: str, request: Request, response: Response):
    d = _public_row(code, request)
    _public_headers(response)
    try:                                                          # engagement count for the admin (only a number, nothing about the visitor)
        with pool.connection() as conn:
            conn.execute("SELECT shared_portfolio_seen(%s)", (d["share_id"],))
    except Exception:                                             # noqa: BLE001 — a count never breaks the page
        pass
    i = d.get("inputs") or {}
    hs = d.get("holdings") or []
    kind = d["kind"]
    base = [(h.get("qty") or 0) * (h.get("p") or 0) if kind == "builder" else (h.get("amt") or h.get("slice") or 0) if kind in ("sip", "msip") else 1 for h in hs]
    tot = sum(base) or 1
    plan = [{**{k: h.get(k) for k in PUB_PLAN_KEYS}, "w": round(b / tot * 100, 1)} for h, b in zip(hs, base)]
    return {"code": d["share_id"], "kind": kind, "tag": SAVED_TAG.get(kind), "name": d["name"],
            "saved_on": d["saved_on"].isoformat() if d["saved_on"] else None, "created_at": d.get("created_at"),
            "changes": max(0, len(d.get("versions") or []) - 1),
            "inputs": {k: i.get(k) for k in ("amount", "freq", "years", "stepup", "rel", "mix", "count", "reliability", "sector_max", "as_of") if k in i}
                      | ({"opts": {k: (i.get("opts") or {}).get(k) for k in ("gold", "caps", "style")}} if i.get("opts") else {}),
            "holdings": plan}


@app.get("/app/api/public/portfolio/{code}/track")
def public_portfolio_track(code: str, request: Request, response: Response, sym: str | None = None, stepup: int | None = None):
    """the same tracking as the owner's page (tracking.track — cached per price day), read only"""
    if sym is not None and not PF_SYM.match(sym):
        raise HTTPException(422, "Unknown stock")
    if stepup is not None and stepup not in sip.STEPUPS:
        raise HTTPException(422, "Choose a step-up of 0, 5, 10, 15 or 20 %")
    d = _public_row(code, request)
    _public_headers(response)
    with pool.connection() as conn:
        t = tracking.track(conn, d, sym, stepup)
    return {"code": d["share_id"], "kind": d["kind"], "name": d["name"], "tag": SAVED_TAG.get(d["kind"]), **t}


@app.delete("/app/api/saved/{sid}")
def saved_delete(sid: int, c=Depends(customer)):
    with _own(c) as conn:
        _saved_row(conn, c, sid)
        conn.execute("DELETE FROM customer_sips WHERE id = %s AND customer_id = %s", (sid, c["id"]))
    return {"ok": True}


@app.get("/app/api/saved/{sid}/check")
def saved_check(sid: int, c=Depends(customer)):
    """the momentum check: keep / exit (with the reason) / new (sip.check_holdings) — the order for this instalment"""
    _rate("saved-check", str(c["id"]), 60, 60)
    with _own(c) as conn:
        r = _saved_row(conn, c, sid)
        res = _check(r)
        conn.execute("UPDATE customer_sips SET refreshed_at = now() WHERE id = %s AND customer_id = %s", (sid, c["id"]))
    return {"id": sid, "kind": r["kind"], "name": r["name"], "freq": (r["inputs"] or {}).get("freq", "month"), **res}


@app.post("/app/api/saved/{sid}/apply")
def saved_apply(sid: int, c=Depends(customer)):
    """the portfolio adjuster: exit the flagged holdings and put the suggested replacements in their place"""
    _rate("saved-check", str(c["id"]), 60, 60)
    with _own(c) as conn:
        r = _saved_row(conn, c, sid)
        res = _check(r)
        hold = [{k: h.get(k) for k in SAVED_KEEP if isinstance(h.get(k), (str, int, float)) or h.get(k) is None}
                for h in sip.apply_changes(r["holdings"] or [], res)]
        _new_version(conn, c, r, hold, [(h.get("replaces"), h["s"]) for h in res.get("new") or [] if h.get("replaces")])
        return {"changed": len(res["exit"]), **_saved_out(_saved_row(conn, c, sid), c)}


def _check(r):
    """the momentum check of one saved portfolio: Analyser portfolios by their colour / direction (monitor), the others
    by the long-term checks (sip.check_holdings)"""
    if r["kind"] == "analyser":
        view = _latest_view(today=True)
        by = {x["s"]: x for x in view.get("stocks", [])}
        price = lambda sym: (by.get(sym) or {}).get("p")
        hold = r["holdings"] or []
        flags, alts = monitor.portfolio_flags(view, [h["s"] for h in hold])
        keep = [{**h, "p": price(h["s"]), "amt": price(h["s"])} for h in hold if h["s"] not in flags]
        exits = [{**h, "why": flags[h["s"]]} for h in hold if h["s"] in flags]
        new = [{"kind": "stock", "s": a["s"], "n": a.get("n"), "st": a.get("st"), "sec": a.get("sec"), "cap": (by.get(a["s"]) or {}).get("cap"),
                "grp": f"{(by.get(a['s']) or {}).get('cap')} cap", "qty": 1, "units": 1, "p": price(a["s"]), "amt": price(a["s"]), "replaces": sym}
               for sym, a in alts.items()]
        return {"keep": keep, "exit": exits, "new": new, "total": round(sum(h.get("amt") or 0 for h in keep + new), 2)}
    return sip.check_holdings(_latest_view(today=True), _latest_etf_view(today=True), r["holdings"] or [], _rel_of(r), kind=r["kind"])


def _brief(h):
    return {k: h.get(k) for k in ("s", "n", "kind", "cap", "sec")} if h else None


def _new_version(conn, c, r, hold, pairs=()):
    """a change to a saved portfolio: the new holdings + a dated version (tracking sells / buys at that day's close);
    a second change on the same day replaces that day's version. Every change also goes into the version's swap log
    (owner 2026-11-07, round 15: "stop the old one but keep the track of it — what changed — and start tracking the new one"):
    {d, out, in} per stock that left / came, carried from version to version, so a same-day replacement never loses it.
    pairs: (old symbol, new symbol) known by the caller; the rest pair up in order."""
    today = datetime.now(IST).date().isoformat()
    vers = tracking.versions_of(r)
    log = list(vers[-1].get("log") or [])
    oldh, newh = {h["s"]: h for h in r["holdings"] or []}, {h["s"]: h for h in hold}
    gone, came = [x for x in oldh if x not in newh], [x for x in newh if x not in oldh]
    pairs = [(a, b) for a, b in pairs if a in gone and b in came]
    g2, c2 = [x for x in gone if x not in {a for a, _ in pairs}], [x for x in came if x not in {b for _, b in pairs}]
    n = max(len(g2), len(c2))
    pairs += [(g2[i] if i < len(g2) else None, c2[i] if i < len(c2) else None) for i in range(n)]
    log += [{"d": today, "out": _brief(oldh.get(a)), "in": _brief(newh.get(b))} for a, b in pairs]
    if len(vers) > 1 and vers[-1]["d"] == today:
        vers = vers[:-1]
    # round 17: the saved version is always kept, even when the change is made on the day it was saved — the old stock was bought at that
    # close and sold at the same close, so it keeps its amounts in the swap history (it used to be overwritten and never recorded)
    vers = vers + [{"d": today, "holdings": hold}]
    vers[-1]["log"] = log[-200:]
    conn.execute("UPDATE customer_sips SET holdings = %s, versions = %s, refreshed_at = now(), state = NULL WHERE id = %s AND customer_id = %s",
                 (json.dumps(hold), json.dumps(vers), r["id"], c["id"]))
    # inbox (round 19): the stocks that left settle the open "stocks to change" items of this portfolio
    inbox.settle(conn, c["id"], r["kind"], r["id"], {a: ({"how": "swapped", "in": b} if b else {"how": "removed"}) for a, b in pairs if a})


class HoldingsIn(SafeModel):
    holdings: list


@app.put("/app/api/saved/{sid}/holdings")
def saved_holdings(sid: int, body: HoldingsIn, c=Depends(customer)):
    """change a saved portfolio by hand (a Swap on the tracking page) → a new dated version"""
    _rate("saved", str(c["id"]), 20, 60)
    if not body.holdings or len(body.holdings) > 1000:
        raise HTTPException(422, "Nothing to save")
    with _own(c) as conn:
        r = _saved_row(conn, c, sid)
        old = {h["s"]: h for h in r["holdings"] or []}
        price = {x["s"]: x.get("p") for x in _latest_view(today=True).get("stocks", [])}
        stocks = {x["s"]: x for x in _latest_view(today=True).get("stocks", [])}
        hold, used, pairs = [], set(), []
        for h in body.holdings:
            if not isinstance(h, dict) or not PF_SYM.match(str(h.get("s") or "")):
                raise HTTPException(422, "That portfolio cannot be saved")
            sym, rep_ = h["s"], h.get("replaces")
            if sym in old and not rep_:                               # kept: the stored holding, whatever the request says
                if sym in used:
                    raise HTTPException(422, "That portfolio cannot be saved")
                used.add(sym); hold.append(old[sym]); continue
            o = old.get(rep_)
            ref = stocks.get(sym)
            if not o or rep_ in used or sym in old or sym in used or not ref or o.get("kind") != "stock":
                raise HTTPException(422, "A swap can only replace a stock of this portfolio with a stock from today's data")
            used.update({rep_, sym}); pairs.append((rep_, sym))
            p = price.get(sym)
            base = {"kind": "stock", "s": sym, "n": ref.get("n"), "cap": ref.get("cap"), "sec": ref.get("sec"), "grp": f"{ref.get('cap')} cap" if ref.get("cap") else None}
            if r["kind"] == "analyser":
                nh = {**base, "qty": 1}
            elif r["kind"] == "builder":                              # the money of the old holding, in the new one
                q = max(1, int((o.get("qty") or 0) * (price.get(o["s"]) or o.get("p") or p) // p))
                nh = {**base, "qty": q, "units": q, "every": 1, "p": p, "amt": round(q * p, 2)}
            else:
                sl = max(o.get("slice") or 0, o.get("amt") or 0) or p
                u = sip._units(sl, p) or (1, 1)
                nh = {**base, "sleeve": "stock", "slice": sl, "units": u[0], "every": u[1], "p": p, "amt": round(u[0] * p / u[1], 2)}
            hold.append({k: nh.get(k) for k in SAVED_KEEP if isinstance(nh.get(k), (str, int, float)) or nh.get(k) is None})
        if not hold or len(hold) > len(old):
            raise HTTPException(422, "That portfolio cannot be saved")
        _new_version(conn, c, r, hold, pairs)
        return _saved_out(_saved_row(conn, c, sid), c)


@app.get("/app/api/saved/{sid}/track")
def saved_track(sid: int, sym: str | None = None, stepup: int | None = None, c=Depends(customer)):
    """the tracking of one saved portfolio since the day it was saved (tracking.track — cached per price day)"""
    _rate("saved-track", str(c["id"]), 60, 60)
    if sym is not None and not PF_SYM.match(sym):
        raise HTTPException(422, "Unknown stock")
    if stepup is not None and stepup not in sip.STEPUPS:              # the step-up % chosen on the tracking page
        raise HTTPException(422, "Choose a step-up of 0, 5, 10, 15 or 20 %")
    with _own(c) as conn:
        r = _saved_row(conn, c, sid)
        t = tracking.track(conn, r, sym, stepup)
    flags = monitor.regime_flags(_latest_view(today=True), [h["s"] for h in t["holdings"] if h.get("held") and h.get("kind") == "stock"])
    themes = {h["s"]: sip.etf_status(_latest_etf_view(today=True), h["s"]) for h in t["holdings"] if h.get("held") and h.get("kind") == "etf"}
    hold = [{**h, "flag": flags.get(h["s"]) or (themes.get(h["s"]) if h.get("kind") == "etf" else None)} for h in t["holdings"]]
    return {"id": sid, "name": r["name"], "kind": r["kind"], "tag": _tag_of(r), **t, "holdings": hold}


@app.get("/app/api/alternatives")
def alternatives(s: str, exclude: str = "", c=Depends(need("portfolio", "builder", "msip"))):
    """the best 3 alternatives for one stock (same industry → sector → market cap; long-term uptrend, High / Medium) and up to 3
    upgrades (a bigger company in the same industry / sector — round 15)"""
    _rate("alternatives", str(c["id"]), 60, 60)
    if not PF_SYM.match(s):
        raise HTTPException(422, "Unknown stock")
    skip = {x for x in exclude.split(",") if PF_SYM.match(x)} | {s}
    view = _latest_view(today=True)
    cur = next((x for x in view.get("stocks", []) if x["s"] == s), None)
    return {"s": s, "cur": cur and {**monitor.size_of(cur), "n": cur.get("n"), "sec": cur.get("sec"), "ind": cur.get("ind"), "st": monitor.lt_strength(cur), "rel": cur.get("h")}, "items": monitor.alternatives(view, s, skip, 3, up=3)}


@app.get("/app/api/stock/{sym}")
def stock_insight(sym: str, c=Depends(need("portfolio", "builder", "msip"))):
    """one stock for the Stock insight pop-up (round 19i, owner 2026-11-12: "clicking a swap recommendation — the well detailed data like the
    AI summary, as a pop-up, with the option to swap"): the stock's row of today's view plus only the sector / industry rows (Q and Y) the
    research summary reads — the same labels-only data the Analyser shows, nothing more"""
    _rate("stock-insight", str(c["id"]), 60, 60)
    sym = sym.strip().upper()
    if not PF_SYM.match(sym):
        raise HTTPException(422, "Unknown stock")
    v = _latest_view(today=True)
    s = next((x for x in v.get("stocks", []) if x["s"] == sym), None)
    if not s:
        raise HTTPException(404, "This stock is not in today's data")
    pick = lambda by, f: {tf: [r for r in ((by or {}).get(tf) or []) if f(r)] for tf in ("Q", "Y")}
    return {"stock": s, "rd": v.get("rd"), "as_of": v.get("as_of"), **monitor.size_of(s),
            "sectors": pick(v.get("sectors"), lambda r: r.get("k") == s.get("sec")),
            "industries": pick(v.get("industries"), lambda r: r.get("k") == s.get("ind") and r.get("sec") == s.get("sec"))}


def _watch_syms(r):
    """the stocks of a saved portfolio that the AI watch flags today (long-term regime turned down)"""
    syms = [h["s"] for h in r["holdings"] or [] if h.get("kind", "stock") == "stock"]
    return monitor.regime_flags(_latest_view(today=True), syms) if syms else {}


@app.get("/app/api/saved/{sid}/watch")
def saved_watch(sid: int, c=Depends(customer)):
    """Hyperplane AI watch of one saved portfolio (owner 2026-11-07, round 15: "the AI watch button on the portfolio overview — the tile
    shows how many stocks to change; a click shows all the swaps"): each flagged stock with its alternatives and upgrades"""
    _rate("saved-check", str(c["id"]), 60, 60)
    with _own(c) as conn:
        r = _saved_row(conn, c, sid)
    view = _latest_view(today=True)
    by = {x["s"]: x for x in view.get("stocks", [])}
    syms = [h["s"] for h in r["holdings"] or []]
    items = []
    for s_, w in _watch_syms(r).items():
        x = by.get(s_) or {}
        items.append({"s": s_, "n": x.get("n"), "sec": x.get("sec"), "ind": x.get("ind"), "cap": x.get("cap"), "st": monitor.lt_strength(x), "why": w,
                      **monitor.size_of(x), "alts": monitor.alternatives(view, s_, set(syms), 3, up=3)})
    return {"id": sid, "items": items, "total": len(syms)}


# ── notification centre ──
class ReadIn(SafeModel):
    ids: list[int] = []
    all: bool = False


@app.get("/app/api/notifications")
def notifications(c=Depends(customer)):
    with _own(c) as conn:
        rows = conn.execute("SELECT id, kind, ref_id, title, body, created_at, updated_at, read_at, app, type, status FROM customer_notifications "
                            "WHERE customer_id = %s ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 50", (c["id"],)).fetchall()
    items = [{"id": r["id"], "kind": r["kind"], "ref": r["ref_id"], "title": r["title"], "body": r["body"], "at": (r["updated_at"] or r["created_at"]).isoformat(),
              "read": r["read_at"] is not None, "app": r["app"], "type": r["type"], "status": r["status"]} for r in rows]
    return {"items": items, "unread": sum(1 for i in items if not i["read"])}


# ── Unified inbox (round 19, inbox.py): every notification + the helpdesk tickets, for the three-pane inbox page ──
# which process an item belongs to (round 19k, owner: "from which app, which process — the investment or the SIP"), in plain words
PROCESS = {"analyser": "Saved stock list", "portfolio": "Your Analyser list", "builder": "Investment · one-time amount", "sip": "ETF SIP", "msip": "Stock SIP",
           "etf": "Saved ETF portfolio"}
INBOX_COLS = "id, kind, ref_id, title, body, created_at, updated_at, read_at, app, type, status, done_at, done_note, items_done"


def _plan_of(r, plans):
    p = plans.get(r["ref_id"]) if r["ref_id"] else None
    if r["kind"] not in PROCESS or r["kind"] in ("announce", "mention"):
        return None
    freq = ((p or {}).get("inputs") or {}).get("freq")
    word = {"month": "monthly", "quarter": "quarterly"}.get(freq, "")
    return {"name": p["name"] if p else "Your Analyser list", "kind": r["kind"], "code": p and p["code"],
            "process": PROCESS[r["kind"]] + (f" · {word}" if word and r["kind"] in ("sip", "msip") else "")}


def _inbox_note(r, plans=None):
    return {"id": f"n{r['id']}", "nid": r["id"], "src": {"announce": "announce", "mention": "mention", "planner_due": "planner", "planner_soon": "planner"}.get(r["kind"], "alert"), "kind": r["kind"],
            "app": r["app"] or inbox.app_of(r["kind"]), "type": r["type"] or "info", "status": r["status"], "title": r["title"],
            "body": r["body"], "ref": r["ref_id"], "at": (r.get("updated_at") or r["created_at"]).isoformat(), "created": r["created_at"].isoformat(),
            "plan": _plan_of(r, plans or {}), "read": r["read_at"] is not None,
            "read_at": r["read_at"] and r["read_at"].isoformat(), "done_at": r["done_at"] and r["done_at"].isoformat(),
            "done_note": r["done_note"], "items_done": r["items_done"] or {}}


@app.get("/app/api/inbox")
def inbox_list(c=Depends(customer)):
    _rate("inbox", str(c["id"]), 60, 60)
    with _own(c) as conn:
        rows = conn.execute(f"SELECT {INBOX_COLS} FROM customer_notifications WHERE customer_id = %s "
                            "ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 500", (c["id"],)).fetchall()
        refs = list({r["ref_id"] for r in rows if r["ref_id"]})
        plans = {p["id"]: p for p in conn.execute("SELECT id, name, kind, share_id AS code, inputs FROM customer_sips WHERE customer_id = %s AND id = ANY(%s)",
                                                  (c["id"], refs)).fetchall()} if refs else {}
    a = {"kind": "customer", "id": str(c["id"]), "name": c["name"], "staff": False}
    with _hd(a) as conn:
        tk = hd.list_tickets(conn, a, "all", 200)["tickets"]
    tickets = [{"id": f"h{t['id']}", "hid": t["id"], "src": "helpdesk", "kind": "helpdesk", "app": "helpdesk",
                "type": "info", "status": "done" if t["status"] == "closed" else "open",
                "title": t["subject"], "body": {"severity": t["severity"], "messages": t["messages"], "snippet": t["snippet"], "unread": t["unread"]},
                "at": t["updated_at"], "created": t["created_at"], "read": not t["unread"], "done_at": t["closed_at"],
                "done_note": "Query closed" if t["status"] == "closed" else None, "items_done": {}} for t in tk]
    return {"items": [_inbox_note(r, plans) for r in rows] + tickets}


class DoneIn(SafeModel):
    note: str = Field("", max_length=200)


@app.post("/app/api/inbox/{nid}/done")
def inbox_done(nid: int, body: DoneIn, c=Depends(customer)):
    _rate("inbox-w", str(c["id"]), 60, 60)
    note = " ".join(hd.CTRL.sub("", body.note).split())[:200] or "Marked done by you"
    with _own(c) as conn:
        r = conn.execute("UPDATE customer_notifications SET status = 'done', done_at = now(), done_note = %s, read_at = COALESCE(read_at, now()) "
                         "WHERE id = %s AND customer_id = %s RETURNING " + INBOX_COLS, (note, nid, c["id"])).fetchone()
    if not r:
        raise HTTPException(404, "Not found")
    return _inbox_note(r)


@app.post("/app/api/inbox/{nid}/reopen")
def inbox_reopen(nid: int, c=Depends(customer)):
    _rate("inbox-w", str(c["id"]), 60, 60)
    with _own(c) as conn:
        r = conn.execute("UPDATE customer_notifications SET status = 'open', done_at = NULL, done_note = NULL WHERE id = %s AND customer_id = %s "
                         "RETURNING " + INBOX_COLS,
                         (nid, c["id"])).fetchone()
    if not r:
        raise HTTPException(404, "Not found")
    return _inbox_note(r)


@app.post("/app/api/notifications/read")
def notifications_read(body: ReadIn, c=Depends(customer)):
    with _own(c) as conn:
        if body.all:
            conn.execute("UPDATE customer_notifications SET read_at = now() WHERE customer_id = %s AND read_at IS NULL", (c["id"],))
        elif body.ids:
            conn.execute("UPDATE customer_notifications SET read_at = now() WHERE customer_id = %s AND id = ANY(%s) AND read_at IS NULL",
                         (c["id"], body.ids[:100]))
    return {"ok": True}


# ── AI Portfolio Analyser: alerts on the customer's list ──
class AlertsIn(SafeModel):
    alerts: bool


@app.put("/app/api/portfolio/alerts")
def portfolio_alerts(body: AlertsIn, c=Depends(need("portfolio"))):
    with _own(c) as conn:
        conn.execute("INSERT INTO customer_portfolio (customer_id, symbols, updated_at, alerts) VALUES (%s, '{}', now(), %s) "
                     "ON CONFLICT (customer_id) DO UPDATE SET alerts = EXCLUDED.alerts", (c["id"], body.alerts))
    return {"alerts": body.alerts}


@app.get("/app/api/portfolio/check")
def portfolio_check(c=Depends(need("portfolio"))):
    """which stocks of the list need a look now, why, and the better alternative (monitor.portfolio_flags)"""
    _rate("portfolio", str(c["id"]), 60, 60)
    with _own(c) as conn:
        r = conn.execute("SELECT symbols, alerts FROM customer_portfolio WHERE customer_id = %s", (c["id"],)).fetchone()
    syms = list(r["symbols"]) if r else []
    view = _latest_view()
    by = {x["s"]: x for x in view.get("stocks", [])}
    flags = monitor.regime_flags(view, syms)
    items = []
    for s, w in flags.items():                                   # each flagged stock with its 3 best alternatives (industry → sector → cap)
        x = by.get(s) or {}
        alts = monitor.alternatives(view, s, set(syms), 3, up=3)
        items.append({"s": s, "n": x.get("n"), "sec": x.get("sec"), "ind": x.get("ind"), "cap": x.get("cap"), "st": monitor.lt_strength(x), "why": w,
                      **monitor.size_of(x), "alts": alts, "alt": alts[0] if alts else None})
    return {"alerts": bool(r and r["alerts"]), "items": items, "total": len(syms)}


@app.post("/app/api/builder/preview")
def portfolio_builder_preview(body: PreviewIn, c=Depends(need("builder"))):
    """Live count for the form: how many stocks pass every check today (per market cap) + the sector list."""
    _need_day(zones=True)
    _rate("builder-preview", str(c["id"]), 120, 60)
    tier = builder_tier(c)
    try:
        view = _latest_view()
        return {**builder.preview(view, body.reliability, body.opts, tier=tier), "as_of": view.get("as_of")}
    except builder.PlanError as e:
        raise HTTPException(403, str(e), headers={"X-Plan": tier})
    except builder.BuildError as e:
        raise HTTPException(422, str(e))


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


class TicketIn(SafeModel):
    subject: str
    severity: str
    body: list


class MessageIn(SafeModel):
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


# ─────────────────────────────── Hyperplane Community (round 19, community.py) ───────────────────────────────
def cm_customer(request: Request):
    cm.guard_ip(_ip(request))                     # per IP, before the session check and before any database work
    c = _session(request)
    return {"kind": "customer", "cid": c["id"], "name": c["name"], "staff": False}


@contextmanager
def _cm(actor):
    """one transaction with row-level security switched to this customer (see db._setup_portal_role)"""
    with pool.connection() as c:
        c.execute("SELECT set_config('hp.cid', %s, true)", (str(actor["cid"]),))
        yield c


class CmPostIn(SafeModel):
    body: list
    reply_to: int | None = None
    thread: int | None = None


class CmIdsIn(SafeModel):
    ids: list[int] = []


class CmReactIn(SafeModel):
    emoji: str = Field(..., max_length=8)


class CmReportIn(SafeModel):
    reason: str = Field("", max_length=300)


class CmReadIn(SafeModel):
    last_id: int
    thread: int | None = None


@app.get("/app/api/community")
def cm_list(after: int | None = None, before: int | None = None, thread: int | None = None, dfrom: str | None = None, dto: str | None = None,
            cursor: str | None = Query(None, max_length=60), view: str | None = None, a=Depends(cm_customer)):
    with _cm(a) as c:
        return cm.listing(c, a, after, before, thread, dfrom, view, dto, cursor)


@app.get("/app/api/community/people")
def cm_people(q: str = "", a=Depends(cm_customer)):
    """the @mention picker: the Community admins (Customer Admin role) — names only, never an email, phone or id"""
    _rate("cm-people", str(a["cid"]), 120, 60)
    with _cm(a) as c:
        return cm.people(c, a, q)


@app.put("/app/api/community/{mid}/fav")
def cm_fav(mid: int, a=Depends(cm_customer)):
    with _cm(a) as c:
        return cm.fav(c, a, mid)


@app.post("/app/api/community/refresh")
def cm_refresh(body: CmIdsIn, a=Depends(cm_customer)):
    with _cm(a) as c:
        return cm.refresh(c, a, body.ids, with_counts=True)


@app.post("/app/api/community")
def cm_post(body: CmPostIn, a=Depends(cm_customer)):
    try:
        with _cm(a) as c:
            return cm.post(c, a, body.body, body.reply_to, body.thread)
    except psycopg.errors.InsufficientPrivilege:             # the database refused it (muted / not approved) even if the checks above missed it
        raise HTTPException(403, "You can read the Community, but posting is paused for your account for now")


@app.delete("/app/api/community/{mid}")
def cm_delete(mid: int, a=Depends(cm_customer)):
    with _cm(a) as c:
        return cm.remove(c, a, mid)


@app.put("/app/api/community/{mid}/react")
def cm_react(mid: int, body: CmReactIn, a=Depends(cm_customer)):
    with _cm(a) as c:
        return cm.react(c, a, mid, body.emoji)


@app.post("/app/api/community/{mid}/report")
def cm_report(mid: int, body: CmReportIn, a=Depends(cm_customer)):
    with _cm(a) as c:
        return cm.report(c, a, mid, body.reason)


@app.post("/app/api/community/read")
def cm_read(body: CmReadIn, a=Depends(cm_customer)):
    with _cm(a) as c:
        return cm.read(c, a, body.last_id, body.thread)


@app.get("/app/api/community/unread")
def cm_unread(a=Depends(cm_customer)):
    with _cm(a) as c:
        return cm.unread(c, a)


@app.post("/app/api/community/rules")
def cm_rules(a=Depends(cm_customer)):
    with _cm(a) as c:
        return cm.rules_ok(c, a)


@app.get("/app/api/community/images/{iid}")
def cm_image(iid: int, a=Depends(cm_customer)):
    with _cm(a) as c:
        return cm.image(c, a, iid)


# ── Buy on Zerodha (round 20, app/zerodha.py) ──
# Kite Publisher offsite basket: this service only checks the lines and records the hand-off; the customer's browser posts the basket to
# Kite, where they sign in and confirm. Nothing here places, reads or confirms an order, and no Zerodha token is ever kept.
class _NoTokenLog(logging.Filter):
    """Kite's redirect carries a request token in the query: the access log keeps the path only"""
    def filter(self, rec):
        a = rec.args
        if isinstance(a, tuple) and len(a) >= 3 and isinstance(a[2], str) and a[2].split("?")[0] == "/app/api/zerodha/return":
            rec.args = (*a[:2], "/app/api/zerodha/return", *a[3:])
        return True


logging.getLogger("uvicorn.access").addFilter(_NoTokenLog())
ZR_RETURN_HOURS = 2                                              # a hand-off older than this is not matched to a return


class ZrIn(SafeModel):
    source: str                                                  # sip | msip | builder | etf (a result) · order (a saved SIP's instalment) · swap
    sid: int | None = None                                       # the saved plan (order / swap; optional for the others)
    lines: list = []                                             # [{s, qty, side}] — symbols and quantities only
    swap_out: str | None = None                                  # swap: the stock that left the plan …
    swap_in: str | None = None                                   # … and the one that took its place
    step: str | None = None                                      # round 21: a swap is two baskets — sell, then buy
    swaps: list = []                                             # round 21b: several swaps at once — [{out, in}], all sells, then all buys
    again: bool = False                                          # round 21: send this instalment again although it was checked in as placed
    part: int = 1
    parts: int = 1


class ZrReturnIn(SafeModel):
    status: str = "other"


# round 20c (owner: "the API key comes from the customer, in the customer app … stored against the user, encrypted with high-end security"):
# each customer's own Kite Publisher API key, sealed by app/vault.py (AES-256-GCM envelope, bound to the customer). It is opened only
# inside prepare, to go into that customer's own form to Kite; it is never logged and never shown again — not even in part (round 20d):
# the customer sees a key ID (vault.key_id), which reveals nothing of the key.
ZR_KEY_RE = re.compile(r"^[A-Za-z0-9]{8,40}$")


class ZrKeyIn(SafeModel):
    key: str = Field(..., max_length=80)


def _zr_key_row(conn, c):
    return conn.execute("SELECT key_ct, key_nonce, dek_ct, dek_nonce, kek_id, key_fp, saved_at FROM zerodha_keys WHERE customer_id = %s",
                        (c["id"],)).fetchone()


def _zr_redirect(request):
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    return f"https://{host}/app/api/zerodha/return" if re.fullmatch(r"[A-Za-z0-9.:-]{1,253}", host or "") else "/app/api/zerodha/return"


def _zr_any(c):
    if not any(p.endswith(":zerodha") for p in c["perms"]):
        raise HTTPException(403, NO_ACCESS, headers={"X-Access": "denied"})


def _zr_prices():
    """our latest price, kind and name of every stock and ETF (today's data — an order never follows a past day picked)"""
    px, kinds, names = {}, {}, {}
    for x in _latest_view(today=True).get("stocks", []):
        px[x["s"]], kinds[x["s"]], names[x["s"]] = x.get("p"), "stock", x.get("n")
    for x in (_latest_etf_view(today=True) or {}).get("etfs", []):
        px.setdefault(x["s"], x.get("p")); kinds.setdefault(x["s"], "etf"); names.setdefault(x["s"], x.get("n"))
    return px, kinds, names


def _zr_lines(raw, sell=False):
    out, seen = [], set()
    if not isinstance(raw, list) or len(raw) > 1000:
        raise HTTPException(422, "Too many lines")
    for x in raw:
        if not isinstance(x, dict):
            raise HTTPException(422, "That basket cannot be sent")
        s, side = str(x.get("s") or "").strip().upper(), str(x.get("side") or "BUY").upper()
        if not PF_SYM.match(s) or side not in ("BUY", "SELL"):
            raise HTTPException(422, "That basket cannot be sent")
        if side == "SELL" and not sell:
            raise HTTPException(422, "Only buy orders can be sent from here")
        if (s, side) in seen:
            raise HTTPException(422, f"{s} is listed twice")
        every = x.get("every") if type(x.get("every")) is int and 1 <= x.get("every") <= 12 else 1
        seen.add((s, side)); out.append({"s": s, "qty": x.get("qty"), "side": side, "every": every})
    return out


def _swap_key(w):
    return f"{w['d']}|{w['out']['s']}|{w['in']['s']}"


ZR_SENT = ("SENT_TO_KITE", "RETURNED_UNVERIFIED", "EXPIRED")


def _zr_runs(conn, c, sid):
    return conn.execute("SELECT id, source, part, parts, tag, lines, status, said, created_at, period, swap_key, swap_keys, step, checkin, checked_at "
                        "FROM zerodha_handoffs WHERE customer_id = %s AND sid = %s ORDER BY created_at", (c["id"], sid)).fetchall()


def _ck(h):
    return (h["checkin"] or {}).get("status")


def _has_swap(h, key):
    return h["swap_key"] == key or key in (h["swap_keys"] or [])


def _line_ok(h, sym):
    """did this checked-in basket really trade sym? (round 21b: a basket can carry several swaps — a partly check-in counts per stock)"""
    ck = h["checkin"] or {}
    if ck.get("status") == "skipped":
        return True
    if ck.get("status") not in ("placed", "partly"):
        return False
    ln = next((x for x in ck.get("lines") or [] if x.get("s") == sym), None)
    return ck["status"] == "placed" if ln is None else (ln.get("qty") or 0) > 0


def _swap_state(rows, out, inn):
    """round 21: where a swap stands on Zerodha (from the customer's check-ins of the baskets that carried it): todo · sell_sent · sold ·
    buy_sent · done"""
    sells, buys = [h for h in rows if h["step"] == "sell"], [h for h in rows if h["step"] == "buy"]
    if any(_line_ok(h, inn) for h in buys):
        return "done"
    if any(h["checkin"] is None for h in buys):
        return "buy_sent"
    if any(_line_ok(h, out) for h in sells):
        return "sold"
    if any(h["checkin"] is None and h["status"] != "SKIPPED" for h in sells):
        return "sell_sent"
    return "todo"


def _period_done(rows, period):
    """an instalment is placed when the last basket of a run was checked in as placed"""
    return next((h for h in rows if h["period"] == period and _ck(h) == "placed" and h["part"] == h["parts"]), None)


def _zr_context(conn, c, body):
    """(application, the lines the customer's own saved plan gives, the SELL caps, meta): a saved SIP → this instalment's whole units
    (a holding bought "1 every N months" is marked); a saved Builder portfolio → its quantities; a swap → round 21: TWO baskets, the sell
    of the stock that left (at most what the plan's tracking holds) and, once the sell is checked in, the buy of the one that came.
    meta = {kind, period (an instalment), swap_key + step + state (a swap)}"""
    if body.source not in zr.SOURCES:
        raise HTTPException(422, "Unknown source")
    row = _saved_row(conn, c, body.sid) if body.sid else None
    if body.source in ("order", "swap", "swaps") and not row:
        raise HTTPException(422, "Open the saved plan first")
    if row and body.source in ("sip", "msip", "builder", "etf") and row["kind"] != body.source:
        raise HTTPException(422, "That saved plan belongs to another application")
    if body.source == "order" and row["kind"] not in ("sip", "msip"):
        raise HTTPException(422, "Only a SIP has instalment orders")
    app_ = zr.APP_OF[row["kind"]] if row else body.source
    if f"{app_}:zerodha" not in c["perms"]:
        raise HTTPException(403, NO_ACCESS, headers={"X-Access": "denied"})
    meta = {"kind": row["kind"] if row else None, "period": None, "swap_key": None, "step": None, "state": None}
    if body.source == "swaps":                                   # round 21b: several swaps, one step — all the sells, or all the buys
        if body.step not in ("sell", "buy") or not isinstance(body.swaps, list) or not 1 <= len(body.swaps) <= 50:
            raise HTTPException(422, "Pick the swaps, and sell or buy")
        t = tracking.track(conn, row)
        runs = _zr_runs(conn, c, row["id"])
        lines, caps, smap, items = [], {}, {}, []
        for x in body.swaps:
            out, inn = str((x or {}).get("out") or ""), str((x or {}).get("in") or "")
            w = next((w for w in t.get("swaps") or [] if (w.get("out") or {}).get("s") == out and (w.get("in") or {}).get("s") == inn), None) if PF_SYM.match(out) and PF_SYM.match(inn) else None
            if not w:
                raise HTTPException(422, f"{out} → {inn} is not a swap of this portfolio")
            key = _swap_key(w)
            st_ = _swap_state([h for h in runs if _has_swap(h, key)], out, inn)
            ok = st_ == "todo" if body.step == "sell" else st_ == "sold"
            items.append({"out": out, "in": inn, "state": st_, "ok": ok})
            sym = out if body.step == "sell" else inn
            if not ok or sym in smap:
                continue
            smap[sym] = key
            o, i = w["out"], w["in"]
            if row["kind"] in ("analyser", "etf"):
                held, cap, buy = 1, zr.QTY_MAX, 1
            else:
                held = cap = int(o.get("qty") or 0)
                h = next((h for h in row["holdings"] or [] if h.get("s") == inn), None) or {}
                buy = int(i.get("qty") or 0) or int(h.get("qty") or 0) or (int(held * (o.get("now") or 0) // i["now"]) if i.get("now") else 0)
            if body.step == "sell":
                lines.append({"s": out, "qty": held or None, "side": "SELL"}); caps[out] = cap
            else:
                lines.append({"s": inn, "qty": buy or None, "side": "BUY"})
        meta.update(step=body.step, swap_map=smap, items=items)
        return app_, lines, caps, meta
    if body.source != "swap":
        if not row:
            return app_, None, None, meta
        if row["kind"] in ("sip", "msip"):
            meta["period"] = monitor._period((row["inputs"] or {}).get("freq", "month"), datetime.now(IST))
        q = "units" if row["kind"] in ("sip", "msip") else "qty"
        return app_, [{"s": h["s"], "qty": int(h.get(q) or 0) or None, "side": "BUY", "every": int(h.get("every") or 1)}
                      for h in row["holdings"] or [] if h.get("s")], None, meta
    if not (body.swap_out and body.swap_in and PF_SYM.match(body.swap_out) and PF_SYM.match(body.swap_in)):
        raise HTTPException(422, "Name the swap")
    t = tracking.track(conn, row)
    w = next((w for w in t.get("swaps") or [] if (w.get("out") or {}).get("s") == body.swap_out and (w.get("in") or {}).get("s") == body.swap_in), None)
    if not w:
        raise HTTPException(422, "That swap is not in this portfolio")
    o, i = w["out"], w["in"]
    if row["kind"] in ("analyser", "etf"):                       # the Analyser lists have no quantities: the customer enters theirs
        held, cap, buy = 1, zr.QTY_MAX, 1
    else:
        held = int(o.get("qty") or 0)
        cap = held
        h = next((h for h in row["holdings"] or [] if h.get("s") == body.swap_in), None) or {}
        buy = int(i.get("qty") or 0) or int(h.get("qty") or 0) or (int(held * (o.get("now") or 0) // i["now"]) if i.get("now") else 0)
    key = _swap_key(w)
    state = _swap_state([h for h in _zr_runs(conn, c, row["id"]) if _has_swap(h, key)], body.swap_out, body.swap_in)
    step = body.step if body.step in ("sell", "buy") else ("buy" if state in ("sold", "buy_sent") else "sell")
    meta.update(swap_key=key, step=step, state=state)
    lines = [{"s": body.swap_out, "qty": held or None, "side": "SELL"}] if step == "sell" else [{"s": body.swap_in, "qty": buy or None, "side": "BUY"}]
    return app_, lines, {body.swap_out: cap}, meta


def _zr_stale(d):
    return d is None or d < datetime.now(IST).date() - timedelta(days=zr.STALE_DAYS)


@app.put("/app/api/zerodha/key")
def zerodha_key_save(body: ZrKeyIn, request: Request, c=Depends(customer)):
    """save (or replace) this customer's own Publisher API key — sealed before it reaches the database; the answer never repeats it"""
    _zr_any(c)
    _rate("zerodha-key", str(c["id"]), 10, 3600)
    if not vault.ready():
        raise HTTPException(503, "Connecting Zerodha is not available yet — please try again later")
    key = body.key.strip()
    if not ZR_KEY_RE.match(key):
        raise HTTPException(422, "That does not look like a Kite API key: copy the “API key” of your Publisher app (letters and digits). "
                                 "Never paste the API secret or your Zerodha password.")
    sealed, kid = vault.seal(key, c["id"]), vault.key_id(key)
    del key
    with _own(c) as conn:
        # one statement: a changed key replaces the old one only when the new one is sealed and stored (never a moment without a key)
        conn.execute("INSERT INTO zerodha_keys (customer_id, key_ct, key_nonce, dek_ct, dek_nonce, kek_id, key_fp, saved_at) "
                     "VALUES (%(c)s, %(key_ct)s, %(key_nonce)s, %(dek_ct)s, %(dek_nonce)s, %(kek_id)s, %(fp)s, now()) "
                     "ON CONFLICT (customer_id) DO UPDATE SET key_ct = EXCLUDED.key_ct, key_nonce = EXCLUDED.key_nonce, dek_ct = EXCLUDED.dek_ct, "
                     "dek_nonce = EXCLUDED.dek_nonce, kek_id = EXCLUDED.kek_id, key_fp = EXCLUDED.key_fp, saved_at = now()",
                     {"c": c["id"], "fp": kid, **sealed})
        act.log(conn, actor_kind="customer", actor_id=c["id"], actor_name=c["name"], session_id=c["sid"], device_id=c["device_id"],
                device=act.device_label(_ua(request)), ip=_ip(request), app="customer", event="zerodha_key_saved", detail={"key_id": kid})
        r = _zr_key_row(conn, c)
    return {"id": r["key_fp"], "saved": r["saved_at"].isoformat()}


@app.delete("/app/api/zerodha/key")
def zerodha_key_remove(request: Request, c=Depends(customer)):
    _zr_any(c)
    with _own(c) as conn:
        n = conn.execute("DELETE FROM zerodha_keys WHERE customer_id = %s", (c["id"],)).rowcount
        if n:
            act.log(conn, actor_kind="customer", actor_id=c["id"], actor_name=c["name"], session_id=c["sid"], device_id=c["device_id"],
                    device=act.device_label(_ua(request)), ip=_ip(request), app="customer", event="zerodha_key_removed")
    return {"removed": bool(n)}


@app.get("/app/api/zerodha/status")
def zerodha_status(request: Request, c=Depends(customer)):
    """what the Connect Zerodha window needs: the key saved or not (its last 4), the address to paste in the Publisher app"""
    _zr_any(c)
    with _own(c) as conn:
        d, k = zr.list_day(conn), _zr_key_row(conn, c)
    return {"key": {"id": k["key_fp"], "saved": k["saved_at"].isoformat()} if k else None, "available": vault.ready(),
            "redirect": _zr_redirect(request), "list": d.isoformat() if d else None, "stale": _zr_stale(d), "max": zr.MAX_LINES}


@app.post("/app/api/zerodha/check")
def zerodha_check(body: ZrIn, c=Depends(customer)):
    """the preview: every line with its Zerodha symbol (✓ / ⚠ / ✗), lot, our price → the limit, the value; round 21: where this instalment
    or this swap stands (placed already? which step of the swap?)"""
    _rate("zerodha-check", str(c["id"]), 60, 600)
    px, kinds, names = _zr_prices()
    with _own(c) as conn:
        app_, own, caps, meta = _zr_context(conn, c, body)
        lines = own if own is not None and (body.source in ("swap", "swaps") or not body.lines) else _zr_lines(body.lines)
        found = zr.resolve(conn, [x["s"] for x in lines])
        for x in lines:                                          # a suggestion in whole lots (the customer can change it)
            lot = (found.get(x["s"]) or {}).get("lot", 1)
            if zr.whole(x.get("qty")) and lot > 1:
                x["qty"] = zr.lots(x["qty"], lot) or None
        res = zr.check(conn, lines, px, caps, kinds)
        d = zr.list_day(conn)
        runs = _zr_runs(conn, c, body.sid) if body.sid else []
        done = _period_done(runs, meta["period"]) if meta["period"] else None
        # a basket of this instalment / this swap step sent in the last week and not checked in yet: the window starts with its check-in
        week = datetime.now(timezone.utc) - timedelta(days=7)
        pend = next((h for h in reversed(runs) if h["checkin"] is None and h["status"] != "SKIPPED" and h["created_at"] > week
                     and ((meta["period"] and h["period"] == meta["period"]) or (meta["swap_key"] and _has_swap(h, meta["swap_key"]))
                          or (body.source == "swaps" and h["step"] == meta["step"] and set(h["swap_keys"] or []) & {_k for _k in (meta.get("swap_map") or {}).values()}))), None)
    for x in res:
        x["n"] = names.get(x["s"])
    return {"list": d.isoformat() if d else None, "stale": _zr_stale(d), "max": zr.MAX_LINES, "app": app_,
            "swap": body.source in ("swap", "swaps"), "caps": caps or {}, "lines": res, "period": meta["period"], "step": meta["step"],
            "state": meta["state"], "placed": done["checked_at"].isoformat() if done and done["checked_at"] else None, "swaps": meta.get("items"),
            "pending": {"id": str(pend["id"]), "tag": pend["tag"], "part": pend["part"], "parts": pend["parts"], "step": pend["step"],
                        "lines": pend["lines"], "at": pend["created_at"].isoformat()} if pend else None}


@app.post("/app/api/zerodha/prepare")
def zerodha_prepare(body: ZrIn, request: Request, c=Depends(customer)):
    """one basket (≤ 10 lines), checked again on the server, recorded, and handed back for the customer's browser to post to Kite"""
    _rate("zerodha-prepare", str(c["id"]), 30, 3600)
    if not 1 <= body.part <= body.parts <= 100:
        raise HTTPException(422, "That basket cannot be sent")
    px, kinds, _ = _zr_prices()
    with _own(c) as conn:
        app_, own, caps, meta = _zr_context(conn, c, body)
        lines = _zr_lines(body.lines, sell=body.source in ("swap", "swaps"))
        if body.source == "swaps":                               # round 21b: only the chosen swaps that are at this step
            allowed = {(x["s"], x["side"]) for x in own}
            if any((x["s"], x["side"]) not in allowed for x in lines):
                raise HTTPException(422, "Only the " + ("sells of the swaps not sold yet" if meta["step"] == "sell" else "buys of the swaps already sold") + " can go in this basket")
        if body.source == "swap":                                # round 21: one step at a time — the sell, then (checked in) the buy
            st_ = meta["state"]
            if st_ == "done":
                raise HTTPException(409, "This swap is already done on Zerodha (you checked it in)")
            if meta["step"] == "sell" and st_ in ("sold", "buy_sent"):
                raise HTTPException(409, "The sell of this swap is already checked in — the next step is the buy")
            if meta["step"] == "buy" and st_ not in ("sold", "buy_sent"):
                raise HTTPException(409, "Sell first: check in the sell of the old stock, then buy the new one")
            allowed = {(x["s"], x["side"]) for x in own}
            if any((x["s"], x["side"]) not in allowed for x in lines):
                raise HTTPException(422, "This step of the swap holds only " + ("the sell of the stock that left" if meta["step"] == "sell" else "the buy of the new stock"))
        if meta["period"] and not body.again and body.part == 1:
            done = _period_done(_zr_runs(conn, c, body.sid), meta["period"])
            if done:
                raise HTTPException(409, f"This instalment was already placed on Zerodha (you checked it in on {done['checked_at'].astimezone(IST):%d %b}). Send it again only if you mean to buy it twice.")
        if not lines:
            raise HTTPException(422, "Pick at least one stock")
        if len(lines) > zr.MAX_LINES:
            raise HTTPException(422, f"At most {zr.MAX_LINES} orders in one Zerodha basket")
        k = _zr_key_row(conn, c)
        if not k:
            raise HTTPException(409, "Connect Zerodha first: save your Publisher API key")
        try:
            api_key = vault.unseal(k, c["id"])
        except vault.VaultError:
            raise HTTPException(409, "Your saved Zerodha key could not be opened — please save it again (Connect Zerodha)")
        if _zr_stale(zr.list_day(conn)):
            raise HTTPException(409, "Zerodha's symbol list is out of date — please try again later")
        res = zr.check(conn, lines, px, caps, kinds)
        bad = next((x for x in res if not x["ok"]), None)
        if bad:
            raise HTTPException(422, f"{bad['s']}: {bad.get('why') or bad.get('note') or 'cannot be sent to Zerodha'}")
        snap = [{k: x.get(k) for k in ("s", "k", "side", "qty", "price", "lot", "st")} for x in res]
        hid = tag = None
        for _ in range(5):                                       # the tag is unique (36^8 tags — a clash is all but impossible)
            tag = zr.new_tag()
            try:
                with conn.transaction():
                    keys = [meta["swap_map"][x["s"]] for x in snap] if body.source == "swaps" else ([meta["swap_key"]] if meta["swap_key"] else None)
                    hid = conn.execute("INSERT INTO zerodha_handoffs (customer_id, source, sid, part, parts, tag, lines, status, period, swap_key, swap_keys, step) "
                                       "VALUES (%s, %s, %s, %s, %s, %s, %s, 'SENT_TO_KITE', %s, %s, %s, %s) RETURNING id",
                                       (c["id"], body.source, body.sid, body.part, body.parts, tag, json.dumps(snap),
                                        meta["period"], meta["swap_key"], keys, meta["step"])).fetchone()["id"]
                break
            except psycopg.errors.UniqueViolation:
                continue
        if hid is None:
            raise HTTPException(503, "Please try again")
        act.log(conn, actor_kind="customer", actor_id=c["id"], actor_name=c["name"], session_id=c["sid"], device_id=c["device_id"],
                device=act.device_label(_ua(request)), ip=_ip(request), app="customer", module=app_, event="zerodha_handoff",
                detail={"source": body.source, "lines": len(snap), "tag": tag, "part": body.part, "parts": body.parts})
    return {"id": str(hid), "tag": tag, "action": zr.BASKET_URL, "api_key": api_key, "data": zr.basket(res, tag), "lines": snap}


class ZrCheckIn(SafeModel):
    status: str                                                  # placed | partly | not_placed
    lines: list = []                                             # [{s, qty, price}] — what was bought / sold (prefilled with the plan)


UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


@app.post("/app/api/zerodha/handoffs/{hid}/checkin")
def zerodha_checkin(hid: str, body: ZrCheckIn, c=Depends(customer)):
    """round 21 (owner: "track the real order … the system doesn't know whether the previous order is done"): the customer says what
    happened on Kite — placed as planned, partly (their quantities / prices), or not placed. Their own hand-off only (row-level security);
    it can be changed later. A placed instalment (its last basket) closes its Inbox item."""
    _zr_any(c)
    _rate("zerodha-checkin", str(c["id"]), 60, 600)
    if not UUID_RE.match(hid or "") or body.status not in ("placed", "partly", "not_placed"):
        raise HTTPException(422, "That check-in cannot be saved")
    with _own(c) as conn:
        h = conn.execute("SELECT id, sid, part, parts, lines, period, swap_key, step FROM zerodha_handoffs WHERE id = %s AND customer_id = %s",
                         (hid, c["id"])).fetchone()
        if not h:
            raise HTTPException(404, "That basket was not found")
        plan = {x["s"]: x for x in h["lines"] or []}
        given = {}
        for x in body.lines if isinstance(body.lines, list) else []:
            if not isinstance(x, dict) or str(x.get("s")) not in plan:
                raise HTTPException(422, "A check-in can only name the stocks of that basket")
            p_ = plan[x["s"]]
            q, pr = x.get("qty"), x.get("price")
            if type(q) is not int or not 0 <= q <= max(1, (p_.get("qty") or 0)) * 10:
                raise HTTPException(422, f"{x['s']}: enter the whole number of shares")
            if not isinstance(pr, (int, float)) or isinstance(pr, bool) or not math.isfinite(pr) or not 0 < pr <= (p_.get("price") or 0) * 10:
                raise HTTPException(422, f"{x['s']}: enter the price you got")
            given[x["s"]] = {"qty": q, "price": round(float(pr), 2)}
        out = []
        for sym, p_ in plan.items():
            g = given.get(sym) or {"qty": p_.get("qty") or 0, "price": p_.get("price")}
            if body.status == "not_placed":
                g = {"qty": 0, "price": p_.get("price")}
            out.append({"s": sym, "k": p_.get("k"), "side": p_.get("side"), "plan": p_.get("qty"), "qty": g["qty"], "price": g["price"]})
        conn.execute("UPDATE zerodha_handoffs SET checkin = %s, checked_at = now() WHERE id = %s",
                     (json.dumps({"status": body.status, "lines": out}), hid))
        if h["period"] and h["sid"] and body.status == "placed" and h["part"] == h["parts"]:
            r = conn.execute("SELECT kind FROM customer_sips WHERE id = %s AND customer_id = %s", (h["sid"], c["id"])).fetchone()
            if r:
                inbox.settle_order(conn, c["id"], r["kind"], h["sid"], f"Placed on Zerodha — you checked it in on {datetime.now(IST):%d %b}")
    return {"id": hid, "status": body.status, "lines": out}


class ZrSkipIn(SafeModel):
    sid: int
    swap_out: str
    swap_in: str


@app.post("/app/api/zerodha/swap/skip-sell")
def zerodha_swap_skip_sell(body: ZrSkipIn, c=Depends(customer)):
    """round 21: "I don't hold it / I sold it already" — the swap moves on to its buy without a sell basket (recorded, never sent)"""
    _zr_any(c)
    _rate("zerodha-prepare", str(c["id"]), 30, 3600)
    with _own(c) as conn:
        app_, own, caps, meta = _zr_context(conn, c, ZrIn(source="swap", sid=body.sid, swap_out=body.swap_out, swap_in=body.swap_in, step="sell"))
        if meta["state"] not in ("todo", "sell_sent"):
            raise HTTPException(409, "The sell of this swap is already checked in")
        conn.execute("INSERT INTO zerodha_handoffs (customer_id, source, sid, tag, lines, status, swap_key, step, checkin, checked_at) "
                     "VALUES (%s, 'swap', %s, %s, '[]', 'SKIPPED', %s, 'sell', %s, now())",
                     (c["id"], body.sid, zr.new_tag(), meta["swap_key"], json.dumps({"status": "skipped", "lines": []})))
    return {"state": "sold"}


@app.get("/app/api/saved/{sid}/zerodha")
def saved_zerodha(sid: int, c=Depends(customer)):
    """round 21: this plan on Zerodha, as the customer checked it in — each instalment planned vs placed, each swap's step, the baskets
    waiting for a check-in, and the holdings their check-ins add up to (quantity, average cost). Side by side with the model tracking."""
    _rate("saved-track", str(c["id"]), 60, 60)
    with _own(c) as conn:
        r = _saved_row(conn, c, sid)
        rows = _zr_runs(conn, c, sid)
        swaps = []
        if any(f"{a}:zerodha" in c["perms"] for a in (zr.APP_OF.get(r["kind"]),)):
            for w in tracking.track(conn, r).get("swaps") or []:
                if w.get("out") and w.get("in"):
                    k = _swap_key(w)
                    swaps.append({"key": k, "d": w["d"], "out": w["out"]["s"], "in": w["in"]["s"],
                                  "state": _swap_state([h for h in rows if _has_swap(h, k)], w["out"]["s"], w["in"]["s"])})
    sent = [h for h in rows if h["source"] != "return"]
    one = lambda h: {"id": str(h["id"]), "part": h["part"], "parts": h["parts"], "tag": h["tag"], "at": h["created_at"].isoformat(), "step": h["step"],
                     "lines": h["lines"], "checkin": h["checkin"], "checked_at": h["checked_at"] and h["checked_at"].isoformat(), "status": h["status"]}
    periods = {}
    for h in sent:
        if h["period"]:
            periods.setdefault(h["period"], []).append(h)
    per = []
    for k, hs in sorted(periods.items(), reverse=True):
        cks = [_ck(h) for h in hs]
        st_ = "placed" if _period_done(hs, k) else "partly" if any(x in ("placed", "partly") for x in cks) else "waiting" if any(x is None for x in cks) else "not_placed"
        per.append({"period": k, "status": st_, "baskets": [one(h) for h in hs]})
    hold = {}
    for h in sent:
        for x in ((h["checkin"] or {}).get("lines") or []):
            if not x.get("qty"):
                continue
            a = hold.setdefault(x["s"], {"s": x["s"], "k": x.get("k"), "qty": 0, "cost": 0.0})
            if x.get("side") == "SELL":
                if a["qty"]:
                    a["cost"] -= a["cost"] / a["qty"] * min(a["qty"], x["qty"])
                a["qty"] = max(0, a["qty"] - x["qty"])
            else:
                a["qty"] += x["qty"]; a["cost"] += x["qty"] * float(x.get("price") or 0)
    holdings = [{**a, "cost": round(a["cost"], 2), "avg": round(a["cost"] / a["qty"], 2) if a["qty"] else None} for a in hold.values() if a["qty"]]
    return {"periods": per, "swaps": swaps, "waiting": [one(h) for h in sent if h["checkin"] is None and h["status"] != "SKIPPED"][-10:],
            "holdings": sorted(holdings, key=lambda a: a["s"]), "reminder_day": r.get("reminder_day")}


@app.get("/app/api/zerodha/return")
def zerodha_return(request: Request):
    """the redirect URL registered on the Publisher app. Kite's query (status + a request token) is not trusted and not kept: only
    the status word travels on, and the app records the return as the signed-in customer (POST …/returned)"""
    _rate("zerodha-return", _ip(request), 30, 600)
    s = (request.query_params.get("status") or "").strip().lower()
    word = "success" if s == "success" else "cancelled" if s in ("cancelled", "canceled", "cancel") else "other"
    return RedirectResponse(f"/app/#zerodha={word}", status_code=303, headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})


@app.post("/app/api/zerodha/returned")
def zerodha_returned(body: ZrReturnIn, c=Depends(customer)):
    """back from Kite: the newest open hand-off of THIS customer (last 2 hours) is marked "returned — not verified". A return with
    none (another tab, a replayed or hand-made link) is kept for review and changes nothing else."""
    _zr_any(c)
    _rate("zerodha-returned", str(c["id"]), 10, 3600)
    word = body.status if body.status in ("success", "cancelled") else "other"
    with _own(c) as conn:
        r = conn.execute("SELECT id, tag, source, sid, part, parts, lines FROM zerodha_handoffs WHERE customer_id = %s AND status = 'SENT_TO_KITE' "
                         "AND created_at > now() - make_interval(hours => %s) ORDER BY created_at DESC LIMIT 1", (c["id"], ZR_RETURN_HOURS)).fetchone()
        if r:
            conn.execute("UPDATE zerodha_handoffs SET status = 'RETURNED_UNVERIFIED', said = %s, returned_at = now() WHERE id = %s", (word, r["id"]))
        else:
            conn.execute("INSERT INTO zerodha_handoffs (customer_id, source, tag, status, said, returned_at) VALUES (%s, 'return', %s, 'NEEDS_REVIEW', %s, now())",
                         (c["id"], zr.new_tag(), word))
    if not r:
        return {"found": False, "said": word}
    return {"found": True, "said": word, "id": str(r["id"]), "tag": r["tag"], "source": r["source"], "sid": r["sid"], "part": r["part"], "parts": r["parts"],
            "lines": r["lines"] or []}


# ── Hyperplane Planner (round 22, app/planner.py) ──
# Notes, journal, to-dos, calendar, projects and a knowledge graph. Every route needs planner:view and runs as the signed-in customer
# (row-level security: only their own rows exist for it). A page travels as a JSON string and is checked block by block in planner.clean_doc.
class PlNotebookIn(SafeModel):
    name: str = Field(..., max_length=60)
    color: str = Field("blue", max_length=12)
    icon: str = Field("book", max_length=12)


class PlNotebookPatch(SafeModel):
    name: str | None = Field(None, max_length=60)
    color: str | None = Field(None, max_length=12)
    icon: str | None = Field(None, max_length=12)
    sort: int | None = Field(None, ge=0, le=1000)


class PlPageIn(SafeModel):
    notebook_id: int
    kind: str = Field("note", max_length=10)
    title: str = Field("", max_length=300)
    doc: str | None = Field(None, max_length=pl.MAX_DOC)
    tags: list[str] = Field(default_factory=list, max_length=20)
    day: str | None = Field(None, max_length=10)
    status: str | None = Field(None, max_length=10)
    due: str | None = Field(None, max_length=10)


class PlPageSave(SafeModel):
    title: str = Field("", max_length=300)
    doc: str = Field(..., max_length=pl.MAX_DOC)
    rev: int = Field(..., ge=1)


class PlPagePatch(SafeModel):
    notebook_id: int | None = None
    kind: str | None = Field(None, max_length=10)
    title: str | None = Field(None, max_length=300)
    tags: list[str] | None = Field(None, max_length=20)
    day: str | None = Field(None, max_length=10)
    pinned: bool | None = None
    status: str | None = Field(None, max_length=10)
    due: str | None = Field(None, max_length=10)
    trashed: bool | None = None


class PlMergeIn(SafeModel):
    ids: list[int] = Field(..., min_length=2, max_length=pl.MAX_MERGE)
    title: str = Field("", max_length=300)
    notebook_id: int
    trash_sources: bool = False


class PlSplitIn(SafeModel):
    mode: str = Field(..., max_length=10)
    level: int = Field(1, ge=1, le=3)
    index: int = Field(0, ge=0, le=pl.MAX_NODES)
    trash_source: bool = False


class PlIdsIn(SafeModel):
    ids: list[int] = Field(..., min_length=1, max_length=500)


class PlTaskIn(SafeModel):
    notebook_id: int
    title: str = Field(..., max_length=400)
    note: str = Field("", max_length=4000)
    status: str = Field("todo", max_length=10)
    priority: int = Field(0, ge=0, le=3)
    due: str | None = Field(None, max_length=10)
    repeat: str | None = Field(None, max_length=10)
    tags: list[str] = Field(default_factory=list, max_length=20)
    page_id: int | None = None
    kind: str = Field("todo", max_length=10)
    start: str | None = Field(None, max_length=10)
    parent_id: int | None = None
    after_id: int | None = None
    progress: int = Field(0, ge=0, le=100)
    time_from: str | None = Field(None, max_length=5)
    time_to: str | None = Field(None, max_length=5)
    plan_id: int | None = None


class PlPlanIn(SafeModel):
    notebook_id: int
    name: str = Field(..., max_length=120)


class PlPlanPatch(SafeModel):
    notebook_id: int | None = None
    name: str | None = Field(None, max_length=120)
    sort: float | None = Field(None, ge=-1e12, le=1e12)


class PlMoveIn(SafeModel):
    action: str = Field(..., max_length=10)


class PlTaskPatch(SafeModel):
    notebook_id: int | None = None
    title: str | None = Field(None, max_length=400)
    note: str | None = Field(None, max_length=4000)
    status: str | None = Field(None, max_length=10)
    priority: int | None = Field(None, ge=0, le=3)
    due: str | None = Field(None, max_length=10)
    repeat: str | None = Field(None, max_length=10)
    tags: list[str] | None = Field(None, max_length=20)
    sort: float | None = Field(None, ge=-1e12, le=1e12)
    page_id: int | None = None
    start: str | None = Field(None, max_length=10)
    progress: int | None = Field(None, ge=0, le=100)
    time_from: str | None = Field(None, max_length=5)
    time_to: str | None = Field(None, max_length=5)
    plan_id: int | None = None


class PlFileIn(SafeModel):
    image: str = Field(..., max_length=pl.MAX_IMAGE * 4 // 3 + 64)


class PlPrefsIn(SafeModel):
    digest: bool


class PlClearIn(SafeModel):
    notebook_id: int | None = None
    status: str = Field("done", max_length=10)


def _pl_changes(body, nullable):
    """only what the request really sent; a null is kept only where "none" is a value (a day, a due date, a repeat, a project)"""
    return {k: getattr(body, k) for k in body.model_fields_set if getattr(body, k) is not None or k in nullable}


def _pl_used(c, action):
    with pool.connection() as conn:
        adoption.action(conn, c["id"], "planner", action)


@app.get("/app/api/planner")
def planner_state(c=Depends(need("planner"))):
    _rate("planner", str(c["id"]), 120, 60)
    with _own(c) as conn:
        return pl.state(conn, c["id"])


# ── phone notifications (round 28): the public key, turn a phone on / off, a test message. The message itself is sent by the worker. ──
class PushSubIn(SafeModel):
    endpoint: str = Field(max_length=1000)
    p256dh: str = Field(max_length=120)
    auth: str = Field(max_length=40)
    device: str = Field("", max_length=80)


class PushEndIn(SafeModel):
    endpoint: str = Field("", max_length=1000)
    token: str = Field("", max_length=4096)                 # round 29: the Android app's own address (FCM)


class PushNativeIn(SafeModel):
    token: str = Field(max_length=4096)
    key: str = Field(max_length=64)
    device: str = Field("", max_length=80)


@app.get("/app/api/push/key")
def push_key(c=Depends(customer)):
    with _own(c) as conn:
        r = conn.execute("SELECT push_public_key() AS k").fetchone()
    if not r or not r["k"]:
        raise HTTPException(503, "Phone notifications are not ready yet — please try again in a minute")
    return {"key": r["k"]}


@app.post("/app/api/push/subscribe")
def push_subscribe(body: PushSubIn, c=Depends(customer)):
    _rate("push", str(c["id"]), 20, 3600)
    if not push.endpoint_ok(body.endpoint) or not push.keys_ok(body.p256dh, body.auth):
        raise HTTPException(422, "This browser's notification address is not supported")
    with _own(c) as conn:
        conn.execute("SELECT push_subscribe(%s, %s, %s, %s, %s)", (c["id"], body.endpoint, body.p256dh, body.auth, body.device))
    return {"ok": True}


@app.post("/app/api/push/unsubscribe")
def push_unsubscribe(body: PushEndIn, c=Depends(customer)):
    _rate("push", str(c["id"]), 20, 3600)
    with _own(c) as conn:
        n = conn.execute("DELETE FROM push_subs WHERE customer_id = %s AND endpoint = %s", (c["id"], body.endpoint)).rowcount
    return {"ok": True, "removed": n}


# round 29: the Android app (APK 1.0.5) hands the page its own address + a key it made; the page sends them here (Android's "Allow")
@app.post("/app/api/push/native")
def push_native_on(body: PushNativeIn, c=Depends(customer)):
    _rate("push", str(c["id"]), 20, 3600)
    if not push.token_ok(body.token, body.key):
        raise HTTPException(422, "This app's notification address is not supported — please update the app")
    with _own(c) as conn:
        conn.execute("SELECT push_native_subscribe(%s, %s, %s, %s)", (c["id"], body.token, body.key, body.device))
    return {"ok": True}


@app.post("/app/api/push/native/off")
def push_native_off(body: PushEndIn, c=Depends(customer)):
    _rate("push", str(c["id"]), 20, 3600)
    with _own(c) as conn:
        n = conn.execute("DELETE FROM push_native WHERE customer_id = %s AND token = %s", (c["id"], body.token)).rowcount
    return {"ok": True, "removed": n}


@app.post("/app/api/push/status")
def push_status(body: PushEndIn, c=Depends(customer)):
    with _own(c) as conn:
        on = body.endpoint and conn.execute("SELECT 1 FROM push_subs WHERE customer_id = %s AND endpoint = %s", (c["id"], body.endpoint)).fetchone()
        app_on = body.token and conn.execute("SELECT 1 FROM push_native WHERE customer_id = %s AND token = %s", (c["id"], body.token)).fetchone()
        n = conn.execute("SELECT (SELECT count(*) FROM push_subs WHERE customer_id = %s) + (SELECT count(*) FROM push_native WHERE customer_id = %s) AS n",
                         (c["id"], c["id"])).fetchone()["n"]
    return {"on": bool(on), "native": bool(app_on), "phones": n}


@app.post("/app/api/push/test")
def push_test(c=Depends(customer)):
    _rate("push-test", str(c["id"]), 5, 600)
    with _own(c) as conn:
        if not conn.execute("SELECT 1 FROM push_subs WHERE customer_id = %s UNION ALL SELECT 1 FROM push_native WHERE customer_id = %s LIMIT 1",
                            (c["id"], c["id"])).fetchone():
            raise HTTPException(409, "Turn on notifications on this phone first")
        push.queue(conn, c["id"], "Hyperplane notifications are on",
                   "New Inbox items and Planner reminders will appear here. Tap one to open it.", url="/app/inbox", tag="hp-test")
    return {"ok": True}


@app.patch("/app/api/planner/prefs")
def planner_prefs(body: PlPrefsIn, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        return pl.prefs_set(conn, c["id"], body.digest)


@app.post("/app/api/planner/notebooks")
def planner_nb_create(body: PlNotebookIn, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        return pl.nb_create(conn, c["id"], body.name, body.color, body.icon)


@app.patch("/app/api/planner/notebooks/{nid}")
def planner_nb_update(nid: int, body: PlNotebookPatch, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        return pl.nb_update(conn, c["id"], nid, body.name, body.color, body.icon, body.sort)


@app.delete("/app/api/planner/notebooks/{nid}")
def planner_nb_delete(nid: int, force: bool = False, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        return pl.nb_delete(conn, c["id"], nid, force)


@app.get("/app/api/planner/search")
def planner_search(q: str = Query("", max_length=120), c=Depends(need("planner"))):
    _rate("planner-search", str(c["id"]), 120, 60)
    with _own(c) as conn:
        return pl.search(conn, c["id"], q)


@app.post("/app/api/planner/pages")
def planner_page_create(body: PlPageIn, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        r = pl.page_create(conn, c["id"], body.notebook_id, body.kind, body.title, body.doc, body.tags, body.day, body.status, body.due)
    _pl_used(c, "note")
    return r


@app.post("/app/api/planner/pages/merge")
def planner_pages_merge(body: PlMergeIn, c=Depends(need("planner"))):
    _rate("planner-heavy", str(c["id"]), 30, 60)
    with _own(c) as conn:
        return pl.pages_merge(conn, c["id"], body.ids, body.title, body.notebook_id, body.trash_sources)


@app.post("/app/api/planner/pages/docs")
def planner_pages_docs(body: PlIdsIn, c=Depends(need("planner"))):
    _rate("planner-heavy", str(c["id"]), 30, 60)
    with _own(c) as conn:
        return pl.pages_docs(conn, c["id"], body.ids)


@app.post("/app/api/planner/trash/empty")
def planner_trash_empty(c=Depends(need("planner"))):
    _rate("planner-heavy", str(c["id"]), 30, 60)
    with _own(c) as conn:
        return pl.trash_empty(conn, c["id"])


@app.get("/app/api/planner/pages/{pid}")
def planner_page_get(pid: int, c=Depends(need("planner"))):
    _rate("planner", str(c["id"]), 120, 60)
    with _own(c) as conn:
        return pl.page_get(conn, c["id"], pid)


@app.put("/app/api/planner/pages/{pid}")
def planner_page_save(pid: int, body: PlPageSave, c=Depends(need("planner"))):
    _rate("planner-save", str(c["id"]), 120, 60)
    with _own(c) as conn:
        return pl.page_save(conn, c["id"], pid, body.title, body.doc, body.rev)


@app.patch("/app/api/planner/pages/{pid}")
def planner_page_patch(pid: int, body: PlPagePatch, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        return pl.page_patch(conn, c["id"], pid, _pl_changes(body, {"day", "due"}))


@app.delete("/app/api/planner/pages/{pid}")
def planner_page_delete(pid: int, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        return pl.page_delete(conn, c["id"], pid)


@app.post("/app/api/planner/pages/{pid}/copy")
def planner_page_copy(pid: int, c=Depends(need("planner"))):
    _rate("planner-heavy", str(c["id"]), 30, 60)
    with _own(c) as conn:
        return pl.page_copy(conn, c["id"], pid)


@app.post("/app/api/planner/pages/{pid}/split")
def planner_page_split(pid: int, body: PlSplitIn, c=Depends(need("planner"))):
    _rate("planner-heavy", str(c["id"]), 30, 60)
    with _own(c) as conn:
        return pl.page_split(conn, c["id"], pid, body.mode, body.level, body.index, body.trash_source)


@app.post("/app/api/planner/tasks")
def planner_task_create(body: PlTaskIn, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        return pl.task_create(conn, c["id"], body.notebook_id, body.title, body.note, body.status, body.priority, body.due, body.repeat,
                              body.tags, body.page_id, body.kind, body.start, body.parent_id, body.after_id, body.progress, body.time_from, body.time_to,
                              body.plan_id)


@app.post("/app/api/planner/plans")
def planner_plan_create(body: PlPlanIn, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        return pl.plan_create(conn, c["id"], body.notebook_id, body.name)


@app.patch("/app/api/planner/plans/{pid}")
def planner_plan_patch(pid: int, body: PlPlanPatch, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        return pl.plan_patch(conn, c["id"], pid, body.name, body.notebook_id, body.sort)


@app.delete("/app/api/planner/plans/{pid}")
def planner_plan_delete(pid: int, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        return pl.plan_delete(conn, c["id"], pid)


@app.post("/app/api/planner/tasks/{tid}/move")
def planner_task_move(tid: int, body: PlMoveIn, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        return pl.task_move(conn, c["id"], tid, body.action)


@app.post("/app/api/planner/tasks/clear-done")
def planner_tasks_clear(body: PlClearIn, c=Depends(need("planner"))):
    _rate("planner-heavy", str(c["id"]), 30, 60)
    with _own(c) as conn:
        return pl.tasks_clear_done(conn, c["id"], body.notebook_id, body.status)


@app.patch("/app/api/planner/tasks/{tid}")
def planner_task_patch(tid: int, body: PlTaskPatch, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    ch = _pl_changes(body, {"due", "repeat", "page_id", "start", "time_from", "time_to"})
    with _own(c) as conn:
        r = pl.task_patch(conn, c["id"], tid, ch)
    if ch.get("status") == "done" and r["task"]["status"] == "done":
        _pl_used(c, "task_done")
    return r


@app.delete("/app/api/planner/tasks/{tid}")
def planner_task_delete(tid: int, c=Depends(need("planner"))):
    _rate("planner-write", str(c["id"]), 300, 60)
    with _own(c) as conn:
        return pl.task_delete(conn, c["id"], tid)


@app.post("/app/api/planner/files")
def planner_file_add(body: PlFileIn, c=Depends(need("planner"))):
    _rate("planner-files", str(c["id"]), 40, 60)
    with _own(c) as conn:
        return pl.file_add(conn, c["id"], body.image)


@app.get("/app/api/planner/files/{fid}")
def planner_file_get(fid: int, c=Depends(need("planner"))):
    _rate("planner-file", str(c["id"]), 600, 60)
    with _own(c) as conn:
        return pl.file_get(conn, c["id"], fid)
