"""
Route comparison endpoint — side-by-side fare analysis across routes or periods.
Returns per-route window data from real observations. GENERATED_TEST excluded.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timezone, timedelta
from typing import List
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.fare import FareObservation

router = APIRouter()

ADVANCE_WINDOWS = [1, 7, 15, 30, 45]


@router.get("/compare")
async def compare_routes(
    routes: str = Query(description="Comma-separated route codes e.g. DEL-BOM,DEL-BLR"),
    advance_days: int = Query(default=7, description="Advance window (1,7,15,30,45)"),
    lookback_days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Compare fare statistics across multiple routes for the same advance window.
    Only real (non-GENERATED_TEST) observations are included.
    """
    route_list = [r.strip().upper() for r in routes.split(",") if r.strip()]
    if not route_list:
        return {"error": "No routes provided", "routes": []}

    since = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).isoformat()
    result = []

    for route in route_list:
        rows = await db.execute(
            select(FareObservation.total_fare)
            .where(and_(
                FareObservation.route == route,
                FareObservation.advance_days == advance_days,
                FareObservation.data_origin != "GENERATED_TEST",
                FareObservation.is_valid == True,
                FareObservation.collected_at >= since,
            ))
            .order_by(FareObservation.total_fare)
        )
        fares = [r[0] for r in rows.fetchall() if r[0] is not None]

        if fares:
            n = len(fares)
            median = fares[n // 2] if n % 2 == 1 else (fares[n // 2 - 1] + fares[n // 2]) / 2
            result.append({
                "route": route,
                "advance_days": advance_days,
                "count": n,
                "min": float(fares[0]),
                "max": float(fares[-1]),
                "median": float(median),
                "mean": round(sum(fares) / n, 2),
                "data_origin": "REAL",
                "status": "AVAILABLE",
            })
        else:
            result.append({
                "route": route,
                "advance_days": advance_days,
                "count": 0,
                "min": None,
                "max": None,
                "median": None,
                "mean": None,
                "data_origin": "NO_DATA",
                "status": "INSUFFICIENT_DATA",
            })

    return {
        "comparison": result,
        "advance_days": advance_days,
        "lookback_days": lookback_days,
        "routes_requested": route_list,
        "has_any_data": any(r["status"] == "AVAILABLE" for r in result),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
