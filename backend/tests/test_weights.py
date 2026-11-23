"""
Weights-config tests: AAI gravity-model weights today, DGCA weights still
unavailable, and the weighted-Jevons engine behaviour (normalised weights).
"""
import csv
import math
from datetime import datetime
from pathlib import Path

import pytest
from sqlalchemy import select

from app.config.weights import (
    AAI_TRAFFIC_PERIOD,
    DGCA_ROUTE_TRAFFIC,
    DGCA_WEIGHTS_STATUS,
    ROUTE_WEIGHTS,
    WEIGHT_SOURCE,
    WEIGHTS_FALLBACK_ACTIVE,
    _aai_data_path,
    compute_gravity_weights,
    get_route_weights,
    get_weight,
    load_aai_airport_traffic,
    weights_metadata,
)
from app.models.fare import FareObservation
from app.services.collector import ROUTE_BASKET as COLLECTION_ROUTE_BASKET
from app.services.index_engine import calculate_index


def test_weights_are_aai_gravity_and_sum_to_one():
    assert WEIGHT_SOURCE == "AAI_GRAVITY"
    assert WEIGHTS_FALLBACK_ACTIVE is False
    assert AAI_TRAFFIC_PERIOD == "2026-09"
    assert len(ROUTE_WEIGHTS) == len(COLLECTION_ROUTE_BASKET)
    assert set(ROUTE_WEIGHTS) == set(COLLECTION_ROUTE_BASKET)
    assert all(w > 0 for w in ROUTE_WEIGHTS.values())
    assert math.isclose(sum(ROUTE_WEIGHTS.values()), 1.0, rel_tol=1e-9)


def test_weights_derive_from_the_aai_file():
    """Weights must come from the shipped AAI CSV — recompute them here from
    the file and compare, so hardcoded numbers in code fail this test."""
    traffic = load_aai_airport_traffic()
    assert len(traffic) == 12  # one row per basket airport
    expected = compute_gravity_weights(traffic, COLLECTION_ROUTE_BASKET)
    assert set(expected) == set(ROUTE_WEIGHTS)
    for route, weight in expected.items():
        assert math.isclose(ROUTE_WEIGHTS[route], weight, rel_tol=1e-9)


def test_pinned_aai_values():
    """Pin the AAI September 2026 figures, so a silent edit of the data file
    (or a wrong month) fails loudly. Source: AAI Traffic News, Sep 2026,
    Annexure-III B, 'For The Month' column."""
    traffic = load_aai_airport_traffic()
    assert traffic["DEL"] == 4256929
    assert traffic["BOM"] == 2777538
    assert traffic["BLR"] == 2705725
    assert traffic["IMF"] == 95579
    # And the weights those figures produce (rounded, stable to 4 dp).
    assert round(ROUTE_WEIGHTS["DEL-BOM"], 4) == 0.0969
    assert round(ROUTE_WEIGHTS["CCU-IMF"], 4) == 0.0095


def test_biggest_route_outweighs_smallest():
    assert ROUTE_WEIGHTS["DEL-BOM"] == max(ROUTE_WEIGHTS.values())
    assert ROUTE_WEIGHTS["CCU-IMF"] == min(ROUTE_WEIGHTS.values())
    assert ROUTE_WEIGHTS["DEL-BOM"] > 10 * ROUTE_WEIGHTS["CCU-IMF"]
    # Symmetric routes share a weight (gravity is symmetric in endpoints).
    assert ROUTE_WEIGHTS["DEL-MAA"] == ROUTE_WEIGHTS["MAA-DEL"]


def test_compute_gravity_weights_formula():
    traffic = {"AAA": 10000, "BBB": 40000, "CCC": 100}
    weights = compute_gravity_weights(traffic, ["AAA-BBB", "AAA-CCC"])
    # raw: sqrt(10000*40000)=20000, sqrt(10000*100)=1000; total 21000.
    assert math.isclose(weights["AAA-BBB"], 20000 / 21000, rel_tol=1e-9)
    assert math.isclose(weights["AAA-CCC"], 1000 / 21000, rel_tol=1e-9)
    assert math.isclose(sum(weights.values()), 1.0, rel_tol=1e-9)
    with pytest.raises(KeyError):
        compute_gravity_weights(traffic, ["AAA-ZZZ"])


def test_dgca_weights_unavailable_and_documented():
    assert DGCA_WEIGHTS_STATUS == "UNAVAILABLE"
    assert DGCA_ROUTE_TRAFFIC == {}
    metadata = weights_metadata()
    assert metadata["dgca_weights_status"] == "UNAVAILABLE"
    assert metadata["weight_source"] == "AAI_GRAVITY"
    assert "gravity model" in metadata["weight_source_note"]
    assert "DGCA route-level data remains unavailable" in metadata["weight_source_note"]
    assert "not DGCA weights" in metadata["dgca_weights_note"]


def test_get_route_weights_shape():
    rows = get_route_weights()
    assert len(rows) == len(COLLECTION_ROUTE_BASKET)
    for row in rows:
        assert row["weight"] == ROUTE_WEIGHTS[row["route"]]
        assert row["weight_source"] == "AAI_GRAVITY"
    assert get_weight("DEL-BOM") == ROUTE_WEIGHTS["DEL-BOM"]
    assert get_weight("del-bom") == ROUTE_WEIGHTS["DEL-BOM"]
    # Unknown routes get the equal share, never a 1.0 that would dwarf the
    # normalised basket weights.
    assert get_weight("XXX-YYY") == pytest.approx(1.0 / len(ROUTE_WEIGHTS))


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

# ── Publish-path wiring (FIX-ONCE) ──────────────────────────────────────────
# The index-publication call sites must pass AAI gravity weights to
# publish_index — not hardcoded {"weight": 1.0} (the pre-wiring state).


async def test_finalize_publishes_with_gravity_weights(db, monkeypatch):
    """finalize_collection_day (the live Vercel-cron path) publishes with
    gravity weights, not equal 1.0."""
    from app.services.collector import finalize_collection_day

    seen: dict = {}

    async def fake_publish(db_arg, period, routes):
        seen["routes"] = routes
        return {"status": "INSUFFICIENT_DATA", "index_value": None}

    monkeypatch.setattr("app.services.index_engine.publish_index", fake_publish)
    await finalize_collection_day(db)

    weights = {row["route"]: row["weight"] for row in seen["routes"]}
    assert set(weights) == set(COLLECTION_ROUTE_BASKET)
    assert math.isclose(sum(weights.values()), 1.0, rel_tol=1e-9)
    # Gravity, not equal: the biggest-airport pair outweighs the smallest.
    assert weights["DEL-BOM"] > weights["CCU-IMF"]
    assert weights["DEL-BOM"] == pytest.approx(0.0969, abs=1e-4)


async def test_job_publish_index_uses_gravity_weights(db, monkeypatch):
    """job_publish_index (the APScheduler path) publishes with gravity
    weights, not equal 1.0."""
    from app.scheduler.jobs import job_publish_index

    seen: dict = {}

    async def fake_publish(db_arg, period, routes):
        seen["routes"] = routes
        return {"status": "INSUFFICIENT_DATA", "index_value": None}

    class _FakeSessionCM:
        async def __aenter__(self):
            return db

        async def __aexit__(self, *exc):
            return False

    monkeypatch.setattr("app.scheduler.jobs.publish_index", fake_publish)
    monkeypatch.setattr(
        "app.scheduler.jobs.AsyncSessionLocal", lambda: _FakeSessionCM()
    )
    await job_publish_index()

    weights = {row["route"]: row["weight"] for row in seen["routes"]}
    assert set(weights) == set(COLLECTION_ROUTE_BASKET)
    assert math.isclose(sum(weights.values()), 1.0, rel_tol=1e-9)
    assert weights["DEL-BOM"] > weights["CCU-IMF"]
