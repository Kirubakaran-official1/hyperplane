"""Round 28: phone notifications (Web Push) — owner 2026-11-18: "the Planner reminders … I want to see that on my mobile, like Teams".

Standard Web Push (RFC 8030 delivery, RFC 8291 message encryption, RFC 8292 VAPID signing) written with the `cryptography` package the
service already uses for the Zerodha keys, so no new library.

  push_keys    one VAPID key pair, made once; admin-only. The customer service reads only the public half (push_public_key()).
  push_subs    one row per phone / browser that allowed notifications (own rows, RLS); a push service answering 404 / 410 removes it.
  push_outbox  what to send. The customer service may add only its own test message; the worker sends everything (only the worker reads
               the private key) and keeps no message text after sending.

A message is end-to-end encrypted for the phone: Google / Apple / Mozilla's push servers carry it but cannot read it.
"""
import base64
import json
import os
import struct
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit

from cryptography.hazmat.primitives import hashes, hmac, serialization
from cryptography.hazmat.primitives.asymmetric import ec
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
"""

# the push services of Chrome / Android, Safari / iPhone, Firefox and Edge — a subscription pointing anywhere else is refused (the worker
# would otherwise be made to send requests to any address)
PUSH_HOSTS = ("fcm.googleapis.com", "android.googleapis.com", ".push.apple.com", "updates.push.services.mozilla.com",
              ".push.services.mozilla.com", ".notify.windows.com")
MAX_TEXT = 300


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


def queue(c, cid, title, body="", url="/app/inbox", tag=None):
    """a phone notification for one customer — sent by the worker within a few seconds, to every phone they turned it on for"""
    c.execute("INSERT INTO push_outbox (customer_id, payload) VALUES (%s, %s)",
              (cid, json.dumps({"title": title[:120], "body": (body or "")[:MAX_TEXT], "url": url, "tag": tag})))


def drain(c, limit=200, sender=send_one):
    """the worker: send what is waiting. Each message goes to every phone of its customer; a phone the push service no longer knows
    (404 / 410) is removed; after sending, only the result is kept (not the text). Returns (messages, phones reached)."""
    rows = c.execute("SELECT id, customer_id, payload FROM push_outbox WHERE sent_at IS NULL ORDER BY id LIMIT %s FOR UPDATE SKIP LOCKED",
                     (limit,)).fetchall()
    if not rows:
        return 0, 0
    keys = c.execute("SELECT private_pem, public_b64 FROM push_keys WHERE id = 1").fetchone()
    reached = 0
    for r in rows:
        subs = c.execute("SELECT id, endpoint, p256dh, auth FROM push_subs WHERE customer_id = %s", (r["customer_id"],)).fetchall() if keys else []
        ok = gone = 0
        for s in subs:
            st = sender(s, r["payload"], keys)
            if 200 <= st < 300:
                ok += 1
                c.execute("UPDATE push_subs SET last_ok = now(), fails = 0 WHERE id = %s", (s["id"],))
            elif st in (404, 410):
                gone += 1
                c.execute("DELETE FROM push_subs WHERE id = %s", (s["id"],))
            else:
                c.execute("UPDATE push_subs SET fails = fails + 1 WHERE id = %s", (s["id"],))
                c.execute("DELETE FROM push_subs WHERE id = %s AND fails >= 20", (s["id"],))
        reached += ok
        c.execute("UPDATE push_outbox SET sent_at = now(), payload = '{}'::jsonb, result = %s WHERE id = %s",
                  (f"{ok} of {len(subs)} phone(s){f' · {gone} gone' if gone else ''}", r["id"]))
    c.execute("DELETE FROM push_outbox WHERE sent_at < now() - interval '7 days'")
    return len(rows), reached
