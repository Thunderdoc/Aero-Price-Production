"""
Jevons Matched-Sample Price Index Engine.

Formula:   P_t = Π (p_it / p_i0)^(1/n)

where:
  p_it = observed fare for corridor i at time t
  p_i0 = fare on the first verified collection day for corridor i
  n    = number of corridors with observations in BOTH periods

Only published when n >= MIN_CORRIDORS_TO_PUBLISH.
Never calculated from GENERATED_TEST data in production mode.

Eligible origins: REAL, OFFICIAL and PUBLIC_INTERFACE. PUBLIC_INTERFACE is
the disclosed SIH-demo methodology: fares collected from the Google Flights
public interface via fast-flights (the only free path to real Indian LCC
fares). They are real observed fares, honestly labelled — never GDS fares,
never "official". SANDBOX_TEST (Amadeus synthetic) and GENERATED_TEST are
permanently excluded.
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

# Origins that may feed the index. PUBLIC_INTERFACE (scraped Google Flights
# fares, honestly labelled) is included as the disclosed SIH-demo methodology
# — see the module docstring. SANDBOX_TEST and GENERATED_TEST are excluded.
INDEX_ELIGIBLE_ORIGINS = ("REAL", "OFFICIAL", "PUBLIC_INTERFACE")

# Base-period policy (documented for SIH review — see also the /index/current
# `base_period_note` field). The base period is NOT a fixed calendar date:
# it is the first verified collection day for this deployment — the earliest
# day on which REAL/OFFICIAL fares were collected. The index for that day is
# 100.0 by construction, and every later day is measured against it. This is
# self-baselining: a deployment whose first collection day differs has a
# different base, so index values are only comparable within one deployment
# (or after re-basing onto a shared reference month, which the backtest module
# supports via its base-month parameter). A fixed reference period (e.g. a
# DGCA-published month) requires a DGCA average-fare dataset that this project
# does not yet have — see backend/app/analytics/backtest.py.
BASE_PERIOD_POLICY = (
    "Base period = the first verified collection day for this deployment "
    "(earliest day with REAL/OFFICIAL fares). That day's index is 100.0 by "
    "construction. Values are comparable within one deployment only, until a "
    "shared DGCA reference period is adopted."
)


async def _get_median_fare(
    db: AsyncSession,
    route: str,
    period_start: str,
    period_end: str,
) -> Optional[float]:
    """Get median total_fare for a route in a date range. Index-eligible
    origins only (REAL, OFFICIAL, PUBLIC_INTERFACE — the disclosed demo
    methodology). SANDBOX_TEST (Amadeus synthetic) and GENERATED_TEST are
    permanently excluded."""
    rows = await db.execute(
        select(FareObservation.total_fare)
        .where(and_(
            FareObservation.route == route,
            FareObservation.data_origin.in_(list(INDEX_ELIGIBLE_ORIGINS)),
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
        .where(FareObservation.data_origin.in_(list(INDEX_ELIGIBLE_ORIGINS)))
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
    weights = []
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
        ratios.append(ratio)
        weights.append(route_info.get("weight", 1.0))
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

    # Weighted Jevons: geometric mean of ratios with normalised weights,
    # P = Π (ratio_i ^ (w_i / Σw)) * 100. Under the current equal-weight
    # regime (every w_i = 1.0) this is exactly the unweighted Jevons formula
    # Π ratio^(1/n) * 100; when DGCA traffic weights arrive, the same code
    # weights corridors by their traffic share without an engine change.
    total_weight = sum(weights)
    log_sum = sum(
        (w / total_weight) * math.log(ratio) for ratio, w in zip(ratios, weights)
    )
    jevons = math.exp(log_sum) * BASE_VALUE

    return {
        "status": "CALCULATED",
        "index_value": round(jevons, 2),
        "base_value": BASE_VALUE,
        "base_period": base_date,
        "base_period_note": BASE_PERIOD_POLICY,
        "n": n,
        "covered_routes": covered_routes,
        "missing_routes": missing_routes,
        "observation_period": observation_period,
        "method": METHOD,
        "version": INDEX_VERSION,
        "data_origin": "DERIVED",
        "origins_included": list(INDEX_ELIGIBLE_ORIGINS),
    }


async def publish_index(db: AsyncSession, observation_period: str, routes: list[dict]) -> dict:
    """Calculate and persist an index observation. Skip if insufficient data."""
    result = await calculate_index(db, observation_period, routes)

    # Do not create rows that look like historical index observations when the
    # matched sample is not publishable. The API exposes the current diagnostic
    # calculation, while /index/history remains a series of real publications.
    if result["status"] != "CALCULATED":
        logger.info(
            "Index %s not published: %s — covered=%s missing=%s",
            observation_period,
            result.get("message"),
            len(result.get("covered_routes", [])),
            len(result.get("missing_routes", [])),
        )
        return result

    day_start = datetime.fromisoformat(f"{observation_period}T00:00:00")
    day_end = datetime.fromisoformat(f"{observation_period}T23:59:59")
    observation_count = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(FareObservation.data_origin.in_(list(INDEX_ELIGIBLE_ORIGINS)))
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
