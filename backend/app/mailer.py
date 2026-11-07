"""
Outgoing email + "Forgot password" (owner, 2026-11-02: "people forget the password … I don't have a mail server").

Who does what
  · the customer service (portal.py) never sends mail and never reads config.ini: it calls two database functions
    (SECURITY DEFINER, the only rights it gets here) that store a reset and queue an email in `email_outbox`
  · the worker's mail thread (MailThread) sends the queue through the SMTP service in config.ini [mail] (Brevo:
    smtp-relay.brevo.com:587, login + SMTP key) and builds links from [mail] public_url — never from a request's
    Host header, which a caller could fake to steal a reset link
  · the admin service sends the "test email" directly (Admin → System & settings)

Reset links
  · a random token (secrets.token_urlsafe(32)) goes into the email; the database keeps only its SHA-256 (password_resets)
  · the link is <public_url>/app/#reset=<token>: the part after # never reaches a server, a log or a link scanner
  · it works once, for RESET_MINUTES; using it changes the password, signs the customer out on every device, ends the
    other open links and queues a "your password was changed" email
  · the token sits in the outbox only until the email is sent (then `data` is wiped); an email still waiting after
    RESET_MINUTES is dropped (status 'expired')
"""
import smtplib
import ssl
import threading
import time
import traceback
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from html import escape

from . import config

RESET_MINUTES = 30
VERIFY_HOURS = 48                      # the "confirm your email" link (round 17: sign-up screening, signup_guard.py)
RESETS_PER_HOUR = 3                    # per customer (the database counts them; the service also limits per IP / email)
MAX_TRIES = 5
POLL_SECONDS = 3
KEEP_DAYS = 90                         # outbox rows (without tokens) and used resets are deleted after this

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS email_outbox (
    id          BIGSERIAL PRIMARY KEY,
    kind        TEXT NOT NULL,                       -- password_reset · password_changed
    to_email    TEXT NOT NULL,
    customer_id BIGINT REFERENCES customers(id) ON DELETE CASCADE,
    data        JSONB,                               -- name, token … wiped once sent / failed / expired
    status      TEXT NOT NULL DEFAULT 'queued',      -- queued · sent · failed · expired
    tries       INT NOT NULL DEFAULT 0,
    next_try    TIMESTAMPTZ NOT NULL DEFAULT now(),
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_outbox_queued ON email_outbox (next_try) WHERE status = 'queued';
CREATE TABLE IF NOT EXISTS password_resets (
    token_hash  TEXT PRIMARY KEY,                    -- SHA-256 of the emailed token (the token itself is never kept)
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    ip          TEXT
);
CREATE INDEX IF NOT EXISTS password_resets_cust ON password_resets (customer_id, created_at);

-- "Forgot password": 'sent' · 'limited' (too many in the last hour) · 'none' (no active account). The service answers
-- the customer the same way in every case, so nobody can learn which emails have an account.
CREATE OR REPLACE FUNCTION portal_password_forgot(p_email text, p_token text, p_ip text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
    SELECT id, name, email INTO r FROM customers WHERE email = lower(trim(p_email)) AND status IN ('approved', 'pending');
    IF NOT FOUND THEN RETURN 'none'; END IF;
    IF (SELECT count(*) FROM password_resets WHERE customer_id = r.id AND created_at > now() - interval '1 hour') >= {RESETS_PER_HOUR} THEN
        RETURN 'limited';
    END IF;
    INSERT INTO password_resets (token_hash, customer_id, expires_at, ip)
        VALUES (encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), r.id, now() + interval '{RESET_MINUTES} minutes', left(p_ip, 64));
    INSERT INTO email_outbox (kind, to_email, customer_id, data)
        VALUES ('password_reset', r.email, r.id, jsonb_build_object('name', r.name, 'token', p_token));
    RETURN 'sent';
END $$;

-- is this link still usable? → the account's email, masked (k•••@gmail.com), or NULL
CREATE OR REPLACE FUNCTION portal_password_check(p_token text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT left(c.email, 1) || '•••' || substr(c.email, strpos(c.email, '@'))
    FROM password_resets p JOIN customers c ON c.id = p.customer_id
    WHERE p.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') AND p.used_at IS NULL AND p.expires_at > now()
      AND c.status IN ('approved', 'pending')
$$;

-- use the link: new password, signed out everywhere, other links ended, "password changed" email queued
CREATE OR REPLACE FUNCTION portal_password_reset(p_token text, p_hash text)
    RETURNS TABLE (customer_id bigint, name text, devices int)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
DECLARE p record; c record; n int;
BEGIN
    SELECT * INTO p FROM password_resets pr
        WHERE pr.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') AND pr.used_at IS NULL AND pr.expires_at > now()
        FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT cu.id, cu.name, cu.email INTO c FROM customers cu WHERE cu.id = p.customer_id AND cu.status IN ('approved', 'pending');
    IF NOT FOUND THEN RETURN; END IF;
    UPDATE password_resets pr SET used_at = now() WHERE pr.customer_id = c.id AND pr.used_at IS NULL;
    UPDATE customers cu SET pw_hash = p_hash, session_ver = cu.session_ver + 1, failed_logins = 0, locked_until = NULL WHERE cu.id = c.id;
    UPDATE customer_sessions s SET ended_at = now(), end_reason = 'password_reset' WHERE s.customer_id = c.id AND s.ended_at IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO email_outbox (kind, to_email, customer_id, data) VALUES ('password_changed', c.email, c.id, jsonb_build_object('name', c.name));
    RETURN QUERY SELECT c.id, c.name, n;
END $$;
-- ── Sign-up screening (owner 2026-11-07; signup_guard.py has the design): confirm the email, then approve only what looks real ──
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS review_flags TEXT[] NOT NULL DEFAULT '{{}}';
UPDATE customers SET email_verified_at = COALESCE(approved_at, created_at) WHERE status = 'approved' AND email_verified_at IS NULL;
CREATE TABLE IF NOT EXISTS signup_verifications (
    token_hash  TEXT PRIMARY KEY,                    -- SHA-256 of the emailed token
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS signup_verifications_cust ON signup_verifications (customer_id, created_at);
-- messages to the owner (Telegram): a sign-up that needs a decision, a new customer approved
CREATE TABLE IF NOT EXISTS owner_alerts (
    id         BIGSERIAL PRIMARY KEY,
    text       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'queued',       -- queued · sent · failed
    tries      INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at    TIMESTAMPTZ
);
-- a self sign-up is never approved at insert any more: it is approved when its email is confirmed (portal_verify_email)
CREATE OR REPLACE FUNCTION customers_auto_approve() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN NEW;
END $$;
-- right after the insert: remember what looked fake, queue the "confirm your email" mail (only for a brand-new pending account)
CREATE OR REPLACE FUNCTION portal_signup_start(p_id bigint, p_token text, p_flags text[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
    SELECT id, name, email INTO r FROM customers
        WHERE id = p_id AND status = 'pending' AND email_verified_at IS NULL AND created_at > now() - interval '2 minutes';
    IF NOT FOUND THEN RETURN false; END IF;
    UPDATE customers SET review_flags = COALESCE(p_flags, '{{}}') WHERE id = r.id;
    INSERT INTO signup_verifications (token_hash, customer_id, expires_at)
        VALUES (encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), r.id, now() + interval '{VERIFY_HOURS} hours');
    INSERT INTO email_outbox (kind, to_email, customer_id, data)
        VALUES ('verify_email', r.email, r.id, jsonb_build_object('name', r.name, 'token', p_token));
    RETURN true;
END $$;
-- "send me the link again": the same answer whether or not the address exists; a few a day per account
CREATE OR REPLACE FUNCTION portal_signup_resend(p_email text, p_token text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
    SELECT id, name, email INTO r FROM customers WHERE email = lower(trim(p_email)) AND status = 'pending' AND email_verified_at IS NULL;
    IF NOT FOUND THEN RETURN 'none'; END IF;
    IF (SELECT count(*) FROM signup_verifications WHERE customer_id = r.id AND created_at > now() - interval '1 day') >= 4 THEN RETURN 'limited'; END IF;
    UPDATE signup_verifications SET used_at = now() WHERE customer_id = r.id AND used_at IS NULL;
    INSERT INTO signup_verifications (token_hash, customer_id, expires_at)
        VALUES (encode(sha256(convert_to(p_token, 'UTF8')), 'hex'), r.id, now() + interval '{VERIFY_HOURS} hours');
    INSERT INTO email_outbox (kind, to_email, customer_id, data)
        VALUES ('verify_email', r.email, r.id, jsonb_build_object('name', r.name, 'token', p_token));
    RETURN 'sent';
END $$;
-- the link: 'approved' (opened and nothing looked fake, auto-approval on) · 'review' (waits for the owner) · 'invalid'
CREATE OR REPLACE FUNCTION portal_verify_email(p_token text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v record; c record; ok boolean; who text;
BEGIN
    SELECT * INTO v FROM signup_verifications WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
        AND used_at IS NULL AND expires_at > now() FOR UPDATE;
    IF NOT FOUND THEN RETURN 'invalid'; END IF;
    SELECT * INTO c FROM customers WHERE id = v.customer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN 'invalid'; END IF;
    UPDATE signup_verifications SET used_at = now() WHERE customer_id = c.id AND used_at IS NULL;
    IF c.status = 'blocked' THEN RETURN 'invalid'; END IF;
    UPDATE customers SET email_verified_at = now() WHERE id = c.id AND email_verified_at IS NULL;
    IF c.status = 'approved' THEN RETURN 'approved'; END IF;
    who := c.name || ' · ' || c.email || ' · ' || coalesce(c.phone, '') || ' · ' || coalesce(c.city || ', ', '') || coalesce(c.state, '');
    ok := portal_auto_approve() AND cardinality(c.review_flags) = 0;
    IF ok THEN
        UPDATE customers SET status = 'approved', approved_at = now() WHERE id = c.id;
        INSERT INTO email_outbox (kind, to_email, customer_id, data) VALUES ('approved', c.email, c.id, jsonb_build_object('name', c.name));
        INSERT INTO owner_alerts (text) VALUES ('✅ New customer approved: ' || who);
        RETURN 'approved';
    END IF;
    INSERT INTO email_outbox (kind, to_email, customer_id, data) VALUES ('verified_wait', c.email, c.id, jsonb_build_object('name', c.name));
    INSERT INTO owner_alerts (text) VALUES ('🔎 Sign-up needs your decision: ' || who
        || CASE WHEN cardinality(c.review_flags) > 0 THEN E'\nWhy: ' || array_to_string(c.review_flags, '; ') ELSE E'\nWhy: Admin approves each sign-up' END
        || E'\nOpen Admin → Customers to approve or block.');
    RETURN 'review';
END $$;
REVOKE ALL ON FUNCTION portal_signup_start(bigint, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal_signup_resend(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal_verify_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal_password_forgot(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal_password_check(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION portal_password_reset(text, text) FROM PUBLIC;
"""
PORTAL_FUNCTIONS = ("portal_password_forgot(text, text, text)", "portal_password_check(text)", "portal_password_reset(text, text)",
                    "portal_signup_start(bigint, text, text[])", "portal_signup_resend(text, text)", "portal_verify_email(text)")


class MailNotSetUp(RuntimeError):
    pass


# ─── the emails (plain words; the HTML is the same text with one button) ───
def _layout(title, paras, button=None, foot=""):
    btn = (f'<p style="margin:24px 0"><a href="{escape(button[1])}" style="background:#0e7490;color:#fff;text-decoration:none;'
           f'padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">{escape(button[0])}</a></p>') if button else ""
    body = "".join(f'<p style="margin:0 0 14px">{p}</p>' for p in paras)
    return (f'<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2933;max-width:520px;margin:0 auto;padding:24px">'
            f'<div style="font-weight:700;font-size:17px;margin-bottom:18px">Hyperplane</div>'
            f'<h1 style="font-size:20px;margin:0 0 16px">{escape(title)}</h1>{body}{btn}'
            f'<p style="margin:24px 0 0;font-size:12.5px;color:#6b7785">{foot}</p></div>')


def render(kind, data, cfg):
    """(subject, text, html) for an outbox row"""
    name = (data or {}).get("name") or "there"
    first = escape(name.split()[0]) if name.split() else "there"
    if kind == "password_reset":
        link = f"{cfg['public_url']}/app/#reset={data['token']}"
        text = (f"Hi {name.split()[0]},\n\nWe received a request to reset the password of your Hyperplane account.\n"
                f"Open this link to choose a new password:\n\n{link}\n\n"
                f"The link works once and expires in {RESET_MINUTES} minutes.\n"
                "If you did not ask for this, ignore this email: your password stays the same.\n\n— Hyperplane")
        html = _layout("Reset your password", [
            f"Hi {first},", "We received a request to reset the password of your Hyperplane account. Press the button to choose a new password.",
            f"The link works once and expires in {RESET_MINUTES} minutes."], ("Choose a new password", link),
            "If you did not ask for this, ignore this email: your password stays the same.")
        return "Reset your Hyperplane password", text, html
    if kind == "verify_email":
        link = f"{cfg['public_url']}/app/#verify={data['token']}"
        text = (f"Hi {name.split()[0]},\n\nWelcome to Hyperplane! Please confirm that this email address is yours:\n\n{link}\n\n"
                f"The link is valid for {VERIFY_HOURS} hours. Once it is confirmed, we activate your account and email you again.\n"
                "If you did not sign up, ignore this email: nothing is opened without it.\n\n— Hyperplane")
        html = _layout("Confirm your email", [
            f"Hi {first},", "Welcome to Hyperplane! Please confirm that this email address is yours — it takes one click.",
            f"The link is valid for {VERIFY_HOURS} hours. Once it is confirmed, we activate your account and email you again."], ("Confirm my email", link),
            "If you did not sign up, ignore this email: nothing is opened without it.")
        return "Confirm your Hyperplane account", text, html
    if kind == "approved":
        link = f"{cfg['public_url']}/app/"
        text = (f"Hi {name.split()[0]},\n\nYour Hyperplane account is approved and ready.\nSign in here:\n\n{link}\n\n"
                "For education and information only — not investment advice.\n\n— Hyperplane")
        html = _layout("Your account is ready", [f"Hi {first},", "Your Hyperplane account is approved and ready to use."], ("Sign in to Hyperplane", link),
                       "For education and information only — not investment advice.")
        return "Your Hyperplane account is approved", text, html
    if kind == "verified_wait":
        text = (f"Hi {name.split()[0]},\n\nThank you — your email is confirmed. We check every new account before it opens, "
                "and we will email you as soon as yours is approved.\n\n— Hyperplane")
        html = _layout("Email confirmed", [f"Hi {first},", "Thank you — your email is confirmed.",
                                           "We check every new account before it opens, and we will email you as soon as yours is approved."])
        return "Your Hyperplane email is confirmed", text, html
    if kind == "password_changed":
        text = (f"Hi {name.split()[0]},\n\nThe password of your Hyperplane account was just changed, and you were signed out on "
                "every device.\nIf this was you, there is nothing to do. If it was not you, reply to this email or raise a "
                "query in the Helpdesk straight away.\n\n— Hyperplane")
        html = _layout("Your password was changed", [
            f"Hi {first},", "The password of your Hyperplane account was just changed, and you were signed out on every device.",
            "If this was you, there is nothing to do."], None,
            "If it was not you, reply to this email or raise a query in the Helpdesk straight away.")
        return "Your Hyperplane password was changed", text, html
    if kind == "test":
        text = "This is a test email from Hyperplane. Email sending is set up correctly.\n\n— Hyperplane"
        return "Hyperplane test email", text, _layout("Email is working", ["This is a test email from Hyperplane. Email sending is set up correctly."])
    raise ValueError(f"unknown email kind {kind}")


def send(cfg, to, subject, text, html):
    """one email through the SMTP service (raises on failure)"""
    if not cfg:
        raise MailNotSetUp("Email is not set up: fill in [mail] in config.ini (smtp_host, smtp_user, smtp_password, "
                           "from_email, public_url)")
    msg = EmailMessage()
    msg["Subject"], msg["To"] = subject, to
    msg["From"] = formataddr((cfg["from_name"], cfg["from_email"]))
    if cfg.get("reply_to"):
        msg["Reply-To"] = cfg["reply_to"]
    msg["Message-ID"] = make_msgid(domain=cfg["from_email"].split("@")[-1])
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    ctx = ssl.create_default_context()
    if cfg["security"] == "ssl":
        s = smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=20, context=ctx)
    else:
        s = smtplib.SMTP(cfg["host"], cfg["port"], timeout=20)
    with s:
        if cfg["security"] == "starttls":
            s.starttls(context=ctx)
        if cfg["user"]:
            s.login(cfg["user"], cfg["password"])
        s.send_message(msg)


def deliver(pool, limit=20):
    """send what is waiting in the outbox; returns how many were sent"""
    cfg = config.mail()
    sent = 0
    with pool.connection() as c:
        # a reset email that could not go out in time is useless (and carries a live token): drop it
        c.execute("UPDATE email_outbox SET status = 'expired', data = NULL, error = coalesce(error, 'not sent in time') "
                  f"WHERE status = 'queued' AND kind = 'password_reset' AND created_at < now() - interval '{RESET_MINUTES} minutes'")
        c.execute("UPDATE email_outbox SET status = 'expired', data = NULL, error = coalesce(error, 'not sent in time') "
                  f"WHERE status = 'queued' AND kind = 'verify_email' AND created_at < now() - interval '{VERIFY_HOURS} hours'")
        rows = c.execute("SELECT id, kind, to_email, data, tries FROM email_outbox WHERE status = 'queued' AND next_try <= now() "
                         "ORDER BY id LIMIT %s FOR UPDATE SKIP LOCKED", (limit,)).fetchall()
        for r in rows:
            try:
                subject, text, html = render(r["kind"], r["data"], cfg or {"public_url": ""})
                send(cfg, r["to_email"], subject, text, html)
                c.execute("UPDATE email_outbox SET status = 'sent', sent_at = now(), data = NULL, error = NULL, tries = tries + 1 "
                          "WHERE id = %s", (r["id"],))
                c.commit()                              # each sent email is recorded at once: a crash never sends it twice
                sent += 1
            except MailNotSetUp as e:                   # waits (unexpired) until the owner fills in [mail]
                c.execute("UPDATE email_outbox SET error = %s, next_try = now() + interval '30 seconds' WHERE id = %s", (str(e), r["id"]))
            except Exception as e:                      # noqa: BLE001 — retried with a growing wait, then given up
                tries = r["tries"] + 1
                c.execute("UPDATE email_outbox SET tries = %s, error = %s, next_try = now() + make_interval(secs => %s), "
                          "status = CASE WHEN %s >= %s THEN 'failed' ELSE status END, "
                          "data = CASE WHEN %s >= %s THEN NULL ELSE data END WHERE id = %s",
                          (tries, f"{type(e).__name__}: {e}"[:500], 30 * 2 ** tries, tries, MAX_TRIES, tries, MAX_TRIES, r["id"]))
                print(f"⚠ Email to {r['to_email']} ({r['kind']}) failed, try {tries}: {e}", flush=True)
    return sent


def deliver_alerts(pool, limit=10):
    """send the owner's waiting messages through the Telegram bot in config.ini (nothing is sent when it is not set up)"""
    tg = config.telegram()
    if not tg:
        return 0
    import json as _json
    import urllib.request
    sent = 0
    with pool.connection() as c:
        c.execute("UPDATE owner_alerts SET status = 'failed' WHERE status = 'queued' AND created_at < now() - interval '2 days'")
        for r in c.execute("SELECT id, text, tries FROM owner_alerts WHERE status = 'queued' ORDER BY id LIMIT %s FOR UPDATE SKIP LOCKED", (limit,)).fetchall():
            try:
                req = urllib.request.Request(f"https://api.telegram.org/bot{tg['bot_token']}/sendMessage", method="POST",
                                             data=_json.dumps({"chat_id": tg["chat_id"], "text": r["text"][:3500]}).encode(),
                                             headers={"Content-Type": "application/json"})
                urllib.request.urlopen(req, timeout=15).read()
                c.execute("UPDATE owner_alerts SET status = 'sent', sent_at = now(), tries = tries + 1 WHERE id = %s", (r["id"],))
                c.commit()
                sent += 1
            except Exception as e:                      # noqa: BLE001 — retried; the bot token is never written to a log
                c.execute("UPDATE owner_alerts SET tries = tries + 1, status = CASE WHEN tries + 1 >= 5 THEN 'failed' ELSE status END WHERE id = %s", (r["id"],))
                print(f"⚠ Owner alert #{r['id']} not sent: {type(e).__name__}", flush=True)
    return sent


def cleanup(c):
    c.execute(f"DELETE FROM email_outbox WHERE status <> 'queued' AND created_at < now() - interval '{KEEP_DAYS} days'")
    c.execute(f"DELETE FROM password_resets WHERE created_at < now() - interval '{KEEP_DAYS} days'")
    c.execute(f"DELETE FROM owner_alerts WHERE status <> 'queued' AND created_at < now() - interval '{KEEP_DAYS} days'")


def status(c):
    """Admin: is email set up, and how has sending gone in the last day"""
    cfg = config.mail()
    row = c.execute("SELECT count(*) FILTER (WHERE status = 'sent' AND sent_at > now() - interval '1 day') AS sent, "
                    "count(*) FILTER (WHERE status = 'queued') AS queued, "
                    "count(*) FILTER (WHERE status IN ('failed', 'expired') AND created_at > now() - interval '1 day') AS failed "
                    "FROM email_outbox").fetchone()
    last = c.execute("SELECT error, created_at FROM email_outbox WHERE error IS NOT NULL ORDER BY id DESC LIMIT 1").fetchone()
    return {"configured": cfg is not None, "from": cfg and f"{cfg['from_name']} <{cfg['from_email']}>", "host": cfg and cfg["host"],
            "public_url": cfg and cfg["public_url"], **row, "last_error": last and last["error"]}


class MailThread(threading.Thread):
    """Sends the outbox every few seconds, apart from the collection loop (a 10-minute collection must not hold back a
    reset email)."""

    def __init__(self, pool):
        super().__init__(daemon=True, name="mail")
        self.pool = pool

    def run(self):
        while True:
            try:
                deliver(self.pool)
                deliver_alerts(self.pool)
            except Exception:                           # noqa: BLE001 — keep the thread alive
                traceback.print_exc()
            time.sleep(POLL_SECONDS)
