"""
Simple fare forecasting engine.

Uses exponential smoothing (Holt-Winters) per route/cabin/advance_window bucket.
Only produces forecasts when n_observations >= MIN_OBS_FOR_FORECAST.
Never forecasts from GENERATED_TEST data.

Metrics stored: MAE, RMSE, MAPE on last holdout period.
Returns explicit INSUFFICIENT_DATA status when data is too sparse.
"""
import math
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from app.models.fare import FareObservation

logger = logging.getLogger(__name__)

MIN_OBS_FOR_FORECAST = 14
FORECAST_HORIZONS_DAYS = [2, 7, 14]
MODEL_VERSION = "holt_winters_v1"


def _mean(values: list[float]) -> float:
    return sum(values) / len(values)


def _mae(actual: list[float], predicted: list[float]) -> float:
    return _mean([abs(a - p) for a, p in zip(actual, predicted)])


def _rmse(actual: list[float], predicted: list[float]) -> float:
    return math.sqrt(_mean([(a - p) ** 2 for a, p in zip(actual, predicted)]))


def _mape(actual: list[float], predicted: list[float]) -> float:
    errors = [abs((a - p) / a) * 100 for a, p in zip(actual, predicted) if a != 0]
    return _mean(errors) if errors else 0.0


def _holt_winters_simple(series: list[float], alpha: float = 0.3, beta: float = 0.1) -> list[float]:
    """
    Double exponential smoothing (Holt's linear trend method).
    Returns smoothed series of same length.
    """
    if len(series) < 2:
        return series[:]
    level = series[0]
    trend = series[1] - series[0]
    smoothed = [level]
    for v in series[1:]:
        prev_level = level
        level = alpha * v + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend
        smoothed.append(level)
    return smoothed


def _forecast_next(series: list[float], horizon: int, alpha: float = 0.3, beta: float = 0.1) -> float:
    """
    Forecast `horizon` steps ahead using Holt's linear method.
    """
    if len(series) < 2:
        return series[-1]
    level = series[0]
    trend = series[1] - series[0]
    for v in series[1:]:
        prev_level = level
        level = alpha * v + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend
    return level + horizon * trend


async def _get_fare_series(
    db: AsyncSession,
    route: str,
    advance_days: int,
    cabin: str,
    lookback_days: int = 90,
) -> list[tuple[str, float]]:
    """
    Return (date_str, median_fare) tuples for the route/window/cabin bucket,
    ordered by date ascending. Real observations only.
    """
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    rows = await db.execute(
        select(
            func.date(FareObservation.collected_at).label("day"),
            func.avg(FareObservation.total_fare).label("avg_fare"),
        )
        .where(and_(
            FareObservation.route == route,
            FareObservation.advance_days == advance_days,
            FareObservation.cabin == cabin,
            FareObservation.data_origin.in_(["REAL", "OFFICIAL"]),
            FareObservation.is_valid == True,
            FareObservation.collected_at >= since,
        ))
        .group_by(func.date(FareObservation.collected_at))
        .order_by(func.date(FareObservation.collected_at))
    )
    return [(r.day, float(r.avg_fare)) for r in rows.fetchall() if r.avg_fare is not None]


async def forecast_route(
    db: AsyncSession,
    route: str,
    advance_days: int = 7,
    cabin: str = "ECONOMY",
    lookback_days: int = 90,
) -> dict:
    """
    Produce a fare forecast for a route/advance-window/cabin bucket.

    Returns:
        status: FORECAST | INSUFFICIENT_DATA | NO_DATA
        forecasts: [{horizon_days, forecast_fare, lower_bound, upper_bound}]
        metrics: {mae, rmse, mape, n_obs, training_window_days, model_version}
    """
    series = await _get_fare_series(db, route, advance_days, cabin, lookback_days)

    if len(series) < MIN_OBS_FOR_FORECAST:
        return {
            "status": "INSUFFICIENT_DATA",
            "route": route,
            "advance_days": advance_days,
            "cabin": cabin,
            "n_obs": len(series),
            "required": MIN_OBS_FOR_FORECAST,
            "message": (
                f"Requires ≥{MIN_OBS_FOR_FORECAST} daily observations. "
                f"Have {len(series)}. The verified fare collector is building this daily history."
            ),
            "forecasts": [],
            "metrics": None,
        }

    fares = [v for _, v in series]

    # Holdout validation: reserve last 20% of data
    holdout_n = max(1, len(fares) // 5)
    train = fares[:-holdout_n]
    holdout = fares[-holdout_n:]

    if len(train) < 2:
        train = fares[:-1]
        holdout = fares[-1:]

    smoothed_train = _holt_winters_simple(train)
    holdout_preds = [_forecast_next(train, h + 1) for h in range(holdout_n)]

    mae = _mae(holdout, holdout_preds)
    rmse = _rmse(holdout, holdout_preds)
    mape = _mape(holdout, holdout_preds)

    # Forecast forward using full series
    forecasts = []
    for horizon in FORECAST_HORIZONS_DAYS:
        point = _forecast_next(fares, horizon)
        # Confidence interval: ±1.5 * RMSE as a simple approximation
        margin = 1.5 * rmse
        forecasts.append({
            "horizon_days": horizon,
            "forecast_fare": round(max(point, 0), 2),
            "lower_bound": round(max(point - margin, 0), 2),
            "upper_bound": round(point + margin, 2),
            "currency": "INR",
        })

    return {
        "status": "FORECAST",
        "route": route,
        "advance_days": advance_days,
        "cabin": cabin,
        "forecasts": forecasts,
        "metrics": {
            "n_obs": len(fares),
            "training_window_days": lookback_days,
            "holdout_n": holdout_n,
            "mae": round(mae, 2),
            "rmse": round(rmse, 2),
            "mape_pct": round(mape, 2),
            "model_version": MODEL_VERSION,
            "trained_at": datetime.now(timezone.utc).isoformat(),
        },
        "data_origin": "DERIVED",
        "disclaimer": "Statistical forecast only. Actual fares are subject to market conditions.",
    }
