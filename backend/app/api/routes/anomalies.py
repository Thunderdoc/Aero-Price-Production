"""
Anomalies API — flagged fare observations and detection summary.
Requires ANALYST or ADMIN role.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timezone, timedelta
import json
from app.core.database import get_db
from app.core.auth import require_analyst, get_current_user
from app.models.fare import FareObservation
from app.services.anomaly_detector import get_anomaly_summary, detect_anomalies

router = APIRouter()


@router.get("/anomalies")
async def list_anomalies(
    route: str = Query(default=None),
    limit: int = Query(default=50, le=500),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return fare observations flagged as anomalies (quality_flags contains OUTLIER)."""
    filters = [
        FareObservation.quality_flags.like('%OUTLIER%'),
        FareObservation.data_origin.in_(["REAL", "OFFICIAL"]),
    ]
    if route:
        filters.append(FareObservation.route == route.upper())

    rows = await db.execute(
        select(FareObservation)
        .where(and_(*filters))
        .order_by(FareObservation.collected_at.desc())
        .limit(limit)
    )
    obs = rows.scalars().all()

    summary = await get_anomaly_summary(db)

    return {
        "anomalies": [
            {
                "observation_id": str(o.observation_id),
                "route": o.route,
                "advance_days": o.advance_days,
                "cabin": o.cabin,
                "total_fare": o.total_fare,
                "airline": o.airline,
                "travel_date": o.travel_date,
                "data_origin": o.data_origin,
                "quality_flags": json.loads(o.quality_flags or "[]"),
                "collected_at": o.collected_at.isoformat() if o.collected_at else None,
            }
            for o in obs
        ],
        "total_shown": len(obs),
        "summary": summary,
        "method": "Z-SCORE",
        "threshold": 3.0,
        "min_sample": 10,
        "status": "NO_DATA" if summary["total_observations"] == 0 else "ACTIVE",
    }


@router.post("/anomalies/run-detection")
async def run_detection(
    lookback_days: int = Query(default=30, ge=7, le=365),
    current_user=Depends(require_analyst),
    db: AsyncSession = Depends(get_db),
):
    """Trigger anomaly detection on real observations within the lookback window."""
    return await detect_anomalies(db, lookback_days=lookback_days)
