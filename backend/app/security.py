"""Password hashing for customer accounts (scrypt, standard library only)."""
import base64
import hashlib
import hmac
import os

_N, _R, _P, _LEN = 2 ** 14, 8, 1, 32


def _b64(b):
    return base64.b64encode(b).decode()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=_LEN)
    return f"scrypt${_N}${_R}${_P}${_b64(salt)}${_b64(dk)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, dk = stored.split("$")
        if algo != "scrypt":
            return False
        want = base64.b64decode(dk)
        got = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=len(want))
        return hmac.compare_digest(got, want)
    except (ValueError, TypeError):
        return False


# verified against when an email is unknown, so a wrong email takes as long as a wrong password
DUMMY_HASH = hash_password(os.urandom(12).hex())
