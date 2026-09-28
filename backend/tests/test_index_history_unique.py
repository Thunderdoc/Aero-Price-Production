from datetime import datetime, timezone

import pytest

from app.api.routes.index import index_history, route_basket
from app.models.index import IndexObservation
from app.services.collector import ROUTE_BASKET


@pytest.mark.asyncio
async def test_index_history_returns_latest_publication_per_day(db):
    for identifier, period, value, hour in (
        ("old", "2026-09-27", 101.0, 8),
        ("new", "2026-09-27", 102.5, 10),
        ("prior", "2026-09-26", 100.0, 8),
    ):
        db.add(IndexObservation(
            id=identifier,
            publication_id=identifier,
            observation_period=period,
            calculation_ts=datetime(2026, 9, 27 if period.endswith("27") else 26, hour, tzinfo=timezone.utc),
            index_value=value,
            status="PUBLISHED",
            data_origin="DERIVED",
            route_count=12,
            observation_count=100,
        ))
    await db.commit()

    result = await index_history(limit=30, db=db, current_user={"role": "ANALYST"})
    assert result["count"] == 2
    assert [(row["period"], row["value"]) for row in result["observations"]] == [
        ("2026-09-27", 102.5),
        ("2026-09-26", 100.0),
    ]


@pytest.mark.asyncio
async def test_index_basket_reports_actual_collection_routes_and_weights():
    result = await route_basket(current_user={"role": "ANALYST"})
    assert [row["route"] for row in result["routes"]] == ROUTE_BASKET
    assert all(row["weight"] == 1.0 for row in result["routes"])
