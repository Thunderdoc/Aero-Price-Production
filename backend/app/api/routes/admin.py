"""
Admin API: user management, source configuration, anomaly detection, audit log.
All endpoints require ADMIN role.
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone
from app.core.database import get_db
from app.core.auth import require_admin, get_current_user, DEMO_USERS, oauth2_optional_scheme
from app.core.config import settings
from app.models.user import AuditLog, User
from app.models.fare import FareObservation
from app.models.collection import SourceHealth
from app.models.feedback import UserFeedback
from app.models.access import FeatureAccessRequest, UserFeatureAccess, UserNotification
from app.services.anomaly_detector import detect_anomalies, get_anomaly_summary

router = APIRouter()


class FeedbackCreate(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class FeedbackUpdate(BaseModel):
    status: str = Field(pattern="^(NEW|REVIEWED)$")


class AccessRequestCreate(BaseModel):
    feature_key: str = Field(min_length=1, max_length=80)
    feature_name: str = Field(min_length=1, max_length=255)


class AccessDecision(BaseModel):
    rejection_reason: str | None = Field(default=None, max_length=2000)


async def require_admin_or_local(token: str | None = Depends(oauth2_optional_scheme)):
    if not token and not settings.is_production:
        return {"email": "local-admin", "role": "ADMIN", "plan": "ADMIN", "name": "Local Admin"}
    if not token:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return await get_current_user(token)


def _firebase_users():
    """Read Firebase Auth users when the Admin SDK is configured server-side."""
    try:
        from app.core.firebase_admin import firebase_app
        firebase_admin = firebase_app()
        if not firebase_admin:
            return None
        from firebase_admin import auth
        users = []
        page = auth.list_users()
        while page:
            for record in page.users:
                last_login = record.user_metadata.last_sign_in_timestamp
                users.append({
                    "email": record.email or "",
                    "role": "ADMIN" if record.email == "admin@aeroprice.in" else "PUBLIC",
                    "plan": "ADMIN" if record.email == "admin@aeroprice.in" else "FREE",
                    "name": record.display_name or record.email or "Firebase User",
                    "is_active": not record.disabled,
                    "last_login": datetime.fromtimestamp(last_login / 1000, timezone.utc).isoformat() if last_login else None,
                })
            page = page.get_next_page() if page.has_next_page else None
        return users
    except Exception:
        return None


@router.get("/admin/users")
async def list_users(
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    firebase_users = _firebase_users()
    if firebase_users is not None:
        return {"users": firebase_users, "total": len(firebase_users), "source": "firebase"}
    rows = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    if rows:
        return {"users": [{"email": row.email, "role": row.role, "plan": row.plan, "name": row.name, "is_active": row.is_active, "last_login": row.last_login.isoformat() if row.last_login else None} for row in rows], "total": len(rows)}
    users = [{"email": email, "role": info["role"], "plan": info["plan"], "name": info["name"], "is_active": True, "last_login": None} for email, info in DEMO_USERS.items()]
    return {"users": users, "total": len(users), "note": "Showing configured demo users; persistent users will appear when registered in the backend."}


@router.post("/admin/feedback")
async def create_feedback(
    payload: FeedbackCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = UserFeedback(
        user_email=current_user["email"],
        user_name=current_user.get("name") or current_user["email"],
        message=payload.message.strip(),
    )
    db.add(entry)
    await db.flush()
    return {"id": entry.id, "status": entry.status, "created_at": entry.created_at.isoformat() if entry.created_at else None}


@router.get("/admin/feedback")
async def list_feedback(
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(UserFeedback).order_by(UserFeedback.created_at.desc()))).scalars().all()
    return {"feedback": [{
        "id": row.id,
        "email": row.user_email,
        "name": row.user_name,
        "message": row.message,
        "status": row.status,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
    } for row in rows], "total": len(rows)}


@router.patch("/admin/feedback/{feedback_id}")
async def update_feedback(
    feedback_id: str,
    payload: FeedbackUpdate,
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(UserFeedback, feedback_id)
    if not entry:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Feedback not found")
    entry.status = payload.status
    entry.reviewed_at = datetime.now(timezone.utc) if payload.status == "REVIEWED" else None
    await db.flush()
    return {"id": entry.id, "status": entry.status}


def _access_request_dict(entry: FeatureAccessRequest) -> dict:
    return {
        "id": entry.id,
        "email": entry.user_email,
        "name": entry.user_name,
        "feature_key": entry.feature_key,
        "feature": entry.feature_name,
        "status": entry.status,
        "created_at": entry.requested_at.isoformat() if entry.requested_at else None,
        "reviewed_at": entry.reviewed_at.isoformat() if entry.reviewed_at else None,
        "reviewed_by": entry.reviewed_by,
        "rejection_reason": entry.rejection_reason,
    }


@router.post("/access-requests")
async def create_access_request(
    payload: AccessRequestCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    email = current_user["email"].lower()
    granted = await db.scalar(select(UserFeatureAccess).where(UserFeatureAccess.user_email == email, UserFeatureAccess.feature_key == payload.feature_key))
    if granted:
        return {"status": "APPROVED", "feature_key": payload.feature_key, "feature": payload.feature_name, "message": "Feature access is already approved."}
    pending = await db.scalar(select(FeatureAccessRequest).where(FeatureAccessRequest.user_email == email, FeatureAccessRequest.feature_key == payload.feature_key, FeatureAccessRequest.status == "PENDING"))
    if pending:
        return _access_request_dict(pending)
    entry = FeatureAccessRequest(user_email=email, user_name=current_user.get("name") or email, feature_key=payload.feature_key, feature_name=payload.feature_name)
    db.add(entry)
    await db.flush()
    return _access_request_dict(entry)


@router.get("/access-requests")
async def list_my_access_requests(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(FeatureAccessRequest).where(FeatureAccessRequest.user_email == current_user["email"].lower()).order_by(FeatureAccessRequest.requested_at.desc()))).scalars().all()
    return {"requests": [_access_request_dict(row) for row in rows]}


@router.get("/admin/access-requests")
async def list_access_requests(
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(FeatureAccessRequest).order_by(FeatureAccessRequest.requested_at.desc()))).scalars().all()
    return {"requests": [_access_request_dict(row) for row in rows], "total": len(rows)}


@router.post("/admin/access-requests/{request_id}/approve")
async def approve_access_request(
    request_id: str,
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(FeatureAccessRequest, request_id)
    if not entry:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Access request not found")
    entry.status = "APPROVED"
    entry.reviewed_at = datetime.now(timezone.utc)
    entry.reviewed_by = current_user.get("email")
    entry.rejection_reason = None
    granted = await db.scalar(select(UserFeatureAccess).where(UserFeatureAccess.user_email == entry.user_email, UserFeatureAccess.feature_key == entry.feature_key))
    if not granted:
        db.add(UserFeatureAccess(user_email=entry.user_email, feature_key=entry.feature_key, granted_by=current_user.get("email") or "admin"))
    db.add(UserNotification(user_email=entry.user_email, title="Access Approved", message=f"Your access to {entry.feature_name} has been approved."))
    await db.flush()
    return _access_request_dict(entry)


@router.post("/admin/access-requests/{request_id}/reject")
async def reject_access_request(
    request_id: str,
    payload: AccessDecision,
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(FeatureAccessRequest, request_id)
    if not entry:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Access request not found")
    entry.status = "REJECTED"
    entry.reviewed_at = datetime.now(timezone.utc)
    entry.reviewed_by = current_user.get("email")
    entry.rejection_reason = payload.rejection_reason or "Not approved by the administrator."
    db.add(UserNotification(user_email=entry.user_email, title="Access Request Update", message=f"Your request for {entry.feature_name} was not approved. {entry.rejection_reason}"))
    await db.flush()
    return _access_request_dict(entry)


@router.get("/notifications")
async def list_notifications(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(UserNotification).where(UserNotification.user_email == current_user["email"].lower()).order_by(UserNotification.created_at.desc()).limit(25))).scalars().all()
    return {"notifications": [{"id": row.id, "title": row.title, "message": row.message, "created_at": row.created_at.isoformat() if row.created_at else None, "read": row.read_at is not None} for row in rows]}


@router.get("/admin/audit-log")
async def audit_log(
    limit: int = Query(default=50, ge=1, le=200),
    current_user=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit)
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
