from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.fare import FareObservation
from app.models.collection import CollectionRun, SourceHealth
from app.models.government import DgcaMonthlyRecord

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
async def dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Single endpoint for the Overview page. No hardcoded values."""
    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)

    real_obs_total = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(FareObservation.data_origin != "GENERATED_TEST")
    ) or 0

    real_obs_24h = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(and_(
            FareObservation.data_origin != "GENERATED_TEST",
            FareObservation.collected_at >= since_24h,
        ))
    ) or 0

    sources = await db.execute(select(SourceHealth))
    source_rows = sources.scalars().all()
    live_sources = [s for s in source_rows if s.status == "LIVE"]
    challenge_sources = [s for s in source_rows if s.status == "CHALLENGE_DETECTED"]

    last_run = await db.scalar(
        select(CollectionRun.ended_at)
        .where(CollectionRun.status.in_(["COMPLETED", "PARTIAL"]))
        .order_by(CollectionRun.started_at.desc())
        .limit(1)
    )

    dgca_latest = await db.scalar(
        select(DgcaMonthlyRecord).order_by(
            DgcaMonthlyRecord.year.desc(), DgcaMonthlyRecord.month.desc()
        ).limit(1)
    )

    return {
        "timestamp": now.isoformat(),
        "index": {
            "value": None,
            "status": "INSUFFICIENT_DATA",
            "message": "No real airfare observations. Requires ≥15 matched corridors.",
            "data_origin": "NO_DATA",
        },
        "observations": {
            "total_real": real_obs_total,
            "last_24h": real_obs_24h,
            "data_status": "LIVE" if live_sources else "NO_LIVE_DATA",
        },
        "sources": {
            "live": len(live_sources),
            "challenge_detected": len(challenge_sources),
            "total": len(source_rows),
        },
        "last_collection": last_run.isoformat() if last_run else None,
        "government_data": {
            "dgca_available": dgca_latest is not None,
            "dgca_latest_period": f"{dgca_latest.year}-{dgca_latest.month:02d}" if dgca_latest else None,
        },
    }
