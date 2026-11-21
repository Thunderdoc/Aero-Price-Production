"""
Phase 2 regression tests — live data path (SIH fix track, 21 Nov 2026).

Pins: adapter wiring (Amadeus + Duffel), provenance defaults (never REAL),
finalize_provenance ordering (before the ORM row is built), the chunked
collection endpoints + CRON_SECRET auth, the run lock via the HTTP layer,
the dashboard "current fare" window, the price-alert freshness window,
sequential aviation fallback, honest gov degradation, and the SerpApi T+7
quota guard.

Reaper / run-lock / run-lifecycle behaviour is pinned in
test_collection_orchestration.py (shared with the other phase that tests the
same collector API); it is not duplicated here.

No network: every test uses stub adapters or monkeypatched HTTP clients.
"""
import inspect
from datetime import date, datetime, timedelta, timezone

import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.routes import aviation as aviation_mod
from app.api.routes import collections as collections_mod
from app.api.routes.aviation import live_aircraft
from app.api.routes.collections import (
    ChunkRequest,
    collect_chunk,
    collection_plan,
    cron_collection,
)
from app.api.routes.dashboard import dashboard_summary
from app.collectors.aggregators.serpapi_google_flights import SerpApiGoogleFlightsAdapter
from app.collectors.base import (
    CollectionResult,
    FareRecord,
    FareSourceAdapter,
)
from app.models.access import PriceAlert
from app.models.collection import CollectionRun
from app.models.fare import FareObservation, RawFarePayload
from app.processing.normalize import normalize_fare
from app.processing.provenance import (
    PUBLIC_INTERFACE,
    REAL,
    SANDBOX_TEST,
    UNKNOWN,
    assign_provenance,
    is_analytical_eligible,
    is_production_eligible,
)
from app.processing.quality import validate_batch, validate_record
from app.services import collector as collector_mod
from app.services.collector import (
    CollectionDisabledError,
    CollectionLockedError,
    _make_adapters,
    finalize_collection_day,
    run_collection,
    run_collection_chunk,
)
from app.services.gov_fetcher import fetch_datagov_aviation, fetch_mospi_cpi
from app.services.price_alerts import evaluate_price_alerts

UTC = timezone.utc


# ── Stubs ─────────────────────────────────────────────────────────────────────

def make_record(data_origin="PUBLIC_INTERFACE", **overrides):
    """A valid fare record; override fields as needed."""
    defaults = dict(
        origin="DEL", destination="BOM", route="DEL-BOM", airline="IndiGo",
        travel_date=(date.today() + timedelta(days=7)).isoformat(),
        advance_days=7, base_fare=4000.0, taxes=500.0, fees=0.0,
        total_fare=4500.0, cabin="ECONOMY", stops=0, data_origin=data_origin,
        source="stub-test",
    )
    defaults.update(overrides)
    return FareRecord(**defaults)


class StubSuccessAdapter(FareSourceAdapter):
    """One valid PUBLIC_INTERFACE fare per call, with a real raw payload."""

    source_id = "stub-test"
    source_name = "Stub (test only)"
    source_type = "PUBLIC_INTERFACE"

    def __init__(self, raw_response='{"provider": "stub", "offers": [1]}'):
        super().__init__({})
        self._raw_response = raw_response

    async def collect(self, route, travel_date, advance_days, collection_run_id):
        origin, destination = route.split("-")
        return CollectionResult(
            source_id=self.source_id, route=route, travel_date=travel_date,
            advance_days=advance_days, status="SUCCESS",
            records=[make_record(origin=origin, destination=destination,
                                 route=route, travel_date=travel_date,
                                 advance_days=advance_days)],
            raw_response=self._raw_response,
        )


class StubDowngradeAdapter(StubSuccessAdapter):
    """Claims REAL, then finalize_provenance downgrades to SANDBOX_TEST."""

    source_id = "stub-downgrade"

    async def collect(self, route, travel_date, advance_days, collection_run_id):
        result = await super().collect(route, travel_date, advance_days, collection_run_id)
        for record in result.records:
            record.data_origin = REAL
        return result

    def finalize_provenance(self, record, persisted):
        record.data_origin = SANDBOX_TEST
        return record


class SessionCM:
    """Async context manager yielding a fixed session (stands in for AsyncSessionLocal)."""

    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *exc):
        return False


@pytest.fixture
def cron_env(monkeypatch, db):
    """Wire the collections routes to the test session + a known CRON_SECRET."""
    monkeypatch.setattr(collections_mod, "AsyncSessionLocal", lambda: SessionCM(db))
    monkeypatch.setattr(collections_mod.settings, "CRON_SECRET", "test-secret")
    return db


@pytest.fixture(autouse=True)
def _fresh_aviation_cache():
    aviation_mod._live_cache.clear()
    aviation_mod._live_cache.update({
        "expires_at": 0.0, "fetched_at": 0.0, "aircraft": [],
        "source": "", "data_origin": "", "retrieved_at": None,
    })


# ── 1. Adapter wiring ─────────────────────────────────────────────────────────

def test_make_adapters_wires_amadeus_and_duffel():
    ids = {a.source_id for a in _make_adapters()}
    assert "amadeus" in ids
    assert "duffel" in ids
    assert "fast-flights" in ids
    assert "serpapi-google-flights" in ids


def test_make_adapters_instantiates_every_imported_adapter_class():
    """Regression: adapters imported by the collector must not silently drop
    out of the pipeline (Amadeus was built but never instantiated)."""
    imported = {
        name: obj for name, obj in vars(collector_mod).items()
        if inspect.isclass(obj)
        and issubclass(obj, FareSourceAdapter)
        and obj is not FareSourceAdapter
    }
    assert "AmadeusAdapter" in imported and "DuffelAdapter" in imported
    built = {type(a).__name__ for a in _make_adapters()}
    missing = set(imported) - built
    assert not missing, f"adapter classes imported but not instantiated: {missing}"


def test_serpapi_stays_wired_and_t7_guarded():
    assert "serpapi-google-flights" in {a.source_id for a in _make_adapters()}
    adapter = SerpApiGoogleFlightsAdapter({"SERPAPI_API_KEY": "test-key"})

    async def _run():
        # T+1 is not a top-route window — the quota guard must skip it
        # BEFORE any network call.
        result = await adapter.collect("DEL-BOM", "2026-11-28", 1, "run-x")
        assert result.status == "SKIPPED"

    import asyncio
    asyncio.run(_run())


# ── 2. Provenance defaults ────────────────────────────────────────────────────

def test_fare_record_default_origin_is_unknown():
    rec = FareRecord(
        origin="DEL", destination="BOM", route="DEL-BOM", airline="IndiGo",
        travel_date="2026-11-28", advance_days=7, base_fare=4000.0,
        taxes=500.0, fees=0.0, total_fare=4500.0,
    )
    assert rec.data_origin == UNKNOWN


def test_normalize_defaults_unknown_origin():
    rec = normalize_fare(make_record(data_origin=""))
    assert rec.data_origin == UNKNOWN


def test_assign_provenance_unknown_source_type_is_unknown():
    assert assign_provenance(make_record(), "SOMETHING_NEW") == UNKNOWN
    assert assign_provenance(make_record(), "PUBLIC_INTERFACE") == PUBLIC_INTERFACE


def test_quality_rejects_unknown_origin():
    is_valid, flags = validate_record(make_record(data_origin=UNKNOWN))
    assert is_valid is False
    assert "UNKNOWN_ORIGIN" in flags


def test_quality_accepts_public_interface_and_sandbox():
    for origin in (PUBLIC_INTERFACE, SANDBOX_TEST):
        is_valid, flags = validate_record(make_record(data_origin=origin))
        assert is_valid is True, f"{origin} should validate: {flags}"
        assert "UNKNOWN_ORIGIN" not in flags


def test_public_interface_is_listing_and_analytical_eligible():
    assert is_production_eligible(make_record(data_origin=PUBLIC_INTERFACE), "live") is True
    assert is_analytical_eligible(make_record(data_origin=PUBLIC_INTERFACE)) is True
    # Sandbox test data never enters analytics.
    assert is_analytical_eligible(make_record(data_origin=SANDBOX_TEST)) is False


# ── 3. finalize_provenance ordering ───────────────────────────────────────────

async def test_finalize_applies_before_row_is_stored(db, monkeypatch):
    """A record claiming REAL whose adapter downgrades it in
    finalize_provenance must be STORED as SANDBOX_TEST — the finalize call
    happens before the ORM row is built, so no false REAL survives."""
    monkeypatch.setattr(collector_mod, "_make_adapters", lambda: [StubDowngradeAdapter()])
    run_id = await run_collection(
        db, triggered_by="test", routes=["DEL-BOM"], advance_windows=[7],
        publish_index_after=False,
    )
    rows = (await db.scalars(
        select(FareObservation).where(FareObservation.collection_run_id == run_id)
    )).all()
    assert len(rows) == 1
    assert rows[0].data_origin == SANDBOX_TEST
    assert rows[0].total_fare == 4500.0


async def test_raw_payload_stores_real_provider_response(db, monkeypatch):
    monkeypatch.setattr(collector_mod, "_make_adapters", lambda: [StubSuccessAdapter()])
    run_id = await run_collection(
        db, triggered_by="test", routes=["DEL-BOM"], advance_windows=[7],
        publish_index_after=False,
    )
    payloads = (await db.scalars(
        select(RawFarePayload).where(RawFarePayload.collection_run_id == run_id)
    )).all()
    assert len(payloads) == 1
    assert '"provider": "stub"' in payloads[0].payload
    assert "production GDS fare" not in payloads[0].payload


# ── 4. Chunked collection + endpoints ─────────────────────────────────────────

async def test_run_collection_chunk_collects_one_route_window(db, monkeypatch):
    monkeypatch.setattr(collector_mod, "_make_adapters", lambda: [StubSuccessAdapter()])
    run_id = await run_collection_chunk(db, "DEL-BOM", 7, triggered_by="test")
    run = await db.scalar(select(CollectionRun).where(CollectionRun.run_id == run_id))
    assert run.status == "COMPLETED"
    assert run.routes_planned == 1
    assert run.observations_collected == 1
    rows = (await db.scalars(
        select(FareObservation).where(FareObservation.collection_run_id == run_id)
    )).all()
    assert len(rows) == 1
    assert rows[0].data_origin == PUBLIC_INTERFACE


async def test_chunk_endpoint_happy_path(cron_env, monkeypatch):
    monkeypatch.setattr(collector_mod, "_make_adapters", lambda: [StubSuccessAdapter()])
    response = await collect_chunk(
        ChunkRequest(route="DEL-BOM", advance_days=7),
        authorization="Bearer test-secret",
    )
    assert response["status"] == "COMPLETED"
    assert response["run_id"]
    assert response["observations_collected"] == 1


async def test_chunk_endpoint_auth_required(cron_env):
    with pytest.raises(HTTPException) as exc:
        await collect_chunk(ChunkRequest(route="DEL-BOM", advance_days=7), authorization=None)
    assert exc.value.status_code == 401
    with pytest.raises(HTTPException) as exc:
        await collect_chunk(ChunkRequest(route="DEL-BOM", advance_days=7), authorization="Bearer wrong")
    assert exc.value.status_code == 401


async def test_chunk_endpoint_fails_closed_without_cron_secret(cron_env, monkeypatch):
    monkeypatch.setattr(collections_mod.settings, "CRON_SECRET", "")
    with pytest.raises(HTTPException) as exc:
        await collect_chunk(ChunkRequest(route="DEL-BOM", advance_days=7), authorization="Bearer test-secret")
    assert exc.value.status_code == 503


async def test_chunk_endpoint_validates_route_and_window(cron_env):
    with pytest.raises(HTTPException) as exc:
        await collect_chunk(ChunkRequest(route="XXX-YYY", advance_days=7), authorization="Bearer test-secret")
    assert exc.value.status_code == 400
    with pytest.raises(HTTPException) as exc:
        await collect_chunk(ChunkRequest(route="DEL-BOM", advance_days=99), authorization="Bearer test-secret")
    assert exc.value.status_code == 400


async def test_chunk_endpoint_lock_conflict_is_409(cron_env):
    cron_env.add(CollectionRun(
        run_id="active-run", triggered_by="test", status="RUNNING",
        started_at=datetime.now(UTC) - timedelta(minutes=5),
    ))
    await cron_env.commit()
    with pytest.raises(HTTPException) as exc:
        await collect_chunk(ChunkRequest(route="DEL-BOM", advance_days=7), authorization="Bearer test-secret")
    assert exc.value.status_code == 409


async def test_collection_plan_returns_basket_and_windows(cron_env):
    plan = await collection_plan(authorization="Bearer test-secret")
    assert "DEL-BOM" in plan["routes"]
    assert plan["advance_windows"] == [1, 7, 15, 30, 45]
    assert plan["chunks"] == len(plan["routes"]) * len(plan["advance_windows"])
    with pytest.raises(HTTPException) as exc:
        await collection_plan(authorization=None)
    assert exc.value.status_code == 401


async def test_cron_endpoint_is_lightweight_trigger(cron_env):
    """The Vercel cron does NOT collect fares — it reaps stale runs and
    publishes the index + alerts only."""
    response = await cron_collection(authorization="Bearer test-secret")
    assert response["status"] == "COMPLETED"
    assert "reaped_stale_runs" in response
    assert response["result"]["index_status"] == "INSUFFICIENT_DATA"


async def test_finalize_collection_day_publishes_index_and_alerts(db):
    result = await finalize_collection_day(db)
    assert result["index_status"] == "INSUFFICIENT_DATA"
    assert result["alerts_triggered"] == 0


async def test_collection_disabled_refuses(db, monkeypatch):
    monkeypatch.setattr(collector_mod.settings, "COLLECTION_ENABLED", False)
    with pytest.raises(CollectionDisabledError):
        await run_collection_chunk(db, "DEL-BOM", 7, triggered_by="test")


# ── 5. Dashboard windowing ────────────────────────────────────────────────────

def _fare_row(route, total, collected_at, origin=PUBLIC_INTERFACE):
    return FareObservation(
        collection_run_id="test-run",
        route=route, origin=route[:3], destination=route[4:], airline="IndiGo",
        travel_date=(date.today() + timedelta(days=7)).isoformat(),
        advance_days=7, total_fare=total, base_fare=total - 500.0,
        taxes=500.0, fees=0.0, currency="INR", cabin="ECONOMY",
        stops=0, data_origin=origin, source="stub-test",
        collected_at=collected_at, raw_hash=f"h-{route}-{total}-{collected_at.date()}",
    )


async def test_dashboard_current_fare_uses_latest_collection_day(db):
    now = datetime.now(UTC)
    day_old = now - timedelta(days=3)
    day_new = now - timedelta(days=1)
    db.add_all([
        _fare_row("DEL-BOM", 4000.0, day_old),
        _fare_row("DEL-BOM", 7000.0, day_new),
        _fare_row("DEL-BOM", 9000.0, day_new),
    ])
    await db.commit()
    summary = await dashboard_summary(db)
    # Latest day average is 8000, not the 3-day average of 6666.67.
    assert summary["current_fare_rate"] == pytest.approx(8000.0)
    assert summary["current_fare_period"] == day_new.date().isoformat()
    assert summary["observations_by_origin"]["PUBLIC_INTERFACE"] == 3


async def test_dashboard_data_status_is_stale_with_stored_fares(db):
    """Merge-gate fix: stored observations with no live source must report
    STALE_DATA, not NO_LIVE_DATA (same count/status contradiction as health)."""
    now = datetime.now(UTC)
    db.add_all([_fare_row("DEL-BOM", 5000.0, now - timedelta(days=2))])
    await db.commit()
    summary = await dashboard_summary(db)
    assert summary["observations"]["data_status"] == "STALE_DATA"
    assert summary["real_observations"] == 1


# ── 6. Price-alert freshness window ───────────────────────────────────────────

async def test_price_alerts_ignore_stale_fares(db):
    db.add(PriceAlert(user_email="t@example.com", route="DEL-BOM", target_fare=6000.0))
    db.add(_fare_row("DEL-BOM", 5000.0, datetime.now(UTC) - timedelta(days=5)))
    await db.commit()
    assert await evaluate_price_alerts(db) == 0
    alert = await db.scalar(select(PriceAlert).where(PriceAlert.route == "DEL-BOM"))
    assert alert.triggered_at is None

    db.add(_fare_row("DEL-BOM", 5000.0, datetime.now(UTC) - timedelta(hours=1)))
    await db.commit()
    assert await evaluate_price_alerts(db) == 1
    await db.refresh(alert)
    assert alert.triggered_at is not None


# ── 7. Aviation sequential fallback ───────────────────────────────────────────

class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


async def _fake_adsb_ok(client, url, limit):
    return [{
        "hex": "abc123", "flight": "IGO123", "lat": 28.5, "lon": 77.1,
        "alt_baro": 35000, "gs": 450, "track": 90.0, "squawk": "1200",
    }]


async def _fake_adsb_fail(client, url, limit):
    raise httpx.ConnectError("provider down", request=httpx.Request("GET", url))


async def _fake_get_never(self, url, **kwargs):
    raise AssertionError(f"OpenSky must not be called when an earlier provider succeeds: {url}")


async def test_aviation_adsb_first_no_opensky_call(monkeypatch):
    monkeypatch.setattr(aviation_mod, "_adsb_compatible_aircraft", _fake_adsb_ok)
    monkeypatch.setattr(httpx.AsyncClient, "get", _fake_get_never)
    monkeypatch.setattr(aviation_mod.settings, "AVIATION_EDGE_API_KEY", "")
    result = await live_aircraft(limit=150, current_user={"email": "t@t", "role": "PUBLIC"})
    assert result["source"] == "ADSB.lol"
    assert result["count"] == 1


async def test_aviation_falls_back_to_avioadsb_not_opensky(monkeypatch):
    async def _fake(client, url, limit):
        if "adsb.lol" in url:
            raise httpx.ConnectError("adsb down", request=httpx.Request("GET", url))
        return await _fake_adsb_ok(client, url, limit)

    monkeypatch.setattr(aviation_mod, "_adsb_compatible_aircraft", _fake)
    monkeypatch.setattr(httpx.AsyncClient, "get", _fake_get_never)
    monkeypatch.setattr(aviation_mod.settings, "AVIATION_EDGE_API_KEY", "")
    result = await live_aircraft(limit=150, current_user={"email": "t@t", "role": "PUBLIC"})
    assert result["source"] == "AvioADSB"
    assert result["count"] == 1


async def test_aviation_opensky_only_after_both_adsb_providers_fail(monkeypatch):
    monkeypatch.setattr(aviation_mod, "_adsb_compatible_aircraft", _fake_adsb_fail)

    async def _fake_opensky(self, url, **kwargs):
        assert "opensky-network.org" in url
        return _FakeResponse({"states": [[
            "abc123", "IGO123  ", "India", 1760000000, 1760000000,
            77.1, 28.5, 10000.0, False, 200.0, 90.0, 0.0, None, None,
        ]]})

    monkeypatch.setattr(httpx.AsyncClient, "get", _fake_opensky)
    monkeypatch.setattr(aviation_mod.settings, "AVIATION_EDGE_API_KEY", "")
    result = await live_aircraft(limit=150, current_user={"email": "t@t", "role": "PUBLIC"})
    assert result["source"] == "OpenSky"
    assert result["count"] == 1
    assert result["aircraft"][0]["callsign"] == "IGO123"


# ── 8. Gov honest degradation ─────────────────────────────────────────────────

async def test_gov_fetchers_report_not_configured_without_credentials(db, monkeypatch):
    monkeypatch.setattr("app.services.gov_fetcher.settings.DATAGOV_API_KEY", "")
    monkeypatch.setattr("app.services.gov_fetcher.settings.DATAGOV_AVIATION_DATASET_ID", "")
    monkeypatch.setattr("app.services.gov_fetcher.settings.MOSPI_API_EMAIL", "")
    monkeypatch.setattr("app.services.gov_fetcher.settings.MOSPI_API_PASSWORD", "")
    dgca = await fetch_datagov_aviation(db)
    assert dgca["status"] == "NOT_CONFIGURED"
    assert dgca["records"] == 0
    mospi = await fetch_mospi_cpi(db)
    assert mospi["status"] == "NOT_CONFIGURED"
    assert mospi["records"] == 0
    assert "not configured" in mospi["reason"]
