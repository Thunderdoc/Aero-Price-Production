from fastapi import APIRouter, Depends, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.core.database import AsyncSessionLocal
from app.core.auth import require_admin, get_current_user
from app.models.collection import CollectionRun, SourceHealth
from app.services.collector import (
    run_collection,
    run_collection_chunk,
    finalize_collection_day,
    reap_stale_runs,
    ROUTE_BASKET,
    ADVANCE_WINDOWS,
    CollectionLockedError,
    CollectionDisabledError,
)
from app.services.gov_fetcher import run_gov_fetches
from app.services.source_health import effective_status
from app.core.config import settings

router = APIRouter(prefix="/collections", tags=["collections"])


def _require_cron_auth(authorization: str | None) -> None:
    """Fail closed on the CRON_SECRET.

    - Secret unset on the server → 503 with a clear fix (set CRON_SECRET in
      Vercel env vars + redeploy; the GitHub Actions workflow needs the same
      value as a repo secret). Setting CRON_SECRET is Ankit's job — the code
      must never silently accept an unauthenticated cron call.
    - Wrong/missing token → 401.
    """
    if not settings.CRON_SECRET:
        raise HTTPException(
            status_code=503,
            detail=(
                "CRON_SECRET is not configured on the server. Set a random 16+ "
                "character CRON_SECRET in Vercel env vars and redeploy; the "
                "GitHub Actions collection workflow needs the same value as "
                "its AEROPRICE_CRON_SECRET repo secret."
            ),
        )
    if authorization != f"Bearer {settings.CRON_SECRET}":
        raise HTTPException(status_code=401, detail="Invalid cron authorization")


class ChunkRequest(BaseModel):
    """One collection chunk: a single route + a single advance window."""
    route: str
    advance_days: int
    adapter_ids: list[str] | None = None


@router.get("/cron")
async def cron_collection(authorization: str | None = Header(default=None)):
    """Vercel Cron entrypoint — LIGHTWEIGHT trigger only.

    The Vercel cron (daily, 60 s limit) must NOT run a full collection: a
    full run is 19 routes × 5 windows × 11 adapters and is always killed
    mid-run. Real collection runs as chunks driven by the GitHub Actions
    workflow (POST /api/collections/chunk). This endpoint only does fast,
    DB-local work: reap stale RUNNING runs, publish the index, evaluate
    price alerts. Government refresh has its own endpoint
    (POST /api/collections/gov-refresh) because MoSPI can take minutes.
    """
    _require_cron_auth(authorization)
    async with AsyncSessionLocal() as cron_db:
        reaped = await reap_stale_runs(cron_db)
        result = await finalize_collection_day(cron_db)
    return {
        "status": "COMPLETED",
        "message": "Lightweight cron trigger completed (reaper + index publish + price alerts). Fare collection runs as chunks via the GitHub Actions workflow.",
        "reaped_stale_runs": reaped,
        "result": result,
    }


@router.get("/plan")
async def collection_plan(authorization: str | None = Header(default=None)):
    """Return the chunk plan (routes × windows) so the scheduler never hardcodes the basket."""
    _require_cron_auth(authorization)
    return {
        "routes": ROUTE_BASKET,
        "advance_windows": ADVANCE_WINDOWS,
        "chunks": len(ROUTE_BASKET) * len(ADVANCE_WINDOWS),
    }


@router.post("/chunk")
async def collect_chunk(payload: ChunkRequest, authorization: str | None = Header(default=None)):
    """Collect ONE route + ONE advance window. Completes well under 60 s.

    Called by the GitHub Actions workflow (.github/workflows/collect.yml),
    once per chunk, with CRON_SECRET auth. 409 if another run holds the
    lock; 503 if collection is disabled; 400 for an unknown route/window.
    """
    _require_cron_auth(authorization)
    route = payload.route.upper()
    if route not in ROUTE_BASKET:
        raise HTTPException(status_code=400, detail=f"Unknown route '{payload.route}'. See GET /api/collections/plan for the basket.")
    if payload.advance_days not in ADVANCE_WINDOWS:
        raise HTTPException(status_code=400, detail=f"advance_days must be one of {ADVANCE_WINDOWS}.")
    async with AsyncSessionLocal() as chunk_db:
        try:
            run_id = await run_collection_chunk(
                chunk_db,
                route,
                payload.advance_days,
                triggered_by="chunk",
                adapter_ids=set(payload.adapter_ids) if payload.adapter_ids else None,
            )
        except CollectionLockedError as e:
            raise HTTPException(status_code=409, detail=str(e))
        except CollectionDisabledError as e:
            raise HTTPException(status_code=503, detail=str(e))
        run = await chunk_db.scalar(select(CollectionRun).where(CollectionRun.run_id == run_id))
    # Report the run's REAL status and count — a chunk that found no fares
    # is NO_DATA, not COMPLETED.
    return {
        "status": run.status if run else "COMPLETED",
        "run_id": run_id,
        "route": route,
        "advance_days": payload.advance_days,
        "observations_collected": run.observations_collected if run else 0,
    }


@router.post("/gov-refresh")
async def cron_gov_refresh(authorization: str | None = Header(default=None)):
    """Refresh government datasets (DGCA/MoSPI/PPAC/data.gov.in) via the cron path.

    Called by the GitHub Actions workflow after the fare sweep. Sources
    without credentials report NOT_CONFIGURED honestly — nothing is faked.
    """
    _require_cron_auth(authorization)
    async with AsyncSessionLocal() as gov_db:
        results = await run_gov_fetches(gov_db)
    return {"status": "REFRESH_COMPLETE", "results": results}


@router.post("/finalize")
async def cron_finalize(authorization: str | None = Header(default=None)):
    """End-of-sweep step: reap stale runs, publish the index, evaluate alerts.

    Called by the GitHub Actions workflow after the last chunk (and safe to
    call on its own — it is DB-local and fast).
    """
    _require_cron_auth(authorization)
    async with AsyncSessionLocal() as final_db:
        reaped = await reap_stale_runs(final_db)
        result = await finalize_collection_day(final_db)
    return {"status": "COMPLETED", "reaped_stale_runs": reaped, "result": result}


async def _run_triggered_collection(triggered_by: str) -> dict:
    """Run a collection with a fresh session and return its persisted result."""
    async with AsyncSessionLocal() as collection_db:
        run_id = await run_collection(collection_db, triggered_by=triggered_by)
        return {"run_id": run_id}


@router.get("")
async def list_runs(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    # Read-only: any signed-in user (analyst gate dropped 21 Nov 2026).
    # Triggering a run stays admin-only.
    current_user: dict = Depends(get_current_user),
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
    # Read-only: any signed-in user (analyst gate dropped 21 Nov 2026).
    current_user: dict = Depends(get_current_user),
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
