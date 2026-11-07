"""
Permission catalogue + effective access (Access manager v2, owner 2026-11-01: "in future there might be 10 permissions
and many roles … keep it dynamic but identify everything properly … any permission to any role, and to a user as well").

Standard RBAC (NIST) plus direct grants:
    customer → roles → permissions ("application:action")   +   customer → direct grants (reason, optional end date)
  * "<app>:view" = open and use the application; every other action requires its application's view.
  * The catalogue lives HERE, in code (a permission without code does nothing). init_db syncs it on every start: new
    keys are added, code-owned fields (application, action, requires, order) follow the code, admin-owned fields
    (label, description, group, owner-level, on/off) are kept; keys no longer in the code are marked retired (never
    deleted, so old assignments stay visible). Adding a feature = adding one line below.
  * Effective = held through a role or an active direct grant, the permission is on and not retired, and the permission
    it requires is effective too. One SQL view (effective_permissions) answers it for the customer service, the admin
    screens and the database row-level security alike.
"""

# key, label, description, requires, owner-level (restricted)
PERMISSIONS = (
    ("research:view", "Open Deep Research",
     "Control Tower: every stock with filters, sectors, industries and the stock card", None, False),
    ("simple:view", "Open AI Mode",
     "Search one stock and read the AI verdict in plain words", None, False),
    ("portfolio:view", "Open AI Portfolio Analyser",
     "The customer's own stock list with strength, trend map and the PDF report", None, False),
    ("portfolio:detail", "Stock detail view",
     "Click a stock to see its checklist, zones, mother candles, regime and technicals", "portfolio:view", True),
    # past data (owner 2026-11-07, round 16: "the customer admin can go to the old data and do the analysis — a permission instead of
    # the option in the admin panel; customers can't"): a day picker in every application; the server follows the day picked
    ("research:history", "Past data in every application",
     "Pick an older day (Day open / Day end) and every application — AI Mode, Deep Research, Analyser, Builder, ETF Analyser and both SIP "
     "Builders — works on that day's data; a portfolio saved then is tracked from that day to today", "research:view", True),
    ("builder:view", "Open AI Portfolio Builder",
     "Builds a model portfolio from an amount, stock count, market-cap mix and reliability", None, False),
    # builder plans (owner 2026-11-01): the highest one held applies; holding the app without any plan = Customer
    ("builder:customer", "Builder · Customer level",
     "Up to ₹1 lakh and 20 stocks, High reliability only, standard settings (More options locked) — every role has it",
     "builder:view", False),
    ("builder:trader", "Builder · Trader level",
     "Up to ₹10,000 crore and 1,000 stocks, High or Medium reliability, every More option", "builder:view", False),
    ("builder:admin", "Builder · Admin level",
     "Any amount, every option — for the owner to check results", "builder:view", True),
    ("builder:detail", "Stock detail view",
     "Click a stock in the built portfolio to see its checklist, zones, mother candles, regime and technicals",
     "builder:view", True),
    # ETF analyser (owner, 2026-11-06): a separate application — given to customers by the admin like any other
    ("etf:view", "Open ETF Analyser",
     "Tradable ETFs (gold, silver, index, sector, international) with their strength and the recommended ETF for each",
     None, False),    # AI ETF SIP Builder (owner, 2026-11-06): for everyone — every role gets it once (migrate_sip)
    ("sip:view", "Open AI ETF SIP Builder",
     "A monthly or quarterly SIP of ₹5,000 to ₹1 crore in ETFs only (Nifty large / mid / small caps, gold, small themes)", None, False),
    # AI Momentum SIP (owner, 2026-11-06): stocks only, higher risk — for everyone (migrate_msip)
    ("msip:view", "Open AI Momentum SIP Builder",
     "A monthly or quarterly SIP in momentum stocks only, spread wide; higher risk", None, False),
    # its levels (owner, 2026-11-06 round 6: "2 roles, customer and customer admin, as usual like the AI Portfolio
    # Builder"): the highest one held applies; holding the app without a level = Customer
    # sharing saved portfolios: one permission per application (round 15: every role that opens the application has it — migrate_share_all)
    ("sip:share", "Share saved AI ETF SIP Builder plans", "Give a saved plan an ID and make it private or public", "sip:view", False),
    ("msip:share", "Share saved AI Momentum SIP Builder plans", "Give a saved plan an ID and make it private or public", "msip:view", False),
    ("builder:share", "Share saved AI Portfolio Builder portfolios", "Give a saved portfolio an ID and make it private or public", "builder:view", False),
    ("portfolio:share", "Share saved AI Portfolio Analyser lists", "Give a saved list an ID and make it private or public", "portfolio:view", False),
    ("msip:customer", "Momentum SIP Builder · Customer level",
     "Up to ₹50,000 an instalment and 50 stocks, High reliability only, standard settings (More options locked) — every role has it",
     "msip:view", False),
    ("msip:admin", "Momentum SIP Builder · Admin level",
     "Any amount and number of stocks, High / Medium / Low reliability, every More option — for the owner", "msip:view", True),
)
KEYS = tuple(p[0] for p in PERMISSIONS)
assert all(r is None or r in KEYS for *_, r, _ in PERMISSIONS), "requires must name a catalogue key"
assert all(r is None or dict((k, q) for k, _, _, q, _ in PERMISSIONS)[r] is None for *_, r, _ in PERMISSIONS), \
    "requires is one level deep (the required permission requires nothing)"

ACTIVE_GRANT = "(g.expires_on IS NULL OR g.expires_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date)"

SCHEMA = f"""
ALTER TABLE app_permissions ADD COLUMN IF NOT EXISTS grp TEXT;                   -- admin group label (NULL = application)
ALTER TABLE app_permissions ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE app_permissions ADD COLUMN IF NOT EXISTS requires TEXT;
ALTER TABLE app_permissions ADD COLUMN IF NOT EXISTS retired BOOLEAN NOT NULL DEFAULT false;
-- direct grants: a permission given to one customer outside any role (reason required, optional last day)
CREATE TABLE IF NOT EXISTS customer_permissions (
    customer_id  BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    permission   TEXT   NOT NULL REFERENCES app_permissions(key) ON DELETE CASCADE,
    reason       TEXT   NOT NULL,
    expires_on   DATE,                                  -- last day it works (Indian date); NULL = no end
    granted_by   TEXT,
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (customer_id, permission)
);
CREATE INDEX IF NOT EXISTS customer_permissions_perm ON customer_permissions (permission);
CREATE INDEX IF NOT EXISTS role_permissions_perm ON role_permissions (permission);
-- role_modules is kept for one release as a mirror of the ":view" permissions (safe rollback); nothing reads it
CREATE OR REPLACE FUNCTION role_permissions_mirror() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.permission LIKE '%:view' THEN
        INSERT INTO role_modules (role_id, module) VALUES (NEW.role_id, split_part(NEW.permission, ':', 1)) ON CONFLICT DO NOTHING;
    ELSIF TG_OP = 'DELETE' AND OLD.permission LIKE '%:view' THEN
        DELETE FROM role_modules WHERE role_id = OLD.role_id AND module = split_part(OLD.permission, ':', 1);
    END IF;
    RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS role_permissions_mirror ON role_permissions;
CREATE TRIGGER role_permissions_mirror AFTER INSERT OR DELETE ON role_permissions FOR EACH ROW EXECUTE FUNCTION role_permissions_mirror();
-- effective access, one row per customer and permission they can use right now
CREATE OR REPLACE VIEW effective_permissions AS
SELECT h.customer_id, h.key FROM (
    SELECT cr.customer_id, rp.permission AS key FROM customer_roles cr JOIN role_permissions rp ON rp.role_id = cr.role_id
    UNION
    SELECT g.customer_id, g.permission FROM customer_permissions g WHERE {ACTIVE_GRANT}
) h JOIN app_permissions p ON p.key = h.key AND p.enabled AND NOT p.retired
WHERE p.requires IS NULL OR EXISTS (
    SELECT 1 FROM app_permissions q WHERE q.key = p.requires AND q.enabled AND NOT q.retired AND (
        EXISTS (SELECT 1 FROM customer_roles cr2 JOIN role_permissions rp2 ON rp2.role_id = cr2.role_id
                WHERE cr2.customer_id = h.customer_id AND rp2.permission = q.key)
        OR EXISTS (SELECT 1 FROM customer_permissions g WHERE g.customer_id = h.customer_id AND g.permission = q.key AND {ACTIVE_GRANT})));
"""


def sync_catalogue(c):
    """Bring app_permissions in line with PERMISSIONS (keeps the admin's label / description / group / owner-level / on-off)."""
    for i, (key, label, desc, requires, restricted) in enumerate(PERMISSIONS):
        module, action = key.split(":")
        c.execute("INSERT INTO app_permissions (key, module, action, name, description, restricted, sort, requires, retired) "
                  "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,false) ON CONFLICT (key) DO UPDATE SET module = EXCLUDED.module, "
                  "action = EXCLUDED.action, requires = EXCLUDED.requires, sort = EXCLUDED.sort, retired = false",
                  (key, module, action, label, desc, restricted, i, requires))
    c.execute("UPDATE app_permissions SET retired = true WHERE NOT (key = ANY(%s))", (list(KEYS),))
    # renamed applications (owner 2026-11-06): only the old default labels change — a label the admin edited stays
    labels = {k: (l, d) for k, l, d, *_ in PERMISSIONS}
    for key, old in (("research:view", ("Open Research view",)), ("simple:view", ("Open Simplified view (AI Mode)",)),
                     ("sip:view", ("Open Momentum SIP", "Open AI SIP Builder")),
                     ("msip:view", ("Open AI Momentum SIP",)), ("msip:customer", ("Momentum SIP · Customer level",)),
                     ("msip:admin", ("Momentum SIP · Admin level",))):
        c.execute("UPDATE app_permissions SET name = %s, description = %s WHERE key = %s AND name = ANY(%s)", (*labels[key], key, list(old)))


def migrate_v2(c):
    """Once: application access moves from role_modules into role_permissions ("<app>:view"); an application that was
    switched off keeps its view permission off."""
    if c.execute("SELECT 1 FROM settings WHERE key = 'perm_model_v2'").fetchone():
        return
    c.execute("INSERT INTO role_permissions (role_id, permission) SELECT rm.role_id, rm.module || ':view' FROM role_modules rm "
              "JOIN app_permissions p ON p.key = rm.module || ':view' ON CONFLICT DO NOTHING")
    c.execute("UPDATE app_permissions p SET enabled = m.enabled FROM app_modules m WHERE p.key = m.key || ':view'")
    c.execute("INSERT INTO settings (key, value) VALUES ('perm_model_v2', 'true'::jsonb) ON CONFLICT DO NOTHING")


def migrate_sip(c):
    """Once (owner 2026-11-06: "everyone by default"): every role gets the AI ETF SIP Builder; customers with saved menu pins
    get it pinned while there is room."""
    if c.execute("SELECT 1 FROM settings WHERE key = 'sip_v1'").fetchone():
        return
    c.execute("INSERT INTO role_permissions (role_id, permission) SELECT id, 'sip:view' FROM roles ON CONFLICT DO NOTHING")
    c.execute("UPDATE customer_prefs SET pins = array_append(pins, 'sip'), updated_at = now() "
              "WHERE NOT ('sip' = ANY(pins)) AND cardinality(pins) < 6")
    c.execute("INSERT INTO settings (key, value) VALUES ('sip_v1', 'true'::jsonb) ON CONFLICT DO NOTHING")


def migrate_msip(c):
    """Once (owner 2026-11-06: the AI Momentum SIP is for everyone): every role gets it; pinned while there is room."""
    if c.execute("SELECT 1 FROM settings WHERE key = 'msip_v1'").fetchone():
        return
    c.execute("INSERT INTO role_permissions (role_id, permission) SELECT id, 'msip:view' FROM roles ON CONFLICT DO NOTHING")
    c.execute("UPDATE customer_prefs SET pins = array_append(pins, 'msip'), updated_at = now() "
              "WHERE NOT ('msip' = ANY(pins)) AND cardinality(pins) < 6")
    c.execute("INSERT INTO settings (key, value) VALUES ('msip_v1', 'true'::jsonb) ON CONFLICT DO NOTHING")


def migrate_msip_levels(c):
    """Once (owner 2026-11-06 round 6): every role gets the Momentum SIP Customer level, the Customer Admin role its
    Admin level (later changes only in Admin → Access manager)."""
    if c.execute("SELECT 1 FROM settings WHERE key = 'msip_levels_v1'").fetchone():
        return
    c.execute("INSERT INTO role_permissions (role_id, permission) SELECT id, 'msip:customer' FROM roles ON CONFLICT DO NOTHING")
    c.execute("INSERT INTO role_permissions (role_id, permission) SELECT id, 'msip:admin' FROM roles "
              "WHERE lower(name) = 'customer admin' ON CONFLICT DO NOTHING")
    c.execute("INSERT INTO settings (key, value) VALUES ('msip_levels_v1', 'true'::jsonb) ON CONFLICT DO NOTHING")


def migrate_share(c):
    """Once (owner 2026-11-07): the Customer Admin role may share saved portfolios; every other role cannot (the owner can give it
    to any role in Admin → Access manager later)."""
    if c.execute("SELECT 1 FROM settings WHERE key = 'share_v1'").fetchone():
        return
    c.execute("INSERT INTO role_permissions (role_id, permission) SELECT r.id, k FROM roles r "
              "CROSS JOIN unnest(ARRAY['sip:share', 'msip:share', 'builder:share', 'portfolio:share']) k "
              "WHERE lower(r.name) = 'customer admin' ON CONFLICT DO NOTHING")
    c.execute("INSERT INTO settings (key, value) VALUES ('share_v1', 'true'::jsonb) ON CONFLICT DO NOTHING")


def migrate_share_all(c):
    """Once (owner 2026-11-07, round 15: "anyone can save and share any portfolio — keep it at the customer level, but as one of
    the permissions"): every role that opens an application may share its saved portfolios. Still a permission per application,
    so the owner can take it away from any role in Admin → Access manager."""
    if c.execute("SELECT 1 FROM settings WHERE key = 'share_all_v1'").fetchone():
        return
    for app in ("sip", "msip", "builder", "portfolio"):
        c.execute("INSERT INTO role_permissions (role_id, permission) SELECT role_id, %s FROM role_permissions WHERE permission = %s "
                  "ON CONFLICT DO NOTHING", (f"{app}:share", f"{app}:view"))
    c.execute("INSERT INTO settings (key, value) VALUES ('share_all_v1', 'true'::jsonb) ON CONFLICT DO NOTHING")


def migrate_history_perm(c):
    """Once (round 16): past data moves from the admin switch to the permission research:history — the Customer Admin role gets it."""
    if c.execute("SELECT 1 FROM settings WHERE key = 'history_perm_v1'").fetchone():
        return
    c.execute("INSERT INTO role_permissions (role_id, permission) SELECT id, 'research:history' FROM roles WHERE lower(name) = 'customer admin' "
              "ON CONFLICT DO NOTHING")
    c.execute("INSERT INTO settings (key, value) VALUES ('history_perm_v1', 'true'::jsonb) ON CONFLICT DO NOTHING")


def migrate_pins8(c):
    """Once (owner 2026-11-06: "allow 8 apps to pin"): saved menu pins get the AI Momentum SIP while there is room."""
    if c.execute("SELECT 1 FROM settings WHERE key = 'pins8_v1'").fetchone():
        return
    c.execute("UPDATE customer_prefs SET pins = array_append(pins, 'msip'), updated_at = now() "
              "WHERE NOT ('msip' = ANY(pins)) AND cardinality(pins) < 8")
    c.execute("INSERT INTO settings (key, value) VALUES ('pins8_v1', 'true'::jsonb) ON CONFLICT DO NOTHING")


def migrate_pin_order(c):
    """Once (owner 2026-11-06: "AI Mode as the first app, the landing page, then Deep Research"): in saved menu pins,
    AI Mode moves in front of Deep Research."""
    if c.execute("SELECT 1 FROM settings WHERE key = 'pins_ai_first_v1'").fetchone():
        return
    c.execute("UPDATE customer_prefs SET pins = array_prepend('simple', array_remove(pins, 'simple')), updated_at = now() "
              "WHERE 'simple' = ANY(pins)")
    c.execute("INSERT INTO settings (key, value) VALUES ('pins_ai_first_v1', 'true'::jsonb) ON CONFLICT DO NOTHING")


def migrate_research_second(c):
    """Once (owner 2026-11-07: "keep research mode as the 2nd app in the side nav"): saved menu pins start with AI Mode, then
    Deep Research (the others keep their order). A default only: ↑ ↓ in More apps still arrange them freely afterwards."""
    if c.execute("SELECT 1 FROM settings WHERE key = 'pins_research_second_v1'").fetchone():
        return
    c.execute("UPDATE customer_prefs SET pins = ARRAY(SELECT x FROM unnest(ARRAY['simple', 'research']) x WHERE x = ANY(pins)) "
              "|| ARRAY(SELECT p FROM unnest(pins) WITH ORDINALITY t(p, o) WHERE p NOT IN ('simple', 'research') ORDER BY o), updated_at = now() "
              "WHERE 'simple' = ANY(pins) OR 'research' = ANY(pins)")
    c.execute("INSERT INTO settings (key, value) VALUES ('pins_research_second_v1', 'true'::jsonb) ON CONFLICT DO NOTHING")


def migrate_builder_plans(c):
    """Once (owner 2026-11-01: "bring the AI Portfolio Builder to all the roles … customer permission common for all;
    trader and admin only from the admin panel"): every role gets the builder and its Customer plan; the Customer Admin
    role gets the Admin plan; customers with saved menu pins get the builder pinned while there is room."""
    if c.execute("SELECT 1 FROM settings WHERE key = 'builder_plans_v1'").fetchone():
        return
    c.execute("INSERT INTO role_permissions (role_id, permission) SELECT r.id, k FROM roles r "
              "CROSS JOIN unnest(ARRAY['builder:view', 'builder:customer']) k ON CONFLICT DO NOTHING")
    c.execute("INSERT INTO role_permissions (role_id, permission) SELECT id, 'builder:admin' FROM roles "
              "WHERE lower(name) = 'customer admin' ON CONFLICT DO NOTHING")
    c.execute("UPDATE customer_prefs SET pins = array_append(pins, 'builder'), updated_at = now() "
              "WHERE NOT ('builder' = ANY(pins)) AND cardinality(pins) < 6")
    c.execute("INSERT INTO settings (key, value) VALUES ('builder_plans_v1', 'true'::jsonb) ON CONFLICT DO NOTHING")


def rename_builder_levels(c):
    """labels said "plan" (owner 2026-11-01: "don't mention it as a plan … it looks like I'm going to sell it"); only
    labels nobody has edited change"""
    for key, old, new in (("builder:customer", "Builder · Customer plan", "Builder · Customer level"),
                          ("builder:trader", "Builder · Trader plan", "Builder · Trader level"),
                          ("builder:admin", "Builder · Admin plan", "Builder · Admin level")):
        c.execute("UPDATE app_permissions SET name = %s WHERE key = %s AND name = %s", (new, key, old))


def effective(conn, cid):
    """the permission keys a customer can use right now"""
    return {r["key"] for r in conn.execute("SELECT key FROM effective_permissions WHERE customer_id = %s", (cid,))}


def explain(conn, cid):
    """every catalogue permission for one customer: held or not, through what (roles / direct grant), and why not"""
    cat = conn.execute("SELECT p.key, p.module, p.action, p.name, p.restricted, p.enabled, p.retired, p.requires, m.name AS app "
                       "FROM app_permissions p JOIN app_modules m ON m.key = p.module ORDER BY m.sort, p.sort, p.key").fetchall()
    via = {}
    for r in conn.execute("SELECT rp.permission, r.name FROM customer_roles cr JOIN roles r ON r.id = cr.role_id "
                          "JOIN role_permissions rp ON rp.role_id = r.id WHERE cr.customer_id = %s ORDER BY r.name", (cid,)):
        via.setdefault(r["permission"], []).append({"kind": "role", "name": r["name"]})
    for r in conn.execute(f"SELECT g.permission, g.reason, g.expires_on FROM customer_permissions g WHERE g.customer_id = %s AND {ACTIVE_GRANT}", (cid,)):
        via.setdefault(r["permission"], []).append({"kind": "direct", "reason": r["reason"],
                                                     "until": r["expires_on"].isoformat() if r["expires_on"] else None})
    eff = effective(conn, cid)
    names = {p["key"]: p["name"] for p in cat}
    out = []
    for p in cat:
        held = p["key"] in eff
        why = None
        if not held:
            why = ("retired" if p["retired"] else "off" if not p["enabled"] else
                   "needs" if p["key"] in via and p["requires"] and p["requires"] not in eff else "not_given")
        out.append({**{k: p[k] for k in ("key", "module", "app", "action", "name", "restricted")}, "held": held,
                    "sources": via.get(p["key"], []), "why": why,
                    **({"needs": names.get(p["requires"], p["requires"])} if why == "needs" else {})})
    return out
