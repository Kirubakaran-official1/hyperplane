"""
Everything read from config.ini (the one place for users and secrets).

config.ini is re-read automatically when it changes, so adding / removing a user
or changing a password needs no restart.
"""
import configparser
import os
import threading

CONFIG_PATH = os.environ.get("CONFIG_PATH", "/config/config.ini")
DATA_DIR = os.environ.get("DATA_DIR", "/data")
TZ_NAME = os.environ.get("APP_TIMEZONE", "Asia/Kolkata")   # all schedule times are in this timezone

_lock = threading.Lock()
_cache = {"mtime": None, "cfg": None}


def _load():
    with _lock:
        try:
            mtime = os.path.getmtime(CONFIG_PATH)
        except OSError:
            raise RuntimeError(f"config.ini not found at {CONFIG_PATH} — copy config.example.ini to config.ini")
        if _cache["mtime"] != mtime:
            cfg = configparser.ConfigParser(interpolation=None)
            cfg.optionxform = str                      # keep user names exactly as written
            cfg.read(CONFIG_PATH, encoding="utf-8")
            _cache.update(mtime=mtime, cfg=cfg)
        return _cache["cfg"]


def users():
    """{username: {"password": str, "admin": bool}}   from [users]:  name = password[, admin]"""
    cfg = _load()
    out = {}
    if cfg.has_section("users"):
        for name, raw in cfg.items("users"):
            parts = [p.strip() for p in raw.rsplit(",", 1)]
            if len(parts) == 2 and parts[1].lower() == "admin":
                out[name.strip()] = {"password": parts[0], "admin": True}
            else:
                out[name.strip()] = {"password": raw.strip(), "admin": False}
    return out


def secret_key():
    key = _load().get("app", "secret_key", fallback="").strip()
    if not key or key.startswith("change-me"):
        raise RuntimeError("Set a long random [app] secret_key in config.ini")
    return key


def session_hours():
    return _load().getint("app", "session_hours", fallback=72)


def telegram():
    cfg = _load()
    token = cfg.get("telegram", "bot_token", fallback="NIL").strip()
    chat = cfg.get("telegram", "chat_id", fallback="NIL").strip()
    if not token or token == "NIL" or not chat or chat == "NIL":
        return None
    return {"bot_token": token, "chat_id": chat}
