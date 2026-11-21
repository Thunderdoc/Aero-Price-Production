"""
Forecast-origin tests: forecasts train on the same index-eligible origins
as the Jevons index (REAL / OFFICIAL / PUBLIC_INTERFACE) and never on
SANDBOX_TEST / GENERATED_TEST data.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.models.fare import FareObservation
from app.services.forecast_engine import forecast_route


async def _seed_series(db, origin, days=15, base_fare=5000.0):
    """Seed one observation per day for DEL-BOM / T+7 / ECONOMY."""
    now = datetime.now(timezone.utc)
    for i in range(days):
        collected = now - timedelta(days=days - 1 - i)
        db.add(
            FareObservation(
                collection_run_id=f"forecast-seed-{origin}",
                origin="DEL",
                destination="BOM",
                route="DEL-BOM",
                airline="IndiGo",
                travel_date=collected.date().isoformat(),
                advance_days=7,
                base_fare=base_fare - 500.0,
                taxes=500.0,
                fees=0.0,
                total_fare=base_fare + i * 10.0,
                data_origin=origin,
                source="fast-flights" if origin == "PUBLIC_INTERFACE" else "amadeus",
                is_valid=True,
                collected_at=collected,
            )
        )
    await db.flush()


@pytest.mark.asyncio
async def test_forecast_trains_on_public_interface_fares(db):
    await _seed_series(db, "PUBLIC_INTERFACE")
    result = await forecast_route(db, "DEL-BOM", advance_days=7)
    assert result["status"] == "FORECAST"
    assert result["metrics"]["n_obs"] == 15
    assert len(result["forecasts"]) == 3


@pytest.mark.asyncio
async def test_forecast_ignores_sandbox_test_fares(db):
    await _seed_series(db, "SANDBOX_TEST")
    result = await forecast_route(db, "DEL-BOM", advance_days=7)
    assert result["status"] == "INSUFFICIENT_DATA"
    assert result["n_obs"] == 0
