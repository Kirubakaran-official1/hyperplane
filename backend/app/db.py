"""PostgreSQL connection pool, schema and settings."""
import json
import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://hyperplane:hyperplane@db:5432/hyperplane")

pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=6, kwargs={"row_factory": dict_row, "options": "-c timezone=UTC"}, open=False)

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    id          BIGSERIAL PRIMARY KEY,
    taken_at    TIMESTAMPTZ NOT NULL,
    trade_date  DATE        NOT NULL,
    slot        TEXT,                        -- '09:45' for a scheduled run, NULL otherwise
    source      TEXT        NOT NULL,        -- scheduled | manual | import
    label       TEXT,
    stocks      INT,
    signals     INT,
    sheets      TEXT[],
    data_gz     BYTEA       NOT NULL,        -- gzip JSON {sheet_name: [rows]} — exactly what the dashboard reads
    size_bytes  INT,
    excel_path  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snapshots_trade_date ON snapshots (trade_date, taken_at);

CREATE TABLE IF NOT EXISTS snapshot_stocks (
    snapshot_id BIGINT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    symbol      TEXT   NOT NULL,
    price       DOUBLE PRECISION,
    change_pct  DOUBLE PRECISION,
    sector      TEXT,
    industry    TEXT,
    bias        TEXT,
    n_signals   INT,
    health      TEXT,
    is_fno      BOOLEAN,
    signals     TEXT,                        -- '|' separated signal names
    PRIMARY KEY (snapshot_id, symbol)
);

CREATE TABLE IF NOT EXISTS jobs (
    id           BIGSERIAL PRIMARY KEY,
    kind         TEXT NOT NULL,              -- scheduled | manual
    slot         TEXT,
    trade_date   DATE,
    requested_by TEXT,
    status       TEXT NOT NULL DEFAULT 'queued',   -- queued | running | done | failed | cancelled
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    snapshot_id  BIGINT REFERENCES snapshots(id) ON DELETE SET NULL,
    log          TEXT NOT NULL DEFAULT '',
    error        TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_per_slot ON jobs (trade_date, slot) WHERE kind = 'scheduled';
CREATE INDEX IF NOT EXISTS jobs_status ON jobs (status, created_at);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value JSONB NOT NULL
);
"""

DEFAULT_SETTINGS = {
    "schedule_times": ["09:45", "14:30"],   # IST, one collection per time
    "weekdays_only": True,
    "skip_dates": [],                       # e.g. NSE holidays "2026-10-02"
    "catch_up_minutes": 180,                # run a missed slot if the server comes back within this window
    "retention_days": 0,                    # 0 = keep everything
    "manual_keep": "all",                   # all | latest  (manual syncs kept per day)
    "telegram_enabled": True,
    "nr_mother_body_pct": 60,               # NR mother candle: body must be at least this % of high-low
}


def init_db():
    pool.open(wait=True, timeout=60)
    with pool.connection() as c:
        c.execute(SCHEMA)


def get_settings():
    with pool.connection() as c:
        rows = c.execute("SELECT key, value FROM settings").fetchall()
    s = dict(DEFAULT_SETTINGS)
    s.update({r["key"]: r["value"] for r in rows if r["key"] in DEFAULT_SETTINGS})
    return s


def put_settings(values: dict):
    with pool.connection() as c:
        for k, v in values.items():
            c.execute("INSERT INTO settings(key, value) VALUES (%s, %s::jsonb) "
                      "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (k, json.dumps(v)))


def get_meta(key, default=None):
    with pool.connection() as c:
        r = c.execute("SELECT value FROM settings WHERE key = %s", (key,)).fetchone()
    return r["value"] if r else default


def set_meta(key, value):
    with pool.connection() as c:
        c.execute("INSERT INTO settings(key, value) VALUES (%s, %s::jsonb) "
                  "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (key, json.dumps(value)))
