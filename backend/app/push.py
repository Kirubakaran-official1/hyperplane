"""Round 28: phone notifications (Web Push) — owner 2026-11-18: "the Planner reminders … I want to see that on my mobile, like Teams".

Standard Web Push (RFC 8030 delivery, RFC 8291 message encryption, RFC 8292 VAPID signing) written with the `cryptography` package the
service already uses for the Zerodha keys, so no new library.

  push_keys    one VAPID key pair, made once; admin-only. The customer service reads only the public half (push_public_key()).
  push_subs    one row per phone / browser that allowed notifications (own rows, RLS); a push service answering 404 / 410 removes it.
  push_outbox  what to send. The customer service may add only its own test message; the worker sends everything (only the worker reads
               the private key) and keeps no message text after sending.

A message is end-to-end encrypted for the phone: Google / Apple / Mozilla's push servers carry it but cannot read it.

Round 29 (owner 2026-11-18: "not like a random notification from Chrome … like WhatsApp"): the Android app (APK 1.0.5) receives its own
messages through Firebase Cloud Messaging and draws them itself — Hyperplane's name and icon, the full text, one Android channel per kind.
  push_native  one row per app install (own rows, RLS): its FCM address + a key made on the phone. The message is AES-GCM encrypted with
               that key, so Google carries it but cannot read it either. The customer service never reads the key column.
  from_inbox   every new (or new-again) Inbox item becomes a phone message — Planner reminders write their own (planner.run_reminders).
The worker signs in to FCM with secrets/firebase/service-account.json (mounted into the worker only); without it app phones are skipped.
"""
import base64
import json
import os
import struct
import time
import urllib.error
import urllib.request
from urllib.parse import urlencode, urlsplit

from cryptography.hazmat.primitives import hashes, hmac, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SCHEMA = """
CREATE TABLE IF NOT EXISTS push_keys (
    id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    private_pem TEXT NOT NULL,
    public_b64  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION push_public_key() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
    AS $$ SELECT public_b64 FROM push_keys WHERE id = 1 $$;
CREATE TABLE IF NOT EXISTS push_subs (
    id          BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    device      TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_ok     TIMESTAMPTZ,
    fails       INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_subs_cust ON push_subs (customer_id);
-- a phone that moves to another sign-in moves with it (an endpoint is one phone / browser): the old owner's row goes, the new one is made
CREATE OR REPLACE FUNCTION push_subscribe(p_cid BIGINT, p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT, p_device TEXT) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF p_cid::text IS DISTINCT FROM current_setting('hp.cid', true) THEN RAISE EXCEPTION 'not your account'; END IF;
    DELETE FROM push_subs WHERE endpoint = p_endpoint;
    INSERT INTO push_subs (customer_id, endpoint, p256dh, auth, device) VALUES (p_cid, p_endpoint, p_p256dh, p_auth, left(p_device, 80));
    DELETE FROM push_subs WHERE customer_id = p_cid AND id NOT IN
        (SELECT id FROM push_subs WHERE customer_id = p_cid ORDER BY created_at DESC LIMIT 10);
END $$;
CREATE TABLE IF NOT EXISTS push_outbox (
    id          BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at     TIMESTAMPTZ,
    result      TEXT
);
CREATE INDEX IF NOT EXISTS push_outbox_open ON push_outbox (id) WHERE sent_at IS NULL;
-- round 29: the Android app's own notifications (FCM). key = the AES-256 key made on the phone (base64url); only the worker reads it
CREATE TABLE IF NOT EXISTS push_native (
    id          BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    key         TEXT NOT NULL,
    device      TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_ok     TIMESTAMPTZ,
    fails       INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_native_cust ON push_native (customer_id);
CREATE OR REPLACE FUNCTION push_native_subscribe(p_cid BIGINT, p_token TEXT, p_key TEXT, p_device TEXT) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF p_cid::text IS DISTINCT FROM current_setting('hp.cid', true) THEN RAISE EXCEPTION 'not your account'; END IF;
    DELETE FROM push_native WHERE token = p_token;
    INSERT INTO push_native (customer_id, token, key, device) VALUES (p_cid, p_token, p_key, left(p_device, 80));
    DELETE FROM push_native WHERE customer_id = p_cid AND id NOT IN
        (SELECT id FROM push_native WHERE customer_id = p_cid ORDER BY created_at DESC LIMIT 10);
END $$;
-- round 29: every Inbox item goes to the phone once (again when it becomes new again); items from before this round count as sent
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customer_notifications' AND column_name = 'pushed_at') THEN
        ALTER TABLE customer_notifications ADD COLUMN pushed_at TIMESTAMPTZ;
        UPDATE customer_notifications SET pushed_at = created_at;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS customer_notifications_topush ON customer_notifications (id) WHERE pushed_at IS NULL;
"""

# the push services of Chrome / Android, Safari / iPhone, Firefox and Edge — a subscription pointing anywhere else is refused (the worker
# would otherwise be made to send requests to any address)
PUSH_HOSTS = ("fcm.googleapis.com", "android.googleapis.com", ".push.apple.com", "updates.push.services.mozilla.com",
              ".push.services.mozilla.com", ".notify.windows.com")
MAX_TEXT = 300
FCM_CREDENTIALS = os.environ.get("FCM_CREDENTIALS", "/run/hp-firebase/service-account.json")
# the Android channels the app makes (deploy/android/app-extras.java.txt): which one a message rings in
CHANNELS = ("planner", "portfolio", "sip", "community", "announce", "general")


def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def unb64u(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def endpoint_ok(url):
    try:
        u = urlsplit(url)
    except ValueError:
        return False
    host = (u.hostname or "").lower()
    return u.scheme == "https" and not u.port and len(url) <= 1000 and any(host == h.lstrip(".") or host.endswith(h) for h in PUSH_HOSTS)


def keys_ok(p256dh, auth):
    try:
        k, a = unb64u(p256dh), unb64u(auth)
    except (ValueError, TypeError):
        return False
    return len(k) == 65 and k[0] == 4 and len(a) == 16


def ensure_keys(c):
    """made once (admin connection, at start-up)"""
    if c.execute("SELECT 1 FROM push_keys WHERE id = 1").fetchone():
        return
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    pub = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    c.execute("INSERT INTO push_keys (id, private_pem, public_b64) VALUES (1, %s, %s) ON CONFLICT DO NOTHING", (pem, b64u(pub)))


def _hmac(key, data):
    h = hmac.HMAC(key, hashes.SHA256())
    h.update(data)
    return h.finalize()


def encrypt(p256dh, auth, plaintext, salt=None, server_key=None):
    """RFC 8291 (aes128gcm): the message for one phone. Returns the request body."""
    ua_pub = unb64u(p256dh)
    secret = unb64u(auth)
    server_key = server_key or ec.generate_private_key(ec.SECP256R1())
    as_pub = server_key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    shared = server_key.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_pub))
    ikm = _hmac(_hmac(secret, shared), b"WebPush: info\x00" + ua_pub + as_pub + b"\x01")
    salt = salt or os.urandom(16)
    prk = _hmac(salt, ikm)
    cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    body = AESGCM(cek).encrypt(nonce, plaintext + b"\x02", None)
    return salt + struct.pack("!IB", 4096, len(as_pub)) + as_pub + body


def _vapid(endpoint, private_pem, public_b64):
    """RFC 8292: the signed note that says the message comes from this site"""
    key = serialization.load_pem_private_key(private_pem.encode(), password=None)
    u = urlsplit(endpoint)
    dom = os.environ.get("DOMAIN", "")
    sub = f"https://{dom}" if dom and not dom.startswith(":") and "localhost" not in dom else "https://hyperplane.quantfriday.in"
    head = b64u(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    claims = b64u(json.dumps({"aud": f"{u.scheme}://{u.netloc}", "exp": int(time.time()) + 12 * 3600, "sub": sub}, separators=(",", ":")).encode())
    r, s = decode_dss_signature(key.sign(f"{head}.{claims}".encode(), ec.ECDSA(hashes.SHA256())))
    return f"vapid t={head}.{claims}.{b64u(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}, k={public_b64}"


def send_one(sub, payload, keys, ttl=3600, urgency="high"):
    """one phone; returns the push service's HTTP status (201 = accepted)"""
    data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    req = urllib.request.Request(sub["endpoint"], data=encrypt(sub["p256dh"], sub["auth"], data), method="POST", headers={
        "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", "TTL": str(ttl), "Urgency": urgency,
        "Authorization": _vapid(sub["endpoint"], keys["private_pem"], keys["public_b64"])})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except (urllib.error.URLError, OSError):
        return 0


def token_ok(token, key):
    """an app install's FCM address and its own key (32 bytes)"""
    try:
        k = unb64u(key)
    except (ValueError, TypeError):
        return False
    return 20 <= len(token) <= 4096 and all(ch.isascii() and (ch.isalnum() or ch in "-_:.") for ch in token) and len(k) == 32


def seal(key_b64, payload):
    """AES-256-GCM for one app install: base64url(nonce ‖ ciphertext+tag). The app opens it with the key it made (HpMessaging.java)."""
    nonce = os.urandom(12)
    data = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
    return b64u(nonce + AESGCM(unb64u(key_b64)).encrypt(nonce, data, None))


_fcm = {"token": None, "exp": 0, "creds": None}


def fcm_creds():
    """the service account (project id, client email, private key) — None when the file is not there"""
    if _fcm["creds"] is None:
        try:
            with open(FCM_CREDENTIALS, encoding="utf-8") as f:
                j = json.load(f)
            _fcm["creds"] = j if all(j.get(k) for k in ("project_id", "client_email", "private_key", "token_uri")) else False
        except (OSError, ValueError):
            _fcm["creds"] = False
    return _fcm["creds"] or None


def fcm_jwt(creds, now=None):
    """the signed sign-in note Google exchanges for a 1-hour access token (RS256, OAuth 2.0 service account)"""
    now = int(now or time.time())
    head = b64u(json.dumps({"alg": "RS256", "typ": "JWT"}, separators=(",", ":")).encode())
    claims = b64u(json.dumps({"iss": creds["client_email"], "scope": "https://www.googleapis.com/auth/firebase.messaging",
                              "aud": creds["token_uri"], "iat": now, "exp": now + 3600}, separators=(",", ":")).encode())
    key = serialization.load_pem_private_key(creds["private_key"].encode(), password=None)
    return f"{head}.{claims}.{b64u(key.sign(f'{head}.{claims}'.encode(), padding.PKCS1v15(), hashes.SHA256()))}"


def _fcm_token(creds):
    if _fcm["token"] and time.time() < _fcm["exp"]:
        return _fcm["token"]
    req = urllib.request.Request(creds["token_uri"], method="POST", headers={"Content-Type": "application/x-www-form-urlencoded"},
                                 data=urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": fcm_jwt(creds)}).encode())
    with urllib.request.urlopen(req, timeout=10) as r:
        j = json.load(r)
    _fcm.update(token=j["access_token"], exp=time.time() + min(int(j.get("expires_in", 3600)), 3600) - 300)
    return _fcm["token"]


def fcm_send(sub, payload, ttl=3600):
    """one app install; returns an HTTP-like status: 200 sent · 404 the install is gone · 0 not set up / no answer · other = try later"""
    creds = fcm_creds()
    if not creds:
        return 0
    try:
        tok = _fcm_token(creds)
    except (urllib.error.URLError, OSError, ValueError, KeyError):
        return 0
    msg = {"message": {"token": sub["token"], "data": {"e": seal(sub["key"], payload)}, "android": {"priority": "HIGH", "ttl": f"{ttl}s"}}}
    req = urllib.request.Request(f"https://fcm.googleapis.com/v1/projects/{creds['project_id']}/messages:send", method="POST",
                                 data=json.dumps(msg).encode(), headers={"Content-Type": "application/json", "Authorization": f"Bearer {tok}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        if e.code == 401:
            _fcm["token"] = None                                  # signed out early: a new token next time
        try:
            det = json.loads(e.read() or b"{}").get("error", {})
        except ValueError:
            det = {}
        codes = {d.get("errorCode") for d in det.get("details", []) if isinstance(d, dict)}
        return 404 if e.code == 404 or "UNREGISTERED" in codes else e.code
    except (urllib.error.URLError, OSError):
        return 0


def queue(c, cid, title, body="", url="/app/inbox", tag=None, cat="general"):
    """a phone notification for one customer — sent by the worker within a few seconds, to every phone they turned it on for.
    cat = the Android channel it rings in (CHANNELS)"""
    c.execute("INSERT INTO push_outbox (customer_id, payload) VALUES (%s, %s)",
              (cid, json.dumps({"title": title[:120], "body": (body or "")[:MAX_TEXT], "url": url, "tag": tag,
                                "cat": cat if cat in CHANNELS else "general"})))


def _one_line(x, n=160):
    return " ".join(str(x or "").split())[:n]


def phone_text(kind, title, body):
    """(channel, bold line, text) of one Inbox item for the phone — the same facts the Inbox card shows, in plain words"""
    b = body if isinstance(body, dict) else {}
    if kind == "mention":
        return "community", f"{b.get('by') or 'Someone'} mentioned you", _one_line(b.get("text"), 240) or "Tap to read it in the Community"
    if kind == "announce":
        return "announce", title, _one_line(b.get("text"), 280) or "Tap to read it"
    if b.get("order"):
        amt = b.get("total")
        return "sip", title, (f"Amount ₹{amt:,.0f} · " if isinstance(amt, (int, float)) and amt else "") + "Tap to see the order"
    items = [x for x in b.get("items") or [] if isinstance(x, dict) and x.get("s")]
    if items:
        parts = [f"{x['s']} → {x['alt']['s']}" if isinstance(x.get("alt"), dict) and x["alt"].get("s") else f"review {x['s']}" for x in items[:4]]
        more = f" · +{len(items) - 4} more" if len(items) > 4 else ""
        return "portfolio", title, "Change: " + " · ".join(parts) + more
    cat = "portfolio" if kind in ("analyser", "portfolio", "builder", "etf") else "sip" if kind in ("sip", "msip") else "general"
    return cat, title, _one_line(b.get("text"), 240) or "Tap to open it in your Inbox"


def from_inbox(c, limit=500):
    """the worker: every Inbox item that is new (or new again) and still unread goes to the customer's phones once. Items of customers
    with no phone, already read or closed, older than 30 minutes, or Planner reminders (they send their own) are only marked."""
    c.execute("UPDATE customer_notifications n SET pushed_at = now() WHERE pushed_at IS NULL AND (status <> 'open' OR read_at IS NOT NULL "
              "OR kind IN ('planner_due', 'planner_soon') OR COALESCE(updated_at, created_at) < now() - interval '30 minutes' "
              "OR NOT (EXISTS (SELECT 1 FROM push_subs s WHERE s.customer_id = n.customer_id) "
              "OR EXISTS (SELECT 1 FROM push_native p WHERE p.customer_id = n.customer_id)))")
    rows = c.execute("SELECT id, customer_id, kind, title, body FROM customer_notifications WHERE pushed_at IS NULL ORDER BY id LIMIT %s "
                     "FOR UPDATE SKIP LOCKED", (limit,)).fetchall()
    for r in rows:
        cat, head, text = phone_text(r["kind"], r["title"], r["body"])
        queue(c, r["customer_id"], head, text, url=f"/app/inbox?n={r['id']}", tag=f"n{r['id']}", cat=cat)
        c.execute("UPDATE customer_notifications SET pushed_at = now() WHERE id = %s", (r["id"],))
    return len(rows)


def _settle(c, table, sid, st):
    """after one send: a good answer clears the failures; 404 / 410 removes the phone; 20 failures in a row too"""
    if 200 <= st < 300:
        c.execute(f"UPDATE {table} SET last_ok = now(), fails = 0 WHERE id = %s", (sid,))
        return "ok"
    if st in (404, 410):
        c.execute(f"DELETE FROM {table} WHERE id = %s", (sid,))
        return "gone"
    if st:                                                      # 0 = no answer / not set up: not the phone's fault
        c.execute(f"UPDATE {table} SET fails = fails + 1 WHERE id = %s", (sid,))
        c.execute(f"DELETE FROM {table} WHERE id = %s AND fails >= 20", (sid,))
    return "fail"


def drain(c, limit=200, sender=send_one, app_sender=fcm_send):
    """the worker: send what is waiting. Each message goes to every phone of its customer — browsers (Web Push) and the Android app
    (FCM); a phone the push service no longer knows (404 / 410) is removed; after sending, only the result is kept (not the text).
    Returns (messages, phones reached)."""
    rows = c.execute("SELECT id, customer_id, payload FROM push_outbox WHERE sent_at IS NULL ORDER BY id LIMIT %s FOR UPDATE SKIP LOCKED",
                     (limit,)).fetchall()
    if not rows:
        return 0, 0
    keys = c.execute("SELECT private_pem, public_b64 FROM push_keys WHERE id = 1").fetchone()
    reached = 0
    for r in rows:
        subs = c.execute("SELECT id, endpoint, p256dh, auth FROM push_subs WHERE customer_id = %s", (r["customer_id"],)).fetchall() if keys else []
        apps = c.execute("SELECT id, token, key FROM push_native WHERE customer_id = %s", (r["customer_id"],)).fetchall()
        res = [_settle(c, "push_subs", x["id"], sender(x, r["payload"], keys)) for x in subs]
        res += [_settle(c, "push_native", a["id"], app_sender(a, r["payload"])) for a in apps]
        ok, gone = res.count("ok"), res.count("gone")
        reached += ok
        c.execute("UPDATE push_outbox SET sent_at = now(), payload = '{}'::jsonb, result = %s WHERE id = %s",
                  (f"{ok} of {len(res)} phone(s){f' · {gone} gone' if gone else ''}", r["id"]))
    c.execute("DELETE FROM push_outbox WHERE sent_at < now() - interval '7 days'")
    return len(rows), reached
