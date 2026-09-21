"""
Admin API: user management, source configuration, anomaly detection, audit log.
All endpoints require ADMIN role.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone
from app.core.database import get_db
from app.core.auth import require_admin, get_current_user, DEMO_USERS
from app.models.user import AuditLog
from app.models.fare import FareObservation
from app.models.collection import SourceHealth
from app.services.anomaly_detector import detect_anomalies, get_anomaly_summary

router = APIRouter()


@router.get("/admin/users")
async def list_users(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return demo user list (no real user DB in this deployment)."""
    users = []
    for email, info in DEMO_USERS.items():
        users.append({
            "email": email,
            "role": info["role"],
            "plan": info["plan"],
            "name": email.split("@")[0].replace(".", " ").title(),
        })
    return {"users": users, "total": len(users), "note": "Demo users only — no persistent user DB in this deployment."}


@router.get("/admin/audit-log")
async def audit_log(
    limit: int = Query(default=50, ge=1, le=200),
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    )
    entries = rows.scalars().all()
    return {
        "entries": [
            {
                "id": str(e.id),
                "user_email": e.user_email,
                "action": e.action,
                "resource_type": e.resource_type,
                "resource_id": e.resource_id,
                "details": e.details,
                "ip_address": e.ip_address,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ],
        "total": len(entries),
    }


@router.post("/admin/anomaly-detection/run")
async def run_anomaly_detection(
    lookback_days: int = Query(default=30, ge=1, le=365),
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await detect_anomalies(db, lookback_days=lookback_days)
    return result


@router.get("/admin/anomaly-detection/summary")
async def anomaly_summary(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    return await get_anomaly_summary(db)


@router.get("/admin/system-metrics")
async def system_metrics(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    obs_count = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(FareObservation.data_origin.in_(["REAL", "OFFICIAL"]))
    )
    source_count = await db.scalar(
        select(func.count()).select_from(SourceHealth)
    )
    challenge_count = await db.scalar(
        select(func.count()).select_from(SourceHealth)
        .where(SourceHealth.status == "CHALLENGE_DETECTED")
    )
    return {
        "real_observations": obs_count or 0,
        "source_health_rows": source_count or 0,
        "sources_challenge_detected": challenge_count or 0,
        "all_airline_sources_blocked": False if obs_count else True,
        "note": "Verified aggregator fares are available. Direct airline sites may remain unavailable without authorized NDC access."
                if obs_count else "No verified live fares have been collected yet.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
