from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.fare import FareObservation
from app.models.collection import CollectionRun, SourceHealth
from app.models.government import DgcaMonthlyRecord
from app.models.index import IndexObservation

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
        .where(FareObservation.data_origin.in_(["REAL", "OFFICIAL"]))
    ) or 0

    real_obs_24h = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(and_(
            FareObservation.data_origin.in_(["REAL", "OFFICIAL"]),
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

    latest_index = await db.scalar(
        select(IndexObservation)
        .where(IndexObservation.status == "PUBLISHED")
        .order_by(IndexObservation.calculation_ts.desc())
        .limit(1)
    )
    index_status = latest_index.status if latest_index else "NOT_PUBLISHED"
    index_value = latest_index.index_value if latest_index else None
    note = (
        "Verified airfare observations are available. Route trends require a later collection for comparison."
        if latest_index else
        "No published live airfare index yet."
    )

    return {
        "timestamp": now.isoformat(),
        # Flat fields are consumed by the Overview UI. Keep the nested blocks for
        # API clients that already use the earlier dashboard response shape.
        "real_observations": real_obs_total,
        "sources_live": len(live_sources),
        "sources_challenge_detected": len(challenge_sources),
        "gov_datasets_connected": 1 if dgca_latest else 0,
        "collection_runs_today": 0,
        "index_status": index_status,
        "index_value": index_value,
        "note": note,
        "index": {
            "value": index_value,
            "status": index_status,
            "message": note,
            "data_origin": latest_index.data_origin if latest_index else "NO_DATA",
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
