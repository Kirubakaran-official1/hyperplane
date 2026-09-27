"""
Collection worker — runs in its own container (it has Chromium).

Every 15 seconds it:
  1. queues any scheduled slot that is due (09:45 / 14:30 IST by default, editable in Admin)
  2. picks the next queued collection (scheduled or "Sync now") and runs the ChartInk scanner
  3. stores the result in PostgreSQL and keeps the Excel file
Once a day it removes collections older than the retention setting.
"""
import glob
import io
import os
import shutil
import sys
import threading
import time
import traceback
from datetime import timedelta

from . import config
from .db import get_settings, init_db, pool, set_meta
from .schedule import due_slots, now
from .store import save_snapshot, workbook_to_sheets

DATA_DIR = config.DATA_DIR
RUNS_DIR = os.path.join(DATA_DIR, "runs")
EXCEL_DIR = os.path.join(DATA_DIR, "excel")
OFFLINE_DIR = os.environ.get("SCAN_OFFLINE_DIR") or None     # testing: recalculate from a saved raw_YYYYMMDD folder
POLL_SECONDS = 15


class LogTee(io.TextIOBase):
    """Copies everything the scanner prints to the real stdout and to the job's log in the database."""

    def __init__(self, real):
        self.real, self.buf, self.lock = real, [], threading.Lock()

    def write(self, s):
        self.real.write(s)
        with self.lock:
            self.buf.append(s)
        return len(s)

    def flush(self):
        self.real.flush()

    def take(self):
        with self.lock:
            out, self.buf = "".join(self.buf), []
        return out


def _append_log(job_id, text):
    if text:
        with pool.connection() as c:
            c.execute("UPDATE jobs SET log = right(log || %s, 200000) WHERE id = %s", (text, job_id))


def _heartbeat():
    set_meta("worker_heartbeat", now().isoformat())


class Background(threading.Thread):
    """Heartbeat + live log flushing while a long collection runs."""

    def __init__(self):
        super().__init__(daemon=True)
        self.job_id, self.tee = None, None

    def run(self):
        while True:
            try:
                _heartbeat()
                if self.job_id and self.tee:
                    _append_log(self.job_id, self.tee.take())
            except Exception:                                    # noqa: BLE001 — keep the thread alive
                pass
            time.sleep(5)


def queue_due_slots():
    s = get_settings()
    today = now().date()
    for slot in due_slots(s):
        with pool.connection() as c:
            exists = c.execute("SELECT 1 FROM jobs WHERE kind='scheduled' AND trade_date=%s AND slot=%s",
                               (today, slot)).fetchone()
            if not exists:                                       # (checking first keeps job numbers without gaps)
                c.execute("INSERT INTO jobs (kind, slot, trade_date, requested_by) VALUES ('scheduled', %s, %s, 'schedule') "
                          "ON CONFLICT DO NOTHING", (slot, today))


def claim_job():
    with pool.connection() as c:
        return c.execute("""
            UPDATE jobs SET status = 'running', started_at = now()
            WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
            RETURNING *""").fetchone()


def run_scanner(run_dir, settings):
    """Runs chartink_fast inside run_dir; returns the path of the Excel it wrote."""
    from scanner import chartink_fast as sc                      # imported late: heavy module
    creds = config.telegram() if settings.get("telegram_enabled", True) else None
    send = creds is not None
    os.chdir(run_dir)
    ok, err = False, None
    for attempt in range(1, sc.MAX_RETRIES + 1):
        ok, err = sc.attempt_scraping(attempt, creds or {"bot_token": "NIL", "chat_id": "NIL"},
                                      offline_dir=OFFLINE_DIR, send_to_telegram=send)
        if ok:
            break
        if attempt < sc.MAX_RETRIES:
            print(f"\n⏳ Waiting {10 * attempt}s before retry {attempt + 1}...")
            time.sleep(10 * attempt)
    if not ok:
        raise RuntimeError(err or "scan failed")
    files = sorted(glob.glob(os.path.join(run_dir, "detailed_signals_*.xlsx")), key=os.path.getmtime)
    if not files:
        raise RuntimeError("the scanner finished but wrote no Excel file")
    return files[-1]


def run_job(job, bg):
    settings = get_settings()
    job_id = job["id"]
    started = now()
    run_dir = os.path.join(RUNS_DIR, f"job_{job_id}")
    os.makedirs(run_dir, exist_ok=True)
    tee = LogTee(sys.stdout)
    bg.job_id, bg.tee = job_id, tee
    old_out, old_err, old_cwd = sys.stdout, sys.stderr, os.getcwd()
    sys.stdout = sys.stderr = tee
    try:
        who = "schedule" if job["kind"] == "scheduled" else job.get("requested_by") or "user"
        print(f"▶ Collection #{job_id} ({job['kind']}{' ' + job['slot'] if job.get('slot') else ''}, by {who}) "
              f"started {started.strftime('%d %b %Y %H:%M:%S')}")
        excel = run_scanner(run_dir, settings)
        os.chdir(old_cwd)
        dest = os.path.join(EXCEL_DIR, f"detailed_signals_{started.strftime('%Y%m%d_%H%M')}_{job_id}.xlsx")
        shutil.move(excel, dest)
        print("📥 Storing the collection in the database...")
        sheets = workbook_to_sheets(dest)
        label = started.strftime("%d %b %Y %H:%M") + (f" · {job['slot']} run" if job["kind"] == "scheduled" else " · sync")
        sid = save_snapshot(sheets, started, "scheduled" if job["kind"] == "scheduled" else "manual",
                            slot=job.get("slot"), label=label, excel_path=dest)
        if job["kind"] == "manual" and settings.get("manual_keep") == "latest":
            _drop_older_manual(started.date(), keep_id=sid)
        print(f"✓ Stored as collection #{sid} ({len(sheets)} sheets)")
        _append_log(job_id, tee.take())
        with pool.connection() as c:
            c.execute("UPDATE jobs SET status='done', finished_at=now(), snapshot_id=%s WHERE id=%s", (sid, job_id))
    except Exception as e:                                       # noqa: BLE001 — record every failure
        print(f"✗ Collection failed: {e}\n{traceback.format_exc()}")
        _append_log(job_id, tee.take())
        with pool.connection() as c:
            c.execute("UPDATE jobs SET status='failed', finished_at=now(), error=%s WHERE id=%s", (str(e)[:2000], job_id))
    finally:
        sys.stdout, sys.stderr = old_out, old_err
        os.chdir(old_cwd)
        bg.job_id, bg.tee = None, None


def _drop_older_manual(day, keep_id):
    with pool.connection() as c:
        rows = c.execute("DELETE FROM snapshots WHERE source='manual' AND trade_date=%s AND id<>%s RETURNING excel_path",
                         (day, keep_id)).fetchall()
    for r in rows:
        if r["excel_path"] and os.path.exists(r["excel_path"]):
            os.remove(r["excel_path"])


def cleanup():
    s = get_settings()
    days = int(s.get("retention_days") or 0)
    if days > 0:
        cutoff = now().date() - timedelta(days=days)
        with pool.connection() as c:
            rows = c.execute("DELETE FROM snapshots WHERE trade_date < %s RETURNING excel_path", (cutoff,)).fetchall()
        for r in rows:
            if r["excel_path"] and os.path.exists(r["excel_path"]):
                os.remove(r["excel_path"])
        if rows:
            print(f"🧹 Retention: removed {len(rows)} collections older than {cutoff}")
    # scanner working folders (raw tables) are only kept for a week
    limit = time.time() - 7 * 86400
    for d in glob.glob(os.path.join(RUNS_DIR, "job_*")):
        if os.path.getmtime(d) < limit:
            shutil.rmtree(d, ignore_errors=True)
    with pool.connection() as c:
        c.execute("DELETE FROM jobs WHERE created_at < now() - interval '120 days'")


def main():
    os.makedirs(RUNS_DIR, exist_ok=True)
    os.makedirs(EXCEL_DIR, exist_ok=True)
    init_db()
    with pool.connection() as c:
        c.execute("UPDATE jobs SET status='failed', finished_at=now(), error='worker restarted during the run' "
                  "WHERE status='running'")
    bg = Background()
    bg.start()
    print(f"Hyperplane worker ready — {now().strftime('%d %b %Y %H:%M:%S %Z')}"
          + (f" — OFFLINE test mode from {OFFLINE_DIR}" if OFFLINE_DIR else ""), flush=True)
    last_cleanup = None
    while True:
        try:
            queue_due_slots()
            job = claim_job()
            if job:
                run_job(job, bg)
                continue                                         # look for the next job straight away
            if last_cleanup != now().date():
                cleanup()
                last_cleanup = now().date()
        except Exception:                                        # noqa: BLE001 — never let the loop die
            traceback.print_exc()
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
