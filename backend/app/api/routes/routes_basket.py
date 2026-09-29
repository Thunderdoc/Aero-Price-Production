"""
Routes basket API — the monitored route list and per-route coverage.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.fare import FareObservation
from app.services.collector import ROUTE_BASKET

router = APIRouter()
LIVE_ORIGINS = ("REAL", "OFFICIAL")

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
    since_7d = datetime.now(timezone.utc) - timedelta(days=7)

    counts = dict((row[0], row[1]) for row in (await db.execute(
        select(FareObservation.route, func.count()).where(
            and_(FareObservation.data_origin.in_(LIVE_ORIGINS), FareObservation.collected_at >= since_7d)
        ).group_by(FareObservation.route)
    )).all())
    routes = []
    for route in ROUTE_BASKET:
        origin_code, dest_code = route.split("-")
        count = counts.get(route, 0)
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


@router.get("/routes/summary")
async def route_summaries(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Return verified route medians in one request for fast map rendering."""
    rows = (await db.execute(select(FareObservation).where(
        FareObservation.data_origin.in_(LIVE_ORIGINS), FareObservation.is_valid.is_(True),
        FareObservation.currency == "INR", FareObservation.cabin == "ECONOMY",
    ))).scalars().all()
    grouped = defaultdict(list)
    for row in rows: grouped[row.route].append(row)
    summaries = {}
    for route, values in grouped.items():
        latest = max((row.travel_date for row in values if row.travel_date), default=None)
        latest_rows = [row for row in values if row.travel_date == latest]
        fares = sorted(float(row.total_fare) for row in latest_rows if row.total_fare is not None)
        if not fares: continue
        middle = len(fares) // 2
        median = fares[middle] if len(fares) % 2 else (fares[middle - 1] + fares[middle]) / 2
        summaries[route] = {"median": median, "min": min(fares), "max": max(fares), "count": len(fares),
                            "sample_period": latest, "last_collected_at": max((row.collected_at for row in latest_rows if row.collected_at), default=None).isoformat() if latest_rows else None}
    return {"summaries": summaries, "timestamp": datetime.now(timezone.utc).isoformat()}


@router.get("/context")
async def system_context(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Overall system context: coverage, freshness, data-origin breakdown."""
    total = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(FareObservation.data_origin.in_(["REAL", "OFFICIAL"]))
    )
    since_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    fresh = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(and_(
            FareObservation.data_origin.in_(["REAL", "OFFICIAL"]),
            FareObservation.collected_at >= since_24h,
        ))
    )
    return {
        "real_observations_total": total or 0,
        "real_observations_24h": fresh or 0,
        "routes_monitored": len(ROUTE_BASKET),
        "advance_windows": [1, 7, 15, 30, 45],
        "airline_sources_status": "AGGREGATOR_LIVE" if (fresh or 0) > 0 else "NO_LIVE_DATA",
        "airline_sources_note": "Verified aggregator fares available. Direct airline feeds still require authorized credentials." if (fresh or 0) > 0 else "No verified fares collected in the past 24 hours.",
        "system_status": "OPERATIONAL" if (fresh or 0) > 0 else "AWAITING_REAL_DATA",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
