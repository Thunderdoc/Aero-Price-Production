"""
Tests for GET /api/health — the endpoint that reports the live outage state.

Covers: healthy empty DB, seeded real observations, and the DB-error state
(missing tables — the exact shape of the live 21 Nov 2026 outage).
"""
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.collection import SourceHealth
from app.models.fare import FareObservation
from main import app


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    limiter._buckets.clear()
    yield
    limiter._buckets.clear()


async def _client_for(session):
    async def isolated_db():
        yield session

    app.dependency_overrides[get_db] = isolated_db
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_health_empty_db_is_connected_with_no_live_data(db):
    client = await _client_for(db)
    try:
        response = await client.get("/api/health")
    finally:
        await client.aclose()
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    assert body["real_observations"] == 0
    assert body["live_sources"] == 0
    assert body["data_status"] == "NO_LIVE_DATA"
    assert body["project"] == "SIH26056"


@pytest.mark.asyncio
async def test_health_counts_real_observations(db):
    db.add(
        FareObservation(
            collection_run_id="run-1",
            origin="DEL",
            destination="BOM",
            route="DEL-BOM",
            airline="IndiGo",
            travel_date="2026-11-25",
            advance_days=7,
            base_fare=4000.0,
            taxes=500.0,
            fees=0.0,
            total_fare=4500.0,
            data_origin="REAL",
            source="manual-collection",
            is_valid=True,
        )
    )
    # A PUBLIC_INTERFACE row counts too: health counts the index-eligible
    # origins (REAL/OFFICIAL/PUBLIC_INTERFACE), not REAL alone.
    db.add(
        FareObservation(
            collection_run_id="run-1",
            origin="DEL",
            destination="BOM",
            route="DEL-BOM",
            airline="IndiGo",
            travel_date="2026-11-25",
            advance_days=7,
            base_fare=4000.0,
            taxes=500.0,
            fees=0.0,
            total_fare=4600.0,
            data_origin="PUBLIC_INTERFACE",
            source="fast-flights",
            is_valid=True,
        )
    )
    # A sandbox row must NOT count as a real observation.
    db.add(
        FareObservation(
            collection_run_id="run-1",
            origin="DEL",
            destination="BOM",
            route="DEL-BOM",
            airline="IndiGo",
            travel_date="2026-11-25",
            advance_days=7,
            base_fare=4000.0,
            taxes=500.0,
            fees=0.0,
            total_fare=4500.0,
            data_origin="SANDBOX_TEST",
            source="amadeus",
            is_valid=True,
        )
    )
    await db.flush()
    client = await _client_for(db)
    try:
        response = await client.get("/api/health")
    finally:
        await client.aclose()
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 200
    assert response.json()["real_observations"] == 2


@pytest.mark.asyncio
async def test_health_db_error_state_when_tables_are_missing():
    """Missing tables (fresh Postgres with no schema — the live outage shape)
    must report database 'error' + degraded, never a 500."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    try:
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            client = await _client_for(session)
            try:
                response = await client.get("/api/health")
            finally:
                await client.aclose()
                app.dependency_overrides.pop(get_db, None)
    finally:
        await engine.dispose()
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["database"] == "error"
    assert body["real_observations"] == 0
    assert body["data_status"] == "NO_LIVE_DATA"


@pytest.mark.asyncio
async def test_health_counts_public_interface_observations(db):
    """Scraped fares (PUBLIC_INTERFACE, Phase 2 relabel) count as live
    observations — health must not report 0 after collection restarts —
    while SANDBOX_TEST rows stay excluded. The per-origin breakdown keeps
    the mix honest: scraped vs verified is visible, not hidden in a total."""
    for origin in ("PUBLIC_INTERFACE", "PUBLIC_INTERFACE", "REAL", "SANDBOX_TEST"):
        db.add(
            FareObservation(
                collection_run_id="run-1",
                origin="DEL",
                destination="BOM",
                route="DEL-BOM",
                airline="IndiGo",
                travel_date="2026-11-25",
                advance_days=7,
                base_fare=4000.0,
                taxes=500.0,
                fees=0.0,
                total_fare=4500.0,
                data_origin=origin,
                source="google-flights" if origin == "PUBLIC_INTERFACE" else "manual-collection",
                is_valid=True,
            )
        )
    await db.flush()
    client = await _client_for(db)
    try:
        response = await client.get("/api/health")
    finally:
        await client.aclose()
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 200
    body = response.json()
    assert body["real_observations"] == 3  # 2 PUBLIC_INTERFACE + 1 REAL
    assert body["observations_by_origin"] == {
        "PUBLIC_INTERFACE": 2,
        "REAL": 1,
        "SANDBOX_TEST": 1,
    }


@pytest.mark.asyncio
async def test_health_stored_observations_without_live_sources_is_stale_data(db):
    """Merge-gate fix (Phase 5 local run): 542 stored fares were reported
    alongside data_status NO_LIVE_DATA — count and status contradicted each
    other. Stored observations with no fresh source is STALE_DATA."""
    db.add(
        FareObservation(
            collection_run_id="run-1",
            origin="DEL",
            destination="BOM",
            route="DEL-BOM",
            airline="IndiGo",
            travel_date="2026-11-25",
            advance_days=7,
            base_fare=4000.0,
            taxes=500.0,
            fees=0.0,
            total_fare=4500.0,
            data_origin="PUBLIC_INTERFACE",
            source="fast-flights",
            is_valid=True,
        )
    )
    await db.flush()
    client = await _client_for(db)
    try:
        response = await client.get("/api/health")
    finally:
        await client.aclose()
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 200
    body = response.json()
    assert body["real_observations"] == 1
    assert body["live_sources"] == 0
    assert body["data_status"] == "STALE_DATA"


@pytest.mark.asyncio
async def test_health_live_source_is_live(db):
    """A source with a successful update inside the freshness window
    reports LIVE (and the count/status agree)."""
    db.add(
        SourceHealth(
            source_id="fast-flights",
            source_name="FastFlights",
            source_type="AGGREGATOR",
            enabled=True,
            status="LIVE",
            last_success=datetime.now(timezone.utc),
        )
    )
    await db.flush()
    client = await _client_for(db)
    try:
        response = await client.get("/api/health")
    finally:
        await client.aclose()
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 200
    body = response.json()
    assert body["live_sources"] == 1
    assert body["data_status"] == "LIVE"
