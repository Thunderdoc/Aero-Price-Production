from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func
from datetime import datetime, timezone
import os
from app.core.database import get_db
from app.models.fare import FareObservation
from app.models.collection import CollectionRun, SourceHealth
from app.services.source_health import is_live_now

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check(db: AsyncSession = Depends(get_db)):
    """System health — database, sources, collection status."""
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    try:
        fare_count = await db.scalar(select(func.count()).select_from(FareObservation).where(FareObservation.data_origin.in_(["REAL", "OFFICIAL"])))
        last_run = await db.scalar(select(CollectionRun.ended_at).order_by(CollectionRun.started_at.desc()).limit(1))
        sources = await db.execute(select(SourceHealth))
        source_rows = sources.scalars().all()
    except Exception:
        # Health must remain useful during first boot, before migrations create
        # the application tables.
        db_ok = False
        fare_count, last_run, source_rows = 0, None, []
    live_sources = sum(1 for s in source_rows if is_live_now(s))
    snapshot_fallback = os.getenv("AEROPRICE_SNAPSHOT_FALLBACK") == "1"

    return {
        "status": "ok" if db_ok else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": "connected" if db_ok else "error",
        "real_observations": fare_count or 0,
        "live_sources": live_sources,
        "total_sources": len(source_rows),
        "last_collection": last_run.isoformat() if last_run else None,
        "data_status": "CACHED_SNAPSHOT" if snapshot_fallback else ("LIVE" if live_sources > 0 else "NO_LIVE_DATA"),
        "storage_mode": "VERIFIED_SNAPSHOT_READONLY" if snapshot_fallback else "PERSISTENT_DATABASE",
        "collection_enabled": not snapshot_fallback,
        "version": "2.0.0",
        "project": "SIH26056",
    }
