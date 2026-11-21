"""Hyperplane LENS database — its own PostgreSQL (container lens-db), never Hyperplane's.

  lens_users   one row per person: sign-up details, status (pending → approved / blocked), lock-out counters
  lens_logins  every sign-in attempt, good or bad (who, when, result, device, address) — Hyperplane admin → Lens admin → Sign-ins
  lens_admin_log  what a Hyperplane admin changed (approve, block)
"""
import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

pool = ConnectionPool(os.environ["DATABASE_URL"], min_size=1, max_size=8, open=False, kwargs={"row_factory": dict_row})   # one transaction per `with pool.connection()`

SCHEMA = """
CREATE TABLE IF NOT EXISTS lens_users (
    id             BIGSERIAL PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    phone          TEXT NOT NULL DEFAULT '',
    pw_hash        TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'blocked')),
    session_ver    INT NOT NULL DEFAULT 1,
    failed_logins  INT NOT NULL DEFAULT 0,
    locked_until   TIMESTAMPTZ,
    signup_ip      TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at    TIMESTAMPTZ,
    approved_by    TEXT,
    last_login_at  TIMESTAMPTZ,
    login_count    INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS lens_logins (
    id        BIGSERIAL PRIMARY KEY,
    user_id   BIGINT REFERENCES lens_users(id) ON DELETE SET NULL,
    email     TEXT NOT NULL DEFAULT '',
    ok        BOOLEAN NOT NULL,
    reason    TEXT NOT NULL,
    ip        TEXT NOT NULL DEFAULT '',
    device    TEXT NOT NULL DEFAULT '',
    at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lens_logins_at ON lens_logins (at DESC);
CREATE INDEX IF NOT EXISTS lens_logins_user ON lens_logins (user_id, at DESC);
CREATE TABLE IF NOT EXISTS lens_admin_log (
    id        BIGSERIAL PRIMARY KEY,
    admin_id  BIGINT REFERENCES lens_users(id) ON DELETE SET NULL,
    action    TEXT NOT NULL,
    target_id BIGINT,
    detail    JSONB NOT NULL DEFAULT '{}'::jsonb,
    at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


def init_db():
    pool.open(wait=True, timeout=60)
    with pool.connection() as c:
        c.execute("SELECT pg_advisory_xact_lock(727101)")
        c.execute(SCHEMA)
