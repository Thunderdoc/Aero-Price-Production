"""Live-fare fallback: /api/fares/live tries fast-flights first and falls
back to the scrapling adapter only on a primary FAILED/NO_DATA (or raise).

Google throttles fast-flights after the daily sweep volume, so a fast
FAILED ("no flights found; received error") usually means throttling, not
"no flights exist". The fallback must never run on a primary success (a
double scrape would hammer Google harder), and a both-fail outcome must
report the primary failure honestly — never fabricated fares.

All adapter calls are mocked; no live Google call happens in these tests.
"""

from datetime import date, timedelta

import pytest

from app.api.routes import fares as fares_mod
from app.api.routes.fares import live_fares
from app.collectors.base import CollectionResult, FareRecord

TRAVEL = (date.today() + timedelta(days=7)).isoformat()


def make_record(**overrides):
    """A valid PUBLIC_INTERFACE fare record."""
    defaults = dict(
        origin="DEL", destination="BOM", route="DEL-BOM", airline="IndiGo",
        travel_date=TRAVEL, advance_days=7, base_fare=4000.0, taxes=500.0,
        fees=0.0, total_fare=4500.0, cabin="ECONOMY", stops=0,
        data_origin="PUBLIC_INTERFACE", source="stub-test",
    )
    defaults.update(overrides)
    return FareRecord(**defaults)


def fake_adapter_class(source_id, result=None, exc=None, calls=None):
    """An adapter class whose collect() returns `result` or raises `exc`,
    recording every call's (route, travel_date, advance_days)."""

    class FakeAdapter:
        def __init__(self):
            pass

        async def collect(self, route, travel_date, advance_days, run_id):
            calls.append((route, travel_date, advance_days))
            if exc is not None:
                raise exc
            return result

    FakeAdapter.source_id = source_id
    return FakeAdapter


def ff_result(status, records=None, error=None):
    return CollectionResult(
        "fast-flights", "DEL-BOM", TRAVEL, 7, status,
        records=records or [], error=error,
    )


def scrap_result(status, records=None, error=None):
    return CollectionResult(
        "scrapling-google-flights", "DEL-BOM", TRAVEL, 7, status,
        records=records or [], error=error,
    )


def install(monkeypatch, ff, scrap):
    monkeypatch.setattr(fares_mod, "FastFlightsAdapter", ff)
    monkeypatch.setattr(fares_mod, "ScraplingGoogleFlightsAdapter", scrap)


async def call_live(db):
    return await live_fares(
        route="DEL-BOM", travel_date=TRAVEL, db=db,
        current_user={"role": "ANALYST"},
    )


async def test_fast_flights_success_never_calls_scrapling(db, monkeypatch):
    """Primary success: scrapling is never invoked (no double scrape)."""
    ff_calls, scrap_calls = [], []
    install(
        monkeypatch,
        fake_adapter_class(
            "fast-flights",
            result=ff_result("SUCCESS", records=[make_record(), make_record(airline="Air India", total_fare=5100.0)]),
            calls=ff_calls,
        ),
        fake_adapter_class("scrapling-google-flights", result=scrap_result("SUCCESS", records=[make_record()]), calls=scrap_calls),
    )
    response = await call_live(db)
    assert response["status"] == "SUCCESS"
    assert response["source"] == "fast-flights"
    assert response["data_origin"] == "PUBLIC_INTERFACE"
    assert len(response["observations"]) == 2
    assert response["error"] is None
    assert len(ff_calls) == 1
    assert scrap_calls == []


async def test_fast_flights_failed_falls_back_to_scrapling(db, monkeypatch):
    """Primary FAILED (throttling): the fallback serves the fares, with the
    same route/travel_date/advance."""
    ff_calls, scrap_calls = [], []
    install(
        monkeypatch,
        fake_adapter_class(
            "fast-flights",
            result=ff_result("FAILED", error="no flights found; received error"),
            calls=ff_calls,
        ),
        fake_adapter_class(
            "scrapling-google-flights",
            result=scrap_result("SUCCESS", records=[make_record(airline="SpiceJet", total_fare=4200.0)]),
            calls=scrap_calls,
        ),
    )
    response = await call_live(db)
    assert response["status"] == "SUCCESS"
    assert response["source"] == "scrapling-google-flights"
    assert response["data_origin"] == "PUBLIC_INTERFACE"
    assert len(response["observations"]) == 1
    assert response["observations"][0]["airline"] == "SpiceJet"
    assert response["error"] is None
    assert scrap_calls == [("DEL-BOM", TRAVEL, 7)]


async def test_fast_flights_no_data_falls_back_to_scrapling(db, monkeypatch):
    """Primary NO_DATA also triggers the fallback."""
    scrap_calls = []
    install(
        monkeypatch,
        fake_adapter_class("fast-flights", result=ff_result("NO_DATA"), calls=[]),
        fake_adapter_class(
            "scrapling-google-flights",
            result=scrap_result("SUCCESS", records=[make_record()]),
            calls=scrap_calls,
        ),
    )
    response = await call_live(db)
    assert response["status"] == "SUCCESS"
    assert response["source"] == "scrapling-google-flights"
    assert len(response["observations"]) == 1
    assert len(scrap_calls) == 1


async def test_fast_flights_raising_falls_back_to_scrapling(db, monkeypatch):
    """A raised primary adapter must not 500 the endpoint — the fallback
    serves the fares instead."""
    install(
        monkeypatch,
        fake_adapter_class("fast-flights", exc=RuntimeError("library exploded"), calls=[]),
        fake_adapter_class(
            "scrapling-google-flights",
            result=scrap_result("SUCCESS", records=[make_record()]),
            calls=[],
        ),
    )
    response = await call_live(db)
    assert response["status"] == "SUCCESS"
    assert response["source"] == "scrapling-google-flights"
    assert len(response["observations"]) == 1


async def test_both_fail_returns_honest_failed_with_fast_flights_error(db, monkeypatch):
    """Both attempts fail: FAILED with the primary (fast-flights) error —
    no fabricated fares, no silent empty success."""
    install(
        monkeypatch,
        fake_adapter_class(
            "fast-flights",
            result=ff_result("FAILED", error="no flights found; received error"),
            calls=[],
        ),
        fake_adapter_class(
            "scrapling-google-flights",
            result=scrap_result("FAILED", error="scrapling fetch failed"),
            calls=[],
        ),
    )
    response = await call_live(db)
    assert response["status"] == "FAILED"
    assert response["provider_status"] == "FAILED"
    assert response["source"] == "fast-flights"
    assert response["error"] == "no flights found; received error"
    assert response["observations"] == []
    assert response["data_origin"] == "NO_DATA"


async def test_both_empty_stays_no_data(db, monkeypatch):
    """Primary NO_DATA + fallback with no fares: both sources agree there
    are no fares, so the honest status stays NO_DATA (not FAILED); the
    fallback error only fills the blank message."""
    install(
        monkeypatch,
        fake_adapter_class("fast-flights", result=ff_result("NO_DATA"), calls=[]),
        fake_adapter_class(
            "scrapling-google-flights",
            result=scrap_result("PARTIAL", error="page loaded, no fares found"),
            calls=[],
        ),
    )
    response = await call_live(db)
    assert response["status"] == "NO_DATA"
    assert response["error"] == "page loaded, no fares found"
    assert response["observations"] == []


async def test_scrapling_raising_reports_primary_failure(db, monkeypatch):
    """Fallback raising too: the primary FAILED is still reported honestly."""
    install(
        monkeypatch,
        fake_adapter_class(
            "fast-flights",
            result=ff_result("FAILED", error="no flights found; received error"),
            calls=[],
        ),
        fake_adapter_class("scrapling-google-flights", exc=RuntimeError("stealth browser down"), calls=[]),
    )
    response = await call_live(db)
    assert response["status"] == "FAILED"
    assert response["error"] == "no flights found; received error"
    assert response["observations"] == []
