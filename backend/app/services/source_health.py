"""Shared source-health rules used by dashboard and source-directory APIs."""

from datetime import datetime, timedelta, timezone


LIVE_FRESHNESS = timedelta(hours=24)


def is_live_now(row) -> bool:
    """Return true only for a successful source update within the freshness window."""
    if not row or row.status != "LIVE" or not row.last_success:
        return False
    last_success = row.last_success
    if last_success.tzinfo is None:
        last_success = last_success.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - last_success <= LIVE_FRESHNESS


def effective_status(source: dict, row) -> str:
    """Combine current configuration with persisted health without stale LIVE claims."""
    if not row:
        return str(source.get("status") or "NOT_CONFIGURED")
    if row.status == "LIVE":
        return "LIVE" if is_live_now(row) else "STALE_DATA"
    return str(row.status or source.get("status") or "NOT_CONFIGURED")
