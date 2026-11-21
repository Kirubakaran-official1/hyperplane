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
from datetime import datetime
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel, ConfigDict, Field

from . import fyers as fy
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


# ── Fyers Data Lab (Phase 3) — run from Hyperplane's admin (Admin → Lens admin → Fyers Data Lab) ──
# Fyers sends the admin back here after their sign-in (the redirect address registered in the Fyers API dashboard). The state must be
# one this server made for an admin in the last 10 minutes (used once); the code is exchanged for the day's token, stored sealed.
def _page(title, text, ok):
    color = "#059669" if ok else "#dc2626"
    return HTMLResponse(f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fyers · Hyperplane LENS</title><style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f6fa;font:15px/1.5 Inter,system-ui,sans-serif;color:#0f1b2d}}
.c{{max-width:420px;margin:16px;padding:28px;background:#fff;border:1px solid #dfe6ef;border-radius:12px;text-align:center}}
h1{{font-size:20px;margin:0 0 8px;color:{color}}}p{{margin:0;color:#4b5f7a}}</style></head>
<body><div class="c"><h1>{title}</h1><p>{text}</p></div></body></html>""", headers={"Cache-Control": "no-store"})


@app.get("/api/fyers/callback")
def fyers_callback(request: Request, auth_code: str = "", state: str = "", s: str = ""):
    _rate("fyers-callback", _ip(request), 20, 600)
    if not auth_code or s == "error":
        return _page("Fyers sign-in stopped", "Fyers did not complete the sign-in. Close this tab and try again from Admin → Lens admin → Fyers Data Lab.", False)
    try:
        with pool.connection() as c:
            fy.finish_login(c, state[:100], auth_code[:2000])
    except ValueError as e:
        return _page("Fyers is not connected", str(e), False)
    return _page("Fyers connected ✓", "The Data Lab can use Fyers until 6:30 am tomorrow. You can close this tab.", True)


@app.get("/internal/admin/fyers/status")
def fyers_status(_=Depends(hp_admin)):
    with pool.connection() as c:
        st = fy.settings(c)
        return {
            "settings": {"app_id": st["app_id"], "secret_set": bool(st["secret_enc"]), "redirect_uri": st["redirect_uri"], "plan": st["plan"],
                         "connected": fy.token_valid(st), "token_at": st["token_at"], "token_bad": st["token_bad"], "profile": st["profile"],
                         "consent": {"on": st["consent_on"], "ref": st["consent_ref"], "note": st["consent_note"], "by": st["consent_by"]}},
            "limits": {k: (int(v * fy.SHARE) if v else None) for k, v in fy.PLANS[st["plan"]].items()},
            "usage": fy.usage(c, st["plan"]),
            "per_min": c.execute("SELECT to_char(date_trunc('minute', at) AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') AS t, count(*) AS n, "
                                 "count(*) FILTER (WHERE code = -429 OR http = 429) AS limited FROM fyers_calls WHERE at > now() - interval '60 minutes' "
                                 "GROUP BY 1 ORDER BY 1").fetchall(),
            "calls": c.execute("SELECT at, endpoint, symbol, http, code, ok, ms, rows, note FROM fyers_calls ORDER BY id DESC LIMIT 40").fetchall(),
            "jobs": c.execute("SELECT id, kind, status, params, progress, message, by_admin, created_at, started_at, ended_at, wait_until "
                              "FROM fyers_jobs ORDER BY id DESC LIMIT 25").fetchall(),
            "manifest": c.execute("SELECT kind, status, count(*) AS n, coalesce(sum(rows), 0) AS rows, coalesce(sum(bytes), 0) AS bytes "
                                  "FROM fyers_manifest GROUP BY 1, 2 ORDER BY 1, 2").fetchall(),
            "failures": c.execute("SELECT id, kind, symbol, range_from, range_to, attempts, last_error FROM fyers_manifest WHERE status = 'failed' "
                                  "ORDER BY updated_at DESC LIMIT 50").fetchall(),
            "depth": c.execute("SELECT idx, kind, earliest, note, checked_at FROM fyers_depth ORDER BY idx, kind").fetchall(),
            "coverage": c.execute("SELECT idx, expiry, weekly, strikes, futures, rows, missing_pct, has_oi, has_greeks, note FROM fyers_coverage "
                                  "ORDER BY idx, expiry").fetchall(),
            "quality": c.execute("SELECT path, kind, idx, rows, days, missing_pct, dup_ts, bad_ohlc, nonpos, zero_vol_pct, first_ts, last_ts, checked_at "
                                 "FROM fyers_quality ORDER BY path LIMIT 2000").fetchall(),
            "indices": {k: {"spot": v["spot"], "from": v["fno_from"]} for k, v in fy.INDICES.items()},
        }


class FyersSettingsIn(Model):
    app_id: str | None = Field(None, max_length=40, pattern=r"^[A-Za-z0-9-]{5,40}$")
    secret: str | None = Field(None, max_length=120)
    redirect_uri: str | None = Field(None, max_length=200)
    plan: str | None = Field(None, pattern="^(standard|prime)$")


@app.post("/internal/admin/fyers/settings")
def fyers_settings(body: FyersSettingsIn, _=Depends(hp_admin)):
    lens_cb = r"^(https://[a-z0-9.-]+|http://(127\.0\.0\.1|localhost)(:\d+)?)/api/fyers/callback$"
    if body.redirect_uri is not None and body.redirect_uri != fy.FYERS_PAGE and not re.match(lens_cb, body.redirect_uri):
        raise HTTPException(422, f"The redirect address must be Fyers' page ({fy.FYERS_PAGE}) or https://<lens address>/api/fyers/callback")
    sets, args = [], []
    for k, v in (("app_id", body.app_id), ("redirect_uri", body.redirect_uri), ("plan", body.plan)):
        if v is not None:
            sets.append(f"{k} = %s"); args.append(v)
    if body.secret:
        sets.append("secret_enc = %s"); args.append(fy.seal(body.secret))
    if body.app_id is not None or body.secret:                      # another app: the old token no longer belongs to it
        sets += ["token_enc = ''", "token_at = NULL"]
    if sets:
        with pool.connection() as c:
            c.execute(f"UPDATE fyers_settings SET {', '.join(sets)}, updated_at = now() WHERE id = 1", args)
    return {"ok": True}


@app.post("/internal/admin/fyers/connect")
def fyers_connect(who=Depends(hp_admin)):
    try:
        with pool.connection() as c:
            return {"url": fy.login_url(c, who)}
    except ValueError as e:
        raise HTTPException(409, str(e))


class LinkIn(Model):
    link: str = Field(max_length=6000)


@app.post("/internal/admin/fyers/code")
def fyers_code(body: LinkIn, _=Depends(hp_admin)):
    """the address pasted from Fyers' page after the sign-in (when the app's Redirect URL is Fyers' own page)"""
    try:
        with pool.connection() as c:
            fy.finish_from_link(c, body.link)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return {"ok": True}


@app.post("/internal/admin/fyers/disconnect")
def fyers_disconnect(_=Depends(hp_admin)):
    with pool.connection() as c:
        c.execute("UPDATE fyers_settings SET token_enc = '', token_at = NULL, token_bad = NULL, updated_at = now() WHERE id = 1")
    return {"ok": True}


class ConsentIn(Model):
    on: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    ref: str = Field("", max_length=200)
    note: str = Field("", max_length=1000)


@app.post("/internal/admin/fyers/consent")
def fyers_consent(body: ConsentIn, who=Depends(hp_admin)):
    if body.on and not body.ref.strip():
        raise HTTPException(422, "Give the reference of Fyers' written consent (email / letter)")
    with pool.connection() as c:
        c.execute("UPDATE fyers_settings SET consent_on = %s, consent_ref = %s, consent_note = %s, consent_by = %s, updated_at = now() WHERE id = 1",
                  (body.on, body.ref.strip(), body.note.strip(), who if body.on else ""))
    return {"ok": True}


class JobIn(Model):
    kind: str = Field(pattern="^(depth|coverage|quality|bulk|speed)$")
    indices: list[str] = Field(default_factory=lambda: list(fy.INDICES), max_length=3)
    strikes: int = Field(25, ge=1, le=60)
    full_chain: bool = False
    spot: bool = True
    futures: bool = True
    options: bool = True
    minutes: int = Field(10, ge=1, le=30)
    start: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")       # download from this date (default: the first day Fyers has)


@app.post("/internal/admin/fyers/jobs")
def fyers_job(body: JobIn, who=Depends(hp_admin)):
    if not body.indices or any(i not in fy.INDICES for i in body.indices):
        raise HTTPException(422, "Choose NIFTY, BANKNIFTY and / or SENSEX")
    if body.start and body.start > datetime.now(fy.IST).date().isoformat():
        raise HTTPException(422, "The start date is in the future")
    with pool.connection() as c:
        s = fy.settings(c)
        if body.kind in ("bulk", "speed") and not s["consent_on"]:
            raise HTTPException(409, "Record Fyers' written consent first (Compliance) — storing a copy of Fyers data needs it")
        if c.execute("SELECT 1 FROM fyers_jobs WHERE kind = %s AND status IN ('queued', 'running', 'waiting', 'paused')", (body.kind,)).fetchone():
            raise HTTPException(409, "This one is already queued or running — pause or cancel it first")
        jid = c.execute("INSERT INTO fyers_jobs (kind, params, by_admin) VALUES (%s, %s, %s) RETURNING id",
                        (body.kind, json.dumps(body.model_dump(exclude={"kind"})), who)).fetchone()["id"]
    return {"ok": True, "id": jid}


class JobAction(Model):
    action: str = Field(pattern="^(pause|resume|cancel|retry_failed)$")


@app.post("/internal/admin/fyers/jobs/{jid}")
def fyers_job_action(jid: int, body: JobAction, _=Depends(hp_admin)):
    err = None
    with pool.connection() as c:
        j = c.execute("SELECT status, kind FROM fyers_jobs WHERE id = %s FOR UPDATE", (jid,)).fetchone()
        if not j:
            err = HTTPException(404, "No such job")
        elif body.action == "pause" and j["status"] in ("queued", "running", "waiting"):
            c.execute("UPDATE fyers_jobs SET status = 'paused', message = 'Pausing…' WHERE id = %s", (jid,))
        elif body.action == "resume" and j["status"] in ("paused", "failed", "waiting"):
            c.execute("UPDATE fyers_jobs SET status = 'queued', message = '', wait_until = NULL WHERE id = %s", (jid,))
        elif body.action == "cancel" and j["status"] not in ("done", "cancelled"):
            c.execute("UPDATE fyers_jobs SET status = 'cancelled', message = 'Cancelled', ended_at = now() WHERE id = %s", (jid,))
        elif body.action == "retry_failed" and j["kind"] == "bulk":
            c.execute("UPDATE fyers_manifest SET status = 'pending', attempts = 0 WHERE status = 'failed'")
            if j["status"] in ("done", "failed"):
                c.execute("UPDATE fyers_jobs SET status = 'queued', message = '', ended_at = NULL WHERE id = %s", (jid,))
        else:
            err = HTTPException(409, f"Not possible while it is {j['status']}")
    if err:
        raise err
    return {"ok": True}
