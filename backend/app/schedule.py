"""When collections should run (all times in the server's timezone, IST by default)."""
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo

from .config import TZ_NAME

TZ = ZoneInfo(TZ_NAME)


def now():
    return datetime.now(TZ)


def parse_hhmm(s):
    h, m = s.strip().split(":")
    h, m = int(h), int(m)
    if not (0 <= h < 24 and 0 <= m < 60):
        raise ValueError(f"bad time {s}")
    return time(h, m)


def is_trading_day(d, settings):
    if settings.get("weekdays_only", True) and d.weekday() >= 5:
        return False
    return d.isoformat() not in set(settings.get("skip_dates") or [])


def due_slots(settings, at=None):
    """Slots that should have run by now today and are still inside the catch-up window."""
    at = at or now()
    if not is_trading_day(at.date(), settings):
        return []
    window = timedelta(minutes=int(settings.get("catch_up_minutes", 180)))
    out = []
    for s in settings.get("schedule_times") or []:
        t = parse_hhmm(s)
        slot_dt = datetime.combine(at.date(), t, tzinfo=TZ)
        if slot_dt <= at < slot_dt + window:
            out.append(t.strftime("%H:%M"))
    return out


def next_runs(settings, count=4, at=None):
    at = at or now()
    times = sorted(parse_hhmm(s) for s in settings.get("schedule_times") or [])
    out, d = [], at.date()
    for _ in range(30):
        if is_trading_day(d, settings):
            for t in times:
                dt = datetime.combine(d, t, tzinfo=TZ)
                if dt > at:
                    out.append(dt)
                    if len(out) >= count:
                        return out
        d += timedelta(days=1)
    return out
