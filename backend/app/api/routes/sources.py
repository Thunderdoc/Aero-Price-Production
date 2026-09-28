from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.auth import get_current_user, require_admin
from app.models.collection import SourceHealth
from app.services.collector import AIRFARE_SOURCE_REGISTRY, GOV_SOURCE_REGISTRY
from app.services.source_health import effective_status

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("")
async def list_sources(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """All data sources with live health status."""
    rows = await db.execute(select(SourceHealth))
    health = {r.source_id: r for r in rows.scalars().all()}

    airfare = []
    for s in AIRFARE_SOURCE_REGISTRY:
        h = health.get(s["id"])
        airfare.append({
            **s,
            "status": effective_status(s, h),
            "last_attempt": h.last_attempt.isoformat() if h and h.last_attempt else None,
            "last_success": h.last_success.isoformat() if h and h.last_success else None,
            "records_total": h.records_total if h else 0,
            "latency_ms_avg": h.latency_ms_avg if h else None,
            "challenge_reason": h.challenge_reason if h else s.get("challenge_reason"),
        })

    gov = []
    for s in GOV_SOURCE_REGISTRY:
        h = health.get(s["id"])
        gov.append({
            **s,
            "status": effective_status(s, h),
            "last_attempt": h.last_attempt.isoformat() if h and h.last_attempt else None,
            "last_success": h.last_success.isoformat() if h and h.last_success else None,
            "records_total": h.records_total if h else 0,
        })

    return {
        "airfare_sources": airfare,
        "government_sources": gov,
        "live_count": sum(1 for s in airfare + gov if s["status"] == "LIVE"),
        "total_count": len(airfare) + len(gov),
    }


@router.post("/{source_id}/enable")
async def enable_source(
    source_id: str,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    """Enable a source. Cannot enable sources with CHALLENGE_DETECTED status."""
    all_sources = AIRFARE_SOURCE_REGISTRY + GOV_SOURCE_REGISTRY
    source = next((s for s in all_sources if s["id"] == source_id), None)
    if not source:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Source not found")

    if source.get("status") == "CHALLENGE_DETECTED":
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Cannot enable {source_id}: {source.get('challenge_reason', 'Bot protection detected')}",
        )

    row = await db.get(SourceHealth, source_id)
    if row:
        row.enabled = True
    else:
        db.add(SourceHealth(
            source_id=source_id,
            source_name=source["name"],
            source_type=source["type"],
            enabled=True,
            status="NOT_CONFIGURED",
        ))
    await db.commit()
    return {"source_id": source_id, "enabled": True}
