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
import math
import os
import re
import secrets
import time
import contextvars
from collections import OrderedDict, defaultdict, deque
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
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
    sid = row["snapshot_id"]
    if sid not in _hist:
        with pool.connection() as conn:
            r = conn.execute("SELECT data_gz, etf_gz FROM customer_history WHERE snapshot_id = %s", (sid,)).fetchone()
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
        raise HTTPException(422, "Please enter a valid WhatsApp number — choose the country code and type the number (10 digits for India)",
                            headers={"X-Field": "phone"})
    if not body.accept:
        raise HTTPException(422, "Please accept the terms to continue", headers={"X-Field": "accept"})
    why = signup_guard.refuse(email, phone)                   # round 17: throw-away mail / impossible numbers are refused at once
    if why:
        raise HTTPException(422, why, headers={"X-Field": "phone" if "WhatsApp" in why else "email"})
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
    return {"name": c["name"], "email": c["email"], "expires_on": c["expires_on"].isoformat() if c["expires_on"] else None,
            "apps": [dict(a) for a in c["apps"]], "roles": roles, "grants": grants, "perms": sorted(c["perms"]), "pins": pins, "max_pins": MAX_PINS}


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
            if row and request.headers.get("if-none-match") == f'W/"h{row["snapshot_id"]}"':
                return Response(status_code=304, headers={"ETag": f'W/"h{row["snapshot_id"]}"', "Cache-Control": "private, no-cache"})
            r = row and conn.execute("SELECT data_gz FROM customer_history WHERE snapshot_id = %s", (row["snapshot_id"],)).fetchone()
        if not r:
            raise HTTPException(404, "No data for that day — markets may have been closed.")
        return Response(content=bytes(r["data_gz"]), media_type="application/json",
                        headers={"Content-Encoding": "gzip", "ETag": f'W/"h{row["snapshot_id"]}"', "Cache-Control": "private, no-cache"})
    # latest view: a browser that already holds this publish gets "304 Not Modified" (no 180 KB download again)
    with pool.connection() as conn:
        head = conn.execute("SELECT id, published_at FROM published ORDER BY id DESC LIMIT 1").fetchone()
        if not head:
            raise HTTPException(404, "No data has been published yet — please check back soon.")
        etag = f'W/"p{head["id"]}"'
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
        head = conn.execute("SELECT id, published_at FROM published WHERE etf_gz IS NOT NULL ORDER BY id DESC LIMIT 1").fetchone()
        if not head:
            raise HTTPException(404, "ETF data will appear after the next update — please check back soon.")
        etag = f'W/"e{head["id"]}"'
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
        r = conn.execute("SELECT id FROM published ORDER BY id DESC LIMIT 1").fetchone()
        if not r:
            raise HTTPException(404, "No data has been published yet — please check back soon.")
        if r["id"] != _latest["id"]:
            g = conn.execute("SELECT data_gz FROM published WHERE id = %s", (r["id"],)).fetchone()
            _latest.update(id=r["id"], data=json.loads(gzip.decompress(bytes(g["data_gz"]))))
    return _latest["data"]


DETAIL_SYM = re.compile(r"^[A-Z0-9&._-]{1,30}$")


@app.get("/app/api/detail/{symbol}")
def stock_detail(symbol: str, request: Request, response: Response, app_key: str = "portfolio", date: str | None = None,
                 part: str | None = None):
    """Stock detail view (customer admin): everything behind one stock's result for the day on screen. Permission
    "<application>:detail" (portfolio / builder), checked here AND by the database (row-level security on stock_detail).
    Every look is written to the activity log."""
    if app_key not in ("portfolio", "builder"):
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
        r = conn.execute("SELECT id FROM published WHERE etf_gz IS NOT NULL ORDER BY id DESC LIMIT 1").fetchone()
        if not r:
            return None
        if r["id"] != _latest_etf["id"]:
            g = conn.execute("SELECT etf_gz FROM published WHERE id = %s", (r["id"],)).fetchone()
            _latest_etf.update(id=r["id"], data=json.loads(gzip.decompress(bytes(g["etf_gz"]))))
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
    kind: str = "sip"                                            # sip | msip | builder | analyser
    name: str
    inputs: dict
    holdings: list
    alerts: bool = False


class SavedPatch(SafeModel):
    alerts: bool | None = None
    name: str | None = None
    visibility: str | None = None                                # private | public (public needs the application's :share permission)


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
SAVED_KINDS = {"sip": "sip", "msip": "msip", "builder": "builder", "analyser": "portfolio"}   # kind → the application it needs
SAVED_TAG = {"sip": "AI ETF SIP Builder", "msip": "AI Momentum SIP Builder", "builder": "Portfolio Builder", "analyser": "AI Portfolio Analyser"}
SAVED_COLS = "id, kind, name, inputs, holdings, alerts, state, created_at, refreshed_at, saved_on, versions, share_id, visibility"
SHARE_PERM = {"sip": "sip:share", "msip": "msip:share", "builder": "builder:share", "analyser": "portfolio:share"}   # who may make one public
SHARE_CODE = re.compile(r"^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$")       # db.hp_share_id()
SAVED_KEEP = ("kind", "sleeve", "role", "s", "n", "grp", "cap", "sec", "k", "u", "units", "every", "slice", "p", "amt", "qty")


HOLD_MAX = {"sip": 60, "msip": 2000, "builder": 1000, "analyser": 1000}
HOLD_NUM = (("units", 0, 1e7), ("qty", 0, 1e9), ("every", 1, 12), ("slice", 0, 1e13), ("amt", 0, 1e13))
HOLD_ROLE, HOLD_SLEEVE = (None, "core", "theme", "diversifier", "commodity"), (None, "index", "stock", "commodity")


def _clean_holdings(kind, holdings, inputs, c, legacy=False):
    """the holdings of a saved portfolio, as the server accepts them: known symbols only (today's published stocks / ETFs), each once,
    the right kind for the application, numbers that are finite and in range, names and prices from the server (never the client),
    and the total inside the plan's amount (and so inside the customer's level, checked on the inputs)"""
    if not isinstance(holdings, list) or not holdings or len(holdings) > HOLD_MAX.get(kind, 1000):
        raise HTTPException(422, "That plan cannot be saved")
    stocks = {x["s"]: x for x in _latest_view().get("stocks", [])}
    etfs = {x["s"]: x for x in (_latest_etf_view() or {}).get("etfs", [])} if kind == "sip" else {}
    kinds = ("etf", "stock") if legacy else {"sip": ("etf",), "msip": ("stock",), "builder": ("stock",), "analyser": ("stock",)}[kind]
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


def _saved_out(r, c=None):
    return {"id": r["id"], "kind": r["kind"], "tag": SAVED_TAG.get(r["kind"]), "name": r["name"], "inputs": r["inputs"], "holdings": r["holdings"],
            "code": r["share_id"], "visibility": r["visibility"],
            "can_share": bool(c) and SHARE_PERM.get(r["kind"]) in c["perms"],
            "alerts": r["alerts"], "created_at": r["created_at"].isoformat(), "saved_on": r["saved_on"].isoformat() if r["saved_on"] else None,
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
    with _own(c) as conn:
        rows = conn.execute(f"SELECT {SAVED_COLS} FROM customer_sips WHERE customer_id = %s AND kind = ANY(%s) ORDER BY id DESC",
                            (c["id"], kinds)).fetchall()
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
        if body.kind == "sip" and "opts" in i:                    # AI ETF SIP Builder (ETFs)
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
    elif body.kind == "analyser":                                  # AI Portfolio Analyser: tracked as 1 share of each stock
        inputs = {"reliability": ["S", "M", "W"]}
        body.holdings = [{"kind": "stock", "s": h.get("s"), "n": h.get("n"), "cap": h.get("cap"), "sec": h.get("sec"),
                          "grp": f"{h.get('cap')} cap" if h.get("cap") else None, "qty": 1} for h in body.holdings if isinstance(h, dict)]
    if not body.holdings:
        raise HTTPException(422, "Nothing to save")
    hold = _clean_holdings(body.kind, body.holdings, inputs, c, legacy=body.kind == "sip" and "opts" not in i)
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
    return {"id": sid, "name": r["name"], "kind": r["kind"], "tag": SAVED_TAG.get(r["kind"]), **t, "holdings": hold}


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
    return {"s": s, "cur": cur and monitor.size_of(cur), "items": monitor.alternatives(view, s, skip, 3, up=3)}


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
        rows = conn.execute("SELECT id, kind, ref_id, title, body, created_at, read_at FROM customer_notifications WHERE customer_id = %s "
                            "ORDER BY id DESC LIMIT 50", (c["id"],)).fetchall()
    items = [{"id": r["id"], "kind": r["kind"], "ref": r["ref_id"], "title": r["title"], "body": r["body"], "at": r["created_at"].isoformat(),
              "read": r["read_at"] is not None} for r in rows]
    return {"items": items, "unread": sum(1 for i in items if not i["read"])}


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
