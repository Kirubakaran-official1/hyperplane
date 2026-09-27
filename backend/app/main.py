"""
Hyperplane API.

  /api/login  /api/logout  /api/me
  /api/snapshots            list collections (newest first), filter by date range
  /api/snapshots/{id}/data  the workbook as gzip JSON (cached by the browser forever — collections never change)
  /api/snapshots/{id}/excel download the original Excel
  /api/sync                 start a collection now
  /api/jobs                 collection history + live log
  /api/compare?a=&b=        stock-by-stock change between two collections (morning vs afternoon)
  /api/admin/*              settings, import old Excel files, delete collections, system status
"""
import os
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
from .db import DEFAULT_SETTINGS, get_meta, get_settings, init_db, pool, put_settings
from .schedule import TZ, next_runs, now, parse_hhmm
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
    u = config.users().get(body.username.strip())
    if not u or u["password"] != body.password:
        q.append(_time.time())
        raise HTTPException(401, "Wrong user ID or password")
    q.clear()
    token = _serializer().dumps(body.username.strip())
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(COOKIE, token, max_age=config.session_hours() * 3600, httponly=True,
                        samesite="lax", secure=secure, path="/")
    return {"name": body.username.strip(), "admin": u["admin"]}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.get("/api/me")
def me(user=Depends(current_user)):
    return user


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
    s = body.model_dump()
    s.update(schedule_times=times, skip_dates=skips, retention_days=max(0, body.retention_days),
             catch_up_minutes=max(0, min(body.catch_up_minutes, 720)))
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


@app.exception_handler(RuntimeError)
def _config_error(request, exc):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


# Local development without Caddy: serve the built frontend too.
STATIC_DIR = os.environ.get("STATIC_DIR")
if STATIC_DIR and os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
