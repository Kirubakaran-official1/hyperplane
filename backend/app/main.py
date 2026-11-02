"""
Hyperplane API.

  /api/login  /api/logout  /api/me
  /api/snapshots            list collections (newest first), filter by date range
  /api/snapshots/{id}/data  the workbook as gzip JSON (cached by the browser forever — collections never change)
  /api/snapshots/{id}/excel download the original Excel
  /api/sync                 start a collection now
  /api/jobs                 collection history + live log
  /api/compare?a=&b=        stock-by-stock change between two collections (morning vs afternoon)
  /api/view-config          dashboard options set in Admin: index/ETF lists, technical indicator levels
  /api/admin/*              settings, import old Excel files, delete collections, system status,
                            customers (the /app accounts) and publishing the customer view
  /api/auth/check           used by Caddy: the dashboard files are only served to logged-in users
  /api/helpdesk/*           queries and conversations (users: their own; admins: everyone's, incl. customers)
  /api/admin/access, roles, modules     Access manager — roles and applications of the customer app (RBAC)
  /api/admin/activity/*     Activity log — sign-ins, devices, applications used and minutes per application
"""
import hmac
import os
import re
import shutil
import time as _time
from collections import defaultdict, deque
from datetime import date, datetime, timedelta

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel

from . import access_admin
from . import adoption
from . import activity as act
from . import config
from . import helpdesk as hd
from . import mailer
from .db import (DEFAULT_SETTINGS, TECH_TF_DEFAULT, get_auto_approve, get_history_enabled, get_meta, get_settings,
                 init_db, pool, put_settings, set_auto_approve, set_history_enabled, set_meta, get_history_changed)
from .schedule import TZ, next_runs, now, parse_hhmm
from .publish import FORMULA_VERSION, history_missing, publish
from . import evidence
from .security import hash_password
from .store import save_snapshot, taken_at_from_filename, workbook_to_sheets

app = FastAPI(title="Hyperplane", docs_url=None, redoc_url=None)
COOKIE = "hp_session"
DEV_COOKIE = "hp_dev"                               # one id per browser / system (Activity log)
EXCEL_DIR = os.path.join(config.DATA_DIR, "excel")


@app.on_event("startup")
def _startup():
    os.makedirs(EXCEL_DIR, exist_ok=True)
    init_db()


# ─────────────────────────────── auth ───────────────────────────────
def _serializer():
    return URLSafeTimedSerializer(config.secret_key(), salt="hp-session")


def current_user(request: Request):
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Please log in")
    try:
        name = _serializer().loads(token, max_age=config.session_hours() * 3600)
    except (BadSignature, SignatureExpired):
        raise HTTPException(401, "Session expired — please log in again")
    u = config.users().get(name)
    if not u:                                   # removed from config.ini -> logged out
        raise HTTPException(401, "User no longer exists")
    return {"name": name, "admin": u["admin"]}


def admin_user(user=Depends(current_user)):
    if not user["admin"]:
        raise HTTPException(403, "Admins only")
    return user


_attempts = defaultdict(deque)
_user_fails = {}                      # user id -> (failures, locked_until)
USER_MAX_FAILS, USER_LOCK_SECONDS = 5, 15 * 60


class LoginIn(BaseModel):
    username: str
    password: str


def _user_log(request: Request, event, name=None, known=True, **detail):
    """Dashboard (config.ini) sign-ins in the Activity log."""
    dev = request.cookies.get(DEV_COOKIE) or ""
    with pool.connection() as c:
        act.log(c, actor_kind="user", actor_id=name if known else None, actor_name=name, app="admin", event=event,
                device_id=dev if act.DEV_RE.match(dev) else None, device=act.device_label(request.headers.get("user-agent")),
                ip=_client_ip(request), detail=detail or None)


@app.post("/api/login")
def login(body: LoginIn, request: Request, response: Response):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    q = _attempts[ip]
    while q and q[0] < _time.time() - 300:
        q.popleft()
    if len(q) >= 8:
        raise HTTPException(429, "Too many attempts — wait 5 minutes")
    name = body.username.strip()
    fails, locked = _user_fails.get(name, (0, 0))
    u = config.users().get(name)
    if locked > _time.time():
        _user_log(request, "login_failed", name[:60], bool(u), reason="locked")
        raise HTTPException(429, "Too many attempts — wait 15 minutes")
    ok = bool(u) and hmac.compare_digest(u["password"].encode(), body.password.encode())
    if not ok:
        q.append(_time.time())
        fails += 1
        _user_fails[name] = (0, _time.time() + USER_LOCK_SECONDS) if fails >= USER_MAX_FAILS else (fails, 0)
        _user_log(request, "login_failed", name[:60], bool(u), reason="wrong_password" if u else "unknown_user")
        if u and fails >= USER_MAX_FAILS:
            _user_log(request, "locked", name, minutes=USER_LOCK_SECONDS // 60)
        _time.sleep(0.6)                           # slows down password guessing
        raise HTTPException(401, "Wrong user ID or password")
    q.clear()
    _user_fails.pop(name, None)
    token = _serializer().dumps(name)
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(COOKIE, token, max_age=config.session_hours() * 3600, httponly=True,
                        samesite="strict", secure=secure, path="/")
    dev, _ = act.device_id(request, DEV_COOKIE)
    act.set_device_cookie(request, response, DEV_COOKIE, dev, "/")
    with pool.connection() as c:
        act.log(c, actor_kind="user", actor_id=name, actor_name=name, app="admin", event="login", device_id=dev,
                device=act.device_label(request.headers.get("user-agent")), ip=_client_ip(request),
                detail={"admin": bool(u["admin"])})
    return {"name": body.username.strip(), "admin": u["admin"]}


@app.post("/api/logout")
def logout(request: Request, response: Response):
    try:
        u = current_user(request)
        _user_log(request, "logout", u["name"])
    except HTTPException:
        pass
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.get("/api/me")
def me(user=Depends(current_user)):
    return user


@app.get("/api/auth/check")
def auth_check(user=Depends(current_user)):
    return Response(status_code=204)


@app.get("/api/health")
def health():
    return {"ok": True, "time": now().isoformat()}


# ─────────────────────────────── collections ───────────────────────────────
META_COLS = "id, taken_at, trade_date, slot, source, label, stocks, signals, size_bytes, (excel_path IS NOT NULL) AS has_excel"


def _meta(r):
    r = dict(r)
    r["taken_at"] = r["taken_at"].astimezone(TZ).isoformat()
    r["trade_date"] = r["trade_date"].isoformat()
    return r


@app.get("/api/snapshots")
def list_snapshots(date_from: date | None = None, date_to: date | None = None, limit: int = 2000, user=Depends(current_user)):
    sql, args = f"SELECT {META_COLS} FROM snapshots WHERE TRUE", []
    if date_from:
        sql += " AND trade_date >= %s"; args.append(date_from)
    if date_to:
        sql += " AND trade_date <= %s"; args.append(date_to)
    sql += " ORDER BY taken_at DESC LIMIT %s"; args.append(min(limit, 5000))
    with pool.connection() as c:
        return [_meta(r) for r in c.execute(sql, args).fetchall()]


@app.get("/api/snapshots/latest")
def latest_snapshot(user=Depends(current_user)):
    with pool.connection() as c:
        r = c.execute(f"SELECT {META_COLS} FROM snapshots ORDER BY taken_at DESC LIMIT 1").fetchone()
    return _meta(r) if r else None


@app.get("/api/snapshots/{sid}/data")
def snapshot_data(sid: int, user=Depends(current_user)):
    with pool.connection() as c:
        r = c.execute("SELECT data_gz FROM snapshots WHERE id = %s", (sid,)).fetchone()
    if not r:
        raise HTTPException(404, "Collection not found")
    return Response(content=bytes(r["data_gz"]), media_type="application/json",
                    headers={"Content-Encoding": "gzip", "Cache-Control": "private, max-age=31536000, immutable"})


@app.get("/api/snapshots/{sid}/excel")
def snapshot_excel(sid: int, user=Depends(current_user)):
    with pool.connection() as c:
        r = c.execute("SELECT excel_path, taken_at FROM snapshots WHERE id = %s", (sid,)).fetchone()
    if not r or not r["excel_path"] or not os.path.exists(r["excel_path"]):
        raise HTTPException(404, "No Excel file stored for this collection")
    return FileResponse(r["excel_path"], filename=os.path.basename(r["excel_path"]),
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.get("/api/compare")
def compare(a: int, b: int, user=Depends(current_user)):
    """Stock-by-stock change from collection a (earlier) to b (later)."""
    with pool.connection() as c:
        metas = {r["id"]: _meta(r) for r in c.execute(f"SELECT {META_COLS} FROM snapshots WHERE id = ANY(%s)", ([a, b],)).fetchall()}
        if a not in metas or b not in metas:
            raise HTTPException(404, "Collection not found")
        rows = c.execute("""
            SELECT COALESCE(y.symbol, x.symbol) AS symbol,
                   COALESCE(y.sector, x.sector) AS sector, COALESCE(y.industry, x.industry) AS industry,
                   x.price AS price_a, y.price AS price_b, x.change_pct AS day_chg_a, y.change_pct AS day_chg_b,
                   x.bias AS bias_a, y.bias AS bias_b, COALESCE(x.n_signals,0) AS n_a, COALESCE(y.n_signals,0) AS n_b,
                   x.signals AS sig_a, y.signals AS sig_b, COALESCE(y.health, x.health) AS health,
                   COALESCE(y.is_fno, x.is_fno) AS is_fno
            FROM (SELECT * FROM snapshot_stocks WHERE snapshot_id = %s) x
            FULL OUTER JOIN (SELECT * FROM snapshot_stocks WHERE snapshot_id = %s) y ON x.symbol = y.symbol
        """, (a, b)).fetchall()
    out = []
    for r in rows:
        sa = set(filter(None, (r.pop("sig_a") or "").split("|")))
        sb = set(filter(None, (r.pop("sig_b") or "").split("|")))
        pa, pb = r["price_a"], r["price_b"]
        r["move_pct"] = round((pb / pa - 1) * 100, 2) if pa and pb else None
        r["new_signals"] = sorted(sb - sa)
        r["dropped_signals"] = sorted(sa - sb)
        if r["n_a"] or r["n_b"] or r["move_pct"] is not None:
            out.append(r)
    return {"a": metas[a], "b": metas[b], "rows": out}


# ─────────────────────────────── collection jobs ───────────────────────────────
def _job(r, with_log=False, tail=4000):
    r = dict(r)
    for k in ("created_at", "started_at", "finished_at"):
        r[k] = r[k].astimezone(TZ).isoformat() if r.get(k) else None
    if "trade_date" in r and r["trade_date"]:
        r["trade_date"] = r["trade_date"].isoformat()
    if with_log:
        r["log"] = (r.get("log") or "")[-tail:]
    else:
        r.pop("log", None)
    return r


@app.post("/api/sync")
def sync_now(user=Depends(admin_user)):
    with pool.connection() as c:
        busy = c.execute("SELECT * FROM jobs WHERE status IN ('queued','running') ORDER BY id LIMIT 1").fetchone()
        if busy:
            return {"job": _job(busy), "already_running": True}
        r = c.execute("INSERT INTO jobs (kind, trade_date, requested_by) VALUES ('manual', %s, %s) RETURNING *",
                      (now().date(), user["name"])).fetchone()
    return {"job": _job(r), "already_running": False}


@app.get("/api/jobs")
def list_jobs(limit: int = 50, active: bool = False, user=Depends(current_user)):
    with pool.connection() as c:
        if active:
            rows = c.execute("SELECT * FROM jobs WHERE status IN ('queued','running') ORDER BY id").fetchall()
        else:
            rows = c.execute("SELECT * FROM jobs ORDER BY id DESC LIMIT %s", (min(limit, 500),)).fetchall()
    return [_job(r) for r in rows]


@app.get("/api/jobs/{jid}")
def get_job(jid: int, user=Depends(current_user)):
    with pool.connection() as c:
        r = c.execute("SELECT * FROM jobs WHERE id = %s", (jid,)).fetchone()
    if not r:
        raise HTTPException(404, "Job not found")
    return _job(r, with_log=True)


@app.post("/api/jobs/{jid}/cancel")
def cancel_job(jid: int, user=Depends(admin_user)):
    with pool.connection() as c:
        r = c.execute("UPDATE jobs SET status='cancelled', finished_at=now() WHERE id=%s AND status='queued' RETURNING id",
                      (jid,)).fetchone()
    if not r:
        raise HTTPException(409, "Only a queued collection can be cancelled")
    return {"ok": True}


# ─────────────────────────────── admin ───────────────────────────────
class SettingsIn(BaseModel):
    schedule_times: list[str]
    weekdays_only: bool
    skip_dates: list[str] = []
    catch_up_minutes: int = 180
    retention_days: int = 0
    manual_keep: str = "all"
    telegram_enabled: bool = True
    nr_mother_body_pct: float = 60
    index_add: list[str] = []
    index_keep: list[str] = []
    tech_enabled: bool = True
    tech_weight: float = 1.0
    tech: dict = {}
    algos: list | None = None


def _symbols(items):
    return sorted({s.strip().upper().replace("NSE:", "").strip(",") for s in items if s.strip()})


def _tech_levels(raw):
    out = {}
    for tf in "DWMQY":
        given, cfg = (raw or {}).get(tf) or {}, {}
        for k, d in TECH_TF_DEFAULT.items():
            v = given.get(k, d)
            if k in ("adx_mode", "atr_mode"):
                cfg[k] = v if v in ("below", "above") else d
            else:
                try:
                    cfg[k] = float(v)
                except (TypeError, ValueError):
                    raise HTTPException(422, f"{tf} {k}: '{v}' is not a number")
        out[tf] = cfg
    return out


ALGO_TFS = set("DWMQY")
ALGO_FIELDS = {"close", "prev", "rsi", "rsi70", "adx", "atr", "cci", "macd", "st", "bbu", "bbl", "tz", "tn", "bn", "bz"}
ALGO_OPS = {">", ">=", "<", "<=", "=", "!="}


def _algos(raw):
    """Technical Quant algorithms from the Admin editor -> a clean list (None = use the ready-made set)."""
    if raw is None:
        return None
    def join_of(x):
        return "OR" if x.get("join") == "OR" else "AND"

    def items(raw_items, name, depth):
        out = []
        for r in (raw_items or [])[:30]:
            if r.get("group"):                               # bracket: its own AND / OR, nests up to 3 levels
                if depth >= 2:
                    raise HTTPException(422, f"'{name}': brackets can only go 3 levels deep")
                inner = items(r.get("rules"), name, depth + 1)
                if not inner:
                    raise HTTPException(422, f"'{name}': a bracket is empty")
                out.append({"group": True, "join": join_of(r), "rules": inner})
                continue
            tf, f, op, rhs = r.get("tf"), r.get("f"), r.get("op"), r.get("rhs", "num")
            if tf not in ALGO_TFS or f not in ALGO_FIELDS or op not in ALGO_OPS or rhs not in ("num", "field"):
                raise HTTPException(422, f"'{name}': a condition is incomplete")
            rule = {"tf": tf, "f": f, "op": op, "rhs": rhs}
            if rhs == "num":
                try:
                    rule["v"] = float(r.get("v"))
                except (TypeError, ValueError):
                    raise HTTPException(422, f"'{name}': '{r.get('v')}' is not a number")
            else:
                rtf, rf = r.get("rtf") or tf, r.get("rf")
                if rtf not in ALGO_TFS or rf not in ALGO_FIELDS:
                    raise HTTPException(422, f"'{name}': pick the value to compare with")
                rule.update(rtf=rtf, rf=rf)
            out.append(rule)
        return out

    out = []
    for n, a in enumerate(raw[:100], 1):
        name = str(a.get("name") or f"Algorithm {n}").strip()[:80]
        out.append({"id": str(a.get("id") or f"a{n}")[:40], "name": name, "join": join_of(a),
                    "dir": 1 if (a.get("dir") or 1) >= 0 else -1, "rules": items(a.get("rules"), name, 0)})
    return out


# ─────────────────────────────── customers (/app accounts) ───────────────────────────────
CUSTOMER_COLS = ("id, email, name, phone, country, state, city, status, expires_on, notes, created_at, approved_at, "
                 "last_login, login_count, failed_logins, locked_until, signup_ip")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$", re.I)


def _cust(r):
    r = dict(r)
    for k in ("created_at", "approved_at", "last_login", "locked_until"):
        r[k] = r[k].astimezone(TZ).isoformat() if r.get(k) else None
    r["expires_on"] = r["expires_on"].isoformat() if r.get("expires_on") else None
    return r


class CustomerIn(BaseModel):
    name: str
    email: str
    phone: str = ""
    country: str = ""
    state: str = ""
    city: str = ""
    password: str
    status: str = "approved"
    expires_on: date | None = None
    notes: str = ""


class CustomerPatch(BaseModel):
    status: str | None = None
    expires_on: date | None = None
    clear_expiry: bool = False
    notes: str | None = None
    unlock: bool = False


class PasswordIn(BaseModel):
    password: str


def _check_pw(pw):
    if not 8 <= len(pw) <= 128:
        raise HTTPException(422, "Password must be 8–128 characters")


class SignupModeIn(BaseModel):
    auto_approve: bool


@app.get("/api/admin/signup-mode")
def signup_mode(user=Depends(admin_user)):
    return {"auto_approve": get_auto_approve()}


@app.put("/api/admin/signup-mode")
def set_signup_mode(body: SignupModeIn, user=Depends(admin_user)):
    set_auto_approve(body.auto_approve)
    return {"auto_approve": get_auto_approve()}


class HistoryIn(BaseModel):
    enabled: bool


def _history_status():
    with pool.connection() as c:
        h = c.execute("SELECT count(*) AS n, count(DISTINCT trade_date) AS days, min(trade_date) AS first, max(trade_date) AS last "
                      "FROM customer_history").fetchone()
        sched = c.execute("SELECT count(*) AS n FROM snapshots WHERE source = 'scheduled'").fetchone()["n"]
    failed = get_meta("history_failed", {}) or {}
    return {"enabled": get_history_enabled(), "collections": h["n"], "days": h["days"], "scheduled": sched,
            "pending": len(history_missing()), "failed": len(failed), "changed": get_history_changed(),
            "error": next(iter(failed.values()), None),
            "first": h["first"].isoformat() if h["first"] else None, "last": h["last"].isoformat() if h["last"] else None}


# ─── Strength evidence (owner, 2026-11-01): every combination checked against what the price did afterwards ───
@app.get("/api/admin/evidence")
def evidence_status(user=Depends(admin_user)):
    return evidence.status()


@app.get("/api/admin/evidence/report")
def evidence_report(level: str = "nr", tf: str = "Q", horizon: int = 30, user=Depends(admin_user)):
    try:
        return evidence.report(level, tf, horizon)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/api/admin/evidence/rebuild")
def evidence_rebuild(user=Depends(admin_user)):
    """Rebuild every stored past day and stock state with the current formula (the worker does it in the background)."""
    evidence.rebuild_all()
    set_meta("history_failed", {})
    return {**evidence.status(), "pending": len(history_missing())}


@app.get("/api/admin/customer-history")
def customer_history_status(user=Depends(admin_user)):
    return _history_status()


@app.put("/api/admin/customer-history")
def set_customer_history(body: HistoryIn, user=Depends(admin_user)):
    if body.enabled:
        set_meta("history_failed", {})                     # switching on (again) retries anything that failed before
    set_history_enabled(body.enabled, by=user["name"])
    return _history_status()


@app.get("/api/admin/customers")
def list_customers(user=Depends(admin_user)):
    with pool.connection() as c:
        return [_cust(r) for r in c.execute(
            f"SELECT {CUSTOMER_COLS}, ARRAY(SELECT role_id FROM customer_roles r WHERE r.customer_id = customers.id ORDER BY role_id) AS roles, "
            "(SELECT count(*) FROM customer_sessions s WHERE s.customer_id = customers.id AND s.ended_at IS NULL "
            " AND s.created_at > now() - interval '7 days') AS devices "
            "FROM customers ORDER BY created_at DESC").fetchall()]


def _end_sessions(c, cid, reason, by, event=None, name=None):
    """Sign a customer out on every device (their session rows end; the cookie check refuses them)."""
    n = c.execute("UPDATE customer_sessions SET ended_at = now(), end_reason = %s WHERE customer_id = %s AND ended_at IS NULL",
                  (reason, cid)).rowcount
    if event:
        act.log(c, actor_kind="customer", actor_id=cid, actor_name=name, app="customer", event=event,
                detail={"by": by, "devices": n})
    return n


@app.post("/api/admin/customers")
def create_customer(body: CustomerIn, user=Depends(admin_user)):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email) or len(body.name.strip()) < 2:
        raise HTTPException(422, "Enter a name and a valid email")
    if body.status not in ("pending", "approved", "blocked"):
        raise HTTPException(422, "Unknown status")
    _check_pw(body.password)
    with pool.connection() as c:
        if c.execute("SELECT 1 FROM customers WHERE email = %s", (email,)).fetchone():
            raise HTTPException(409, "A customer with this email already exists")
        r = c.execute("INSERT INTO customers (email, name, phone, country, state, city, pw_hash, status, expires_on, notes, approved_at) "
                      "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, CASE WHEN %s = 'approved' THEN now() END) RETURNING " + CUSTOMER_COLS,
                      (email, body.name.strip()[:80], body.phone.strip()[:20], body.country.strip()[:60], body.state.strip()[:60],
                       body.city.strip()[:60], hash_password(body.password), body.status, body.expires_on, body.notes[:500],
                       body.status)).fetchone()
    return _cust(r)


@app.patch("/api/admin/customers/{cid}")
def update_customer(cid: int, body: CustomerPatch, user=Depends(admin_user)):
    sets, args = [], []
    if body.status is not None:
        if body.status not in ("pending", "approved", "blocked"):
            raise HTTPException(422, "Unknown status")
        sets.append("status = %s"); args.append(body.status)
        if body.status == "approved":
            sets.append("approved_at = COALESCE(approved_at, now())")
        else:
            sets.append("session_ver = session_ver + 1")          # logged out right away
    if body.expires_on is not None or body.clear_expiry:
        sets.append("expires_on = %s"); args.append(None if body.clear_expiry else body.expires_on)
    if body.notes is not None:
        sets.append("notes = %s"); args.append(body.notes[:500])
    if body.unlock:
        sets.append("failed_logins = 0, locked_until = NULL")
    if not sets:
        raise HTTPException(422, "Nothing to change")
    with pool.connection() as c:
        r = c.execute(f"UPDATE customers SET {', '.join(sets)} WHERE id = %s RETURNING {CUSTOMER_COLS}", (*args, cid)).fetchone()
        if r and body.status in ("blocked", "pending"):
            _end_sessions(c, cid, "blocked", user["name"], "blocked" if body.status == "blocked" else None, r["name"])
    if not r:
        raise HTTPException(404, "Customer not found")
    return _cust(r)


@app.post("/api/admin/customers/{cid}/password")
def reset_customer_password(cid: int, body: PasswordIn, user=Depends(admin_user)):
    _check_pw(body.password)
    with pool.connection() as c:
        r = c.execute("UPDATE customers SET pw_hash = %s, session_ver = session_ver + 1, failed_logins = 0, locked_until = NULL "
                      "WHERE id = %s RETURNING id, name", (hash_password(body.password), cid)).fetchone()
        if r:
            _end_sessions(c, cid, "password_reset", user["name"], "password_reset", r["name"])
    if not r:
        raise HTTPException(404, "Customer not found")
    return {"ok": True}


@app.delete("/api/admin/customers/{cid}")
def delete_customer(cid: int, user=Depends(admin_user)):
    with pool.connection() as c:
        r = c.execute("DELETE FROM customers WHERE id = %s RETURNING id", (cid,)).fetchone()
    if not r:
        raise HTTPException(404, "Customer not found")
    return {"ok": True}


# ─────────────────────────────── Access manager (RBAC, customer app only) ───────────────────────────────
# Roles, permissions, direct grants and the paged customer ↔ role mapping live in access_admin.py (Access manager v2).
def _iso(v):
    return v.astimezone(TZ).isoformat() if v else None


def _modules_all(c):
    return c.execute("SELECT key, name, description, sort, enabled FROM app_modules ORDER BY sort, key").fetchall()


app.include_router(access_admin.build(admin_user, _cust, CUSTOMER_COLS))


# ─────────────────────────────── Adoption report (adoption.py) ───────────────────────────────
@app.get("/api/admin/adoption")
def adoption_report(days: int = Query(30), user=Depends(admin_user)):
    if days not in (7, 30, 90):
        raise HTTPException(422, "days is 7, 30 or 90")
    with pool.connection() as c:
        return adoption.report(c, days)


@app.get("/api/admin/adoption/customers")
def adoption_customers(segment: str | None = None, q: str = "", sort: str = "score", page: int = Query(1, ge=1),
                       size: int = Query(50, ge=1, le=200), user=Depends(admin_user)):
    if segment and segment not in dict(adoption.SEGMENTS):
        raise HTTPException(422, "Unknown segment")
    with pool.connection() as c:
        return adoption.customers(c, segment, q, sort, page, size)


# ─────────────────────────────── Activity log ───────────────────────────────
ACTIVE_MINUTES = 5                                  # "active now" = seen in the last 5 minutes
SESSION_DAYS = 7                                    # customer sessions last 7 days (portal.SESSION_SECONDS)
RETENTION_CHOICES = (30, 90, 180, 365, 730)


def _range(date_from: date | None, date_to: date | None):
    """IST calendar days, inclusive → UTC instants. Default: the last 7 days."""
    today = now().date()
    d2 = min(date_to or today, today)
    d1 = date_from or (d2 - timedelta(days=6))
    if d1 > d2:
        d1, d2 = d2, d1
    if (d2 - d1).days > 800:
        d1 = d2 - timedelta(days=800)
    start = datetime.combine(d1, datetime.min.time(), TZ)
    end = datetime.combine(d2 + timedelta(days=1), datetime.min.time(), TZ)
    return d1, d2, start, end


def _session_status(s, at):
    if s["ended_at"]:
        return {"signed_out": "signed_out", "revoked": "revoked", "blocked": "blocked", "password_reset": "password_reset"}.get(s["end_reason"], "signed_out")
    if s["created_at"] < at - timedelta(days=SESSION_DAYS):
        return "expired"
    return "active" if s["last_seen"] > at - timedelta(minutes=ACTIVE_MINUTES) else "idle"


@app.get("/api/admin/activity/summary")
def activity_summary(date_from: date | None = None, date_to: date | None = None, user=Depends(admin_user)):
    d1, d2, start, end = _range(date_from, date_to)
    with pool.connection() as c:
        k = c.execute(
            "SELECT "
            f"(SELECT count(DISTINCT customer_id) FROM customer_sessions WHERE ended_at IS NULL AND last_seen > now() - interval '{ACTIVE_MINUTES} minutes') AS active_now, "
            f"(SELECT count(*) FROM customer_sessions WHERE ended_at IS NULL AND created_at > now() - interval '{SESSION_DAYS} days') AS devices_signed_in, "
            "(SELECT count(*) FROM activity_log WHERE app = 'customer' AND event = 'login' AND at >= %(s)s AND at < %(e)s) AS signins, "
            "(SELECT count(*) FROM activity_log WHERE app = 'customer' AND event = 'signup' AND at >= %(s)s AND at < %(e)s) AS signups, "
            "(SELECT count(*) FROM activity_log WHERE app = 'customer' AND event IN ('login_failed', 'locked') AND at >= %(s)s AND at < %(e)s) AS failed, "
            "(SELECT count(*) FROM activity_log WHERE app = 'admin' AND event = 'login' AND at >= %(s)s AND at < %(e)s) AS admin_signins, "
            "(SELECT count(*) FROM activity_log WHERE app = 'admin' AND event IN ('login_failed', 'locked') AND at >= %(s)s AND at < %(e)s) AS admin_failed, "
            "(SELECT count(DISTINCT customer_id) FROM customer_sessions WHERE last_seen >= %(s)s AND created_at < %(e)s) AS people, "
            "(SELECT count(*) FROM (SELECT customer_id FROM customer_sessions WHERE last_seen >= %(s)s AND created_at < %(e)s "
            "  GROUP BY customer_id HAVING count(DISTINCT device_id) >= 3) x) AS multi_device, "
            "(SELECT COALESCE(sum(minutes), 0) FROM module_usage WHERE day BETWEEN %(d1)s AND %(d2)s) AS minutes",
            {"s": start, "e": end, "d1": d1, "d2": d2}).fetchone()
        mods = _modules_all(c)
        use = {r["module"]: r for r in c.execute(
            "SELECT module, count(DISTINCT customer_id) AS people, count(DISTINCT session_id) AS sessions, sum(minutes) AS minutes "
            "FROM module_usage WHERE day BETWEEN %s AND %s GROUP BY module", (d1, d2))}
        opens = {r["module"]: r["n"] for r in c.execute(
            "SELECT module, count(*) AS n FROM activity_log WHERE event = 'open' AND at >= %s AND at < %s GROUP BY module", (start, end))}
        daily_use = {r["day"]: r for r in c.execute(
            "SELECT day, count(DISTINCT customer_id) AS people, sum(minutes) AS minutes FROM module_usage "
            "WHERE day BETWEEN %s AND %s GROUP BY day", (d1, d2))}
        daily_in = {r["day"]: r for r in c.execute(
            "SELECT (at AT TIME ZONE 'Asia/Kolkata')::date AS day, count(*) FILTER (WHERE event = 'login') AS signins, "
            "count(*) FILTER (WHERE event IN ('login_failed', 'locked')) AS failed "
            "FROM activity_log WHERE app = 'customer' AND at >= %s AND at < %s GROUP BY 1", (start, end))}
        hours = [0] * 24
        for r in c.execute("SELECT extract(hour FROM at AT TIME ZONE 'Asia/Kolkata')::int AS h, count(*) AS n FROM activity_log "
                           "WHERE app = 'customer' AND event IN ('login', 'open') AND at >= %s AND at < %s GROUP BY 1", (start, end)):
            hours[r["h"]] = r["n"]
        top = c.execute(
            "SELECT u.customer_id AS id, c.name, c.email, sum(u.minutes) AS minutes, "
            "array_agg(DISTINCT u.module) AS modules, max(u.last_at) AS last_at, "
            "(SELECT count(DISTINCT device_id) FROM customer_sessions s WHERE s.customer_id = u.customer_id AND s.last_seen >= %s) AS devices "
            "FROM module_usage u JOIN customers c ON c.id = u.customer_id WHERE u.day BETWEEN %s AND %s "
            "GROUP BY u.customer_id, c.name, c.email ORDER BY minutes DESC LIMIT 10", (start, d1, d2)).fetchall()
    days, d = [], d1
    while d <= d2:
        u, i = daily_use.get(d) or {}, daily_in.get(d) or {}
        days.append({"day": d.isoformat(), "people": u.get("people", 0), "minutes": u.get("minutes", 0) or 0,
                     "signins": i.get("signins", 0), "failed": i.get("failed", 0)})
        d += timedelta(days=1)
    return {"from": d1.isoformat(), "to": d2.isoformat(), "kpis": k,
            "modules": [{"key": m["key"], "name": m["name"], "enabled": m["enabled"], "opens": opens.get(m["key"], 0),
                         **{x: int((use.get(m["key"]) or {}).get(x) or 0) for x in ("people", "sessions", "minutes")}} for m in mods],
            "days": days, "hours": hours,
            "top": [{**t, "last_at": _iso(t["last_at"])} for t in top]}


@app.get("/api/admin/activity/events")
def activity_events(date_from: date | None = None, date_to: date | None = None, app_: str | None = Query(None, alias="app"), event: str | None = None,
                    module: str | None = None, q: str | None = None, actor: str | None = None,
                    limit: int = 100, offset: int = 0, user=Depends(admin_user)):
    _, _, start, end = _range(date_from, date_to)
    where, args = ["a.at >= %s", "a.at < %s"], [start, end]
    if app_ in ("customer", "admin"):
        where.append("a.app = %s"); args.append(app_)
    if event:
        evs = [e for e in event.split(",") if e]
        where.append("a.event = ANY(%s)"); args.append(evs)
    if module:
        where.append("a.module = %s"); args.append(module)
    if actor and ":" in actor:                                    # customer:12 | user:admin
        kind, aid = actor.split(":", 1)
        where.append("a.actor_kind = %s AND a.actor_id = %s"); args += [kind, aid]
    if q and q.strip():
        like = f"%{q.strip()[:80]}%"
        where.append("(a.actor_name ILIKE %s OR c.email ILIKE %s OR a.ip ILIKE %s OR a.device ILIKE %s)"); args += [like] * 4
    sql_from = ("FROM activity_log a LEFT JOIN customers c ON a.actor_kind = 'customer' AND c.id::text = a.actor_id "
                "WHERE " + " AND ".join(where))
    limit, offset = max(1, min(limit, 5000)), max(0, offset)
    with pool.connection() as c:
        total = c.execute(f"SELECT count(*) AS n {sql_from}", args).fetchone()["n"]
        rows = c.execute(f"SELECT a.id, a.at, a.actor_kind, a.actor_id, a.actor_name, c.email, a.app, a.module, a.event, "
                         f"a.device, a.ip, a.session_id, a.device_id, a.detail {sql_from} ORDER BY a.at DESC, a.id DESC LIMIT %s OFFSET %s",
                         [*args, limit, offset]).fetchall()
    return {"total": total, "rows": [{**r, "at": _iso(r["at"])} for r in rows]}


@app.get("/api/admin/activity/sessions")
def activity_sessions(date_from: date | None = None, date_to: date | None = None, user=Depends(admin_user)):
    """People & devices: every customer seen in the range (or still signed in), each device and each session."""
    _, _, start, end = _range(date_from, date_to)
    at = now()
    with pool.connection() as c:
        rows = c.execute(
            "SELECT s.id, s.customer_id, s.device_id, s.device, s.ip, s.last_ip, s.created_at, s.last_seen, s.ended_at, s.end_reason, "
            "c.name, c.email, c.status, "
            "(SELECT COALESCE(sum(minutes), 0) FROM module_usage u WHERE u.session_id = s.id) AS minutes, "
            "ARRAY(SELECT DISTINCT module FROM module_usage u WHERE u.session_id = s.id) AS modules "
            "FROM customer_sessions s JOIN customers c ON c.id = s.customer_id "
            "WHERE (s.last_seen >= %s AND s.created_at < %s) OR (s.ended_at IS NULL AND s.created_at > now() - interval '7 days') "
            "ORDER BY s.last_seen DESC LIMIT 5000", (start, end)).fetchall()
    people = {}
    for s in rows:
        p = people.setdefault(s["customer_id"], {"id": s["customer_id"], "name": s["name"], "email": s["email"], "status": s["status"],
                                                 "sessions": [], "devices": set(), "ips": set(), "last_seen": s["last_seen"], "minutes": 0})
        st = _session_status(s, at)
        p["sessions"].append({"id": s["id"], "device_id": s["device_id"], "device": s["device"], "ip": s["ip"], "last_ip": s["last_ip"],
                              "created_at": _iso(s["created_at"]), "last_seen": _iso(s["last_seen"]), "ended_at": _iso(s["ended_at"]),
                              "status": st, "minutes": s["minutes"], "modules": s["modules"]})
        p["devices"].add(s["device_id"] or s["id"])
        p["ips"].update(x for x in (s["ip"], s["last_ip"]) if x)
        p["minutes"] += s["minutes"]
    out = []
    for p in people.values():
        live = [x for x in p["sessions"] if x["status"] in ("active", "idle")]
        out.append({**p, "devices": len(p["devices"]), "ips": len(p["ips"]), "last_seen": _iso(p["last_seen"]),
                    "signed_in": len(live), "active": sum(x["status"] == "active" for x in live)})
    out.sort(key=lambda p: (p["active"] > 0, p["signed_in"] > 0, p["last_seen"] or ""), reverse=True)
    return {"people": out}


@app.get("/api/admin/activity/users")
def activity_users(date_from: date | None = None, date_to: date | None = None, user=Depends(admin_user)):
    """Dashboard users (config.ini): sign-ins, failures and devices in the range."""
    _, _, start, end = _range(date_from, date_to)
    with pool.connection() as c:
        rows = c.execute(
            "SELECT actor_name AS name, bool_or(actor_id IS NOT NULL) AS known, "
            "count(*) FILTER (WHERE event = 'login') AS signins, count(*) FILTER (WHERE event IN ('login_failed', 'locked')) AS failed, "
            "max(at) FILTER (WHERE event = 'login') AS last_login, count(DISTINCT device_id) AS devices, count(DISTINCT ip) AS ips, "
            "array_agg(DISTINCT device) FILTER (WHERE device IS NOT NULL) AS device_names "
            "FROM activity_log WHERE app = 'admin' AND event IN ('login', 'login_failed', 'locked', 'logout') AND at >= %s AND at < %s "
            "GROUP BY actor_name ORDER BY max(at) DESC", (start, end)).fetchall()
    users = config.users()
    return {"users": [{**r, "last_login": _iso(r["last_login"]), "admin": bool(users.get(r["name"], {}).get("admin")),
                       "exists": r["name"] in users} for r in rows]}


@app.get("/api/admin/activity/person/{cid}")
def activity_person(cid: int, user=Depends(admin_user)):
    """Everything about one customer: profile, roles, applications, devices, minutes per application and recent events."""
    at = now()
    with pool.connection() as c:
        r = c.execute(f"SELECT {CUSTOMER_COLS} FROM customers WHERE id = %s", (cid,)).fetchone()
        if not r:
            raise HTTPException(404, "Customer not found")
        roles = c.execute("SELECT r.id, r.name, cr.assigned_at, cr.assigned_by FROM customer_roles cr JOIN roles r ON r.id = cr.role_id "
                          "WHERE cr.customer_id = %s ORDER BY r.name", (cid,)).fetchall()
        eff = c.execute("SELECT e.key, p.module, p.action, p.name, p.restricted FROM effective_permissions e "
                        "JOIN app_permissions p ON p.key = e.key JOIN app_modules m ON m.key = p.module "
                        "WHERE e.customer_id = %s ORDER BY m.sort, p.sort", (cid,)).fetchall()
        names = {m["key"]: m["name"] for m in _modules_all(c)}
        apps = [{"key": x["module"], "name": names[x["module"]]} for x in eff if x["action"] == "view"]
        perms = [{k: x[k] for k in ("key", "module", "name", "restricted")} for x in eff if x["action"] != "view"]
        sessions = c.execute(
            "SELECT s.*, (SELECT COALESCE(sum(minutes), 0) FROM module_usage u WHERE u.session_id = s.id) AS minutes "
            "FROM customer_sessions s WHERE customer_id = %s ORDER BY last_seen DESC LIMIT 200", (cid,)).fetchall()
        usage = c.execute("SELECT module, sum(minutes) AS minutes, count(DISTINCT day) AS days, max(last_at) AS last_at "
                          "FROM module_usage WHERE customer_id = %s GROUP BY module", (cid,)).fetchall()
        daily = c.execute("SELECT day, sum(minutes) AS minutes FROM module_usage WHERE customer_id = %s AND day > current_date - 30 "
                          "GROUP BY day ORDER BY day", (cid,)).fetchall()
        events = c.execute("SELECT id, at, app, module, event, device, ip, detail FROM activity_log "
                           "WHERE actor_kind = 'customer' AND actor_id = %s ORDER BY at DESC LIMIT 150", (str(cid),)).fetchall()
    devices = {}
    for s in sessions:
        d = devices.setdefault(s["device_id"] or s["id"], {"device_id": s["device_id"], "device": s["device"], "first_seen": s["created_at"],
                                                           "last_seen": s["last_seen"], "sessions": 0, "ips": set(), "live": 0, "minutes": 0})
        d["sessions"] += 1; d["minutes"] += s["minutes"]
        d["first_seen"] = min(d["first_seen"], s["created_at"]); d["last_seen"] = max(d["last_seen"], s["last_seen"])
        d["ips"].update(x for x in (s["ip"], s["last_ip"]) if x)
        d["live"] += _session_status(s, at) in ("active", "idle")
    return {
        "customer": _cust(r), "roles": [{**x, "assigned_at": _iso(x["assigned_at"])} for x in roles], "apps": apps,
        "permissions": perms,
        "devices": sorted([{**d, "ips": sorted(d["ips"]), "first_seen": _iso(d["first_seen"]), "last_seen": _iso(d["last_seen"])}
                           for d in devices.values()], key=lambda d: d["last_seen"], reverse=True),
        "sessions": [{"id": s["id"], "device": s["device"], "device_id": s["device_id"], "ip": s["ip"], "last_ip": s["last_ip"],
                      "created_at": _iso(s["created_at"]), "last_seen": _iso(s["last_seen"]), "ended_at": _iso(s["ended_at"]),
                      "status": _session_status(s, at), "minutes": s["minutes"]} for s in sessions],
        "usage": [{**u, "last_at": _iso(u["last_at"])} for u in usage],
        "daily": [{"day": d["day"].isoformat(), "minutes": d["minutes"]} for d in daily],
        "events": [{**e, "at": _iso(e["at"])} for e in events],
    }


@app.post("/api/admin/activity/sessions/{sid}/revoke")
def revoke_session(sid: str, user=Depends(admin_user)):
    with pool.connection() as c:
        s = c.execute("UPDATE customer_sessions s SET ended_at = now(), end_reason = 'revoked' FROM customers c "
                      "WHERE s.id = %s AND s.ended_at IS NULL AND c.id = s.customer_id RETURNING s.customer_id, s.device, s.device_id, c.name",
                      (sid,)).fetchone()
        if not s:
            raise HTTPException(404, "This device is already signed out")
        act.log(c, actor_kind="customer", actor_id=s["customer_id"], actor_name=s["name"], session_id=sid, device_id=s["device_id"],
                device=s["device"], app="customer", event="session_revoked", detail={"by": user["name"]})
    return {"ok": True}


@app.post("/api/admin/customers/{cid}/signout-all")
def signout_all(cid: int, user=Depends(admin_user)):
    with pool.connection() as c:
        r = c.execute("UPDATE customers SET session_ver = session_ver + 1 WHERE id = %s RETURNING name", (cid,)).fetchone()
        if not r:
            raise HTTPException(404, "Customer not found")
        n = _end_sessions(c, cid, "revoked", user["name"], "signed_out_all", r["name"])
    return {"ok": True, "devices": n}


class RetentionIn(BaseModel):
    days: int


@app.get("/api/admin/activity/retention")
def activity_retention(user=Depends(admin_user)):
    with pool.connection() as c:
        oldest = c.execute("SELECT min(at) AS a, count(*) AS n FROM activity_log").fetchone()
    return {"days": int(get_settings()["activity_retention_days"]), "choices": RETENTION_CHOICES,
            "oldest": _iso(oldest["a"]), "events": oldest["n"]}


@app.put("/api/admin/activity/retention")
def set_activity_retention(body: RetentionIn, user=Depends(admin_user)):
    if body.days not in RETENTION_CHOICES:
        raise HTTPException(422, "Pick one of the offered periods")
    put_settings({"activity_retention_days": body.days})
    return activity_retention(user)


# ─────────────────────────────── publishing the customer view ───────────────────────────────
def _pub_meta(r):
    return {"id": r["id"], "published_at": r["published_at"].astimezone(TZ).isoformat(),
            "as_of": r["data_as_of"].astimezone(TZ).isoformat() if r["data_as_of"] else None,
            "mode": r["mode"], "by": r["published_by"], "stocks": r["stocks"], "snapshot_id": r["snapshot_id"]}


@app.get("/api/admin/publish")
def publish_status(user=Depends(admin_user)):
    with pool.connection() as c:
        rows = c.execute("SELECT id, published_at, data_as_of, mode, published_by, stocks, snapshot_id "
                         "FROM published ORDER BY id DESC LIMIT 10").fetchall()
    return {"mode": get_settings()["publish_mode"], "history": [_pub_meta(r) for r in rows]}


class PublishModeIn(BaseModel):
    mode: str


@app.put("/api/admin/publish/mode")
def set_publish_mode(body: PublishModeIn, user=Depends(admin_user)):
    if body.mode not in ("manual", "auto"):
        raise HTTPException(422, "mode must be 'manual' or 'auto'")
    put_settings({"publish_mode": body.mode})
    return {"mode": body.mode}


@app.post("/api/admin/publish")
def publish_now(snapshot_id: int | None = None, user=Depends(admin_user)):
    try:
        return publish(snapshot_id, mode="manual", by=user["name"])
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.get("/api/admin/publish/preview")
def publish_preview(snapshot_id: int | None = None, user=Depends(admin_user)):
    try:
        p = publish(snapshot_id, dry_run=True)
    except ValueError as e:
        raise HTTPException(404, str(e))
    by = {s["s"]: s for s in p["stocks"]}
    breadth = {tf: {k: sum(1 for s in p["stocks"] if s["r"][i] == k) for k in "GMW-"} for i, tf in enumerate("DWMQY")}
    return {"as_of": p["as_of"], "stocks": len(p["stocks"]), "breadth": breadth, "top": [by[s] for s in p["top"]]}


@app.get("/api/view-config")
def view_config(user=Depends(current_user)):
    s = get_settings()
    return {"index_add": s["index_add"], "index_keep": s["index_keep"],
            "tech_enabled": s["tech_enabled"], "tech_weight": s["tech_weight"], "tech": _tech_levels(s["tech"]),
            "algos": s["algos"]}


@app.get("/api/admin/settings")
def read_settings(user=Depends(admin_user)):
    s = get_settings()
    return {"settings": s, "defaults": DEFAULT_SETTINGS,
            "next_runs": [d.isoformat() for d in next_runs(s, 6)]}


@app.put("/api/admin/settings")
def write_settings(body: SettingsIn, user=Depends(admin_user)):
    try:
        times = sorted({parse_hhmm(t).strftime("%H:%M") for t in body.schedule_times})
        skips = sorted({date.fromisoformat(d.strip()).isoformat() for d in body.skip_dates if d.strip()})
    except ValueError as e:
        raise HTTPException(422, f"Check the times and dates: {e}")
    if body.manual_keep not in ("all", "latest"):
        raise HTTPException(422, "manual_keep must be 'all' or 'latest'")
    if not 1 <= body.nr_mother_body_pct <= 100:
        raise HTTPException(422, "Mother candle body % must be between 1 and 100")
    s = body.model_dump()
    s.update(schedule_times=times, skip_dates=skips, retention_days=max(0, body.retention_days),
             catch_up_minutes=max(0, min(body.catch_up_minutes, 720)),
             index_add=_symbols(body.index_add), index_keep=_symbols(body.index_keep),
             tech=_tech_levels(body.tech), tech_weight=max(0.0, min(body.tech_weight, 5.0)), algos=_algos(body.algos))
    put_settings(s)
    return read_settings(user)


@app.delete("/api/admin/snapshots/{sid}")
def delete_snapshot(sid: int, user=Depends(admin_user)):
    with pool.connection() as c:
        r = c.execute("DELETE FROM snapshots WHERE id = %s RETURNING excel_path", (sid,)).fetchone()
    if not r:
        raise HTTPException(404, "Collection not found")
    if r["excel_path"] and os.path.exists(r["excel_path"]):
        os.remove(r["excel_path"])
    return {"ok": True}


@app.post("/api/admin/import")
async def import_excel(files: list[UploadFile] = File(...), user=Depends(admin_user)):
    """Load old detailed_signals_YYYYMMDD.xlsx files so the history starts full."""
    results = []
    for f in files:
        name = os.path.basename(f.filename or "upload.xlsx")
        if not name.lower().endswith(".xlsx"):
            results.append({"file": name, "ok": False, "error": "not an .xlsx file"}); continue
        taken = taken_at_from_filename(name, TZ) or now()
        dest = os.path.join(EXCEL_DIR, f"import_{taken.strftime('%Y%m%d_%H%M')}_{name}")
        with open(dest, "wb") as out:
            shutil.copyfileobj(f.file, out)
        try:
            sheets = workbook_to_sheets(dest)
            if not any(k.lower().startswith("flat") for k in sheets):
                raise ValueError("this does not look like a detailed_signals workbook")
            sid = save_snapshot(sheets, taken, "import", label=taken.strftime("%d %b %Y %H:%M") + " · imported",
                                excel_path=dest)
            results.append({"file": name, "ok": True, "id": sid, "taken_at": taken.isoformat()})
        except Exception as e:                                   # noqa: BLE001 — report per file
            os.remove(dest)
            results.append({"file": name, "ok": False, "error": str(e)})
    return {"results": results}


class MailTestIn(BaseModel):
    to: str


@app.get("/api/admin/mail")
def mail_status(user=Depends(admin_user)):
    """Email (Forgot password): set up in config.ini [mail]? sent / waiting / failed in the last day, the last error"""
    with pool.connection() as c:
        return mailer.status(c)


@app.post("/api/admin/mail/test")
def mail_test(body: MailTestIn, user=Depends(admin_user)):
    """send one test email straight away and say plainly what went wrong, if anything"""
    to = body.to.strip()
    if not re.match(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$", to, re.I):
        raise HTTPException(422, "Enter a valid email address")
    cfg = config.mail()
    try:
        mailer.send(cfg, to, *mailer.render("test", {}, cfg))
    except mailer.MailNotSetUp as e:
        raise HTTPException(422, str(e))
    except Exception as e:                                   # noqa: BLE001 — the admin needs the reason
        raise HTTPException(502, f"The email service refused it: {type(e).__name__}: {str(e)[:300]}")
    return {"ok": True, "message": f"Sent to {to}. Check the inbox (and spam) in a minute."}


@app.get("/api/admin/system")
def system(user=Depends(admin_user)):
    with pool.connection() as c:
        db_size = c.execute("SELECT pg_database_size(current_database()) AS b").fetchone()["b"]
        agg = c.execute("SELECT count(*) AS n, min(taken_at) AS first, max(taken_at) AS last, "
                        "coalesce(sum(size_bytes),0) AS bytes FROM snapshots").fetchone()
        running = c.execute("SELECT * FROM jobs WHERE status IN ('queued','running') ORDER BY id").fetchall()
    beat = get_meta("worker_heartbeat")
    alive = False
    if beat:
        alive = (now() - datetime.fromisoformat(beat)).total_seconds() < 90
    du = shutil.disk_usage(config.DATA_DIR)
    return {
        "server_time": now().isoformat(),
        "worker": {"alive": alive, "last_seen": beat},
        "db_bytes": db_size, "collections": agg["n"],
        "first": agg["first"].astimezone(TZ).isoformat() if agg["first"] else None,
        "last": agg["last"].astimezone(TZ).isoformat() if agg["last"] else None,
        "stored_bytes": agg["bytes"],
        "disk": {"total": du.total, "free": du.free},
        "active_jobs": [_job(r) for r in running],
        "users": [{"name": n, "admin": u["admin"]} for n, u in config.users().items()],
        "telegram_configured": config.telegram() is not None,
    }


# ─────────────────────────────── helpdesk ───────────────────────────────
# Users raise queries and see only their own; admins see every query (customers' and users') and answer them.
def _client_ip(request: Request):
    return request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()


def hd_actor(request: Request):
    hd.guard_ip(_client_ip(request))              # before the session check and before any database work
    u = current_user(request)
    return {"kind": "admin" if u["admin"] else "user", "id": u["name"], "name": u["name"], "staff": u["admin"]}


class TicketIn(BaseModel):
    subject: str
    severity: str
    body: list


class MessageIn(BaseModel):
    body: list


@app.get("/api/helpdesk/tickets")
def hd_list(status: str = "open", a=Depends(hd_actor)):
    with pool.connection() as c:
        return hd.list_tickets(c, a, status)


@app.post("/api/helpdesk/tickets")
def hd_create(body: TicketIn, a=Depends(hd_actor)):
    with pool.connection() as c:
        return hd.create_ticket(c, a, body.subject, body.severity, body.body)


@app.get("/api/helpdesk/tickets/{tid}")
def hd_get(tid: int, a=Depends(hd_actor)):
    with pool.connection() as c:
        return hd.get_ticket(c, a, tid)


@app.post("/api/helpdesk/tickets/{tid}/messages")
def hd_reply(tid: int, body: MessageIn, a=Depends(hd_actor)):
    with pool.connection() as c:
        return hd.add_message(c, a, tid, body.body)


@app.post("/api/helpdesk/tickets/{tid}/close")
def hd_close(tid: int, a=Depends(hd_actor)):
    with pool.connection() as c:
        return hd.set_status(c, a, tid, "closed")


@app.post("/api/helpdesk/tickets/{tid}/reopen")
def hd_reopen(tid: int, a=Depends(hd_actor)):
    with pool.connection() as c:
        return hd.set_status(c, a, tid, "open")


@app.delete("/api/helpdesk/tickets/{tid}")
def hd_delete(tid: int, a=Depends(hd_actor)):
    with pool.connection() as c:
        return hd.delete_ticket(c, a, tid)


@app.get("/api/helpdesk/unread")
def hd_unread(a=Depends(hd_actor)):
    with pool.connection() as c:
        return hd.unread(c, a)


@app.get("/api/helpdesk/images/{iid}")
def hd_image(iid: int, a=Depends(hd_actor)):
    with pool.connection() as c:
        return hd.image(c, a, iid)


@app.middleware("http")
async def _helpdesk_body_cap(request: Request, call_next):
    if request.url.path.startswith("/api/helpdesk"):          # Caddy caps it too; images make messages up to ~5 MB
        try:
            too_big = int(request.headers.get("content-length") or 0) > 8_500_000
        except ValueError:
            too_big = True
        if too_big:
            return JSONResponse({"detail": "This request is too large"}, status_code=413)
    return await call_next(request)


@app.exception_handler(RuntimeError)
def _config_error(request, exc):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# Local development without Caddy: serve the built frontend too.
STATIC_DIR = os.environ.get("STATIC_DIR")
if STATIC_DIR and os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
