"""Hyperplane LENS — the API (sign-up with approval, sign-in) + the admin data for Hyperplane's admin dashboard (Admin → Lens admin).

A separate entity from Hyperplane: its own database, its own secret, its own cookie (`lens_session`, host-only on the Lens address).
Hyperplane accounts and Hyperplane cookies mean nothing here. Security follows Hyperplane's customer service:
  · scrypt passwords (security.py) · the same answer for every failed sign-in · 5 failures → 15 minutes locked
  · sign-in / sign-up limits per address and per email · a session version that signs every device out (block, password change)
  · state-changing requests need the X-Lens header and a same-site Origin (no cross-site form can send one)
Lens has no admin page of its own (owner 2026-11-21): Hyperplane's admin dashboard shows "Lens admin". Its server calls /internal/admin/*
here over the private docker network with LENS_ADMIN_KEY; Lens's web server (lens-web) only passes /api/*, so /internal is never public.
"""
import hmac
import json
import os
import re
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel, ConfigDict, Field

from .db import init_db, pool
from .security import hash_password, verify_password

SECRET = os.environ["LENS_SECRET"]
if len(SECRET) < 32:
    raise SystemExit("LENS_SECRET must be at least 32 characters (deploy/setup.sh makes one)")
COOKIE, SESSION_SECONDS = "lens_session", 7 * 24 * 3600
ADMIN_KEY = os.environ.get("LENS_ADMIN_KEY", "")
DUMMY_HASH = hash_password("not-a-real-password-just-equal-timing")
LOCK_AFTER, LOCK_MINUTES = 5, 15


@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield


app = FastAPI(title="Hyperplane LENS", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


@app.middleware("http")
async def guard(request: Request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
        origin = request.headers.get("origin")
        if request.headers.get("x-lens") != "1" or (origin and re.sub(r"^https?://", "", origin) != host):
            return JSONResponse({"detail": "This request is not allowed"}, status_code=403)
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers.setdefault("Cache-Control", "no-store")
    return resp


# ── limits (per address / per email), as in Hyperplane ──
_hits = defaultdict(deque)


def _rate(bucket, key, limit, window):
    q, now = _hits[(bucket, key)], time.time()
    while q and q[0] < now - window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many attempts — please wait a few minutes and try again")
    q.append(now)


def _ip(request: Request):
    return request.client.host if request.client else "?"


def device_of(ua):
    ua = ua or ""
    os_ = next((n for k, n in (("Android", "Android"), ("iPhone", "iPhone"), ("iPad", "iPad"), ("Windows", "Windows"), ("Mac OS", "Mac"),
                                ("Linux", "Linux")) if k in ua), "Unknown")
    br = next((n for k, n in (("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"), ("Chrome/", "Chrome"), ("Safari/", "Safari")) if k in ua), "")
    return f"{br} on {os_}" if br else os_


def _signer():
    return URLSafeTimedSerializer(SECRET, salt="lens-session")


def _log(c, request, user, email, ok, reason):
    c.execute("INSERT INTO lens_logins (user_id, email, ok, reason, ip, device) VALUES (%s, %s, %s, %s, %s, %s)",
              (user["id"] if user else None, (email or "")[:254], ok, reason, _ip(request), device_of(request.headers.get("user-agent"))))


# ── who is asking ──
def current(request: Request):
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Please sign in")
    try:
        data = _signer().loads(token, max_age=SESSION_SECONDS)
    except (BadSignature, SignatureExpired):
        raise HTTPException(401, "Please sign in")
    if not isinstance(data, dict) or not isinstance(data.get("id"), int):
        raise HTTPException(401, "Please sign in")
    with pool.connection() as c:
        u = c.execute("SELECT id, email, name, role, status, session_ver FROM lens_users WHERE id = %s", (data["id"],)).fetchone()
    if not u or u["session_ver"] != data.get("v") or u["status"] != "approved":
        raise HTTPException(401, "Please sign in")
    return u


def hp_admin(request: Request):
    """Hyperplane's admin server (Admin → Lens admin): the shared key, sent only over the private docker network. Returns the name of
    the Hyperplane admin who asked (for the record)."""
    key = request.headers.get("x-lens-admin-key") or ""
    if len(ADMIN_KEY) < 32 or not hmac.compare_digest(key.encode(), ADMIN_KEY.encode()):
        raise HTTPException(403, "Not allowed")
    return (request.headers.get("x-hp-admin") or "Hyperplane admin")[:120]


# ── sign-up, sign-in, sign-out ──
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$", re.I)
NAME_RE = re.compile(r"^[A-Za-z][A-Za-z .'-]{1,59}$")
PHONE_RE = re.compile(r"^\+\d{1,4} \d{6,13}$")


class SignupIn(Model):
    name: str = Field("", max_length=60)
    email: str = Field("", max_length=254)
    phone: str = Field("", max_length=24)
    password: str = Field("", max_length=200)
    accept: bool = False


class LoginIn(Model):
    email: str = Field("", max_length=254)
    password: str = Field("", max_length=200)


def _field(field, message):
    return HTTPException(422, {"field": field, "message": message})


@app.post("/api/signup")
def signup(body: SignupIn, request: Request):
    _rate("signup", _ip(request), 5, 3600)
    email = body.email.lower()
    if not NAME_RE.match(body.name):
        raise _field("name", "Please enter your full name (letters only).")
    if not EMAIL_RE.match(email):
        raise _field("email", "Please enter a valid email address.")
    if not PHONE_RE.match(body.phone):
        raise _field("phone", "Please enter a valid mobile number.")
    pw = body.password
    if len(pw) < 8 or not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw) or email.split("@")[0] in pw.lower():
        raise _field("password", "Use 8+ characters with letters and numbers, not your email.")
    if not body.accept:
        raise _field("accept", "Please tick the box to agree to the terms.")
    with pool.connection() as c:
        c.execute("INSERT INTO lens_users (email, name, phone, pw_hash, signup_ip) VALUES (%s, %s, %s, %s, %s) ON CONFLICT (email) DO NOTHING",
                  (email, re.sub(r"\s+", " ", body.name), body.phone, hash_password(pw), _ip(request)))
    # the same answer whether or not the email was already there (nobody can test which emails have accounts)
    return {"ok": True, "message": "Thank you — your request is in. You can sign in as soon as QuantFriday approves it."}


@app.post("/api/login")
def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    _rate("login", _ip(request), 10, 900)
    _rate("login-email", email, 10, 900)
    fail = None                                   # raised after the block, so the attempt and the lock-out counter are saved
    with pool.connection() as c:
        u = c.execute("SELECT id, email, name, role, status, pw_hash, session_ver, failed_logins, locked_until, "
                      "locked_until > now() AS locked FROM lens_users WHERE email = %s", (email,)).fetchone()
        if u and u["locked"]:
            _log(c, request, u, email, False, "locked")
            fail = HTTPException(401, f"Too many wrong tries. Please wait {LOCK_MINUTES} minutes and try again.")
        elif not verify_password(body.password, u["pw_hash"] if u else DUMMY_HASH) or not u:
            if u:
                c.execute("UPDATE lens_users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= %s "
                          "THEN now() + make_interval(mins => %s) END WHERE id = %s", (LOCK_AFTER, LOCK_MINUTES, u["id"]))
            _log(c, request, u, email, False, "wrong password" if u else "no such account")
            fail = HTTPException(401, "The email or password is not correct.")
        elif u["status"] != "approved":
            _log(c, request, u, email, False, u["status"])
            fail = HTTPException(403, "Your account is waiting for approval. You can sign in once QuantFriday approves it."
                                 if u["status"] == "pending" else "This account is not active. Please contact QuantFriday.")
        else:
            c.execute("UPDATE lens_users SET failed_logins = 0, locked_until = NULL, last_login_at = now(), login_count = login_count + 1 "
                      "WHERE id = %s", (u["id"],))
            _log(c, request, u, email, True, "signed in")
    if fail:
        raise fail
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(COOKIE, _signer().dumps({"id": u["id"], "v": u["session_ver"]}), max_age=SESSION_SECONDS,
                        httponly=True, samesite="strict", secure=secure, path="/")
    return {"ok": True, "name": u["name"], "role": u["role"]}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.get("/api/me")
def me(u=Depends(current)):
    return {"id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"]}


@app.get("/api/health")
def health():
    return {"ok": True}


# ── for Hyperplane's admin dashboard (Admin → Lens admin) ──
@app.get("/internal/admin/summary")
def admin_summary(_=Depends(hp_admin)):
    with pool.connection() as c:
        return c.execute("SELECT count(*) FILTER (WHERE status = 'pending') AS pending, count(*) FILTER (WHERE status = 'approved') AS approved, "
                         "count(*) FILTER (WHERE status = 'blocked') AS blocked, "
                         "(SELECT count(*) FROM lens_logins WHERE ok AND at > now() - interval '1 day') AS signins_today, "
                         "(SELECT count(DISTINCT user_id) FROM lens_logins WHERE ok AND at > now() - interval '7 days') AS active_week "
                         "FROM lens_users").fetchone()


@app.get("/internal/admin/users")
def admin_users(_=Depends(hp_admin)):
    with pool.connection() as c:
        return c.execute("SELECT id, name, email, phone, status, created_at, approved_at, approved_by, last_login_at, login_count "
                         "FROM lens_users ORDER BY (status = 'pending') DESC, created_at DESC").fetchall()


class UserChange(Model):
    status: str = Field(pattern="^(approved|blocked|pending)$")


@app.post("/internal/admin/users/{uid}")
def admin_change(uid: int, body: UserChange, who=Depends(hp_admin)):
    with pool.connection() as c:
        u = c.execute("SELECT id, status FROM lens_users WHERE id = %s FOR UPDATE", (uid,)).fetchone()
        if u and body.status != u["status"]:
            c.execute("UPDATE lens_users SET status = %s, session_ver = session_ver + (CASE WHEN %s <> 'approved' THEN 1 ELSE 0 END), "
                      "approved_at = CASE WHEN %s = 'approved' THEN now() ELSE approved_at END, "
                      "approved_by = CASE WHEN %s = 'approved' THEN %s ELSE approved_by END WHERE id = %s",
                      (body.status, body.status, body.status, body.status, who, uid))
            c.execute("INSERT INTO lens_admin_log (action, target_id, detail) VALUES ('status', %s, %s::jsonb)",
                      (uid, json.dumps({"status": body.status, "by": who})))
    if not u:
        raise HTTPException(404, "No such person")
    return {"ok": True}


@app.get("/internal/admin/logins")
def admin_logins(user_id: int | None = None, result: str = "all", limit: int = 300, _=Depends(hp_admin)):
    limit = max(1, min(limit, 1000))
    where, args = ["TRUE"], []
    if user_id:
        where.append("l.user_id = %s"); args.append(user_id)
    if result in ("ok", "failed"):
        where.append("l.ok" if result == "ok" else "NOT l.ok")
    with pool.connection() as c:
        return c.execute("SELECT l.id, l.at, l.email, l.ok, l.reason, l.ip, l.device, u.name FROM lens_logins l "
                         f"LEFT JOIN lens_users u ON u.id = l.user_id WHERE {' AND '.join(where)} ORDER BY l.at DESC LIMIT %s",
                         (*args, limit)).fetchall()
