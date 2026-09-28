from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from datetime import datetime, timezone
from app.core.database import get_db
from app.core.auth import get_current_user, require_analyst
from app.models.index import IndexObservation, IndexPublication, RouteBasket
from app.models.fare import FareObservation
from app.services.collector import ROUTE_BASKET as COLLECTION_ROUTE_BASKET
from app.services.index_engine import MIN_CORRIDORS_TO_PUBLISH

router = APIRouter(prefix="/index", tags=["index"])

ROUTE_BASKET = [
    {"route": route, "region": "India", "weight": 1.0, "weight_source": "EQUAL_CONFIGURED"}
    for route in COLLECTION_ROUTE_BASKET
]


@router.get("/current")
async def current_index(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Current index value. Returns INSUFFICIENT_DATA if <15 real matched corridors."""
    real_fare_count = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(FareObservation.data_origin.in_(["REAL", "OFFICIAL"]))
        .where(FareObservation.is_valid == True)
    )

    covered_routes = await db.scalar(
        select(func.count(FareObservation.route.distinct()))
        .where(FareObservation.data_origin.in_(["REAL", "OFFICIAL"]))
        .where(FareObservation.is_valid == True)
    ) or 0

    if covered_routes < MIN_CORRIDORS_TO_PUBLISH:
        return {
            "status": "INSUFFICIENT_DATA",
            "index_value": None,
            "message": f"Index not published. Requires ≥{MIN_CORRIDORS_TO_PUBLISH} matched corridors with real observations. Currently: {covered_routes}.",
            "covered_routes_count": covered_routes,
            "required_routes": MIN_CORRIDORS_TO_PUBLISH,
            "real_observations": real_fare_count or 0,
            "route_count": covered_routes,
            "coverage_pct": covered_routes / max(len(ROUTE_BASKET), 1) * 100,
            "base_period": "First verified collection day",
            "base_value": 100.0,
            "method": "JEVONS_MATCHED_SAMPLE",
            "version": "v1.0",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    latest = await db.scalar(
        select(IndexObservation)
        .where(IndexObservation.status == "PUBLISHED")
        .where(IndexObservation.data_origin.in_(["REAL", "OFFICIAL", "DERIVED"]))
        .order_by(IndexObservation.calculation_ts.desc())
        .limit(1)
    )

    if not latest:
        return {
            "status": "INSUFFICIENT_DATA",
            "index_value": None,
            "message": "No published index yet. The matched-sample calculation needs verified fares in both the first and current collection periods.",
            "covered_routes_count": covered_routes,
            "required_routes": MIN_CORRIDORS_TO_PUBLISH,
            "real_observations": real_fare_count or 0,
            "route_count": covered_routes,
            "coverage_pct": covered_routes / max(len(ROUTE_BASKET), 1) * 100,
            "base_period": "First verified collection day",
            "base_value": 100.0,
            "method": "JEVONS_MATCHED_SAMPLE",
            "version": "v1.0",
            "data_origin": "DERIVED",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    return {
        "status": "PUBLISHED",
        "index_value": latest.index_value,
        "base_period": latest.base_period,
        "base_value": latest.base_value,
        "method": latest.method,
        "version": latest.index_version,
        "observation_period": latest.observation_period,
        "route_count": latest.route_count,
        "observation_count": latest.observation_count,
        "coverage_pct": latest.coverage_pct,
        "data_origin": "DERIVED",
        "covered_routes_count": covered_routes,
        "required_routes": MIN_CORRIDORS_TO_PUBLISH,
        "real_observations": real_fare_count or 0,
        "calculation_ts": latest.calculation_ts.isoformat() if latest.calculation_ts else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/basket")
async def route_basket(
    current_user: dict = Depends(require_analyst),
):
    """Index route basket and weights."""
    return {
        "routes": ROUTE_BASKET,
        "total": len(ROUTE_BASKET),
        "weight_source_note": "The current index calculation uses equal 1.0 weights for every collection route. No DGCA traffic weights are applied.",
        "min_corridors_to_publish": MIN_CORRIDORS_TO_PUBLISH,
    }


@router.get("/history")
async def index_history(
    limit: int = Query(30, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_analyst),
):
    """Published historical index observations only.

    Insufficient-data calculation attempts are operational audit records, not
    index history. Returning them here made the dashboard look like it had a
    broken or empty published series.
    """
    ranked = select(
        IndexObservation.id.label("id"),
        func.row_number().over(
            partition_by=IndexObservation.observation_period,
            order_by=(IndexObservation.calculation_ts.desc(), IndexObservation.id.desc()),
        ).label("period_rank"),
    ).where(
        IndexObservation.status == "PUBLISHED",
        IndexObservation.data_origin.in_(["REAL", "OFFICIAL", "DERIVED"]),
    ).subquery()
    rows = await db.execute(
        select(IndexObservation)
        .join(ranked, IndexObservation.id == ranked.c.id)
        .where(ranked.c.period_rank == 1)
        .order_by(IndexObservation.observation_period.desc())
        .limit(limit)
    )
    obs = rows.scalars().all()
    return {
        "count": len(obs),
        "observations": [
            {
                "period": o.observation_period,
                "value": o.index_value,
                "status": o.status,
                "route_count": o.route_count,
                "observation_count": o.observation_count,
                "data_origin": "DERIVED",
            }
            for o in obs
        ],
    }
