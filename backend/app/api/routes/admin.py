"""
Admin API: user management, source configuration, anomaly detection, audit log.
All endpoints require ADMIN role.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, func
from datetime import datetime, timezone
import logging
import secrets
from app.core.database import get_db
from app.core.auth import require_admin, get_current_user, require_admin_or_local, oauth2_optional_scheme
from app.core.config import settings
from app.models.user import AuditLog, User
from app.models.auth_account import AuthAccount
from app.models.fare import FareObservation
from app.models.collection import SourceHealth
from app.models.feedback import UserFeedback
from app.models.access import FeatureAccessRequest, UserFeatureAccess, UserNotification
from app.services.anomaly_detector import detect_anomalies, get_anomaly_summary

router = APIRouter()
logger = logging.getLogger(__name__)


def _utc_iso(value: datetime | None) -> str | None:
    """Serialize timestamps consistently; SQLite drops tzinfo for UTC values."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class FeedbackCreate(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class FeedbackUpdate(BaseModel):
    status: str = Field(pattern="^(NEW|REVIEWED)$")


class AccessRequestCreate(BaseModel):
    feature_key: str = Field(min_length=1, max_length=80)
    feature_name: str = Field(min_length=1, max_length=255)


class UserInviteCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=3, max_length=255)
    role: str = Field(pattern="^(PUBLIC|ANALYST|ADMIN)$")
    plan: str = Field(default="FREE", pattern="^(FREE|SUBSCRIBER|GOVERNMENT|ADMIN)$")


class UserRoleUpdate(BaseModel):
    role: str = Field(pattern="^(PUBLIC|ANALYST|ADMIN)$")
    plan: str | None = Field(default=None, pattern="^(FREE|SUBSCRIBER|GOVERNMENT|ADMIN)$")


class UserDeleteRequest(BaseModel):
    firebase_uid: str | None = Field(default=None, max_length=128)


async def _ensure_user_record(current_user: dict, db: AsyncSession) -> None:
    """Persist verified identities for admin, feedback, and access workflows."""
    email = (current_user.get("email") or "").strip().lower()
    # `local-admin` is a synthetic development-only authorization fallback,
    # not an account. Never persist it into the real user directory.
    if not email or email == "local-admin":
        return
    try:
        row = await db.scalar(select(User).where(User.email == email))
    except Exception:
        # User-directory persistence is supplemental. Older local databases
        # may not have the users table yet; never block feedback or access
        # requests because that optional table is unavailable.
        await db.rollback()
        return
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


def _role_plan(role: str, existing_plan: str | None = None, requested_plan: str | None = None) -> tuple[str, str]:
    if role == "ADMIN":
        return "ADMIN", "ADMIN"
    if role == "ANALYST":
        return "ANALYST", "GOVERNMENT"
    if requested_plan == "SUBSCRIBER" or existing_plan == "SUBSCRIBER":
        return "PUBLIC", "SUBSCRIBER"
    return "PUBLIC", "FREE"


def _firebase_user_dict(record, admin_emails, analyst_emails):
    email = (record.email or "").strip().lower()
    last_login = record.user_metadata.last_sign_in_timestamp
    created = record.user_metadata.creation_timestamp
    claims = record.custom_claims or {}
    claim_role = str(claims.get("aeroprice_role", "")).upper()
    role_from_claim = claim_role in {"PUBLIC", "ANALYST", "ADMIN"}
    role_from_config = not role_from_claim and (email in admin_emails or email in analyst_emails)
    role = claim_role if role_from_claim else "ADMIN" if email in admin_emails else "ANALYST" if email in analyst_emails else "PUBLIC"
    _, default_plan = _role_plan(role)
    claim_plan = str(claims.get("aeroprice_plan", "")).upper()
    plan_from_claim = claim_plan in {"FREE", "SUBSCRIBER", "GOVERNMENT", "ADMIN"}
    plan = claim_plan if plan_from_claim else default_plan
    providers = [provider.provider_id for provider in (record.provider_data or [])]
    return {
        "uid": record.uid,
        "email": email,
        "role": role,
        "plan": plan,
        "name": record.display_name or email or "Firebase User",
        "is_active": not record.disabled,
        "email_verified": bool(record.email_verified),
        "providers": providers,
        "role_source": "claim" if role_from_claim else "config" if role_from_config else "default",
        "plan_source": "claim" if plan_from_claim else "default",
        "created_at": datetime.fromtimestamp(created / 1000, timezone.utc).isoformat() if created else None,
        "last_login": datetime.fromtimestamp(last_login / 1000, timezone.utc).isoformat() if last_login else None,
    }


def _directory_metadata(*rows):
    """Return the strongest persisted role/plan metadata for each email."""
    result = {}
    rank = {"PUBLIC": 0, "ANALYST": 1, "ADMIN": 2}
    for row in rows:
        email = str(row.email).strip().lower()
        if not email:
            continue
        current = result.get(email)
        if current is None or rank.get(str(row.role).upper(), 0) >= rank.get(str(current.role).upper(), 0):
            result[email] = row
    return result


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
        return [_firebase_user_dict(record, admin_emails, analyst_emails) for record in page.users], page.next_page_token if page.has_next_page else None
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
    try:
        await _ensure_user_record(current_user, db)
        await db.flush()
    except Exception as exc:
        # Directory visibility must not fail just because a first deployment
        # is still waiting for the users-table migration.
        logger.warning("Could not persist authenticated admin in users table: %s", type(exc).__name__)
        await db.rollback()
    if uid or email:
        found = _firebase_user_lookup(uid, email)
        if found is None:
            raise HTTPException(status_code=404, detail="Firebase user not found")
        return {"users": [found], "total": 1, "source": "firebase", "next_page_token": None}
    firebase_page = _firebase_users_page(page_token, limit)
    if firebase_page is not None:
        firebase_users, next_page_token = firebase_page
        # Firebase is the primary directory, but backend-managed accounts can
        # exist before a Firebase identity is linked. Keep those accounts in
        # the admin view instead of dropping them when Firebase is configured.
        try:
            local_rows = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
            backend_rows = (await db.execute(select(AuthAccount).where(AuthAccount.is_active == True).order_by(AuthAccount.created_at.desc()))).scalars().all()
        except Exception:
            local_rows, backend_rows = [], []
        persisted = _directory_metadata(*local_rows, *backend_rows)
        merged = list(firebase_users)
        seen = {str(row.get("email", "")).strip().lower() for row in merged}
        for item in merged:
            row = persisted.get(str(item.get("email", "")).strip().lower())
            if row is not None:
                # Firebase custom claims are the authoritative role/plan when
                # present. Local rows fill in legacy accounts that predate
                # claims, but must not overwrite a newer Firebase decision.
                if item.get("role_source") == "default":
                    item["role"] = row.role
                if item.get("plan_source") == "default":
                    item["plan"] = row.plan
                item.update({
                    "name": row.name or item.get("name"),
                    "is_active": row.is_active,
                    "source": "firebase_and_local",
                })
        for row in persisted.values():
            email_key = str(row.email).strip().lower()
            if not email_key or email_key in seen:
                continue
            merged.append({
                "email": row.email,
                "role": row.role,
                "plan": row.plan,
                "name": row.name,
                "is_active": row.is_active,
                "last_login": row.last_login.isoformat() if row.last_login else None,
                "source": "local_database",
            })
            seen.add(email_key)
        return {"users": merged, "total": len(merged), "source": "firebase_and_local", "next_page_token": next_page_token}
    try:
        rows = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    except Exception:
        # A fresh deployment may receive this request before its first
        # migration. Return the safe demo fallback instead of a 500.
        rows = []
    if rows:
        return {"users": [{"email": row.email, "role": row.role, "plan": row.plan, "name": row.name, "is_active": row.is_active, "last_login": row.last_login.isoformat() if row.last_login else None} for row in rows[:limit]], "total": len(rows), "source": "local_database", "next_page_token": None}
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


@router.post("/admin/users")
async def create_user_invitation(
    payload: UserInviteCreate,
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    """Create a Firebase identity and persist its selected workspace role.

    Firebase Admin creates the account; the admin UI can then send the normal
    Firebase password-reset email. No password is returned to the browser.
    """
    email = payload.email.strip().lower()
    name = payload.name.strip()
    role, plan = _role_plan(payload.role, requested_plan=payload.plan)
    try:
        from app.core.firebase_admin import firebase_app
        firebase_admin = firebase_app()
        if not firebase_admin:
            raise HTTPException(status_code=503, detail="Firebase Admin credentials are not configured; no account was created.")
        from firebase_admin import auth
        try:
            auth.get_user_by_email(email)
            raise HTTPException(status_code=409, detail="A Firebase account already exists for this email.")
        except auth.UserNotFoundError:
            pass
        record = auth.create_user(
            email=email,
            password=secrets.token_urlsafe(32),
            display_name=name,
            email_verified=False,
        )
        auth.set_custom_user_claims(record.uid, {"aeroprice_role": role, "aeroprice_plan": plan})
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Firebase invitation creation failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="The Firebase account could not be created.") from exc

    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        existing.name, existing.role, existing.plan, existing.is_active = name, role, plan, True
    else:
        db.add(User(email=email, name=name, role=role, plan=plan, is_active=True))
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action="USER_CREATE",
        resource_type="user",
        resource_id=email,
        details={"target_email": email, "role": role, "plan": plan},
    ))
    await db.flush()
    return {
        "status": "CREATED",
        "message": "Account created. Send the reset link from this row to deliver access securely.",
        "user": {"uid": record.uid, "email": email, "name": name, "role": role, "plan": plan, "is_active": True, "status": "ACTIVE"},
    }


@router.patch("/admin/users/{email}/role")
async def update_user_role(
    email: str,
    payload: UserRoleUpdate,
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    """Persist an admin-selected role for a Firebase or backend account."""
    normalized = email.strip().lower()
    role = payload.role.upper()
    user = await db.scalar(select(User).where(User.email == normalized))
    auth_account = await db.scalar(select(AuthAccount).where(AuthAccount.email == normalized))
    existing_plan = user.plan if user else auth_account.plan if auth_account else None
    _, plan = _role_plan(role, existing_plan, payload.plan)
    try:
        from app.core.firebase_admin import firebase_app
        firebase_admin = firebase_app()
        if firebase_admin:
            from firebase_admin import auth
            try:
                record = auth.get_user_by_email(normalized)
            except auth.UserNotFoundError:
                record = None
            if record is not None:
                claims = dict(record.custom_claims or {})
                claims.update({"aeroprice_role": role, "aeroprice_plan": plan})
                auth.set_custom_user_claims(record.uid, claims)
    except Exception as exc:
        logger.exception("Firebase role update failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="The Firebase role could not be updated.") from exc
    if user:
        user.role, user.plan = role, plan
    else:
        db.add(User(email=normalized, name=auth_account.name if auth_account else normalized, role=role, plan=plan, is_active=True))
    if auth_account:
        auth_account.role, auth_account.plan = role, plan
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action="ROLE_CHANGE",
        resource_type="user",
        resource_id=normalized,
        details={"target_email": normalized, "role": role, "plan": plan},
    ))
    await db.flush()
    return {"email": normalized, "role": role, "plan": plan}


@router.delete("/admin/users/{email}")
async def delete_managed_user(
    email: str,
    payload: UserDeleteRequest,
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    """Remove an account identity and its access data while retaining audit/feedback history."""
    normalized = email.strip().lower()
    if not normalized or "@" not in normalized:
        raise HTTPException(status_code=422, detail="A valid user email is required.")
    if normalized == str(current_user.get("email", "")).strip().lower():
        raise HTTPException(status_code=400, detail="You cannot delete the currently signed-in administrator.")

    local_user = await db.scalar(select(User).where(func.lower(User.email) == normalized))
    auth_account = await db.scalar(select(AuthAccount).where(func.lower(AuthAccount.email) == normalized))
    firebase_deleted = False
    try:
        from app.core.firebase_admin import firebase_app
        firebase_admin = firebase_app()
        if payload.firebase_uid and not firebase_admin:
            raise HTTPException(status_code=503, detail="Firebase Admin credentials are unavailable; the account was not deleted.")
        if firebase_admin:
            from firebase_admin import auth
            try:
                record = auth.get_user(payload.firebase_uid) if payload.firebase_uid else auth.get_user_by_email(normalized)
            except auth.UserNotFoundError:
                if payload.firebase_uid:
                    raise HTTPException(status_code=404, detail="The Firebase account was not found; no local data was removed.")
                record = None
            if record is not None:
                if str(record.email or "").strip().lower() != normalized:
                    raise HTTPException(status_code=400, detail="The Firebase identity does not match the selected email.")
                auth.delete_user(record.uid)
                firebase_deleted = True
        elif not (local_user or auth_account):
            raise HTTPException(status_code=503, detail="Firebase Admin credentials are unavailable; the account was not deleted.")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Managed user deletion failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="The Firebase account could not be deleted; local data was preserved.") from exc

    for model in (FeatureAccessRequest, UserFeatureAccess, UserNotification):
        await db.execute(delete(model).where(func.lower(model.user_email) == normalized))
    if auth_account:
        await db.delete(auth_account)
    if local_user:
        await db.delete(local_user)
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action="USER_DELETE",
        resource_type="user",
        resource_id=normalized,
        details={"target_email": normalized, "firebase_deleted": firebase_deleted},
    ))
    await db.flush()
    return {"status": "DELETED", "email": normalized, "firebase_deleted": firebase_deleted}


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
    return {"id": entry.id, "status": entry.status, "created_at": _utc_iso(entry.created_at)}


@router.get("/admin/feedback")
async def list_feedback(
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(UserFeedback).order_by(UserFeedback.created_at.desc()))).scalars().all()
    return {"feedback": [{
        "id": row.id,
        "email": row.user_email,
        "name": row.user_name,
        "message": row.message,
        "status": row.status,
        "created_at": _utc_iso(row.created_at),
        "reviewed_at": _utc_iso(row.reviewed_at),
    } for row in rows], "total": len(rows)}


@router.patch("/admin/feedback/{feedback_id}")
async def update_feedback(
    feedback_id: str,
    payload: FeedbackUpdate,
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(UserFeedback, feedback_id)
    if not entry:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Feedback not found")
    previous_status = entry.status
    entry.status = payload.status
    entry.reviewed_at = datetime.now(timezone.utc) if payload.status == "REVIEWED" else None
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action="FEEDBACK_STATUS",
        resource_type="feedback",
        resource_id=entry.id,
        details={"target_email": entry.user_email, "from": previous_status, "to": payload.status},
    ))
    await db.flush()
    return {"id": entry.id, "status": entry.status}


@router.delete("/admin/feedback/{feedback_id}")
async def delete_feedback(feedback_id: str, current_user=Depends(require_admin_or_local), db: AsyncSession = Depends(get_db)):
    entry = await db.get(UserFeedback, feedback_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Feedback not found")
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action="FEEDBACK_DELETE",
        resource_type="feedback",
        resource_id=entry.id,
        details={"target_email": entry.user_email},
    ))
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
        "created_at": _utc_iso(entry.requested_at),
        "reviewed_at": _utc_iso(entry.reviewed_at),
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
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action="ACCESS_REQUEST_DELETE",
        resource_type="feature_access",
        resource_id=entry.id,
        details={"target_email": entry.user_email, "feature_key": entry.feature_key},
    ))
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
    # PRICE_ALERTS is the current Premium entitlement. Keep authentication
    # role and subscription entitlement separate: approval changes the
    # persistent user plan, while the role remains PUBLIC. The next token
    # exchange then carries the backend-authoritative entitlement to the UI.
    if entry.feature_key == "PRICE_ALERTS":
        account = await db.scalar(select(User).where(User.email == entry.user_email))
        if account and account.role == "PUBLIC" and account.plan == "FREE":
            account.plan = "SUBSCRIBER"
        auth_account = await db.scalar(select(AuthAccount).where(AuthAccount.email == entry.user_email))
        if auth_account and auth_account.role == "PUBLIC" and auth_account.plan == "FREE":
            auth_account.plan = "SUBSCRIBER"
    db.add(UserNotification(user_email=entry.user_email, title="Access Approved", message=f"Your access to {entry.feature_name} has been approved."))
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action="ACCESS_APPROVED",
        resource_type="feature_access",
        resource_id=entry.id,
        details={"target_email": entry.user_email, "feature_key": entry.feature_key},
    ))
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
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action="ACCESS_REJECTED",
        resource_type="feature_access",
        resource_id=entry.id,
        details={"target_email": entry.user_email, "feature_key": entry.feature_key, "reason": entry.rejection_reason},
    ))
    await db.flush()
    return _access_request_dict(entry)


@router.get("/notifications")
async def list_notifications(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(UserNotification).where(UserNotification.user_email == current_user["email"].lower()).order_by(UserNotification.created_at.desc()).limit(25))).scalars().all()
    return {"notifications": [{"id": row.id, "title": row.title, "message": row.message, "created_at": _utc_iso(row.created_at), "read": row.read_at is not None} for row in rows]}


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.scalar(select(UserNotification).where(
        UserNotification.id == notification_id,
        UserNotification.user_email == current_user["email"].lower(),
    ))
    if not entry:
        raise HTTPException(status_code=404, detail="Notification not found")
    entry.read_at = entry.read_at or datetime.now(timezone.utc)
    await db.flush()
    return {"id": entry.id, "read": True}


@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(UserNotification).where(
        UserNotification.user_email == current_user["email"].lower(),
        UserNotification.read_at.is_(None),
    ))).scalars().all()
    read_at = datetime.now(timezone.utc)
    for entry in rows:
        entry.read_at = read_at
    await db.flush()
    return {"updated": len(rows)}


@router.get("/admin/audit-log")
async def audit_log(
    limit: int = Query(default=50, ge=1, le=200),
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    total = await db.scalar(select(func.count()).select_from(AuditLog)) or 0
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
                "created_at": _utc_iso(e.created_at),
            }
            for e in entries
        ],
        "total": int(total),
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
