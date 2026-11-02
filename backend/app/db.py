"""PostgreSQL connection pool, schema and settings."""
import json
from datetime import datetime, timezone
import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from . import adoption
from . import mailer
from . import permissions as perms

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

-- Customer sign-up mode (Admin → Customers). The customer service cannot read this table: it may only call
-- portal_auto_approve() (yes / no). New SELF sign-ups (signup_ip set) are approved by the trigger below when it is on,
-- so the customer service itself never gets the right to approve anyone.
CREATE TABLE IF NOT EXISTS portal_config (
    key    TEXT PRIMARY KEY,
    value  JSONB NOT NULL
);
CREATE OR REPLACE FUNCTION portal_auto_approve() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT COALESCE((SELECT value = 'true'::jsonb FROM portal_config WHERE key = 'auto_approve'), false) $$;
CREATE OR REPLACE FUNCTION customers_auto_approve() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NEW.status = 'pending' AND NEW.signup_ip IS NOT NULL AND portal_auto_approve() THEN
        NEW.status := 'approved';
        NEW.approved_at := now();
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS customers_auto_approve ON customers;
CREATE TRIGGER customers_auto_approve BEFORE INSERT ON customers FOR EACH ROW EXECUTE FUNCTION customers_auto_approve();
REVOKE ALL ON FUNCTION portal_auto_approve() FROM PUBLIC;
-- Past days for customers (admin switch 'history' in portal_config): the customer-safe view (same labels-only payload
-- as `published`) of every SCHEDULED collection — never manual syncs or imports. Rows go with their collection.
CREATE TABLE IF NOT EXISTS customer_history (
    snapshot_id  BIGINT PRIMARY KEY REFERENCES snapshots(id) ON DELETE CASCADE,
    trade_date   DATE        NOT NULL,
    taken_at     TIMESTAMPTZ NOT NULL,
    slot         TEXT,
    stocks       INT,
    data_gz      BYTEA       NOT NULL,
    built_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_history_day ON customer_history (trade_date, taken_at);
-- which strength formula built a stored past day (publish.FORMULA_VERSION); older ones are rebuilt by the worker
ALTER TABLE customer_history ADD COLUMN IF NOT EXISTS formula INT NOT NULL DEFAULT 0;
-- Strength evidence (owner, 2026-11-01: "check all the combinations as much as possible … store the final output"):
-- one row per stock per collection with its full combination (per timeframe: zone trend × price place × mother candle
-- = 90 states; full = M × Q × Y = 729,000) and the exact results, so each combination can be checked against what the
-- price did afterwards. Admin only (the customer service has no grant). ~100 bytes a row, ~240 KB a collection.
CREATE TABLE IF NOT EXISTS stock_states (
    snapshot_id  BIGINT      NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    trade_date   DATE        NOT NULL,
    taken_at     TIMESTAMPTZ NOT NULL,
    symbol       TEXT        NOT NULL,
    price        REAL,
    cap          CHAR(1),                 -- L / M / S, '' = other
    rel          CHAR(1),                 -- reliability S / M / W
    stretched    BOOLEAN     NOT NULL DEFAULT false,
    regime       SMALLINT,                -- long-term (monthly) regime 1 / 0 / −1
    m_state      SMALLINT, q_state SMALLINT, y_state SMALLINT,   -- 0 … 89 = trend × 18 + place × 3 + mother candle
    m_st         SMALLINT, q_st SMALLINT, y_st SMALLINT,         -- timeframe strengths (after the regime gate)
    m_nr         SMALLINT, q_nr SMALLINT, y_nr SMALLINT,         -- mother candle ±n (0 = none)
    strength     SMALLINT,                -- long-term stock strength
    colour       SMALLINT,                -- 1 Doing well (green) · 0 · −1
    formula      INT         NOT NULL,
    PRIMARY KEY (snapshot_id, symbol)
);
CREATE INDEX IF NOT EXISTS stock_states_symbol ON stock_states (symbol, taken_at);
CREATE OR REPLACE FUNCTION portal_history_enabled() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT COALESCE((SELECT value = 'true'::jsonb FROM portal_config WHERE key = 'history'), false) $$;
REVOKE ALL ON FUNCTION portal_history_enabled() FROM PUBLIC;
-- AI Portfolio Analyser: the customer's list of stocks (symbols only — no quantities, no prices)
CREATE TABLE IF NOT EXISTS customer_portfolio (
    customer_id  BIGINT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
    symbols      TEXT[]      NOT NULL DEFAULT '{}',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON FUNCTION customers_auto_approve() FROM PUBLIC;
CREATE INDEX IF NOT EXISTS hd_images_uploader ON hd_images (uploader, created_at);

-- Access manager (RBAC for the customer app only, owner 2026-10-27). Applications = the customer app's modules (fixed
-- catalogue — each one is code); roles group applications; a customer may hold several roles (applications = union).
-- Exactly one role is the default: every new customer gets it (trigger below).
CREATE TABLE IF NOT EXISTS app_modules (
    key          TEXT PRIMARY KEY,                    -- research | simple | portfolio
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    sort         INT  NOT NULL DEFAULT 0,
    enabled      BOOLEAN NOT NULL DEFAULT true        -- off = hidden from everyone (maintenance)
);
INSERT INTO app_modules (key, name, description, sort) VALUES
    ('research',  'Research view',              'Control Tower: every stock with filters, sectors, industries and the stock card', 1),
    ('simple',    'Simplified view (AI Mode)',  'Search one stock and read the AI verdict in plain words', 2),
    ('portfolio', 'AI Portfolio Analyser',      'The customer''s own stock list with strength, trend map and the PDF report', 3),
    ('builder',   'AI Portfolio Builder',       'Builds a model portfolio from an amount, stock count, market-cap mix and reliability', 4)
ON CONFLICT (key) DO NOTHING;
CREATE TABLE IF NOT EXISTS roles (
    id           BIGSERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    is_default   BOOLEAN NOT NULL DEFAULT false,
    is_system    BOOLEAN NOT NULL DEFAULT false,      -- the built-in "Customer" role: editable, never deleted
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS roles_name ON roles (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS roles_one_default ON roles (is_default) WHERE is_default;
CREATE TABLE IF NOT EXISTS role_modules (
    role_id      BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    module       TEXT   NOT NULL REFERENCES app_modules(key) ON DELETE CASCADE,
    PRIMARY KEY (role_id, module)
);
CREATE TABLE IF NOT EXISTS customer_roles (
    customer_id  BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    role_id      BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by  TEXT,
    PRIMARY KEY (customer_id, role_id)
);
CREATE INDEX IF NOT EXISTS customer_roles_role ON customer_roles (role_id);
CREATE OR REPLACE FUNCTION customers_default_role() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    INSERT INTO customer_roles (customer_id, role_id, assigned_by)
        SELECT NEW.id, id, 'default role' FROM roles WHERE is_default ON CONFLICT DO NOTHING;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS customers_default_role ON customers;
CREATE TRIGGER customers_default_role AFTER INSERT ON customers FOR EACH ROW EXECUTE FUNCTION customers_default_role();
REVOKE ALL ON FUNCTION customers_default_role() FROM PUBLIC;
-- Permissions (owner, 2026-11-01: "be clear with the RBAC … ai portfolio builder - permission, display, detail view").
-- Standard RBAC (NIST): customer → roles → permissions, each permission = application:action. "application:view"
-- (open and use it) is the role_modules row above; app_permissions lists the EXTRA actions inside an application.
-- A permission only works while the customer can also open its application. Restricted = owner-level (shows how the
-- results are worked out): never allowed on the default role.
CREATE TABLE IF NOT EXISTS app_permissions (
    key          TEXT PRIMARY KEY,                    -- portfolio:detail
    module       TEXT NOT NULL REFERENCES app_modules(key) ON DELETE CASCADE,
    action       TEXT NOT NULL,                       -- detail
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    restricted   BOOLEAN NOT NULL DEFAULT false,
    sort         INT  NOT NULL DEFAULT 0
);
-- rows come from the catalogue in permissions.py (sync_catalogue, every start)
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id      BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission   TEXT   NOT NULL REFERENCES app_permissions(key) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission)
);
-- Monthly / quarterly / yearly candles of a collection (scanner sheet "Candles": current bar + the last 12), kept out
-- of the collection itself so the dashboard does not download them. Only the stock detail view uses them.
CREATE TABLE IF NOT EXISTS snapshot_candles (
    snapshot_id  BIGINT PRIMARY KEY REFERENCES snapshots(id) ON DELETE CASCADE,
    stocks       INT,
    data_gz      BYTEA NOT NULL                       -- gzip JSON [{Symbol, M0 … M12, Q0 …, Y0 …}] each "open high low close"
);
-- Stock detail view (customer-admin permission *:detail): everything behind one stock's result, per collection, built
-- with the final output (detail.py), ~1.3 KB a stock (~3 MB a collection). Kept for the last DETAIL_DAYS days (worker cleanup). The customer service may read
-- it only for a customer whose roles hold a detail permission (row-level security, policy in _setup_portal_role).
CREATE TABLE IF NOT EXISTS stock_detail (
    snapshot_id  BIGINT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    symbol       TEXT   NOT NULL,                     -- '~meta' = the formula's constants for that collection
    formula      INT    NOT NULL,
    data_gz      BYTEA  NOT NULL,                     -- gzip JSON (rows are too small for Postgres to compress them)
    PRIMARY KEY (snapshot_id, symbol)
);
ALTER TABLE stock_detail ENABLE ROW LEVEL SECURITY;

-- Activity log (Admin → Activity log): one session row per customer sign-in (device = the browser's qf_dev cookie),
-- events for customers and dashboard users, and minutes per customer-app module (heartbeat while the page is visible).
CREATE TABLE IF NOT EXISTS customer_sessions (
    id           TEXT PRIMARY KEY,                    -- random, carried in the signed cookie
    customer_id  BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    device_id    TEXT,
    device       TEXT,                                -- "Chrome · Windows"
    user_agent   TEXT,
    ip           TEXT,
    last_ip      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at     TIMESTAMPTZ,
    end_reason   TEXT                                 -- signed_out | revoked | blocked | password_reset
);
CREATE INDEX IF NOT EXISTS customer_sessions_cust ON customer_sessions (customer_id, last_seen DESC);
CREATE INDEX IF NOT EXISTS customer_sessions_seen ON customer_sessions (last_seen DESC);
CREATE TABLE IF NOT EXISTS activity_log (
    id           BIGSERIAL PRIMARY KEY,
    at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_kind   TEXT NOT NULL,                       -- customer | user  (user = dashboard login from config.ini)
    actor_id     TEXT,                                -- customers.id as text / user name; NULL = unknown email
    actor_name   TEXT,
    session_id   TEXT,
    device_id    TEXT,
    device       TEXT,
    ip           TEXT,
    app          TEXT NOT NULL,                       -- customer | admin
    module       TEXT,
    event        TEXT NOT NULL,                       -- signup | login | login_failed | locked | logout | open | ...
    detail       JSONB
);
CREATE INDEX IF NOT EXISTS activity_log_at ON activity_log (at DESC);
CREATE INDEX IF NOT EXISTS activity_log_actor ON activity_log (actor_kind, actor_id, at DESC);
CREATE INDEX IF NOT EXISTS activity_log_event ON activity_log (event, at DESC);
CREATE TABLE IF NOT EXISTS module_usage (
    session_id   TEXT   NOT NULL,
    customer_id  BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    module       TEXT   NOT NULL,
    day          DATE   NOT NULL,
    first_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    minutes      INT    NOT NULL DEFAULT 1,
    PRIMARY KEY (session_id, module, day)
);
CREATE INDEX IF NOT EXISTS module_usage_day ON module_usage (day, module);
-- Customer app side menu: the applications the customer pinned to the rail (max 6; the rest are under "More apps").
-- NULL row = never chose → the first 6 of their applications.
CREATE TABLE IF NOT EXISTS customer_prefs (
    customer_id  BIGINT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
    pins         TEXT[]      NOT NULL DEFAULT '{}',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS module_usage_cust ON module_usage (customer_id, day);
"""

# The customer service logs in as this role: it can read the published view and its own customer rows, nothing else.
PORTAL_ROLE = "hp_portal"

# Bullish / bearish levels per timeframe (Admin). BB and Supertrend need none: above = bullish, below = bearish.
TECH_TF_DEFAULT = {"rsi_bull": 70, "rsi_bear": 30, "rsi70_bull": 70, "rsi70_bear": 40, "adx_mode": "below", "adx_value": 40,
                   "atr_mode": "below", "atr_value": 70,
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
    "activity_retention_days": 180,         # Activity log: events, sessions and minutes per module older than this go
}


def init_db():
    pool.open(wait=True, timeout=60)
    with pool.connection() as c:
        c.execute("SELECT pg_advisory_xact_lock(727001)")     # api and worker start together: one at a time
        c.execute(SCHEMA)
        c.execute(perms.SCHEMA)                                # Access manager v2: one permission model + direct grants
        c.execute(adoption.SCHEMA)                             # Adoption report: customer × day × application, 2 years
        adoption.backfill(c)
        c.execute(mailer.SCHEMA)                               # email outbox + "Forgot password" links
        perms.sync_catalogue(c)
        perms.migrate_v2(c)
        _seed_roles(c)
        perms.migrate_builder_plans(c)                         # builder for every role + its Customer plan
        perms.rename_builder_levels(c)
        _setup_portal_role(c)


CUSTOMER_APPS = ("research", "simple", "portfolio")     # the default "Customer" plan (owner, 2026-10-27)
BUILDER_APPS = CUSTOMER_APPS + ("builder",)             # "AI Portfolio Builder" plan: every dashboard + the builder
CUSTOMER_ADMIN_DESC = ("Owner only: every application plus the stock detail views (zones, mother candles, regime, "
                       "strength steps, technicals) to check the results")


def _seed_roles(c):
    """First start with the Access manager: the built-in default role "Customer" (Research, AI Mode, AI Portfolio
    Analyser), given to every existing customer (new customers get the default role from the customers_default_role
    trigger). Once: the role "AI Portfolio Builder" (every customer dashboard + the builder; owner 2026-10-31: a separate
    role, given to nobody — the owner assigns it later; deleting it later does not bring it back)."""
    if not c.execute("SELECT 1 FROM roles WHERE is_system").fetchone():
        rid = c.execute("INSERT INTO roles (name, description, is_default, is_system, updated_by) VALUES "
                        "('Customer', 'Standard plan: Research view, AI Mode and AI Portfolio Analyser', "
                        "NOT EXISTS (SELECT 1 FROM roles WHERE is_default), true, 'system') RETURNING id").fetchone()["id"]
        c.execute("INSERT INTO role_permissions (role_id, permission) SELECT %s, key FROM app_permissions WHERE key = ANY(%s) "
                  "ON CONFLICT DO NOTHING", (rid, [f"{k}:view" for k in CUSTOMER_APPS]))
        c.execute("INSERT INTO customer_roles (customer_id, role_id, assigned_by) "
                  "SELECT id, %s, 'default role' FROM customers c WHERE NOT EXISTS (SELECT 1 FROM customer_roles r WHERE r.customer_id = c.id)",
                  (rid,))
    if not c.execute("SELECT 1 FROM settings WHERE key = 'builder_role_seeded'").fetchone():
        r = c.execute("INSERT INTO roles (name, description, updated_by) VALUES ('AI Portfolio Builder', "
                      "'Every customer dashboard plus the Hyperplane AI Portfolio Builder', 'system') "
                      "ON CONFLICT DO NOTHING RETURNING id").fetchone()
        if r:
            c.execute("INSERT INTO role_permissions (role_id, permission) SELECT %s, key FROM app_permissions WHERE key = ANY(%s) "
                      "ON CONFLICT DO NOTHING", (r["id"], [f"{k}:view" for k in BUILDER_APPS]))
        c.execute("INSERT INTO settings (key, value) VALUES ('builder_role_seeded', 'true'::jsonb) ON CONFLICT DO NOTHING")
    if not c.execute("SELECT 1 FROM settings WHERE key = 'customer_admin_role_seeded'").fetchone():
        # Owner 2026-11-01: "create one more role as the customer admin to have all the apps and these additional
        # access … don't provide this access to anyone". Every application + every restricted permission, given to
        # nobody. A role of that name made earlier by hand is reused (its customers keep it).
        r = c.execute("SELECT id FROM roles WHERE lower(name) = 'customer admin'").fetchone() or c.execute(
            "INSERT INTO roles (name, description, updated_by) VALUES ('Customer Admin', %s, 'system') RETURNING id",
            (CUSTOMER_ADMIN_DESC,)).fetchone()
        c.execute("UPDATE roles SET description = %s WHERE id = %s AND description = ''", (CUSTOMER_ADMIN_DESC, r["id"]))
        c.execute("INSERT INTO role_permissions (role_id, permission) SELECT %s, key FROM app_permissions "
                  "WHERE (action = 'view' OR restricted) AND NOT retired ON CONFLICT DO NOTHING", (r["id"],))
        c.execute("INSERT INTO settings (key, value) VALUES ('customer_admin_role_seeded', 'true'::jsonb) ON CONFLICT DO NOTHING")


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
    c.execute(sql.SQL("GRANT EXECUTE ON FUNCTION portal_auto_approve() TO {}").format(role))   # yes / no only
    # "Forgot password": three functions only — no rights on password_resets, email_outbox or the password column
    for fn in mailer.PORTAL_FUNCTIONS:
        c.execute(sql.SQL("GRANT EXECUTE ON FUNCTION {} TO {}").format(sql.SQL(fn), role))
    # past days: readable only while the admin switch is on — the database itself enforces it (row-level security)
    c.execute(sql.SQL("GRANT SELECT ON customer_history TO {}").format(role))
    c.execute(sql.SQL("GRANT EXECUTE ON FUNCTION portal_history_enabled() TO {}").format(role))
    # AI Portfolio: each customer sees and changes only their own row (hp.cid set per transaction, like the helpdesk)
    c.execute(sql.SQL("GRANT SELECT, INSERT (customer_id, symbols, updated_at), UPDATE (symbols, updated_at) ON customer_portfolio TO {}").format(role))
    c.execute("ALTER TABLE customer_portfolio ENABLE ROW LEVEL SECURITY")
    c.execute("DROP POLICY IF EXISTS portal_own ON customer_portfolio")
    c.execute(sql.SQL("CREATE POLICY portal_own ON customer_portfolio TO {} USING (customer_id::text = current_setting('hp.cid', true)) "
                      "WITH CHECK (customer_id::text = current_setting('hp.cid', true))").format(role))
    # side-menu pins: same rule as the portfolio — each customer reads and writes only their own row
    c.execute(sql.SQL("GRANT SELECT, INSERT (customer_id, pins, updated_at), UPDATE (pins, updated_at) ON customer_prefs TO {}").format(role))
    c.execute("ALTER TABLE customer_prefs ENABLE ROW LEVEL SECURITY")
    c.execute("DROP POLICY IF EXISTS portal_own ON customer_prefs")
    c.execute(sql.SQL("CREATE POLICY portal_own ON customer_prefs TO {} USING (customer_id::text = current_setting('hp.cid', true)) "
                      "WITH CHECK (customer_id::text = current_setting('hp.cid', true))").format(role))
    c.execute("ALTER TABLE customer_history ENABLE ROW LEVEL SECURITY")
    c.execute("DROP POLICY IF EXISTS portal_history ON customer_history")
    c.execute(sql.SQL("CREATE POLICY portal_history ON customer_history FOR SELECT TO {} USING (portal_history_enabled())").format(role))
    # Access manager: read-only (roles are changed in Admin only). Activity: the service records sessions, events and
    # minutes per module but can never read the log back or change who holds which role.
    c.execute(sql.SQL("GRANT SELECT ON app_modules, roles, role_modules, customer_roles, app_permissions, role_permissions, "
                      "customer_permissions, effective_permissions TO {}").format(role))
    # Stock detail view: readable only while the signed-in customer (hp.cid, set per transaction) holds a detail
    # permission — a bug in the service cannot hand it to a normal customer.
    c.execute(sql.SQL("GRANT SELECT ON stock_detail TO {}").format(role))
    c.execute("DROP POLICY IF EXISTS portal_detail ON stock_detail")
    c.execute(sql.SQL("CREATE POLICY portal_detail ON stock_detail FOR SELECT TO {} USING (EXISTS ("
                      "SELECT 1 FROM effective_permissions e JOIN app_permissions p ON p.key = e.key AND p.action = 'detail' "
                      "WHERE e.customer_id::text = current_setting('hp.cid', true)))").format(role))
    c.execute(sql.SQL("GRANT SELECT, INSERT (id, customer_id, device_id, device, user_agent, ip, last_ip) ON customer_sessions TO {}").format(role))
    c.execute(sql.SQL("GRANT UPDATE (last_seen, last_ip, ended_at, end_reason) ON customer_sessions TO {}").format(role))
    c.execute(sql.SQL("GRANT INSERT (actor_kind, actor_id, actor_name, session_id, device_id, device, ip, app, module, event, detail) "
                      "ON activity_log TO {}").format(role))
    c.execute(sql.SQL("GRANT USAGE ON SEQUENCE activity_log_id_seq TO {}").format(role))
    c.execute(sql.SQL("GRANT SELECT, INSERT (session_id, customer_id, module, day), UPDATE (last_at, minutes) ON module_usage TO {}").format(role))
    c.execute(sql.SQL("GRANT SELECT, INSERT (customer_id, day, module, minutes, visits, actions, first_action_at), "
                      "UPDATE (minutes, visits, actions, first_action_at) ON adoption_daily TO {}").format(role))
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
    # levels saved before a new indicator existed (e.g. RSI-70, ATR) get that indicator's default
    tech = s.get("tech") if isinstance(s.get("tech"), dict) else {}
    s["tech"] = {tf: {**TECH_TF_DEFAULT, **(tech.get(tf) or {})} for tf in "DWMQY"}
    return s


def put_settings(values: dict):
    with pool.connection() as c:
        for k, v in values.items():
            c.execute("INSERT INTO settings(key, value) VALUES (%s, %s::jsonb) "
                      "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (k, json.dumps(v)))


def get_auto_approve():
    with pool.connection() as c:
        return bool(c.execute("SELECT portal_auto_approve() AS v").fetchone()["v"])


def set_auto_approve(on: bool):
    with pool.connection() as c:
        c.execute("INSERT INTO portal_config(key, value) VALUES ('auto_approve', %s::jsonb) "
                  "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (json.dumps(bool(on)),))


def get_history_enabled():
    with pool.connection() as c:
        return bool(c.execute("SELECT portal_history_enabled() AS v").fetchone()["v"])


def set_history_enabled(on: bool, by=None):
    with pool.connection() as c:
        c.execute("INSERT INTO portal_config(key, value) VALUES ('history', %s::jsonb) "
                  "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (json.dumps(bool(on)),))
        c.execute("INSERT INTO portal_config(key, value) VALUES ('history_changed', %s::jsonb) "
                  "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
                  (json.dumps({"on": bool(on), "by": by, "at": datetime.now(timezone.utc).isoformat()}),))


def get_history_changed():
    with pool.connection() as c:
        r = c.execute("SELECT value FROM portal_config WHERE key = 'history_changed'").fetchone()
    return r["value"] if r else None


def get_meta(key, default=None):
    with pool.connection() as c:
        r = c.execute("SELECT value FROM settings WHERE key = %s", (key,)).fetchone()
    return r["value"] if r else default


def set_meta(key, value):
    with pool.connection() as c:
        c.execute("INSERT INTO settings(key, value) VALUES (%s, %s::jsonb) "
                  "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", (key, json.dumps(value)))
