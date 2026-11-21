"""Fyers connection for the Data Lab (Phase 3) — plain HTTPS calls (the addresses of the official fyers-apiv3 3.3.0 library), no SDK:
less to install, less memory, faster start.

  settings   one row: app ID, app secret (encrypted), redirect address, plan (standard / prime), access token (encrypted), consent
  calls      every call to Fyers is logged (fyers_calls: endpoint, symbol, status, code, milliseconds, rows) — usage and limits come from it
  limits     a limiter at 80% of the plan's published limits (per second / minute / day, and Standard's 10 expired-contract minute calls a
             day); -429 (limit hit) → wait and try again, doubling the wait
  secrets    the app secret and the daily access token are sealed with AES-256-GCM, the key derived from LENS_SECRET; they never leave
             the server (the admin screens see only "set" / "connected")
"""
import base64
import hashlib
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

IST = timezone(timedelta(hours=5, minutes=30))
# Fyers' own sign-in landing page (the default Redirect URL of a Fyers app): it only shows the address with the code, so the admin
# copies that address from the browser bar and pastes it into the Data Lab (owner 2026-11-21: "this is my redirect URL … it works")
FYERS_PAGE = "https://trade.fyers.in/api-login/redirect-uri/index.html"
# Fyers sits behind Cloudflare, which refuses Python's default "Python-urllib" identity (error 1010, HTTP 403 — owner 2026-11-21:
# "Fyers did not accept the sign-in: 403"); every request names itself
UA = "Mozilla/5.0 (X11; Linux x86_64) HyperplaneLens/1.0"
API = os.environ.get("FYERS_API_BASE", "https://api-t1.fyers.in")
# published plan limits (FYERS, Nov 2026) — the limiter uses 80% of them
PLANS = {
    "standard": {"per_sec": 5, "per_min": 50, "per_day": 5000, "expired_per_day": 10},
    "prime": {"per_sec": 10, "per_min": 500, "per_day": 500000, "expired_per_day": None},
}
SHARE = 0.8
# Fyers (API standards, Nov 2026): "if the per-minute rate limit is exceeded more than 3 times in a day, the user is blocked for the rest
# of the day" — so after a limit hit the next request waits a whole minute, and after 2 hits in a day the Data Lab stops until tomorrow
LIMIT_WAIT = int(os.environ.get("FYERS_LIMIT_WAIT", "65"))
MAX_LIMIT_HITS = 2
INDICES = {   # underlying (spot) symbol, option strike step, first day of expired F&O minute data
    "NIFTY": {"spot": "NSE:NIFTY50-INDEX", "step": 50, "fno_from": "2018-10-10"},
    "BANKNIFTY": {"spot": "NSE:NIFTYBANK-INDEX", "step": 100, "fno_from": "2018-10-10"},
    "SENSEX": {"spot": "BSE:SENSEX-INDEX", "step": 100, "fno_from": "2023-08-07"},
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS fyers_settings (
    id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    app_id        TEXT NOT NULL DEFAULT '',
    secret_enc    TEXT NOT NULL DEFAULT '',
    redirect_uri  TEXT NOT NULL DEFAULT '',
    plan          TEXT NOT NULL DEFAULT 'standard' CHECK (plan IN ('standard', 'prime')),
    token_enc     TEXT NOT NULL DEFAULT '',
    token_at      TIMESTAMPTZ,
    token_bad     TEXT,
    profile       TEXT NOT NULL DEFAULT '',
    consent_on    DATE,
    consent_ref   TEXT NOT NULL DEFAULT '',
    consent_note  TEXT NOT NULL DEFAULT '',
    consent_by    TEXT NOT NULL DEFAULT '',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO fyers_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS fyers_oauth (
    state       TEXT PRIMARY KEY,
    by_admin    TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fyers_calls (
    id        BIGSERIAL PRIMARY KEY,
    at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    endpoint  TEXT NOT NULL,
    symbol    TEXT NOT NULL DEFAULT '',
    params    JSONB NOT NULL DEFAULT '{}'::jsonb,
    expired   BOOLEAN NOT NULL DEFAULT false,
    http      INT NOT NULL DEFAULT 0,
    code      INT,
    ok        BOOLEAN NOT NULL DEFAULT false,
    ms        INT NOT NULL DEFAULT 0,
    rows      INT NOT NULL DEFAULT 0,
    note      TEXT NOT NULL DEFAULT '',
    job_id    BIGINT
);
CREATE INDEX IF NOT EXISTS fyers_calls_at ON fyers_calls (at DESC);
"""


# ── secrets at rest ──
def _key():
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=b"lens-fyers", info=b"lens-fyers-v1").derive(os.environ["LENS_SECRET"].encode())


def seal(text):
    if not text:
        return ""
    n = os.urandom(12)
    return base64.b64encode(n + AESGCM(_key()).encrypt(n, text.encode(), b"fyers")).decode()


def unseal(blob):
    if not blob:
        return ""
    raw = base64.b64decode(blob)
    return AESGCM(_key()).decrypt(raw[:12], raw[12:], b"fyers").decode()


# ── settings / connection ──
def settings(c):
    return c.execute("SELECT * FROM fyers_settings WHERE id = 1").fetchone()


def token_valid(s, now=None):
    """an access token works until 06:30 IST the next morning (Fyers: "Access tokens expire daily at 6:30 AM") — or until Fyers refused it"""
    if not s["token_enc"] or not s["token_at"] or s["token_bad"]:
        return False
    now = now or datetime.now(IST)
    at = s["token_at"].astimezone(IST)
    after = (at.hour, at.minute) >= (6, 30)
    reset = datetime.combine(at.date() + timedelta(days=1 if after else 0), datetime.min.time(), IST).replace(hour=6, minute=30)
    return now < reset


def login_url(c, by_admin):
    s = settings(c)
    if not s["app_id"] or not s["secret_enc"] or not s["redirect_uri"]:
        raise ValueError("Save the Fyers app ID, secret and redirect address first")
    state = secrets.token_urlsafe(24)
    c.execute("DELETE FROM fyers_oauth WHERE created_at < now() - interval '15 minutes'")
    c.execute("INSERT INTO fyers_oauth (state, by_admin) VALUES (%s, %s)", (state, by_admin[:120]))
    q = urllib.parse.urlencode({"client_id": s["app_id"], "redirect_uri": s["redirect_uri"], "response_type": "code", "state": state})
    return f"{API}/api/v3/generate-authcode?{q}"


def finish_login(c, state, auth_code):
    """the callback: the state must be one we made in the last 10 minutes (used once); the code is exchanged for the day's token"""
    row = c.execute("DELETE FROM fyers_oauth WHERE state = %s AND created_at > now() - interval '10 minutes' RETURNING by_admin",
                    (state or "",)).fetchone()
    if not row:
        raise ValueError("This sign-in link has expired. Start again from Admin → Lens admin → Fyers Data Lab.")
    s = settings(c)
    app_hash = hashlib.sha256(f"{s['app_id']}:{unseal(s['secret_enc'])}".encode()).hexdigest()
    st, j, ms = _http("POST", f"{API}/api/v3/validate-authcode", body={"grant_type": "authorization_code", "appIdHash": app_hash, "code": auth_code})
    log_call(c, "validate-authcode", "", {}, st, j, ms)
    tok = j.get("access_token") if isinstance(j, dict) else None
    if not tok:
        why = (j or {}).get("message") or (j or {}).get("title") or f"HTTP {st}"
        raise ValueError(f"Fyers did not accept the sign-in: {why}")
    c.execute("UPDATE fyers_settings SET token_enc = %s, token_at = now(), token_bad = NULL, updated_at = now() WHERE id = 1", (seal(tok),))
    prof = Fyers(c).call("profile", "/api/v3/profile")
    name = ((prof or {}).get("data") or {}).get("name") or ""
    c.execute("UPDATE fyers_settings SET profile = %s WHERE id = 1", (name[:120],))
    return row["by_admin"]


def finish_from_link(c, link):
    """the address copied from Fyers' page after the sign-in (or just the code). Without a state in it, the newest Connect click of the
    last 10 minutes is used — a code alone is never enough without an admin's Connect just before."""
    link = (link or "").strip()
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(link).query) if "auth_code=" in link else {}
    code = (q.get("auth_code") or [link if link and "=" not in link and " " not in link and "/" not in link else ""])[0]
    if not code:
        raise ValueError("Paste the whole address from the browser bar of Fyers' page (it has auth_code= in it)")
    if (q.get("s") or [""])[0] == "error":
        raise ValueError("Fyers' page says the sign-in did not complete — click Connect Fyers again")
    state = (q.get("state") or [""])[0]
    if not state:
        r = c.execute("SELECT state FROM fyers_oauth WHERE created_at > now() - interval '10 minutes' ORDER BY created_at DESC LIMIT 1").fetchone()
        if not r:
            raise ValueError("Click Connect Fyers first, then paste the address within 10 minutes")
        state = r["state"]
    return finish_login(c, state, code)


# ── HTTP ──
def _http(method, url, headers=None, body=None, timeout=30):
    t = time.perf_counter()
    req = urllib.request.Request(url, method=method, headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": UA,
                                                              **(headers or {})},
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            st, raw = r.status, r.read()
    except urllib.error.HTTPError as e:
        st, raw = e.code, e.read()
    except (urllib.error.URLError, OSError) as e:
        return 0, {"s": "error", "message": f"no answer: {e.__class__.__name__}"}, int((time.perf_counter() - t) * 1000)
    try:
        j = json.loads(raw or b"{}")
    except ValueError:
        j = {"s": "error", "message": "not JSON"}
    return st, j, int((time.perf_counter() - t) * 1000)


def log_call(c, endpoint, symbol, params, http, j, ms, expired=False, rows=0, note="", job_id=None):
    code = j.get("code") if isinstance(j, dict) else None
    ok = 200 <= http < 300 and isinstance(j, dict) and j.get("s") == "ok"
    c.execute("INSERT INTO fyers_calls (endpoint, symbol, params, expired, http, code, ok, ms, rows, note, job_id) "
              "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
              (endpoint, symbol[:80], json.dumps(params)[:2000], expired, http, code if isinstance(code, int) else None, ok, ms, rows,
               note[:300] or ("" if ok else str((j or {}).get("message", ""))[:300]), job_id))


def usage(c, plan):
    """today's calls (IST day) against the plan's day limits"""
    u = c.execute("SELECT count(*) AS calls, count(*) FILTER (WHERE expired) AS expired, count(*) FILTER (WHERE code = -429 OR http = 429) AS limited, "
                  "count(*) FILTER (WHERE NOT ok) AS failed, coalesce(avg(ms), 0)::int AS avg_ms FROM fyers_calls "
                  "WHERE at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' AND endpoint <> 'validate-authcode'").fetchone()
    p = PLANS[plan]
    cap_day = int(p["per_day"] * SHARE)
    cap_exp = int(p["expired_per_day"] * SHARE) if p["expired_per_day"] else None
    return {**u, "cap_day": cap_day, "cap_expired": cap_exp, "left_day": max(0, cap_day - u["calls"]),
            "left_expired": None if cap_exp is None else max(0, cap_exp - u["expired"])}


class QuotaWait(Exception):
    """today's allowance is used up: the job waits for tomorrow (the screen says so)"""


class NotConnected(Exception):
    pass


class Fyers:
    """one connection (the worker). Every call goes through the limiter and is logged."""

    def __init__(self, c, job_id=None):
        self.c, self.job_id = c, job_id
        s = settings(c)
        self.plan = PLANS[s["plan"]]
        self.plan_name = s["plan"]
        self.header = f"{s['app_id']}:{unseal(s['token_enc'])}" if s["token_enc"] else ""
        self.connected = token_valid(s)
        self.sec, self.min = deque(), deque()

    def _wait_slot(self, expired):
        u = usage(self.c, self.plan_name)
        if u["left_day"] <= 0 or (expired and u["left_expired"] is not None and u["left_expired"] <= 0):
            raise QuotaWait("today's allowance is used up")
        per_sec, per_min = max(1, int(self.plan["per_sec"] * SHARE)), max(1, int(self.plan["per_min"] * SHARE))
        while True:
            now = time.monotonic()
            while self.sec and self.sec[0] < now - 1.05:             # a small margin: network timing can bunch requests
                self.sec.popleft()
            while self.min and self.min[0] < now - 61:
                self.min.popleft()
            if len(self.sec) < per_sec and len(self.min) < per_min:
                self.sec.append(now); self.min.append(now)
                return
            waits = ([self.sec[0] + 1.05 - now] if len(self.sec) >= per_sec else []) + ([self.min[0] + 61 - now] if len(self.min) >= per_min else [])
            time.sleep(max(0.02, min(waits)))

    def call(self, name, path, params=None, symbol="", expired=False):
        """GET one data / account address. Returns the JSON (dict) or raises QuotaWait / NotConnected."""
        if not self.header:
            raise NotConnected("Fyers is not connected")
        backoff = 2
        for attempt in range(6):
            self._wait_slot(expired)
            url = f"{API}{path}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
            st, j, ms = _http("GET", url, headers={"Authorization": self.header, "version": "3"})
            rows = len(_candles(j)[1]) if isinstance(j, dict) else 0
            log_call(self.c, name, symbol, params or {}, st, j, ms, expired=expired, rows=rows, job_id=self.job_id)
            code = j.get("code") if isinstance(j, dict) else None
            if st == 429 or code == -429:
                hits = self.c.execute("SELECT count(*) AS n FROM fyers_calls WHERE (code = -429 OR http = 429) AND at >= date_trunc('day', now() "
                                      "AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'").fetchone()["n"]
                if hits >= MAX_LIMIT_HITS:
                    raise QuotaWait(f"Fyers' limit was hit {hits} times today — stopped until tomorrow (a 4th time would block the account for the day)")
                time.sleep(LIMIT_WAIT)                                   # a whole minute: Fyers' per-minute window starts again
                self.sec.clear(); self.min.clear()
                continue
            if st == 401 or code in (-8, -15, -16, -17, -300):          # the day's token is no longer valid
                self.c.execute("UPDATE fyers_settings SET token_bad = %s WHERE id = 1", (str(j.get("message", "token refused"))[:200],))
                raise NotConnected("Fyers sign-in expired — reconnect")
            if st == 0 and attempt < 3:
                time.sleep(backoff); backoff *= 2
                continue
            return j
        return j


def _candles(j):
    """(column names, rows) from any of Fyers' candle answers — the history format [ts, o, h, l, c, v(, oi)] or a named `columns` list"""
    if not isinstance(j, dict):
        return [], []
    d = j.get("data") if isinstance(j.get("data"), dict) else j
    rows = d.get("candles") or d.get("data") if isinstance(d.get("candles") or d.get("data"), list) else []
    cols = d.get("columns") or j.get("columns")
    if not cols and rows and isinstance(rows[0], (list, tuple)):
        cols = ["timestamp", "open", "high", "low", "close", "volume", "oi"][:len(rows[0])]
    if rows and isinstance(rows[0], dict):
        cols = list(rows[0].keys())
        rows = [[r.get(k) for k in cols] for r in rows]
    return [str(x).lower() for x in (cols or [])], rows or []
