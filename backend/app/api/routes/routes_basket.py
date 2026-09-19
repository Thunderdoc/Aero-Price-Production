"""
Routes basket API — the monitored route list and per-route coverage.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.fare import FareObservation
from app.services.collector import ROUTE_BASKET

router = APIRouter()

AIRPORTS = {
    "DEL": {"name": "Indira Gandhi International", "city": "New Delhi"},
    "BOM": {"name": "Chhatrapati Shivaji Maharaj International", "city": "Mumbai"},
    "BLR": {"name": "Kempegowda International", "city": "Bengaluru"},
    "CCU": {"name": "Netaji Subhas Chandra Bose International", "city": "Kolkata"},
    "HYD": {"name": "Rajiv Gandhi International", "city": "Hyderabad"},
    "MAA": {"name": "Chennai International", "city": "Chennai"},
}


@router.get("/routes")
async def list_routes(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return the monitored route basket with per-route observation counts."""
    since_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    routes = []
    for route in ROUTE_BASKET:
        origin_code, dest_code = route.split("-")
        count = await db.scalar(
            select(func.count()).select_from(FareObservation)
            .where(and_(
                FareObservation.route == route,
                FareObservation.data_origin != "GENERATED_TEST",
                FareObservation.collected_at >= since_7d,
            ))
        )
        routes.append({
            "route": route,
            "origin": origin_code,
            "destination": dest_code,
            "origin_name": AIRPORTS.get(origin_code, {}).get("city", origin_code),
            "destination_name": AIRPORTS.get(dest_code, {}).get("city", dest_code),
            "observations_7d": count or 0,
            "has_data": (count or 0) > 0,
            "status": "ACTIVE" if (count or 0) > 0 else "NO_DATA",
        })

    return {
        "routes": routes,
        "total": len(routes),
        "advance_windows": [1, 7, 15, 30, 45],
        "basket_version": "v1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/context")
async def system_context(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Overall system context: coverage, freshness, data-origin breakdown."""
    total = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(FareObservation.data_origin != "GENERATED_TEST")
    )
    since_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    fresh = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(and_(
            FareObservation.data_origin != "GENERATED_TEST",
            FareObservation.collected_at >= since_24h,
        ))
    )
    return {
        "real_observations_total": total or 0,
        "real_observations_24h": fresh or 0,
        "routes_monitored": len(ROUTE_BASKET),
        "advance_windows": [1, 7, 15, 30, 45],
        "airline_sources_status": "CHALLENGE_DETECTED",
        "airline_sources_note": "All 5 Indian carriers block automated access. NDC credentials required.",
        "system_status": "OPERATIONAL" if (fresh or 0) > 0 else "AWAITING_REAL_DATA",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
