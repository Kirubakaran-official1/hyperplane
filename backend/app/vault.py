"""
Secrets a customer gives us (round 20c: their Zerodha Kite Publisher API key) — envelope encryption, as the large cloud providers do it.

  * Every secret gets its own random 256-bit data key (DEK); the secret is sealed with AES-256-GCM under that DEK.
  * The DEK itself is sealed with AES-256-GCM under the master key (KEK). The KEK is a file on the server (secrets/zerodha_kek, not in
    git, chmod 600) mounted read-only into the customer service ONLY (/run/hp-secrets): never in the database, .env, the admin
    service, the worker or a log. A copy of the database alone therefore reveals nothing.
  * Both seals carry "associated data" naming the purpose, the KEK id and the customer id: a sealed key copied onto another
    customer's row (or another purpose) fails to open — it is bound to the account it was saved for.
  * GCM authenticates: any change to a stored byte fails to open instead of giving a wrong key.
  * Nothing readable is kept beside the sealed key (round 20d, owner: "don't show any part of the key"): only a key ID — HMAC-SHA256
    of the key under a sub-key derived from the master key, 8 hex characters — so the customer can tell which key is saved, while
    the database alone cannot be used to guess or check a key.
  * kek_id allows a new master key later (secrets/zerodha_kek_old keeps the previous one readable, as kek_id 0).

The KEK is 32 random bytes, base64:  mkdir -p secrets && openssl rand -base64 32 > secrets/zerodha_kek && chmod 600 secrets/zerodha_kek
"""
import base64
import hashlib
import hmac
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PURPOSE = b"hyperplane/zerodha-publisher-key"


class VaultError(Exception):
    pass


DIR = os.environ.get("HP_SECRETS_DIR", "/run/hp-secrets")
CUR, OLD = "zerodha_kek", "zerodha_kek_old"


def _key(name):
    try:
        with open(os.path.join(DIR, name), encoding="ascii") as f:
            k = base64.b64decode(f.read().strip(), validate=True)
    except (OSError, ValueError):
        return None
    return k if len(k) == 32 else None


def keks():
    """{kek_id: key} — the current master key (id 1) and, during a change of key, the previous one (id 0)"""
    out = {}
    if (k := _key(CUR)):
        out[1] = k
    if (k := _key(OLD)):
        out.setdefault(0, k)
    return out


def ready():
    return bool(_key(CUR))


def key_id(secret: str) -> str:
    """the key ID shown to the customer: 8 hex characters of an HMAC under a sub-key of the master key — reveals nothing of the key"""
    k = _key(CUR)
    if not k:
        raise VaultError("The server has no encryption key yet")
    sub = hmac.new(k, PURPOSE + b"|key-id", hashlib.sha256).digest()
    h = hmac.new(sub, secret.encode(), hashlib.sha256).hexdigest().upper()
    return f"{h[:4]}-{h[4:8]}"


def _aad(kek_id, owner):
    return PURPOSE + b"|kek:" + str(kek_id).encode() + b"|owner:" + str(owner).encode()


def seal(secret: str, owner) -> dict:
    """→ the columns to store: key_ct, key_nonce, dek_ct, dek_nonce, kek_id"""
    k = _key(CUR)
    if not k:
        raise VaultError("The server has no encryption key yet")
    kid = 1
    aad = _aad(kid, owner)
    dek, n1, n2 = AESGCM.generate_key(bit_length=256), os.urandom(12), os.urandom(12)
    return {"key_ct": AESGCM(dek).encrypt(n1, secret.encode(), aad), "key_nonce": n1,
            "dek_ct": AESGCM(k).encrypt(n2, dek, aad + b"|dek"), "dek_nonce": n2, "kek_id": kid}


def unseal(row, owner) -> str:
    k = keks().get(row["kek_id"])
    if not k:
        raise VaultError("This key was saved with a master key the server no longer has")
    aad = _aad(row["kek_id"], owner)
    try:
        dek = AESGCM(k).decrypt(bytes(row["dek_nonce"]), bytes(row["dek_ct"]), aad + b"|dek")
        return AESGCM(dek).decrypt(bytes(row["key_nonce"]), bytes(row["key_ct"]), aad).decode()
    except Exception as e:                                       # noqa: BLE001 — tampered, moved to another account, or a wrong KEK
        raise VaultError("The saved key could not be opened") from e
