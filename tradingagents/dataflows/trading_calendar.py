"""A-stock trading calendar backed by exchange_calendars (XSHG official calendar).

Uses the exchange_calendars library which provides the official Shanghai Stock
Exchange trading calendar. Falls back to weekday + hardcoded Chinese holiday
detection if the library is unavailable (e.g. first import before install).
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

logger = logging.getLogger(__name__)

# ── Hardcoded fallback (used only when exchange_calendars is absent) ──────
# Keep this minimal and update annually from the SSE official calendar.
_FALLBACK_HOLIDAYS: set[str] = set()
_FALLBACK_MAKEUP: set[str] = set()


def _try_xshg_calendar():
    """Return the XSHG calendar object or None if not available."""
    try:
        import exchange_calendars as xcals
        return xcals.get_calendar("XSHG")
    except Exception:
        return None


def is_trading_day(d: date) -> bool:
    """Return True if *d* is an A-stock trading day."""
    cal = _try_xshg_calendar()
    if cal is not None:
        return cal.is_session(d.strftime("%Y-%m-%d"))

    # Fallback: weekend + hardcoded holiday detection
    ds = d.strftime("%Y-%m-%d")
    if ds in _FALLBACK_MAKEUP:
        return True
    if d.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    if ds in _FALLBACK_HOLIDAYS:
        return False
    return True


def get_latest_trading_day(ref_date: date | None = None) -> date:
    """Return the latest trading day <= *ref_date* (inclusive).

    Walks back at most 30 days; falls back to the input date.
    """
    if ref_date is None:
        ref_date = date.today()

    d = ref_date
    for _ in range(30):
        if is_trading_day(d):
            return d
        d = d - timedelta(days=1)

    logger.warning("Could not find trading day within 30 days of %s", ref_date)
    return ref_date


def resolve_analysis_date(user_date: str) -> str:
    """Resolve a user-supplied date string to the latest trading day.

    1. Parses *user_date* (``YYYY-MM-DD``).
    2. Walks back to the latest trading day if needed.
    3. Returns the resolved date string.
    """
    try:
        dt = datetime.strptime(user_date, "%Y-%m-%d").date()
    except ValueError:
        logger.warning("Invalid date format '%s', using today", user_date)
        dt = date.today()

    resolved = get_latest_trading_day(dt)
    resolved_str = resolved.strftime("%Y-%m-%d")

    if resolved_str != user_date:
        logger.info(
            "Date resolved: user=%s → trading=%s (weekday=%d)",
            user_date, resolved_str, resolved.weekday(),
        )

    return resolved_str
