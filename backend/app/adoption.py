"""
Adoption report (owner, 2026-11-01: "convert the activity log report to the adoption report … a standard framework …
once the app is sold commercially, adoption is what matters … usage and output matter more than a glamorous UI").

Framework: Google HEART (Engagement, Adoption, Retention, Task success) + the AARRR funnel, as one path
    Reach → Activate → Adopt → Retain,   with engagement depth and task success per application.

Data: adoption_daily (one row per customer × day × application: minutes, visits, key actions), filled live by the
customer service (portal.activity / server actions) and kept ADOPTION_DAYS — separate from the 180-day audit log.
Definitions below are the tunable rules; the admin page explains each one in plain words.
"""
import statistics
from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
ADOPTION_DAYS = 730                   # adoption_daily is kept two years (cohorts need history)
ACTIVATION_DAYS = 14                  # activated = a key action within 14 days of approval
ADOPT_DAYS, ADOPT_WINDOW = 3, 30      # an application is adopted: used on ≥ 3 days of the last 30, with a key action
HABIT_WEEKS = 3                       # habitual: active in ≥ 3 of the last 4 weeks
NOT_STARTED_AFTER = 7                 # attention: approved 7+ days ago and never used
RENEWAL_DAYS, RENEWAL_SCORE = 14, 40  # attention: access ends within 14 days and the adoption score is under 40
ACTION_CAP = 50                       # one action counted at most 50 times a customer a day (anti-spam)
COHORT_WEEKS, COHORTS, MIN_COHORT = 8, 12, 5

# key actions = the moments an application gives value ("task success"); client ones arrive via /app/api/activity,
# server ones are recorded where they happen (portal: portfolio saved, portfolio built)
ACTIONS = {
    "research": {"stock_card": "Opened a stock card", "filter": "Used a filter or search"},
    "simple": {"search": "Looked up a stock"},
    "portfolio": {"list_saved": "Saved the stock list", "report": "Downloaded the report"},
    "builder": {"build": "Built a portfolio", "sent": "Sent it to the Analyser", "download": "Downloaded the plan"},
}
SERVER_ACTIONS = {("portfolio", "list_saved"), ("builder", "build")}
SEGMENTS = (("champion", "Champion"), ("regular", "Regular"), ("casual", "Casual"), ("at_risk", "At risk"),
            ("dormant", "Dormant"), ("not_started", "Not started"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS adoption_daily (
    customer_id      BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    day              DATE   NOT NULL,                  -- Indian date
    module           TEXT   NOT NULL,
    minutes          INT    NOT NULL DEFAULT 0,
    visits           INT    NOT NULL DEFAULT 0,
    actions          JSONB  NOT NULL DEFAULT '{}'::jsonb,   -- {"build": 2, …} key actions that day
    first_action_at  TIMESTAMPTZ,                       -- first key action that day (time to first value)
    PRIMARY KEY (customer_id, day, module)
);
CREATE INDEX IF NOT EXISTS adoption_daily_day ON adoption_daily (day);
"""
IST_TODAY = "(now() AT TIME ZONE 'Asia/Kolkata')::date"


def backfill(c):
    """Once: minutes and visits from module_usage (key actions start from this day; the report says so)."""
    if c.execute("SELECT 1 FROM settings WHERE key = 'adoption_backfill_v1'").fetchone():
        return
    c.execute("INSERT INTO adoption_daily (customer_id, day, module, minutes, visits) "
              "SELECT customer_id, day, module, sum(minutes), count(*) FROM module_usage GROUP BY customer_id, day, module "
              "ON CONFLICT DO NOTHING")
    c.execute(f"INSERT INTO settings (key, value) VALUES ('adoption_actions_since', to_jsonb({IST_TODAY}::text)) ON CONFLICT DO NOTHING")
    c.execute("INSERT INTO settings (key, value) VALUES ('adoption_backfill_v1', 'true'::jsonb) ON CONFLICT DO NOTHING")


def visit(conn, cid, module):
    conn.execute(f"INSERT INTO adoption_daily (customer_id, day, module, visits) VALUES (%s, {IST_TODAY}, %s, 1) "
                 "ON CONFLICT (customer_id, day, module) DO UPDATE SET visits = adoption_daily.visits + 1", (cid, module))


def minute(conn, cid, module):
    conn.execute(f"INSERT INTO adoption_daily (customer_id, day, module, minutes) VALUES (%s, {IST_TODAY}, %s, 1) "
                 "ON CONFLICT (customer_id, day, module) DO UPDATE SET minutes = adoption_daily.minutes + 1", (cid, module))


def action(conn, cid, module, name):
    """one key action (capped at ACTION_CAP a day); the first one of the day keeps its time"""
    conn.execute(f"INSERT INTO adoption_daily (customer_id, day, module, actions, first_action_at) "
                 f"VALUES (%s, {IST_TODAY}, %s, jsonb_build_object(%s::text, 1), now()) "
                 "ON CONFLICT (customer_id, day, module) DO UPDATE SET "
                 "actions = adoption_daily.actions || jsonb_build_object(%s::text, LEAST(COALESCE((adoption_daily.actions->>%s)::int, 0) + 1, %s)), "
                 "first_action_at = COALESCE(adoption_daily.first_action_at, now())",
                 (cid, module, name, name, name, ACTION_CAP))


# ─── report ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def _today():
    return datetime.now(IST).date()


def _pct(a, b):
    return round(a / b * 100, 1) if b else None


def _load(conn):
    """everything the report needs, in three queries"""
    cust = conn.execute(
        "SELECT c.id, c.name, c.email, c.status, c.created_at, c.approved_at, c.expires_on, c.last_login, "
        "ARRAY(SELECT split_part(e.key, ':', 1) FROM effective_permissions e WHERE e.customer_id = c.id AND e.key LIKE '%%:view') AS apps "
        "FROM customers c").fetchall()
    rows = conn.execute(
        "SELECT customer_id, day, module, minutes, visits, first_action_at, "
        "(SELECT COALESCE(sum(value::int), 0) FROM jsonb_each_text(actions)) AS n_actions, actions "
        f"FROM adoption_daily WHERE day > {IST_TODAY} - 400").fetchall()
    first = {r["customer_id"]: r for r in conn.execute(
        "SELECT customer_id, min(day) AS first_day, max(day) AS last_day, min(first_action_at) AS first_action FROM adoption_daily GROUP BY customer_id")}
    mods = conn.execute("SELECT key, name FROM app_modules ORDER BY sort, key").fetchall()
    since = conn.execute("SELECT value FROM settings WHERE key = 'adoption_actions_since'").fetchone()
    since = since["value"] if since else None
    since_at = datetime.fromisoformat(since).replace(tzinfo=IST) if since else None
    return cust, rows, first, mods, since, since_at


def _people(cust, rows, first, today, since=None):
    """per approved customer: active days, apps adopted, actions, segment, score"""
    by = {}
    for r in rows:
        by.setdefault(r["customer_id"], []).append(r)
    out = []
    for c in cust:
        if c["status"] != "approved":
            continue
        rs = by.get(c["id"], [])
        f = first.get(c["id"])
        last30 = [r for r in rs if (today - r["day"]).days < 30]
        d30 = len({r["day"] for r in last30})
        acts30 = sum(r["n_actions"] for r in last30)
        mins30 = sum(r["minutes"] for r in last30)
        per_mod = {}
        for r in last30:
            m = per_mod.setdefault(r["module"], [set(), 0])
            m[0].add(r["day"]); m[1] += r["n_actions"]
        adopted = sorted(k for k, (days, n) in per_mod.items() if len(days) >= ADOPT_DAYS and n > 0 and k in c["apps"])
        weeks4 = {(today - r["day"]).days // 7 for r in rs if (today - r["day"]).days < 28}
        last = f["last_day"] if f else None
        quiet = (today - last).days if last else None
        if not f:
            seg = "not_started"
        elif quiet >= 30:
            seg = "dormant"
        elif quiet >= 15:
            seg = "at_risk"
        elif d30 >= 12 and len(adopted) >= 2:
            seg = "champion"
        elif d30 >= 4:
            seg = "regular"
        else:
            seg = "casual"
        held = max(1, len(c["apps"]))
        score = round(40 * min(d30, 20) / 20 + 30 * len(adopted) / held + 20 * min(acts30, 30) / 30
                      + (10 if quiet is not None and quiet <= 3 else 5 if quiet is not None and quiet <= 14 else 0))
        appr = c["approved_at"]
        fa = f["first_action"] if f else None
        # the activation window starts at approval — or when key actions began to be counted, for older customers
        start = max(appr, since) if appr and since else appr
        activated = bool(fa and start and fa >= start - timedelta(minutes=1) and fa <= start + timedelta(days=ACTIVATION_DAYS))
        out.append({"id": c["id"], "name": c["name"], "email": c["email"], "approved_at": appr, "expires_on": c["expires_on"],
                    "apps": c["apps"], "first_day": f["first_day"] if f else None, "last_day": last, "quiet": quiet,
                    "d30": d30, "minutes30": mins30, "actions30": acts30, "adopted": adopted, "weeks4": len(weeks4),
                    "segment": seg, "score": score, "first_action": fa, "activated": activated,
                    "ttfv_h": round((fa - start).total_seconds() / 3600, 1) if activated else None})
    return out


def report(conn, days):
    today = _today()
    cust, rows, first, mods, since, since_at = _load(conn)
    people = _people(cust, rows, first, today, since_at)
    P0, P1 = today - timedelta(days=days - 1), today                        # this period
    Q0, Q1 = today - timedelta(days=2 * days - 1), today - timedelta(days=days)   # the one before
    inr = lambda d, a, b: a <= d <= b
    active_in = lambda a, b: {r["customer_id"] for r in rows if inr(r["day"], a, b)}
    act_p, act_q = active_in(P0, P1), active_in(Q0, Q1)
    wau, wau_prev = active_in(today - timedelta(days=6), today), active_in(today - timedelta(days=13), today - timedelta(days=7))
    mau, mau_prev = active_in(today - timedelta(days=29), today), active_in(today - timedelta(days=59), today - timedelta(days=30))
    dau = [len(active_in(today - timedelta(days=k), today - timedelta(days=k))) for k in range(30)]
    stick = round(statistics.mean(dau) / len(mau) * 100, 1) if mau else None
    earlier = active_in(today - timedelta(days=55), today - timedelta(days=28))
    ret4 = _pct(len(earlier & active_in(today - timedelta(days=27), today)), len(earlier))
    approved = [p for p in people]
    activated = [p for p in approved if p["activated"]]
    approved_before = [p for p in approved if p["approved_at"] and p["approved_at"].astimezone(IST).date() < P0]
    act_before = [p for p in approved_before if p["activated"] and p["first_action"].astimezone(IST).date() < P0]
    ttfv = [p["ttfv_h"] for p in activated]
    headline = {
        "customers": {"v": len(approved), "prev": len(approved_before)},
        "active": {"v": len(act_p), "prev": len(act_q)},
        "activated": {"v": _pct(len(activated), len(approved)), "prev": _pct(len(act_before), len(approved_before))},
        "wau": {"v": len(wau), "prev": len(wau_prev)}, "mau": {"v": len(mau), "prev": len(mau_prev)},
        "stickiness": {"v": stick}, "retention4": {"v": ret4},
        "ttfv_h": {"v": statistics.median(ttfv) if ttfv else None},
    }
    signed = len(cust)
    visited = sum(1 for p in approved if p["first_day"])
    habitual = sum(1 for p in approved if p["weeks4"] >= HABIT_WEEKS)
    steps = [("signed_up", "Signed up", signed), ("approved", "Approved", len(approved)), ("visited", "First visit", visited),
             ("activated", "Activated", len(activated)), ("habitual", "Habitual", habitual)]
    funnel = [{"k": k, "label": l, "n": n, "of_prev": _pct(n, steps[i - 1][2]) if i else None,
               "drop": (steps[i - 1][2] - n) if i else 0} for i, (k, l, n) in enumerate(steps)]
    worst = max(funnel[1:], key=lambda s: s["drop"]) if signed else None
    apps = []
    for m in mods:
        k = m["key"]
        access = [p for p in approved if k in p["apps"]]
        rp = [r for r in rows if r["module"] == k and inr(r["day"], P0, P1)]
        rq = [r for r in rows if r["module"] == k and inr(r["day"], Q0, Q1)]
        tried = {r["customer_id"] for r in rp}
        days_per = {}
        for r in rp:
            days_per.setdefault(r["customer_id"], set()).add(r["day"])
        acts = {}
        for r in rp:
            for a, n in (r["actions"] or {}).items():
                acts[a] = acts.get(a, 0) + int(n)
        adopted = sum(1 for p in access if k in p["adopted"])
        apps.append({"k": k, "name": m["name"], "access": len(access), "tried": len(tried), "tried_prev": len({r["customer_id"] for r in rq}),
                     "adopted": adopted, "rate": _pct(adopted, len(access)),
                     "days_per_user": round(statistics.mean(len(v) for v in days_per.values()), 1) if days_per else 0,
                     "minutes_per_user": round(sum(r["minutes"] for r in rp) / len(tried), 1) if tried else 0,
                     "actions": [{"k": a, "label": ACTIONS.get(k, {}).get(a, a), "n": acts.get(a, 0)} for a in ACTIONS.get(k, {})]})
    cohorts = []
    monday = today - timedelta(days=today.weekday())
    for w in range(COHORTS - 1, -1, -1):
        start = monday - timedelta(weeks=w)
        members = [p for p in approved if p["approved_at"] and start <= p["approved_at"].astimezone(IST).date() < start + timedelta(days=7)]
        if not members:
            continue
        ids = {p["id"] for p in members}
        cells = []
        for k in range(COHORT_WEEKS + 1):
            a = start + timedelta(weeks=k)
            if a > today:
                break
            cells.append(_pct(len(ids & active_in(a, a + timedelta(days=6))), len(ids)))
        cohorts.append({"week": start.isoformat(), "n": len(members), "few": len(members) < MIN_COHORT, "cells": cells})
    attention = {
        "not_started": [_brief(p) for p in approved if p["segment"] == "not_started" and p["approved_at"]
                        and (today - p["approved_at"].astimezone(IST).date()).days >= NOT_STARTED_AFTER][:50],
        "at_risk": [_brief(p) for p in sorted((p for p in approved if p["segment"] == "at_risk"), key=lambda p: p["quiet"])][:50],
        "renewal": [_brief(p) for p in approved if p["expires_on"] and 0 <= (p["expires_on"] - today).days <= RENEWAL_DAYS
                    and p["score"] < RENEWAL_SCORE][:50],
    }
    segs = {k: sum(1 for p in approved if p["segment"] == k) for k, _ in SEGMENTS}
    return {"days": days, "from": P0.isoformat(), "to": P1.isoformat(), "actions_since": since, "headline": headline,
            "funnel": funnel, "worst_step": worst and worst["k"], "apps": apps, "cohorts": cohorts, "attention": attention,
            "segments": [{"k": k, "label": l, "n": segs[k]} for k, l in SEGMENTS],
            "rules": {"activation_days": ACTIVATION_DAYS, "adopt_days": ADOPT_DAYS, "adopt_window": ADOPT_WINDOW,
                      "habit_weeks": HABIT_WEEKS, "not_started_after": NOT_STARTED_AFTER, "renewal_days": RENEWAL_DAYS}}


def _iso(v):
    return v.isoformat() if v else None


def _brief(p):
    return {"id": p["id"], "name": p["name"], "email": p["email"], "segment": p["segment"], "score": p["score"],
            "last_day": _iso(p["last_day"]), "quiet": p["quiet"], "expires_on": _iso(p["expires_on"]),
            "approved_at": _iso(p["approved_at"]), "d30": p["d30"]}


def customers(conn, segment=None, q="", sort="score", page=1, size=50):
    today = _today()
    cust, rows, first, mods, _, since_at = _load(conn)
    people = _people(cust, rows, first, today, since_at)
    if segment:
        people = [p for p in people if p["segment"] == segment]
    if q.strip():
        ql = q.strip().lower()
        people = [p for p in people if ql in f"{p['name']} {p['email']}".lower()]
    key = {"score": lambda p: (-p["score"], p["name"].lower()), "name": lambda p: p["name"].lower(),
           "last": lambda p: (p["quiet"] is None, p["quiet"] if p["quiet"] is not None else 0),
           "days": lambda p: (-p["d30"], p["name"].lower())}.get(sort, lambda p: -p["score"])
    people.sort(key=key)
    total = len(people)
    names = {m["key"]: m["name"] for m in mods}
    rows_ = [{**_brief(p), "minutes30": p["minutes30"], "actions30": p["actions30"],
              "adopted": [names.get(k, k) for k in p["adopted"]], "apps": len(p["apps"]), "weeks4": p["weeks4"],
              "activated": p["activated"], "ttfv_h": p["ttfv_h"]} for p in people[(page - 1) * size: page * size]]
    return {"total": total, "page": page, "size": size, "rows": rows_}
