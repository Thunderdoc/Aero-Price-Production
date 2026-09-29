from fastapi import APIRouter, Depends, BackgroundTasks, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.core.database import AsyncSessionLocal
from app.core.auth import require_admin, require_analyst
from app.models.collection import CollectionRun, SourceHealth
from app.services.collector import run_collection
from app.services.source_health import effective_status
from app.core.config import settings

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get("/cron")
async def cron_collection(authorization: str | None = Header(default=None)):
    """Vercel Cron entrypoint; requires the server-side CRON_SECRET."""
    if not settings.CRON_SECRET or authorization != f"Bearer {settings.CRON_SECRET}":
        raise HTTPException(status_code=401, detail="Invalid cron authorization")
    # Vercel can terminate a serverless worker immediately after the response
    # is returned. Await the refresh so the cron invocation cannot report
    # success while silently dropping the collection task.
    result = await _run_triggered_collection("vercel-cron")
    return {"status": "COMPLETED", "message": "Verified collection refresh completed.", "result": result}


async def _run_triggered_collection(triggered_by: str) -> dict:
    """Run a collection with a fresh session and return its persisted result."""
    async with AsyncSessionLocal() as collection_db:
        run_id = await run_collection(collection_db, triggered_by=triggered_by)
        return {"run_id": run_id}


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
                "status": effective_status({}, s),
                "last_attempt": s.last_attempt.isoformat() if s.last_attempt else None,
                "last_success": s.last_success.isoformat() if s.last_success else None,
                "last_failure": s.last_failure.isoformat() if s.last_failure else None,
                "failure_reason": s.failure_reason,
                "records_total": s.records_total,
                "records_rejected": s.records_rejected,
                "latency_ms_avg": s.latency_ms_avg,
                "challenge_reason": s.challenge_reason,
                "auth_status": s.auth_status,
            }
            for s in sources
        ]
    }
