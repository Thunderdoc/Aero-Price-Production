"""
Regression tests for the working-state sweep fixes in routes_basket.py:

- M1 (P0): has_data must mean "has any stored observations", not "collected
  in the last 7 days" — the live DB's newest data is weeks old, so the 7-day
  gate marked every route NO_DATA and the map drew nothing.
- M5 (P1): route medians must come from the latest COLLECTION day (the
  dashboard approach), with a minimum-sample floor that falls back to a wider
  recent window, and the sample count must be reported honestly.
- S3 (P1): /routes/summary must aggregate correctly over the chosen window
  (correctness is the testable part; the SQL aggregation is structural).
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.api.routes.routes_basket import list_routes, route_summaries
from app.models.fare import FareObservation

UTC = timezone.utc


def _fare(identifier, route, amount, collected_at, travel_date="2026-10-05",
          data_origin="PUBLIC_INTERFACE", cabin="ECONOMY", currency="INR",
          valid=True):
    origin, destination = route.split("-")
    return FareObservation(
        observation_id=identifier,
        collection_run_id="test-run",
        origin=origin,
        destination=destination,
        route=route,
        airline="IndiGo",
        travel_date=travel_date,
        advance_days=7,
        collected_at=collected_at,
        base_fare=amount,
        taxes=0,
        fees=0,
        total_fare=amount,
        currency=currency,
        cabin=cabin,
        source="test-source",
        data_origin=data_origin,
        is_valid=valid,
    )


def _by_route(result):
    return {item["route"]: item for item in result["routes"]}


# --- M1 ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_m1_route_with_only_old_observations_still_has_data(db):
    """A route whose observations are all older than 7 days must still report
    has_data=True / ACTIVE — the old 7-day gate marked it NO_DATA."""
    old = datetime.now(UTC) - timedelta(days=60)
    fresh = datetime.now(UTC) - timedelta(hours=2)
    db.add_all([
        _fare("old-1", "DEL-BOM", 4000, old),
        _fare("old-2", "DEL-BOM", 5000, old),
        _fare("old-3", "DEL-BOM", 6000, old),
        _fare("old-4", "DEL-BOM", 7000, old),
        _fare("old-5", "DEL-BOM", 8000, old),
        _fare("fresh-1", "DEL-BLR", 4000, fresh),
        _fare("fresh-2", "DEL-BLR", 5000, fresh),
        _fare("fresh-3", "DEL-BLR", 6000, fresh),
    ])
    await db.commit()

    result = await list_routes(db=db)
    routes = _by_route(result)

    # Old-data route: data exists, so it is ACTIVE — even though nothing was
    # collected in the last 7 days.
    assert routes["DEL-BOM"]["has_data"] is True
    assert routes["DEL-BOM"]["status"] == "ACTIVE"
    assert routes["DEL-BOM"]["observations_7d"] == 0
    assert routes["DEL-BOM"]["observations_total"] == 5
    # Fresh route: both counts agree.
    assert routes["DEL-BLR"]["has_data"] is True
    assert routes["DEL-BLR"]["status"] == "ACTIVE"
    assert routes["DEL-BLR"]["observations_7d"] == 3
    assert routes["DEL-BLR"]["observations_total"] == 3
    # Route with no observations at all stays NO_DATA.
    assert routes["BOM-BLR"]["has_data"] is False
    assert routes["BOM-BLR"]["status"] == "NO_DATA"
    assert routes["BOM-BLR"]["observations_7d"] == 0
    assert routes["BOM-BLR"]["observations_total"] == 0


@pytest.mark.asyncio
async def test_m1_summary_last_collected_at_shows_the_old_date(db):
    """Staleness is surfaced via last_collected_at, not by hiding the route:
    the summary still exists for an old-data route and reports the old date."""
    old = datetime(2026, 9, 28, 8, 30, tzinfo=UTC)
    db.add_all([
        _fare("old-1", "DEL-BOM", 4000, old),
        _fare("old-2", "DEL-BOM", 6000, old),
    ])
    await db.commit()

    result = await route_summaries(db=db)
    summary = result["summaries"]["DEL-BOM"]

    assert summary["last_collected_at"].startswith("2026-09-28")
    assert summary["sample_period"] == "2026-09-28"
    assert summary["median"] == 5000


# --- M5 ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_m5_median_uses_latest_collection_day_not_travel_date(db):
    """The median must come from the latest COLLECTION day. The old code took
    the latest travel_date bucket — here the older collection day holds the
    later travel dates, so the old code would return 5000, not 9000."""
    day1 = datetime(2026, 9, 27, 8, 0, tzinfo=UTC)  # older collection, later travel dates
    day2 = datetime(2026, 9, 28, 8, 0, tzinfo=UTC)  # latest collection, earlier travel dates
    db.add_all(
        [_fare(f"d1-{i}", "DEL-BOM", 5000, day1, travel_date="2026-10-05") for i in range(10)]
        + [_fare(f"d2-{i}", "DEL-BOM", 9000, day2, travel_date="2026-10-01") for i in range(10)]
    )
    await db.commit()

    result = await route_summaries(db=db)
    summary = result["summaries"]["DEL-BOM"]

    assert summary["median"] == 9000
    assert summary["min"] == 9000
    assert summary["max"] == 9000
    assert summary["count"] == 10
    assert summary["sample_count"] == 10
    assert summary["sample_period"] == "2026-09-28"
    assert summary["sample_window_days"] == 1
    assert summary["sample_period_start"] == "2026-09-28"


@pytest.mark.asyncio
async def test_m5_thin_latest_day_falls_back_to_seven_day_window(db):
    """CCU-IMF case: 2 quotes on the latest collection day must NOT price the
    route alone — the median falls back to the 7-day window ending on that
    day, and the window is reported honestly."""
    latest = datetime(2026, 9, 28, 8, 0, tzinfo=UTC)
    earlier = datetime(2026, 9, 25, 8, 0, tzinfo=UTC)
    older = datetime(2026, 9, 26, 8, 0, tzinfo=UTC)
    too_old = datetime(2026, 9, 20, 8, 0, tzinfo=UTC)  # outside the 7-day window
    db.add_all([
        _fare("thin-1", "CCU-IMF", 10000, latest, travel_date="2026-10-10"),
        _fare("thin-2", "CCU-IMF", 11000, latest, travel_date="2026-10-10"),
        _fare("w1", "CCU-IMF", 4000, earlier, travel_date="2026-10-05"),
        _fare("w2", "CCU-IMF", 4200, earlier, travel_date="2026-10-05"),
        _fare("w3", "CCU-IMF", 4400, earlier, travel_date="2026-10-05"),
        _fare("w4", "CCU-IMF", 4600, earlier, travel_date="2026-10-05"),
        _fare("w5", "CCU-IMF", 4800, older, travel_date="2026-10-05"),
        _fare("w6", "CCU-IMF", 5000, older, travel_date="2026-10-05"),
        _fare("w7", "CCU-IMF", 5200, older, travel_date="2026-10-05"),
        _fare("w8", "CCU-IMF", 5400, older, travel_date="2026-10-05"),
        _fare("out", "CCU-IMF", 100, too_old, travel_date="2026-10-01"),
    ])
    await db.commit()

    result = await route_summaries(db=db)
    summary = result["summaries"]["CCU-IMF"]

    # Median over all 10 in-window quotes, not the 2-quote latest day (10500).
    assert summary["median"] == 4900
    assert summary["min"] == 4000  # the 100 quote is outside the window
    assert summary["max"] == 11000
    assert summary["count"] == 10
    assert summary["sample_count"] == 10
    assert summary["sample_period"] == "2026-09-28"
    assert summary["sample_period_start"] == "2026-09-22"
    assert summary["sample_window_days"] == 7


@pytest.mark.asyncio
async def test_m5_sample_floor_is_ten_quotes(db):
    """9 quotes on the latest day falls back; 10 stands alone. Pins the
    MIN_SAMPLES_LATEST_DAY = 10 boundary from both sides."""
    latest = datetime(2026, 9, 28, 8, 0, tzinfo=UTC)
    earlier = datetime(2026, 9, 27, 8, 0, tzinfo=UTC)
    db.add_all(
        [_fare(f"nine-{i}", "DEL-MAA", 8000, latest) for i in range(9)]
        + [_fare(f"nine-old-{i}", "DEL-MAA", 4000, earlier) for i in range(5)]
        + [_fare(f"ten-{i}", "DEL-HYD", 8000, latest) for i in range(10)]
        + [_fare(f"ten-old-{i}", "DEL-HYD", 4000, earlier) for i in range(5)]
    )
    await db.commit()

    result = await route_summaries(db=db)

    nine = result["summaries"]["DEL-MAA"]
    assert nine["sample_window_days"] == 7
    assert nine["sample_count"] == 14
    assert nine["median"] == 8000  # median of 5x4000 + 9x8000
    ten = result["summaries"]["DEL-HYD"]
    assert ten["sample_window_days"] == 1
    assert ten["sample_count"] == 10
    assert ten["median"] == 8000


# --- S3 ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_s3_summary_aggregates_only_valid_live_economy_inr_quotes(db):
    """Aggregates must count exactly the valid live ECONOMY/INR quotes in the
    chosen window — sandbox, historical, invalid, business and non-INR rows
    are excluded, and a route with only such rows has no summary."""
    day = datetime(2026, 9, 28, 8, 0, tzinfo=UTC)
    db.add_all([
        _fare("v1", "DEL-HYD", 3000, day),
        _fare("v2", "DEL-HYD", 5000, day),
        _fare("v3", "DEL-HYD", 7000, day),
        _fare("sandbox", "DEL-HYD", 100, day, data_origin="SANDBOX_TEST"),
        _fare("historical", "DEL-HYD", 100, day, data_origin="HISTORICAL_PUBLIC"),
        _fare("invalid", "DEL-HYD", 100, day, valid=False),
        _fare("business", "DEL-HYD", 100, day, cabin="BUSINESS"),
        _fare("usd", "DEL-HYD", 100, day, currency="USD"),
        _fare("only-bad", "DEL-CCU", 100, day, data_origin="SANDBOX_TEST"),
    ])
    await db.commit()

    result = await route_summaries(db=db)

    summary = result["summaries"]["DEL-HYD"]
    assert summary["median"] == 5000
    assert summary["min"] == 3000
    assert summary["max"] == 7000
    assert summary["count"] == 3
    assert summary["sample_count"] == 3
    assert "DEL-CCU" not in result["summaries"]


@pytest.mark.asyncio
async def test_s3_summary_empty_database_returns_no_summaries(db):
    result = await route_summaries(db=db)
    assert result["summaries"] == {}
    assert "timestamp" in result
