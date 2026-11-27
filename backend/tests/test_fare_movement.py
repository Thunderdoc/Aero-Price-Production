"""
Fare-movement regression tests (follow-up round 3, 24 Nov 2026).

Pins calculate_fare_movement after its rewrite to load only the rows the
comparison needs (the old shape loaded every stored observation into Python;
under a concurrent page-load burst that took 10–12 s and the browser's 12 s
client timeout aborted it, so the Overview showed "Comparison pending" on
reload even though the data was there).

Cases: correct medians/change across the latest two comparable days, the
comparable-pair search when the newest day has a route with no previous
data (that route lands in modelled_states, not in verified movement),
single-day data honestly reporting "a second collection is required", no
comparable pair reporting "a comparable second … is required", and
SANDBOX_TEST / invalid rows never creating a collection period.
"""
from datetime import date, datetime, timedelta, timezone

import pytest

from app.api.routes.dashboard import calculate_fare_movement
from app.models.fare import FareObservation
from app.processing.provenance import PUBLIC_INTERFACE, SANDBOX_TEST

UTC = timezone.utc


def _fare_row(route, total, collected_at, origin=PUBLIC_INTERFACE, is_valid=True):
    return FareObservation(
        collection_run_id="test-run",
        route=route, origin=route[:3], destination=route[4:], airline="IndiGo",
        travel_date=(date.today() + timedelta(days=7)).isoformat(),
        advance_days=7, total_fare=total, base_fare=total - 500.0,
        taxes=500.0, fees=0.0, currency="INR", cabin="ECONOMY",
        stops=0, data_origin=origin, source="stub-test",
        collected_at=collected_at, is_valid=is_valid,
        raw_hash=f"h-{route}-{total}-{collected_at.date()}",
    )


def _day(offset):
    return datetime.now(UTC).replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=offset)


async def test_movement_compares_latest_two_days_with_correct_medians(db):
    # Three days of data; the comparison must use the latest two.
    # DEL-BOM day -2 median 7601.5 -> day -1 median 7706.0 = +1.37%;
    # DEL-BLR day -2 median 11433.0 -> day -1 median 11510.5 = +0.68%.
    # (These mirror the live 23/24 Nov 2026 values.)
    day_old, day_prev, day_curr = _day(-3), _day(-2), _day(-1)
    db.add_all([
        _fare_row("DEL-BOM", 7000.0, day_old),
        _fare_row("DEL-BOM", 7600.0, day_prev),
        _fare_row("DEL-BOM", 7603.0, day_prev),
        _fare_row("DEL-BOM", 7700.0, day_curr),
        _fare_row("DEL-BOM", 7712.0, day_curr),
        _fare_row("DEL-BLR", 11000.0, day_old),
        _fare_row("DEL-BLR", 11400.0, day_prev),
        _fare_row("DEL-BLR", 11466.0, day_prev),
        _fare_row("DEL-BLR", 11500.0, day_curr),
        _fare_row("DEL-BLR", 11521.0, day_curr),
    ])
    await db.commit()
    result = await calculate_fare_movement(db)
    assert result["available"] is True
    assert result["previous_period"] == day_prev.date().isoformat()
    assert result["current_period"] == day_curr.date().isoformat()
    assert result["message"] is None
    by_route = {item["route"]: item for item in result["routes"]}
    assert by_route["DEL-BOM"]["previous_fare"] == pytest.approx(7601.5)
    assert by_route["DEL-BOM"]["current_fare"] == pytest.approx(7706.0)
    assert by_route["DEL-BOM"]["change_pct"] == pytest.approx(1.37, abs=0.01)
    assert by_route["DEL-BLR"]["change_pct"] == pytest.approx(0.68, abs=0.01)
    assert result["price_drops"] == 0


async def test_movement_new_route_on_latest_day_lands_in_modeled_states(db):
    # DEL-MAA exists only on the latest day: it has an honest current price
    # but no verified change, so it must NOT appear in routes — it appears
    # in modelled_states with provenance MODELED. The comparable pair is
    # still the latest two days (DEL-BOM spans both).
    day_prev, day_curr = _day(-2), _day(-1)
    db.add_all([
        _fare_row("DEL-BOM", 7600.0, day_prev),
        _fare_row("DEL-BOM", 7700.0, day_curr),
        _fare_row("DEL-MAA", 12000.0, day_curr),
        _fare_row("DEL-MAA", 12200.0, day_curr),
    ])
    await db.commit()
    result = await calculate_fare_movement(db)
    assert result["available"] is True
    assert result["current_period"] == day_curr.date().isoformat()
    assert [item["route"] for item in result["routes"]] == ["DEL-BOM"]
    assert "Tamil Nadu" in result["modeled_states"]
    assert result["modeled_states"]["Tamil Nadu"]["provenance"] == "MODELED"


async def test_movement_single_day_reports_second_collection_required(db):
    db.add_all([
        _fare_row("DEL-BOM", 7600.0, _day(-1)),
        _fare_row("DEL-BOM", 7700.0, _day(-1)),
    ])
    await db.commit()
    result = await calculate_fare_movement(db)
    assert result["available"] is False
    assert result["price_drops"] is None
    assert result["routes"] == []
    assert "second verified collection" in result["message"]


async def test_movement_no_comparable_pair_reports_comparable_required(db):
    # Two days exist, but no route spans both — there is no comparison.
    db.add_all([
        _fare_row("DEL-BOM", 7600.0, _day(-2)),
        _fare_row("DEL-BLR", 11400.0, _day(-1)),
    ])
    await db.commit()
    result = await calculate_fare_movement(db)
    assert result["available"] is False
    assert "comparable second" in result["message"]


async def test_movement_ignores_sandbox_and_invalid_rows(db):
    # A second "day" made only of SANDBOX_TEST rows (plus an invalid row)
    # must not create a collection period — the data is still single-day.
    db.add_all([
        _fare_row("DEL-BOM", 7600.0, _day(-1)),
        _fare_row("DEL-BOM", 7700.0, _day(-1)),
        _fare_row("DEL-BOM", 100.0, _day(-2), origin=SANDBOX_TEST),
        _fare_row("DEL-BOM", 200.0, _day(-2), is_valid=False),
    ])
    await db.commit()
    result = await calculate_fare_movement(db)
    assert result["available"] is False
    assert "second verified collection" in result["message"]
