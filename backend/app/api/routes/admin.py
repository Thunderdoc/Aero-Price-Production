"""
Admin API: user management, source configuration, anomaly detection, audit log.
All endpoints require ADMIN role.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone
import logging
from app.core.database import get_db
from app.core.auth import require_admin, get_current_user, require_admin_or_local, oauth2_optional_scheme
from app.core.config import settings
from app.models.user import AuditLog, User
from app.models.fare import FareObservation
from app.models.collection import SourceHealth
from app.models.feedback import UserFeedback
from app.models.access import FeatureAccessRequest, UserFeatureAccess, UserNotification
from app.services.anomaly_detector import detect_anomalies, get_anomaly_summary

router = APIRouter()
logger = logging.getLogger(__name__)


class FeedbackCreate(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class FeedbackUpdate(BaseModel):
    status: str = Field(pattern="^(NEW|REVIEWED)$")


class AccessRequestCreate(BaseModel):
    feature_key: str = Field(min_length=1, max_length=80)
    feature_name: str = Field(min_length=1, max_length=255)


async def _ensure_user_record(current_user: dict, db: AsyncSession) -> None:
    """Persist verified identities for admin, feedback, and access workflows."""
    email = (current_user.get("email") or "").strip().lower()
    if not email:
        return
    row = await db.scalar(select(User).where(User.email == email))
    if row:
        row.name = current_user.get("name") or row.name
        row.role = current_user.get("role") or row.role
        row.plan = current_user.get("plan") or row.plan
        row.last_login = datetime.now(timezone.utc)
        return
    db.add(User(
        email=email,
        name=current_user.get("name") or email,
        role=current_user.get("role", "PUBLIC"),
        plan=current_user.get("plan", "FREE"),
        is_active=True,
        last_login=datetime.now(timezone.utc),
    ))


class AccessDecision(BaseModel):
    rejection_reason: str | None = Field(default=None, max_length=2000)


def _firebase_user_dict(record, admin_emails, analyst_emails):
    email = (record.email or "").strip().lower()
    last_login = record.user_metadata.last_sign_in_timestamp
    created = record.user_metadata.creation_timestamp
    role = "ADMIN" if email in admin_emails else "ANALYST" if email in analyst_emails else "PUBLIC"
    providers = [provider.provider_id for provider in (record.provider_data or [])]
    return {
        "uid": record.uid,
        "email": email,
        "role": role,
        "plan": "ADMIN" if role == "ADMIN" else "GOVERNMENT" if role == "ANALYST" else "FREE",
        "name": record.display_name or email or "Firebase User",
        "is_active": not record.disabled,
        "email_verified": bool(record.email_verified),
        "providers": providers,
        "created_at": datetime.fromtimestamp(created / 1000, timezone.utc).isoformat() if created else None,
        "last_login": datetime.fromtimestamp(last_login / 1000, timezone.utc).isoformat() if last_login else None,
    }


def _firebase_users_page(page_token: str | None, limit: int):
    """Read one bounded Firebase Auth page; never scan the whole directory."""
    try:
        from app.core.firebase_admin import firebase_app
        firebase_admin = firebase_app()
        if not firebase_admin:
            logger.warning("Firebase Admin user directory unavailable: FIREBASE_SERVICE_ACCOUNT_JSON is not configured")
            return None
        from firebase_admin import auth
        admin_emails = {
            email.strip().lower()
            for email in settings.FIREBASE_ADMIN_EMAILS.split(",")
            if email.strip()
        }
        analyst_emails = {
            email.strip().lower()
            for email in settings.FIREBASE_ANALYST_EMAILS.split(",")
            if email.strip()
        }
        page = auth.list_users(page_token=page_token, max_results=limit)
        return [_firebase_user_dict(record, admin_emails, analyst_emails) for record in page.users], page.get_next_page_token() if page.has_next_page else None
    except Exception as exc:
        logger.exception("Firebase Admin user directory lookup failed: %s", type(exc).__name__)
        return None


def _firebase_users():
    """Backward-compatible diagnostic helper for callers/tests."""
    page = _firebase_users_page(None, 1000)
    return page[0] if page is not None else None


def _firebase_user_lookup(uid: str | None, email: str | None):
    """Look up one Firebase account without scanning the directory."""
    try:
        from app.core.firebase_admin import firebase_app
        if not firebase_app():
            return None
        from firebase_admin import auth
        admin_emails = {e.strip().lower() for e in settings.FIREBASE_ADMIN_EMAILS.split(",") if e.strip()}
        analyst_emails = {e.strip().lower() for e in settings.FIREBASE_ANALYST_EMAILS.split(",") if e.strip()}
        record = auth.get_user(uid) if uid else auth.get_user_by_email(email.strip().lower())
        return _firebase_user_dict(record, admin_emails, analyst_emails)
    except Exception as exc:
        logger.exception("Firebase Admin user lookup failed: %s", type(exc).__name__)
        return None


@router.get("/admin/users")
async def list_users(
    uid: str | None = Query(default=None),
    email: str | None = Query(default=None),
    page_token: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_user_record(current_user, db)
    await db.flush()
    if uid or email:
        found = _firebase_user_lookup(uid, email)
        if found is None:
            raise HTTPException(status_code=404, detail="Firebase user not found")
        return {"users": [found], "total": 1, "source": "firebase", "next_page_token": None}
    firebase_page = _firebase_users_page(page_token, limit)
    if firebase_page is not None:
        firebase_users, next_page_token = firebase_page
        return {"users": firebase_users, "total": len(firebase_users), "source": "firebase", "next_page_token": next_page_token}
    try:
        rows = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    except Exception:
        # A fresh deployment may receive this request before its first
        # migration. Return the safe demo fallback instead of a 500.
        rows = []
    if rows:
        return {"users": [{"email": row.email, "role": row.role, "plan": row.plan, "name": row.name, "is_active": row.is_active, "last_login": row.last_login.isoformat() if row.last_login else None} for row in rows[:limit]], "total": len(rows), "source": "local_database", "next_page_token": None}
    # Keep the admin workspace useful even when the deployment has not yet
    # configured Firebase Admin directory access or populated local accounts.
    # This is the verified caller, not a fabricated demo user.
    if current_user.get("email"):
        return {
            "users": [{
                "email": current_user["email"],
                "role": current_user.get("role", "ADMIN"),
                "plan": current_user.get("plan", "ADMIN"),
                "name": current_user.get("name") or current_user["email"],
                "is_active": True,
                "last_login": None,
            }],
            "total": 1,
            "source": "authenticated_caller",
            "next_page_token": None,
            "note": "Showing the authenticated admin account. Configure Firebase Admin credentials to load the full user directory.",
        }
    return {
        "users": [],
        "total": 0,
        "source": "local_database",
        "next_page_token": None,
        "note": "No Firebase or local database users are available. Demo accounts are not included in admin user management.",
    }


@router.post("/admin/feedback")
async def create_feedback(
    payload: FeedbackCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_user_record(current_user, db)
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


@router.delete("/admin/feedback/{feedback_id}")
async def delete_feedback(feedback_id: str, current_user=Depends(require_admin), db: AsyncSession = Depends(get_db)):
    entry = await db.get(UserFeedback, feedback_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Feedback not found")
    await db.delete(entry)
    return {"status": "DELETED", "id": feedback_id}


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
    await _ensure_user_record(current_user, db)
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


@router.delete("/admin/access-requests/{request_id}")
async def delete_access_request(request_id: str, current_user=Depends(require_admin_or_local), db: AsyncSession = Depends(get_db)):
    entry = await db.get(FeatureAccessRequest, request_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Access request not found")
    await db.delete(entry)
    return {"status": "DELETED", "id": request_id}


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


@router.get("/admin/system-parameters")
async def system_parameters(current_user=Depends(require_admin)):
    """Read-only values actually used by the running backend algorithms."""
    from app.services.anomaly_detector import Z_THRESHOLD, MIN_SAMPLE_FOR_ZSCORE
    from app.services.forecast_engine import MIN_OBS_FOR_FORECAST
    from app.services.index_engine import MIN_CORRIDORS_TO_PUBLISH, MIN_OBS_PER_CORRIDOR
    from app.services.source_health import LIVE_FRESHNESS

    return {
        "mode": "READ_ONLY",
        "note": "These are backend code settings. Editing browser fields does not change collection or analytics.",
        "parameters": [
            {"key": "anomaly_zscore", "label": "Anomaly Z-score threshold", "value": Z_THRESHOLD, "unit": "σ"},
            {"key": "anomaly_min_sample", "label": "Minimum observations for anomaly detection", "value": MIN_SAMPLE_FOR_ZSCORE, "unit": "quotes"},
            {"key": "min_corridors_index", "label": "Minimum matched corridors for index", "value": MIN_CORRIDORS_TO_PUBLISH, "unit": "routes"},
            {"key": "min_fares_per_corridor", "label": "Minimum fares per index corridor", "value": MIN_OBS_PER_CORRIDOR, "unit": "quotes"},
            {"key": "min_daily_forecast", "label": "Minimum daily observations for forecast", "value": MIN_OBS_FOR_FORECAST, "unit": "days"},
            {"key": "source_live_freshness", "label": "Provider live-status freshness window", "value": LIVE_FRESHNESS.total_seconds() / 3600, "unit": "hours"},
        ],
    }
