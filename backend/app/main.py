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
"""
import hmac
import os
import re
import shutil
import time as _time
from collections import defaultdict, deque
from datetime import date, datetime, timedelta

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel

from . import config
from . import helpdesk as hd
from .db import (DEFAULT_SETTINGS, TECH_TF_DEFAULT, get_auto_approve, get_meta, get_settings, init_db, pool,
                 put_settings, set_auto_approve)
from .schedule import TZ, next_runs, now, parse_hhmm
from .publish import publish
from .security import hash_password
from .store import save_snapshot, taken_at_from_filename, workbook_to_sheets

app = FastAPI(title="Hyperplane", docs_url=None, redoc_url=None)
COOKIE = "hp_session"
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
    if locked > _time.time():
        raise HTTPException(429, "Too many attempts — wait 15 minutes")
    u = config.users().get(name)
    ok = bool(u) and hmac.compare_digest(u["password"].encode(), body.password.encode())
    if not ok:
        q.append(_time.time())
        fails += 1
        _user_fails[name] = (0, _time.time() + USER_LOCK_SECONDS) if fails >= USER_MAX_FAILS else (fails, 0)
        _time.sleep(0.6)                           # slows down password guessing
        raise HTTPException(401, "Wrong user ID or password")
    q.clear()
    _user_fails.pop(name, None)
    token = _serializer().dumps(name)
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(COOKIE, token, max_age=config.session_hours() * 3600, httponly=True,
                        samesite="strict", secure=secure, path="/")
    return {"name": body.username.strip(), "admin": u["admin"]}


@app.post("/api/logout")
def logout(response: Response):
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
            if k == "adx_mode":
                cfg[k] = v if v in ("below", "above") else d
            else:
                try:
                    cfg[k] = float(v)
                except (TypeError, ValueError):
                    raise HTTPException(422, f"{tf} {k}: '{v}' is not a number")
        out[tf] = cfg
    return out


ALGO_TFS = set("DWMQY")
ALGO_FIELDS = {"close", "prev", "rsi", "adx", "cci", "macd", "st", "bbu", "bbl", "tz", "tn", "bn", "bz"}
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


@app.get("/api/admin/customers")
def list_customers(user=Depends(admin_user)):
    with pool.connection() as c:
        return [_cust(r) for r in c.execute(f"SELECT {CUSTOMER_COLS} FROM customers ORDER BY created_at DESC").fetchall()]


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
    if not r:
        raise HTTPException(404, "Customer not found")
    return _cust(r)


@app.post("/api/admin/customers/{cid}/password")
def reset_customer_password(cid: int, body: PasswordIn, user=Depends(admin_user)):
    _check_pw(body.password)
    with pool.connection() as c:
        r = c.execute("UPDATE customers SET pw_hash = %s, session_ver = session_ver + 1, failed_logins = 0, locked_until = NULL "
                      "WHERE id = %s RETURNING id", (hash_password(body.password), cid)).fetchone()
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
