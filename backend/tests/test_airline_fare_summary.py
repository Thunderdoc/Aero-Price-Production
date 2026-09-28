from datetime import datetime, timezone

import pytest

from app.api.routes.fares import airline_fare_summary, route_fare_summary
from app.models.fare import FareObservation


@pytest.mark.asyncio
async def test_airline_summary_uses_only_valid_real_economy_quotes(db):
    def fare(identifier, airline, route, amount, data_origin="REAL", cabin="ECONOMY", valid=True):
        origin, destination = route.split("-")
        return FareObservation(
            observation_id=identifier,
            collection_run_id="test-run",
            origin=origin,
            destination=destination,
            route=route,
            airline=airline,
            travel_date="2026-10-04",
            advance_days=7,
            collected_at=datetime(2026, 9, 27, 8, 0, tzinfo=timezone.utc),
            base_fare=amount,
            taxes=0,
            fees=0,
            total_fare=amount,
            currency="INR",
            cabin=cabin,
            source="test-source",
            data_origin=data_origin,
            is_valid=valid,
        )

    db.add_all([
        fare("one", "IndiGo", "DEL-BOM", 4000),
        fare("two", "IndiGo", "DEL-BOM", 6000),
        fare("three", "Air India", "DEL-BLR", 7000),
        fare("sandbox", "IndiGo", "DEL-BOM", 100, "SANDBOX_TEST"),
        fare("snapshot", "IndiGo", "DEL-BOM", 100, "HISTORICAL_SNAPSHOT"),
        fare("invalid", "IndiGo", "DEL-BOM", 100, valid=False),
        fare("business", "IndiGo", "DEL-BOM", 100, cabin="BUSINESS"),
    ])
    await db.commit()

    result = await airline_fare_summary(db=db, current_user={"role": "PUBLIC"})

    assert result["status"] == "STORED_OBSERVATIONS"
    assert result["total_observations"] == 3
    indigo = result["airlines"][0]
    assert indigo["name"] == "IndiGo"
    assert indigo["observations"] == 2
    assert indigo["routes"] == 1
    assert indigo["average_fare"] == 5000
    assert indigo["share_of_observed_quotes_pct"] == 66.67
    assert indigo["route_details"][0]["route"] == "DEL-BOM"
    assert indigo["booking_windows"][0]["advance_days"] == 7


@pytest.mark.asyncio
async def test_airline_summary_empty_database_has_no_fabricated_rows(db):
    result = await airline_fare_summary(db=db, current_user={"role": "PUBLIC"})
    assert result["status"] == "NO_DATA"
    assert result["total_observations"] == 0
    assert result["airlines"] == []


@pytest.mark.asyncio
async def test_route_summary_uses_latest_observation_day_for_map(db):
    for identifier, day, amount in (
        ("older", 26, 2000),
        ("newer-one", 27, 4000),
        ("newer-two", 27, 6000),
    ):
        db.add(FareObservation(
            observation_id=identifier,
            collection_run_id="run",
            origin="DEL",
            destination="BOM",
            route="DEL-BOM",
            airline="IndiGo",
            travel_date="2026-10-04",
            advance_days=7,
            collected_at=datetime(2026, 9, day, 8, tzinfo=timezone.utc),
            base_fare=amount,
            total_fare=amount,
            currency="INR",
            cabin="ECONOMY",
            source="fast-flights",
            data_origin="REAL",
            is_valid=True,
        ))
    await db.commit()

    result = await route_fare_summary("DEL-BOM", db=db, current_user={"role": "PUBLIC"})
    assert result["overall"]["median"] == 5000
    assert result["overall"]["count"] == 2
    assert result["overall"]["sample_period"] == "2026-09-27"
