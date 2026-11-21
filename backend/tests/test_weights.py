"""
Weights-config tests: equal weights today, DGCA weights unavailable, and the
weighted-Jevons engine behaviour (normalised weights; identical to unweighted
Jevons under equal weights).
"""
import math
from datetime import datetime

import pytest
from sqlalchemy import select

from app.config.weights import (
    DGCA_ROUTE_TRAFFIC,
    DGCA_WEIGHTS_STATUS,
    ROUTE_WEIGHTS,
    WEIGHT_SOURCE,
    get_route_weights,
    get_weight,
    weights_metadata,
)
from app.models.fare import FareObservation
from app.services.collector import ROUTE_BASKET as COLLECTION_ROUTE_BASKET
from app.services.index_engine import calculate_index


def test_weights_are_equal_today():
    assert WEIGHT_SOURCE == "EQUAL_CONFIGURED"
    assert len(ROUTE_WEIGHTS) == len(COLLECTION_ROUTE_BASKET)
    assert set(ROUTE_WEIGHTS) == set(COLLECTION_ROUTE_BASKET)
    assert all(w == 1.0 for w in ROUTE_WEIGHTS.values())


def test_dgca_weights_unavailable_and_documented():
    assert DGCA_WEIGHTS_STATUS == "UNAVAILABLE"
    assert DGCA_ROUTE_TRAFFIC == {}
    metadata = weights_metadata()
    assert metadata["dgca_weights_status"] == "UNAVAILABLE"
    assert "No DGCA traffic weights are applied" in metadata["weight_source_note"]


def test_get_route_weights_shape():
    rows = get_route_weights()
    assert len(rows) == len(COLLECTION_ROUTE_BASKET)
    for row in rows:
        assert row["weight"] == 1.0
        assert row["weight_source"] == "EQUAL_CONFIGURED"
    assert get_weight("DEL-BOM") == 1.0
    assert get_weight("del-bom") == 1.0


async def _seed_day(db, day, fares_by_route):
    """Seed 3 observations per route on one collection day (test fixtures)."""
    for route, fare in fares_by_route.items():
        origin, destination = route.split("-")
        for i in range(3):
            db.add(
                FareObservation(
                    collection_run_id=f"seed-{day}",
                    origin=origin,
                    destination=destination,
                    route=route,
                    airline="IndiGo",
                    travel_date=day,
                    advance_days=7,
                    base_fare=fare - 500.0,
                    taxes=500.0,
                    fees=0.0,
                    total_fare=fare + i,  # median is the middle value
                    data_origin="REAL",
                    source="manual-collection",
                    is_valid=True,
                    collected_at=datetime.fromisoformat(f"{day}T10:00:00"),
                )
            )
    await db.flush()


@pytest.mark.asyncio
async def test_weighted_jevons_matches_unweighted_under_equal_weights(db):
    routes = COLLECTION_ROUTE_BASKET[:12]
    base = {r: 5000.0 for r in routes}
    current = {r: 5500.0 for r in routes}
    await _seed_day(db, "2026-11-01", base)
    await _seed_day(db, "2026-11-02", current)
    result = await calculate_index(
        db, "2026-11-02", [{"route": r, "weight": 1.0} for r in routes]
    )
    assert result["status"] == "CALCULATED"
    # Every ratio is 5501/5001; equal weights → plain Jevons.
    expected = round((5501 / 5001) * 100, 2)
    assert result["index_value"] == expected
    assert result["base_period"] == "2026-11-01"
    assert result["origins_included"] == ["REAL", "OFFICIAL", "PUBLIC_INTERFACE"]


@pytest.mark.asyncio
async def test_weighted_jevons_uses_normalised_weights(db):
    routes = COLLECTION_ROUTE_BASKET[:12]
    base = {r: 5000.0 for r in routes}
    current = dict(base)
    current[routes[0]] = 10000.0  # one corridor doubles; the rest are flat
    await _seed_day(db, "2026-11-01", base)
    await _seed_day(db, "2026-11-02", current)
    # Weight the doubled corridor at 9.0, the other eleven at 1.0 each.
    weighted = [{"route": r, "weight": 9.0 if r == routes[0] else 1.0} for r in routes]
    result = await calculate_index(db, "2026-11-02", weighted)
    assert result["status"] == "CALCULATED"
    total = 9.0 + 11.0
    expected = round(math.exp((9.0 / total) * math.log(10001 / 5001)) * 100, 2)
    assert result["index_value"] == expected
    # And it must differ from the equal-weight answer (weights must matter).
    equal = await calculate_index(
        db, "2026-11-02", [{"route": r, "weight": 1.0} for r in routes]
    )
    assert equal["index_value"] != result["index_value"]


@pytest.mark.asyncio
async def test_public_interface_fares_feed_the_index(db):
    """The disclosed demo methodology: PUBLIC_INTERFACE (scraped) fares are
    index-eligible; the index must publish from them alone."""
    routes = COLLECTION_ROUTE_BASKET[:12]
    for day, fare in (("2026-11-01", 5000.0), ("2026-11-02", 5500.0)):
        for route in routes:
            origin, destination = route.split("-")
            for i in range(3):
                db.add(
                    FareObservation(
                        collection_run_id=f"seed-{day}",
                        origin=origin,
                        destination=destination,
                        route=route,
                        airline="IndiGo",
                        travel_date=day,
                        advance_days=7,
                        base_fare=fare - 500.0,
                        taxes=500.0,
                        fees=0.0,
                        total_fare=fare + i,
                        data_origin="PUBLIC_INTERFACE",
                        source="fast-flights",
                        is_valid=True,
                        collected_at=datetime.fromisoformat(f"{day}T10:00:00"),
                    )
                )
    await db.flush()
    result = await calculate_index(
        db, "2026-11-02", [{"route": r, "weight": 1.0} for r in routes]
    )
    assert result["status"] == "CALCULATED"
    assert result["n"] == 12


@pytest.mark.asyncio
async def test_sandbox_fares_never_feed_the_index(db):
    routes = COLLECTION_ROUTE_BASKET[:12]
    for day, fare in (("2026-11-01", 5000.0), ("2026-11-02", 5500.0)):
        for route in routes:
            origin, destination = route.split("-")
            for i in range(3):
                db.add(
                    FareObservation(
                        collection_run_id=f"seed-{day}",
                        origin=origin,
                        destination=destination,
                        route=route,
                        airline="Duffel Airways",
                        travel_date=day,
                        advance_days=7,
                        base_fare=fare - 500.0,
                        taxes=500.0,
                        fees=0.0,
                        total_fare=fare + i,
                        data_origin="SANDBOX_TEST",
                        source="amadeus",
                        is_valid=True,
                        collected_at=datetime.fromisoformat(f"{day}T10:00:00"),
                    )
                )
    await db.flush()
    result = await calculate_index(
        db, "2026-11-02", [{"route": r, "weight": 1.0} for r in routes]
    )
    assert result["status"] == "INSUFFICIENT_DATA"
    assert result["n"] == 0
