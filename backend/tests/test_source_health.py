from datetime import datetime, timedelta, timezone

import pytest

from app.collectors.base import CollectionResult
from app.models.collection import SourceHealth
from app.services.collector import _upsert_source_health


@pytest.mark.asyncio
async def test_no_data_success_clears_stale_failure(db):
    row = SourceHealth(
        source_id="scrapling-google-flights",
        source_name="Google Flights via Scrapling",
        source_type="PUBLIC_INTERFACE",
        status="DEGRADED",
        last_failure=datetime.now(timezone.utc),
        failure_reason="old dependency error",
        auth_status="NOT_CONFIGURED",
    )
    db.add(row)
    await db.commit()

    result = CollectionResult(
        source_id="scrapling-google-flights",
        route="DEL-BOM",
        travel_date="2026-10-05",
        advance_days=7,
        status="NO_DATA",
        error="Fetched page, no stable fare payload parser configured.",
        latency_ms=1234,
    )
    await _upsert_source_health(db, result, [])
    await db.commit()

    refreshed = await db.get(SourceHealth, "scrapling-google-flights")
    assert refreshed is not None
    assert refreshed.enabled is True
    assert refreshed.status == "DEGRADED"
    assert refreshed.auth_status == "VALID"
    assert refreshed.last_success is not None
    assert refreshed.last_failure is None
    assert refreshed.failure_reason == "Fetched page, no stable fare payload parser configured."


def _live_row(source_id="fast-flights", last_success=None):
    return SourceHealth(
        source_id=source_id,
        source_name="Fast Flights",
        source_type="AGGREGATOR",
        status="LIVE",
        last_success=last_success or datetime.now(timezone.utc),
        records_total=734,
        auth_status="VALID",
    )


def _result(source_id, status, error=None):
    return CollectionResult(
        source_id=source_id,
        route="DEL-BOM",
        travel_date="2026-11-22",
        advance_days=7,
        status=status,
        error=error,
        latency_ms=1234,
    )


@pytest.mark.asyncio
async def test_no_data_preserves_live_status(db):
    # 22 Nov 2026: the sweep's tail chunks returned NO_DATA and flipped the
    # fast-flights row LIVE -> DEGRADED, so /api/health reported STALE_DATA
    # despite 387 fares collected minutes earlier. NO_DATA must not degrade.
    db.add(_live_row())
    await db.commit()

    await _upsert_source_health(db, _result("fast-flights", "NO_DATA", "no fares for this window"), [])
    await db.commit()

    refreshed = await db.get(SourceHealth, "fast-flights")
    assert refreshed.status == "LIVE"
    assert refreshed.last_success is not None
    assert refreshed.last_failure is None


@pytest.mark.asyncio
async def test_failed_preserves_live_with_fresh_success(db):
    # One failed call amid a successful sweep is a blip, not degradation.
    db.add(_live_row())
    await db.commit()

    await _upsert_source_health(db, _result("fast-flights", "FAILED", "connection reset"), [])
    await db.commit()

    refreshed = await db.get(SourceHealth, "fast-flights")
    assert refreshed.status == "LIVE"
    assert refreshed.last_failure is not None
    assert refreshed.failure_reason == "connection reset"


@pytest.mark.asyncio
async def test_failed_degrades_live_with_stale_success(db):
    # ...but a source with no fresh success does degrade on failure.
    db.add(_live_row(last_success=datetime.now(timezone.utc) - timedelta(hours=25)))
    await db.commit()

    await _upsert_source_health(db, _result("fast-flights", "FAILED", "connection reset"), [])
    await db.commit()

    refreshed = await db.get(SourceHealth, "fast-flights")
    assert refreshed.status == "DEGRADED"


@pytest.mark.asyncio
async def test_partial_preserves_status_and_last_success(db):
    # PARTIAL = empty aggregator result: status preserved, last_success NOT
    # refreshed, so a source that goes dry still expires honestly.
    before = datetime.now(timezone.utc) - timedelta(hours=2)
    db.add(_live_row(last_success=before))
    await db.commit()

    await _upsert_source_health(db, _result("fast-flights", "PARTIAL"), [])
    await db.commit()

    refreshed = await db.get(SourceHealth, "fast-flights")
    assert refreshed.status == "LIVE"
    # SQLite strips tzinfo on read-back; compare wall-clock values.
    assert refreshed.last_success.replace(tzinfo=timezone.utc) == before
    assert refreshed.last_attempt is not None
