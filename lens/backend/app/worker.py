"""Lens worker (container lens-worker): runs the Fyers Data Lab jobs one at a time — the only process that calls Fyers.

  queued → running → done / failed
  waiting   today's Fyers allowance is used up (continues after midnight IST), or the Fyers sign-in expired (continues once reconnected)
  paused / cancelled  set by the admin; the job stops between two requests and resumes where it stopped (the manifest remembers)
A restart puts a running job back in the queue. Every day after 18:45 IST the index minutes of the day are added (nightly), once the
bulk download has run and the consent is recorded.
"""
import time
import traceback
from datetime import datetime, timedelta

from . import fyers as fy
from . import lab
from .db import init_db, pool

KINDS = {"depth": lab.probe_depth, "coverage": lab.probe_coverage, "speed": lab.probe_speed, "nightly": lab.nightly,
         "bulk": lambda c, f, j: (lab.plan_bulk(c, f, j), lab.run_bulk(c, f, j)), "quality": lambda c, f, j: lab.quality(c, j)}
STORES_DATA = ("bulk", "speed", "nightly")


def finish(c, jid, status, message="", wait=None):
    c.rollback()
    c.execute("UPDATE fyers_jobs SET status = %s, message = %s, wait_until = %s, ended_at = CASE WHEN %s IN ('done', 'failed') THEN now() END "
              "WHERE id = %s AND status NOT IN ('paused', 'cancelled')", (status, message[:400], wait, status, jid))
    c.commit()


def tomorrow():
    n = datetime.now(fy.IST)
    return datetime.combine(n.date() + timedelta(days=1), datetime.min.time(), fy.IST) + timedelta(minutes=5)


def run_one(c):
    job = c.execute("SELECT * FROM fyers_jobs WHERE status = 'queued' OR (status = 'waiting' AND wait_until <= now()) "
                    "ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED").fetchone()
    if not job:
        c.commit()
        return False
    c.execute("UPDATE fyers_jobs SET status = 'running', started_at = COALESCE(started_at, now()), message = '' WHERE id = %s", (job["id"],))
    c.commit()
    s = fy.settings(c)
    try:
        if job["kind"] in STORES_DATA and not s["consent_on"]:
            raise ValueError("Record Fyers' written consent first (Compliance) — storing a copy of Fyers data needs it")
        f = fy.Fyers(c, job["id"])
        if job["kind"] != "quality" and not f.connected:
            raise fy.NotConnected("Fyers is not connected")
        KINDS[job["kind"]](c, f, job)
        finish(c, job["id"], "done", "Finished")
    except fy.QuotaWait:
        finish(c, job["id"], "waiting", "Today's Fyers allowance is used up — this continues after midnight", tomorrow())
    except fy.NotConnected as e:
        finish(c, job["id"], "waiting", f"{e} — continues once Fyers is connected again", datetime.now(fy.IST) + timedelta(minutes=2))
    except lab.Stop as e:
        c.rollback()
        c.execute("UPDATE fyers_jobs SET message = %s WHERE id = %s", ("Paused — resume to continue where it stopped" if str(e) == "paused" else "Cancelled",
                                                                       job["id"]))
        c.commit()
    except Exception as e:                                       # noqa: BLE001
        traceback.print_exc()
        finish(c, job["id"], "failed", str(e)[:400] or e.__class__.__name__)
    return True


def nightly_due(c):
    n = datetime.now(fy.IST)
    if n.hour < 18 or (n.hour == 18 and n.minute < 45) or n.weekday() >= 5:
        return
    s = fy.settings(c)
    if not s["consent_on"] or not fy.token_valid(s):
        return
    if c.execute("SELECT 1 FROM fyers_jobs WHERE kind = 'nightly' AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE "
                 "'Asia/Kolkata'").fetchone() or not c.execute("SELECT 1 FROM fyers_manifest WHERE kind = 'spot' AND status = 'done' LIMIT 1").fetchone():
        return
    c.execute("INSERT INTO fyers_jobs (kind, by_admin) VALUES ('nightly', 'schedule')")
    c.commit()


def main():
    init_db()
    with pool.connection() as c:
        c.execute("UPDATE fyers_jobs SET status = 'queued' WHERE status = 'running'")
        c.execute("UPDATE fyers_manifest SET status = 'pending' WHERE status = 'running'")
    print(f"Lens worker ready — {datetime.now(fy.IST):%d %b %Y %H:%M} IST", flush=True)
    while True:
        try:
            with pool.connection() as c:
                nightly_due(c)
                busy = run_one(c)
        except Exception:                                        # noqa: BLE001
            traceback.print_exc()
            busy = False
        time.sleep(1 if busy else 5)


if __name__ == "__main__":
    main()
