from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func
from datetime import datetime, timezone
import logging
import os
from app.core.database import get_db
from app.models.fare import FareObservation
from app.models.collection import CollectionRun, SourceHealth
from app.services.source_health import is_live_now

logger = logging.getLogger(__name__)

# Origins counted as live observations (mirrors fares.py / dashboard.py):
# REAL/OFFICIAL are verified fares; PUBLIC_INTERFACE is scraped Google
# Flights fares — real observed fares, not GDS fares (Phase 2 relabelled
# all scraped fares PUBLIC_INTERFACE; counting only REAL/OFFICIAL left
# health reporting 0 observations after collection restarted).
# SANDBOX_TEST and other non-live origins never count toward the total,
# but they still appear in observations_by_origin so the mix stays honest.
_LIVE_ORIGINS = ("REAL", "OFFICIAL", "PUBLIC_INTERFACE")

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check(db: AsyncSession = Depends(get_db)):
    """System health — database, sources, collection status."""
    try:
        await db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        # Log the failure: the live "database: error" state was undiagnosable
        # because both handlers swallowed the exception silently (B26).
        # The traceback carries the driver error, never credentials.
        logger.exception("Health check database probe failed")
        db_ok = False

    try:
        origin_rows = await db.execute(
            select(FareObservation.data_origin, func.count())
            .select_from(FareObservation)
            .group_by(FareObservation.data_origin)
        )
        origin_counts = {origin: count for origin, count in origin_rows.all()}
        fare_count = sum(
            count for origin, count in origin_counts.items() if origin in _LIVE_ORIGINS
        )
        last_run = await db.scalar(select(CollectionRun.ended_at).order_by(CollectionRun.started_at.desc()).limit(1))
        sources = await db.execute(select(SourceHealth))
        source_rows = sources.scalars().all()
    except Exception:
        # Health must remain useful during first boot, before migrations create
        # the application tables — but the cause must still reach the logs.
        logger.exception("Health check database query failed")
        db_ok = False
        fare_count, last_run, source_rows = 0, None, []
        origin_counts = {}
    live_sources = sum(1 for s in source_rows if is_live_now(s))
    snapshot_fallback = os.getenv("AEROPRICE_SNAPSHOT_FALLBACK") == "1"

    return {
        "status": "ok" if db_ok else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": "connected" if db_ok else "error",
        "real_observations": fare_count or 0,
        "observations_by_origin": origin_counts,
        "live_sources": live_sources,
        "total_sources": len(source_rows),
        "last_collection": last_run.isoformat() if last_run else None,
        # LIVE = a source succeeded within the freshness window; STALE_DATA =
        # stored observations exist but no source is currently fresh (the old
        # code reported NO_LIVE_DATA here, contradicting real_observations > 0
        # — seen in the Phase 5 local run: 542 fares + NO_LIVE_DATA);
        # NO_LIVE_DATA = nothing stored at all.
        "data_status": (
            "CACHED_SNAPSHOT"
            if snapshot_fallback
            else "LIVE" if live_sources > 0 else "STALE_DATA" if fare_count > 0 else "NO_LIVE_DATA"
        ),
        "storage_mode": "VERIFIED_SNAPSHOT_READONLY" if snapshot_fallback else "PERSISTENT_DATABASE",
        "collection_enabled": not snapshot_fallback,
        "version": "2.0.0",
        "project": "SIH26056",
    }
