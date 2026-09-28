from datetime import datetime, timezone

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
