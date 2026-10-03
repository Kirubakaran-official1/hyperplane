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

-- Customer edition (/app): accounts and the published customer view
CREATE TABLE IF NOT EXISTS customers (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,                -- lower-case
    name          TEXT NOT NULL,
    phone         TEXT,
    country       TEXT,
    state         TEXT,
    city          TEXT,
    pw_hash       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',     -- pending | approved | blocked
    expires_on    DATE,
    notes         TEXT,
    session_ver   INT  NOT NULL DEFAULT 1,             -- bumped on block / password reset = logged out everywhere
    failed_logins INT  NOT NULL DEFAULT 0,
    locked_until  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at   TIMESTAMPTZ,
    last_login    TIMESTAMPTZ,
    login_count   INT  NOT NULL DEFAULT 0,
    signup_ip     TEXT
);

CREATE TABLE IF NOT EXISTS published (
    id            BIGSERIAL PRIMARY KEY,
    published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    snapshot_id   BIGINT,
    data_as_of    TIMESTAMPTZ,
    mode          TEXT NOT NULL,                       -- auto | manual
    published_by  TEXT,
    stocks        INT,
    data_gz       BYTEA NOT NULL                       -- gzip JSON: labels only, no method / scores / signals
);

-- Helpdesk: queries raised by customers (/app) and dashboard users, answered by admins (see helpdesk.py)
CREATE TABLE IF NOT EXISTS hd_tickets (
    id            BIGSERIAL PRIMARY KEY,
    owner_kind    TEXT NOT NULL,                       -- customer | user
    owner_id      TEXT NOT NULL,                       -- customers.id as text, or the dashboard user name
    owner_name    TEXT NOT NULL,
    subject       TEXT NOT NULL,
    severity      TEXT NOT NULL,                       -- high | medium | low
    status        TEXT NOT NULL DEFAULT 'open',        -- open | closed
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),  -- last message
    closed_at     TIMESTAMPTZ,
    closed_by     TEXT,
    owner_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- inbox: what the owner has read
    staff_seen_at TIMESTAMPTZ                          -- inbox: what the admins have read
);
CREATE INDEX IF NOT EXISTS hd_tickets_owner ON hd_tickets (owner_kind, owner_id, status);
CREATE INDEX IF NOT EXISTS hd_tickets_updated ON hd_tickets (updated_at DESC);

CREATE TABLE IF NOT EXISTS hd_messages (
    id            BIGSERIAL PRIMARY KEY,
    ticket_id     BIGINT NOT NULL REFERENCES hd_tickets(id) ON DELETE CASCADE,
    side          TEXT NOT NULL,                       -- owner | staff
    author_kind   TEXT NOT NULL,                       -- customer | user | admin | system
    author_name   TEXT NOT NULL,
    body          JSONB NOT NULL,                      -- [{"t":"text","v":...}, {"t":"img","id":...}] — never HTML
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hd_messages_ticket ON hd_messages (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS hd_images (
    id            BIGSERIAL PRIMARY KEY,
    ticket_id     BIGINT NOT NULL REFERENCES hd_tickets(id) ON DELETE CASCADE,
    uploader      TEXT NOT NULL,                       -- c:<customer id> | u:<user> | a:<admin>
    mime          TEXT NOT NULL,                       -- image/png | image/jpeg | image/webp (checked by magic bytes)
    data          BYTEA NOT NULL,
    size          INT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hd_images_ticket ON hd_images (ticket_id);
CREATE INDEX IF NOT EXISTS hd_images_uploader ON hd_images (uploader, created_at);
"""

# The customer service logs in as this role: it can read the published view and its own customer rows, nothing else.
PORTAL_ROLE = "hp_portal"

# Bullish / bearish levels per timeframe (Admin). BB and Supertrend need none: above = bullish, below = bearish.
TECH_TF_DEFAULT = {"rsi_bull": 70, "rsi_bear": 30, "adx_mode": "below", "adx_value": 40,
                   "macd_bull": 0, "macd_bear": 0, "cci_bull": 150, "cci_bear": -150}

DEFAULT_SETTINGS = {
    "schedule_times": ["09:45", "14:30"],   # IST, one collection per time
    "weekdays_only": True,
    "skip_dates": [],                       # e.g. NSE holidays "2026-10-02"
    "catch_up_minutes": 180,                # run a missed slot if the server comes back within this window
    "retention_days": 0,                    # 0 = keep everything
    "manual_keep": "all",                   # all | latest  (manual syncs kept per day)
    "telegram_enabled": True,
    "nr_mother_body_pct": 60,               # NR mother candle: body must be at least this % of high-low
    "index_add": [],                        # symbols the dashboard also treats as index / ETF (hidden)
    "index_keep": [],                       # symbols never treated as index / ETF, even if auto-detected
    "tech_enabled": True,                   # use the Technicals sheet in the Control Tower
    "tech_weight": 1.0,                     # a timeframe's technicals, all agreeing = this many zone breaks on that TF
    "tech": {tf: dict(TECH_TF_DEFAULT) for tf in "DWMQY"},
    "algos": None,                          # Technical Quant algorithms (admin-managed); None = the ready-made set
    "publish_mode": "manual",               # customer view: manual (admin presses Publish) | auto (after each collection)
}


def init_db():
    pool.open(wait=True, timeout=60)
    with pool.connection() as c:
        c.execute("SELECT pg_advisory_xact_lock(727001)")     # api and worker start together: one at a time
        c.execute(SCHEMA)
        _setup_portal_role(c)


def _setup_portal_role(c):
    """Least-privilege login for the customer service (password from PORTAL_DB_PASSWORD in .env)."""
    pw = os.environ.get("PORTAL_DB_PASSWORD")
    if not pw:
        print("⚠ PORTAL_DB_PASSWORD is not set — the customer app (/app) cannot start")
        return
    from psycopg import sql
    role = sql.Identifier(PORTAL_ROLE)
    exists = c.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (PORTAL_ROLE,)).fetchone()
    c.execute(sql.SQL("ALTER ROLE {} WITH LOGIN PASSWORD {}" if exists else "CREATE ROLE {} LOGIN PASSWORD {}")
              .format(role, sql.Literal(pw)))
    c.execute(sql.SQL("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {}").format(role))
    c.execute(sql.SQL("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {}").format(role))
    c.execute(sql.SQL("GRANT SELECT ON published TO {}").format(role))
    c.execute(sql.SQL("GRANT SELECT ON customers TO {}").format(role))
    # sign-up can only fill these columns (status stays 'pending'); login can only touch the counters
    c.execute(sql.SQL("GRANT INSERT (email, name, phone, country, state, city, pw_hash, signup_ip) ON customers TO {}").format(role))
    c.execute(sql.SQL("GRANT UPDATE (failed_logins, locked_until, last_login, login_count) ON customers TO {}").format(role))
    c.execute(sql.SQL("GRANT USAGE ON SEQUENCE customers_id_seq TO {}").format(role))
    # Helpdesk: only the columns a customer needs, and row-level security on top — the service sets
    # hp.cid (the signed-in customer) per transaction, and the database itself hides every other row.
    for stmt in (
        "GRANT SELECT ON hd_tickets, hd_messages, hd_images TO {}",
        "GRANT INSERT (owner_kind, owner_id, owner_name, subject, severity) ON hd_tickets TO {}",
        "GRANT UPDATE (status, closed_at, closed_by, owner_seen_at, updated_at) ON hd_tickets TO {}",
        "GRANT INSERT (ticket_id, side, author_kind, author_name, body) ON hd_messages TO {}",
        "GRANT INSERT (ticket_id, uploader, mime, data, size) ON hd_images TO {}",
        "GRANT USAGE ON SEQUENCE hd_tickets_id_seq, hd_messages_id_seq, hd_images_id_seq TO {}",
    ):
        c.execute(sql.SQL(stmt).format(role))
    own = "(owner_kind = 'customer' AND owner_id = current_setting('hp.cid', true))"
    in_own = "EXISTS (SELECT 1 FROM hd_tickets t WHERE t.id = ticket_id)"        # hd_tickets' own policy applies here
    policies = {
        "hd_tickets": (own, own),
        "hd_messages": (in_own, f"side = 'owner' AND author_kind IN ('customer', 'system') AND {in_own}"),
        "hd_images": (in_own, f"uploader = 'c:' || current_setting('hp.cid', true) AND {in_own}"),
    }
    for table, (using, check) in policies.items():
        c.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        c.execute(f"DROP POLICY IF EXISTS portal_own ON {table}")
        c.execute(sql.SQL(f"CREATE POLICY portal_own ON {table} TO {{}} USING ({using}) WITH CHECK ({check})").format(role))


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
