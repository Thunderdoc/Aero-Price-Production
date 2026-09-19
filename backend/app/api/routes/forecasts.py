"""
Forecast API — statistical fare projections per route.
Requires ANALYST or ADMIN role.
Returns INSUFFICIENT_DATA when real observation count is below the minimum.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.auth import require_analyst
from app.services.forecast_engine import forecast_route, FORECAST_HORIZONS_DAYS, MIN_OBS_FOR_FORECAST

router = APIRouter()

VALID_CABINS = {"ECONOMY", "BUSINESS", "FIRST"}
VALID_WINDOWS = {1, 7, 15, 30, 45}


@router.get("/forecast/{route}")
async def get_forecast(
    route: str,
    advance_days: int = Query(default=7, description="Advance-purchase window (1,7,15,30,45)"),
    cabin: str = Query(default="ECONOMY"),
    lookback_days: int = Query(default=90, ge=7, le=365),
    current_user=Depends(require_analyst),
    db: AsyncSession = Depends(get_db),
):
    """
    Return a fare forecast for a route/advance-window/cabin bucket.
    Produces INSUFFICIENT_DATA status when < 14 real daily observations exist.
    """
    route = route.upper()
    cabin = cabin.upper()
    if cabin not in VALID_CABINS:
        cabin = "ECONOMY"
    if advance_days not in VALID_WINDOWS:
        advance_days = 7

    return await forecast_route(db, route, advance_days, cabin, lookback_days)


@router.get("/forecasts/metadata")
async def forecast_metadata(
    current_user=Depends(require_analyst),
):
    return {
        "model": "Holt-Winters Double Exponential Smoothing",
        "model_version": "holt_winters_v1",
        "min_observations": MIN_OBS_FOR_FORECAST,
        "horizons_days": FORECAST_HORIZONS_DAYS,
        "valid_advance_windows": sorted(VALID_WINDOWS),
        "data_origin": "DERIVED",
        "disclaimer": (
            "Forecasts are produced from real fare observations only. "
            "When fewer than " + str(MIN_OBS_FOR_FORECAST) + " daily observations exist, "
            "the system returns INSUFFICIENT_DATA rather than a speculative forecast."
        ),
    }
