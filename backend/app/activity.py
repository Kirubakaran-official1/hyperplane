"""Activity log helpers shared by the admin API (main.py) and the customer service (portal.py).

Logging must never break a sign-in or a page: every write here swallows its own errors.
"""
import json
import re
import secrets

DEVICE_COOKIE_DAYS = 400                     # browsers cap cookies at ~400 days
DEV_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
EVENTS = ("signup", "login", "login_failed", "locked", "logout", "open", "session_revoked", "signed_out_all",
          "roles_changed", "blocked", "password_reset")


def new_id(n=18):
    return secrets.token_urlsafe(n)


def device_id(request, cookie):
    """The browser's long-lived device id (one per browser / system); a new one when missing or malformed."""
    v = request.cookies.get(cookie) or ""
    return (v, False) if DEV_RE.match(v) else (new_id(), True)


def set_device_cookie(request, response, cookie, value, path):
    secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(cookie, value, max_age=DEVICE_COOKIE_DAYS * 86400, httponly=True, samesite="strict",
                        secure=secure, path=path)


def device_label(ua):
    """'Chrome · Windows', 'Safari · iPhone' … plain words, no extra library."""
    ua = ua or ""
    if not ua:
        return "Unknown device"
    if re.search(r"bot|crawl|spider|curl|python|wget|headless", ua, re.I):
        browser = "Automated client"
    elif "Edg/" in ua or "EdgA/" in ua or "EdgiOS/" in ua:
        browser = "Edge"
    elif "OPR/" in ua or "Opera" in ua:
        browser = "Opera"
    elif "SamsungBrowser/" in ua:
        browser = "Samsung Internet"
    elif "Firefox/" in ua or "FxiOS/" in ua:
        browser = "Firefox"
    elif "Chrome/" in ua or "CriOS/" in ua:
        browser = "Chrome"
    elif "Safari/" in ua:
        browser = "Safari"
    else:
        browser = "Browser"
    if "iPhone" in ua:
        os_ = "iPhone"
    elif "iPad" in ua:
        os_ = "iPad"
    elif "Android" in ua:
        os_ = "Android tablet" if "Mobile" not in ua else "Android phone"
    elif "Windows" in ua:
        os_ = "Windows"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        os_ = "Mac"
    elif "CrOS" in ua:
        os_ = "Chromebook"
    elif "Linux" in ua:
        os_ = "Linux"
    else:
        os_ = "Other"
    return f"{browser} · {os_}"


def log(conn, *, actor_kind, app, event, actor_id=None, actor_name=None, session_id=None, device_id=None,
        device=None, ip=None, module=None, detail=None):
    try:
        with conn.transaction():                                 # savepoint: a failure leaves the caller's work intact
            conn.execute("INSERT INTO activity_log (actor_kind, actor_id, actor_name, session_id, device_id, device, ip, app, module, event, detail) "
                         "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                         (actor_kind, None if actor_id is None else str(actor_id), (actor_name or "")[:120] or None, session_id,
                          device_id, (device or "")[:60] or None, (ip or "")[:64] or None, app, module, event,
                          json.dumps(detail) if detail is not None else None))
    except Exception as e:                                       # noqa: BLE001 — never break the request
        print(f"⚠ activity log: {e}", flush=True)
