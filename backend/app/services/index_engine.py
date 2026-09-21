"""
Jevons Matched-Sample Price Index Engine.

Formula:   P_t = Π (p_it / p_i0)^(1/n)

where:
  p_it = observed fare for corridor i at time t
  p_i0 = base-period fare for corridor i (January 2025 = 100)
  n    = number of corridors with observations in BOTH periods

Only published when n >= MIN_CORRIDORS_TO_PUBLISH.
Never calculated from GENERATED_TEST data in production mode.
"""
import math
import uuid
import logging
from datetime import datetime, timezone, date, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.models.fare import FareObservation
from app.models.index import IndexObservation, IndexPublication, RouteBasket

logger = logging.getLogger(__name__)

BASE_VALUE = 100.0
INDEX_VERSION = "v1.0"
METHOD = "JEVONS_MATCHED_SAMPLE"
MIN_CORRIDORS_TO_PUBLISH = 10
MIN_OBS_PER_CORRIDOR = 3


async def _get_median_fare(
    db: AsyncSession,
    route: str,
    period_start: str,
    period_end: str,
) -> Optional[float]:
    """Get median total_fare for a route in a date range. REAL and OFFICIAL only.
    SANDBOX_TEST (Amadeus synthetic) and GENERATED_TEST are permanently excluded."""
    rows = await db.execute(
        select(FareObservation.total_fare)
        .where(and_(
            FareObservation.route == route,
            FareObservation.data_origin.in_(["REAL", "OFFICIAL"]),
            FareObservation.is_valid == True,
            FareObservation.collected_at >= period_start,
            FareObservation.collected_at <= period_end,
        ))
        .order_by(FareObservation.total_fare)
    )
    fares = [r[0] for r in rows.fetchall()]
    if len(fares) < MIN_OBS_PER_CORRIDOR:
        return None
    mid = len(fares) // 2
    return fares[mid] if len(fares) % 2 == 1 else (fares[mid - 1] + fares[mid]) / 2


async def calculate_index(
    db: AsyncSession,
    observation_period: str,   # YYYY-MM-DD
    routes: list[dict],
    triggered_by: str = "scheduler",
) -> dict:
    """
    Calculate the Jevons index for the observation period.
    Returns the result dict; caller decides whether to persist.
    """
    # Use bound datetimes, not ISO strings: SQLite stores naive timestamps with
    # a space separator, so lexical string comparison would miss same-day rows.
    period_start = datetime.fromisoformat(f"{observation_period}T00:00:00")
    period_end = datetime.fromisoformat(f"{observation_period}T23:59:59")

    # Never create an artificial historic base. The first verified live-data
    # day becomes the 100-point baseline for this local deployment.
    first_observation = await db.scalar(
        select(FareObservation.collected_at)
        .where(FareObservation.data_origin.in_(["REAL", "OFFICIAL"]))
        .where(FareObservation.is_valid == True)
        .order_by(FareObservation.collected_at.asc()).limit(1)
    )
    if first_observation is None:
        return {"status": "INSUFFICIENT_DATA", "index_value": None, "covered_routes": [],
                "missing_routes": [r["route"] for r in routes], "n": 0, "required": MIN_CORRIDORS_TO_PUBLISH,
                "message": "No verified live fare observations available."}
    base_date = first_observation.date().isoformat()
    base_start = datetime.fromisoformat(f"{base_date}T00:00:00")
    base_end = datetime.fromisoformat(f"{base_date}T23:59:59")

    ratios = []
    covered_routes = []
    missing_routes = []

    for route_info in routes:
        route = route_info["route"]
        current_median = await _get_median_fare(db, route, period_start, period_end)
        base_median = await _get_median_fare(db, route, base_start, base_end)

        if current_median is None or base_median is None or base_median == 0:
            missing_routes.append(route)
            continue

        ratio = current_median / base_median
        weighted_ratio = ratio ** route_info.get("weight", 1.0)
        ratios.append(weighted_ratio)
        covered_routes.append(route)

    n = len(ratios)
    if n < MIN_CORRIDORS_TO_PUBLISH:
        return {
            "status": "INSUFFICIENT_DATA",
            "index_value": None,
            "covered_routes": covered_routes,
            "missing_routes": missing_routes,
            "n": n,
            "required": MIN_CORRIDORS_TO_PUBLISH,
            "message": f"Requires ≥{MIN_CORRIDORS_TO_PUBLISH} matched corridors. Have {n}.",
        }

    # Jevons: geometric mean of weighted ratios
    product = math.prod(ratios)
    jevons = (product ** (1.0 / n)) * BASE_VALUE

    return {
        "status": "CALCULATED",
        "index_value": round(jevons, 2),
        "base_value": BASE_VALUE,
        "base_period": base_date,
        "n": n,
        "covered_routes": covered_routes,
        "missing_routes": missing_routes,
        "observation_period": observation_period,
        "method": METHOD,
        "version": INDEX_VERSION,
        "data_origin": "REAL",
    }


async def publish_index(db: AsyncSession, observation_period: str, routes: list[dict]) -> dict:
    """Calculate and persist an index observation. Skip if insufficient data."""
    result = await calculate_index(db, observation_period, routes)

    day_start = datetime.fromisoformat(f"{observation_period}T00:00:00")
    day_end = datetime.fromisoformat(f"{observation_period}T23:59:59")
    observation_count = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(FareObservation.data_origin.in_(["REAL", "OFFICIAL"]))
        .where(FareObservation.is_valid == True)
        .where(FareObservation.collected_at >= day_start)
        .where(FareObservation.collected_at <= day_end)
    ) or 0
    obs = IndexObservation(
        publication_id=str(uuid.uuid4()),
        observation_period=observation_period,
        index_value=result.get("index_value"),
        status=result["status"] if result["status"] != "CALCULATED" else "PUBLISHED",
        index_version=INDEX_VERSION,
        method=METHOD,
        base_period=result.get("base_period", ""),
        base_value=BASE_VALUE,
        route_count=len(result.get("covered_routes", [])),
        observation_count=observation_count,
        coverage_pct=len(result.get("covered_routes", [])) / max(len(routes), 1) * 100,
        data_origin=result.get("data_origin", "NO_DATA"),
    )
    db.add(obs)
    await db.commit()
    logger.info(f"Index {observation_period}: {result['status']} — value={result.get('index_value')}")
    return result
