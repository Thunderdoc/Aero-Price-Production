from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.core.database import AsyncSessionLocal
from app.core.auth import require_admin, require_analyst
from app.models.collection import CollectionRun, SourceHealth
from app.services.collector import run_collection

router = APIRouter(prefix="/collections", tags=["collections"])


async def _run_triggered_collection(triggered_by: str) -> None:
    """Background tasks must create their own session after the request ends."""
    async with AsyncSessionLocal() as collection_db:
        await run_collection(collection_db, triggered_by=triggered_by)


@router.get("")
async def list_runs(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_analyst),
):
    rows = await db.execute(
        select(CollectionRun).order_by(desc(CollectionRun.started_at)).limit(limit)
    )
    runs = rows.scalars().all()
    return {
        "runs": [
            {
                "run_id": r.run_id,
                "started_at": r.started_at.isoformat(),
                "ended_at": r.ended_at.isoformat() if r.ended_at else None,
                "status": r.status,
                "triggered_by": r.triggered_by,
                "routes_planned": r.routes_planned,
                "routes_done": r.routes_done,
                "observations_collected": r.observations_collected,
                "observations_rejected": r.observations_rejected,
            }
            for r in runs
        ]
    }


@router.post("/trigger")
async def trigger_collection(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    """Manually trigger a collection run."""
    background_tasks.add_task(_run_triggered_collection, admin["email"])
    return {
        "status": "TRIGGERED",
        "message": "Collection run started. Sources with CHALLENGE_DETECTED will be skipped — configure a backend collector.",
    }


@router.get("/source-health")
async def source_health(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_analyst),
):
    rows = await db.execute(select(SourceHealth))
    sources = rows.scalars().all()
    return {
        "sources": [
            {
                "source_id": s.source_id,
                "source_name": s.source_name,
                "source_type": s.source_type,
                "enabled": s.enabled,
                "status": s.status,
                "last_attempt": s.last_attempt.isoformat() if s.last_attempt else None,
                "last_success": s.last_success.isoformat() if s.last_success else None,
                "records_total": s.records_total,
                "records_rejected": s.records_rejected,
                "latency_ms_avg": s.latency_ms_avg,
                "challenge_reason": s.challenge_reason,
                "auth_status": s.auth_status,
            }
            for s in sources
        ]
    }
