"""
Admin API: user management, source configuration, anomaly detection, audit log.
All endpoints require ADMIN role.
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select, func
from sqlalchemy.orm import defer
from datetime import datetime, timezone
import logging
import secrets
import base64
import binascii
from app.core.database import get_db
from app.core.auth import require_admin, get_current_user, require_admin_or_local, oauth2_optional_scheme
from app.core.config import settings
from app.models.user import AuditLog, User
from app.models.auth_account import AuthAccount
from app.models.fare import FareObservation
from app.models.collection import SourceHealth
from app.models.feedback import UserFeedback, FeedbackDetails
from app.models.access import FeatureAccessRequest, UserFeatureAccess, UserNotification, PriceAlert
from app.services.anomaly_detector import detect_anomalies, get_anomaly_summary
from app.services.price_alerts import evaluate_price_alerts
from app.services.whatsapp import notify_admins

router = APIRouter()
logger = logging.getLogger(__name__)


def _utc_iso(value: datetime | None) -> str | None:
    """Serialize timestamps consistently; SQLite drops tzinfo for UTC values."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class FeedbackScreenshot(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    content_type: str = Field(pattern="^image/(png|jpeg)$")
    data_base64: str = Field(min_length=1, max_length=4_194_304)


class FeedbackCreate(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    title: str | None = Field(default=None, min_length=1, max_length=160)
    category: str = Field(default="PRODUCT", pattern="^(PRODUCT|BUG|DATA|DESIGN|SUPPORT|PRAISE)$")
    priority: str = Field(default="MEDIUM", pattern="^(LOW|MEDIUM|HIGH)$")
    source_module: str | None = Field(default=None, max_length=80)
    screenshot: FeedbackScreenshot | None = None


class FeedbackUpdate(BaseModel):
    status: str = Field(pattern="^(NEW|IN_PROGRESS|REVIEWED|RESOLVED)$")
    reply: str | None = Field(default=None, max_length=5000)
    internal_notes: str | None = Field(default=None, max_length=5000)


class AccessRequestCreate(BaseModel):
    feature_key: str = Field(min_length=1, max_length=80)
    feature_name: str = Field(min_length=1, max_length=255)
    request_message: str | None = Field(default=None, max_length=2000)


class UserInviteCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=3, max_length=255)
    role: str = Field(pattern="^(PUBLIC|ANALYST|ADMIN)$")
    plan: str = Field(default="FREE", pattern="^(FREE|SUBSCRIBER|GOVERNMENT|ADMIN)$")


class UserRoleUpdate(BaseModel):
    role: str = Field(pattern="^(PUBLIC|ANALYST|ADMIN)$")
    plan: str | None = Field(default=None, pattern="^(FREE|SUBSCRIBER|GOVERNMENT|ADMIN)$")
    firebase_uid: str | None = Field(default=None, max_length=128)


class UserStatusUpdate(BaseModel):
    is_active: bool
    reason: str | None = Field(default=None, max_length=500)
    firebase_uid: str | None = Field(default=None, max_length=128)


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
        # An old session must not undo an admin's role or subscription change
        # simply because this user submits feedback or requests access.
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


class PriceAlertCreate(BaseModel):
    route: str = Field(pattern="^[A-Z]{3}-[A-Z]{3}$")
    target_fare: float = Field(gt=0, le=1_000_000)
    travel_date: str | None = Field(default=None, pattern="^\\d{4}-\\d{2}-\\d{2}$")
    notification_frequency: str = Field(default="IMMEDIATE", pattern="^(IMMEDIATE|DAILY)$")


def _role_plan(role: str, existing_plan: str | None = None, requested_plan: str | None = None) -> tuple[str, str]:
    if role == "ADMIN":
        return "ADMIN", "ADMIN"
    if role == "ANALYST":
        return "ANALYST", "GOVERNMENT"
    # An explicit admin choice wins. In particular, changing Premium back to
    # Standard must not be silently overwritten by the previous plan.
    if requested_plan == "SUBSCRIBER":
        return "PUBLIC", "SUBSCRIBER"
    if requested_plan == "FREE":
        return "PUBLIC", "FREE"
    if existing_plan == "SUBSCRIBER":
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
    firebase_sync = "NOT_CONFIGURED"
    try:
        from app.core.firebase_admin import firebase_app
        firebase_admin = firebase_app()
        if firebase_admin:
            from firebase_admin import auth
            try:
                record = auth.get_user(payload.firebase_uid) if payload.firebase_uid else auth.get_user_by_email(normalized)
            except auth.UserNotFoundError:
                record = None
            if record is not None:
                claims = dict(record.custom_claims or {})
                claims.update({"aeroprice_role": role, "aeroprice_plan": plan})
                auth.set_custom_user_claims(record.uid, claims)
                firebase_sync = "SYNCED"
            else:
                firebase_sync = "USER_NOT_FOUND"
    except Exception as exc:
        # The database is the access authority for every API request. Do not
        # discard a valid administrator change merely because an optional
        # Firebase custom-claim mirror is temporarily unavailable.
        logger.warning("Firebase role claim sync deferred: %s", type(exc).__name__)
        firebase_sync = "DEFERRED"
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
        details={"target_email": normalized, "role": role, "plan": plan, "firebase_sync": firebase_sync},
    ))
    await db.flush()
    return {"email": normalized, "role": role, "plan": plan, "firebase_sync": firebase_sync}


@router.patch("/admin/users/{email}/status")
async def update_user_status(
    email: str,
    payload: UserStatusUpdate,
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    """Enable or disable a managed account through the authoritative backend."""
    normalized = email.strip().lower()
    if normalized == str(current_user.get("email") or "").strip().lower():
        raise HTTPException(status_code=422, detail="You cannot disable your own administrator account.")
    reason = (payload.reason or "").strip()
    if not payload.is_active and not reason:
        raise HTTPException(status_code=422, detail="A reason is required when disabling a user.")

    user = await db.scalar(select(User).where(User.email == normalized))
    auth_account = await db.scalar(select(AuthAccount).where(AuthAccount.email == normalized))
    firebase_updated = False
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
                auth.update_user(record.uid, disabled=not payload.is_active)
                firebase_updated = True
    except Exception as exc:
        logger.exception("Firebase status update failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="The Firebase account status could not be updated.") from exc

    if not user and not auth_account and not firebase_updated:
        # Firebase-only directory rows may be visible to the admin UI while
        # local Firebase Admin credentials are unavailable. Keep a local
        # shadow so backend authentication can enforce the requested state.
        user = User(email=normalized, name=normalized, role="PUBLIC", plan="FREE", is_active=payload.is_active)
        db.add(user)
    if user:
        user.is_active = payload.is_active
    elif firebase_updated:
        # Firebase-only identities need a local status shadow so the backend
        # can enforce the same disabled state during the next login exchange.
        user = User(
            email=normalized,
            name=normalized,
            role="PUBLIC",
            plan="FREE",
            is_active=payload.is_active,
        )
        db.add(user)
    if auth_account:
        auth_account.is_active = payload.is_active
    action = "USER_ENABLED" if payload.is_active else "USER_DISABLED"
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action=action,
        resource_type="user",
        resource_id=normalized,
        details={"target_email": normalized, "is_active": payload.is_active, "reason": reason or None},
    ))
    await db.flush()
    return {"email": normalized, "is_active": payload.is_active, "status": "ACTIVE" if payload.is_active else "INACTIVE"}


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
    message = payload.message.strip()
    if not message or (payload.title is not None and not payload.title.strip()):
        raise HTTPException(422, "Enter a summary and a description.")
    image = None
    if payload.screenshot:
        try:
            image = base64.b64decode(payload.screenshot.data_base64, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise HTTPException(422, "The screenshot could not be read.") from exc
        signature = b"\x89PNG\r\n\x1a\n" if payload.screenshot.content_type == "image/png" else b"\xff\xd8\xff"
        if not image.startswith(signature) or len(image) < 16 or len(image) > 3 * 1024 * 1024:
            raise HTTPException(422, "Attach a PNG or JPG screenshot no larger than 3 MB.")
    await _ensure_user_record(current_user, db)
    entry = UserFeedback(
        user_email=current_user["email"].strip().lower(),
        user_name=current_user.get("name") or current_user["email"],
        message=message,
    )
    db.add(entry)
    await db.flush()
    account = await db.scalar(select(User).where(User.email == entry.user_email))
    db.add(FeedbackDetails(
        feedback_id=entry.id, title=(payload.title or message[:160]).strip(),
        category=payload.category, priority=payload.priority, source_module=payload.source_module,
        user_role=account.role if account else current_user.get("role", "PUBLIC"),
        user_plan=account.plan if account else current_user.get("plan", "FREE"),
        screenshot_name=payload.screenshot.name if image else None,
        screenshot_type=payload.screenshot.content_type if image else None, screenshot=image,
    ))
    db.add(AuditLog(
        user_email=entry.user_email,
        action="FEEDBACK_CREATE",
        resource_type="feedback",
        resource_id=entry.id,
        details={
            "target_email": entry.user_email,
            "title": (payload.title or message[:160]).strip(),
            "category": payload.category,
            "priority": payload.priority,
            "source_module": payload.source_module,
            "has_screenshot": image is not None,
        },
    ))
    db.add(UserNotification(user_email=entry.user_email, title="Feedback received", message="Your feedback has been saved. You can follow its status in My submissions."))
    admins = set((await db.execute(select(User.email).where(User.role == "ADMIN", User.is_active == True))).scalars())
    admins.update((await db.execute(select(AuthAccount.email).where(AuthAccount.role == "ADMIN", AuthAccount.is_active == True))).scalars())
    for email in admins - {entry.user_email}:
        db.add(UserNotification(user_email=email.lower(), title="New feedback", message=f"{entry.user_name} submitted feedback: {(payload.title or message[:100]).strip()}"))
    await notify_admins(f"New AeroPrice feedback from {entry.user_name} ({entry.user_email}): {(payload.title or message[:140]).strip()}")
    await db.flush()
    return {"id": entry.id, "status": entry.status, "created_at": _utc_iso(entry.created_at)}


def _feedback_dict(row: UserFeedback, detail: FeedbackDetails | None, include_internal: bool = False) -> dict:
    payload = {"id": row.id, "email": row.user_email, "name": row.user_name,
            "message": row.message, "status": row.status, "created_at": _utc_iso(row.created_at),
            "reviewed_at": _utc_iso(row.reviewed_at), "title": detail.title if detail else None,
            "category": detail.category if detail else "PRODUCT", "priority": detail.priority if detail else "MEDIUM",
            "source_module": detail.source_module if detail else None, "role": detail.user_role if detail else None,
            "plan": detail.user_plan if detail else None, "reply": detail.admin_reply if detail else None,
            "has_screenshot": bool(detail and detail.screenshot_name),
            "screenshot_name": detail.screenshot_name if detail else None,
            "screenshot_type": detail.screenshot_type if detail else None}
    if include_internal:
        payload["internal_notes"] = detail.internal_notes if detail else None
    return payload


async def _audit_exists(db: AsyncSession, action: str, resource_type: str, resource_id: str) -> bool:
    existing = await db.scalar(
        select(AuditLog.id)
        .where(
            AuditLog.action == action,
            AuditLog.resource_type == resource_type,
            AuditLog.resource_id == resource_id,
        )
        .limit(1)
    )
    return existing is not None


async def _backfill_audit_log(db: AsyncSession) -> int:
    """Create audit rows for records saved before audit logging existed."""
    created = 0

    users = (await db.execute(select(User))).scalars().all()
    for row in users:
        email = row.email.strip().lower()
        if not await _audit_exists(db, "USER_CREATE", "user", email):
            db.add(AuditLog(
                user_email=None,
                action="USER_CREATE",
                resource_type="user",
                resource_id=email,
                details={
                    "target_email": email,
                    "role": row.role,
                    "plan": row.plan,
                    "source": "audit_backfill",
                },
                created_at=row.created_at,
            ))
            created += 1

    auth_accounts = (await db.execute(select(AuthAccount))).scalars().all()
    for row in auth_accounts:
        email = row.email.strip().lower()
        if not await _audit_exists(db, "USER_CREATE", "user", email):
            db.add(AuditLog(
                user_email=None,
                action="USER_CREATE",
                resource_type="user",
                resource_id=email,
                details={
                    "target_email": email,
                    "role": row.role,
                    "plan": row.plan,
                    "source": "audit_backfill",
                },
                created_at=row.created_at,
            ))
            created += 1

    feedback_rows = (await db.execute(
        select(UserFeedback, FeedbackDetails).outerjoin(FeedbackDetails)
    )).all()
    for feedback, detail in feedback_rows:
        if not await _audit_exists(db, "FEEDBACK_CREATE", "feedback", feedback.id):
            db.add(AuditLog(
                user_email=feedback.user_email,
                action="FEEDBACK_CREATE",
                resource_type="feedback",
                resource_id=feedback.id,
                details={
                    "target_email": feedback.user_email,
                    "title": detail.title if detail else feedback.message[:160],
                    "category": detail.category if detail else "PRODUCT",
                    "priority": detail.priority if detail else "MEDIUM",
                    "source_module": detail.source_module if detail else None,
                    "has_screenshot": bool(detail and detail.screenshot_name),
                    "source": "audit_backfill",
                },
                created_at=feedback.created_at,
            ))
            created += 1
        if feedback.status in {"REVIEWED", "RESOLVED", "IN_PROGRESS"} and feedback.reviewed_at:
            if not await _audit_exists(db, "FEEDBACK_STATUS", "feedback", feedback.id):
                db.add(AuditLog(
                    user_email=None,
                    action="FEEDBACK_STATUS",
                    resource_type="feedback",
                    resource_id=feedback.id,
                    details={
                        "target_email": feedback.user_email,
                        "status": feedback.status,
                        "source": "audit_backfill",
                    },
                    created_at=feedback.reviewed_at,
                ))
                created += 1

    access_rows = (await db.execute(select(FeatureAccessRequest))).scalars().all()
    for request in access_rows:
        if not await _audit_exists(db, "ACCESS_REQUESTED", "feature_access", request.id):
            db.add(AuditLog(
                user_email=request.user_email,
                action="ACCESS_REQUESTED",
                resource_type="feature_access",
                resource_id=request.id,
                details={
                    "target_email": request.user_email,
                    "feature_key": request.feature_key,
                    "feature_name": request.feature_name,
                    "message": request.request_message,
                    "source": "audit_backfill",
                },
                created_at=request.requested_at,
            ))
            created += 1
        status_action = {
            "APPROVED": "ACCESS_APPROVED",
            "REJECTED": "ACCESS_REJECTED",
            "REVOKED": "ACCESS_REVOKED",
        }.get(str(request.status).upper())
        if status_action and request.reviewed_at and not await _audit_exists(db, status_action, "feature_access", request.id):
            db.add(AuditLog(
                user_email=request.reviewed_by,
                action=status_action,
                resource_type="feature_access",
                resource_id=request.id,
                details={
                    "target_email": request.user_email,
                    "feature_key": request.feature_key,
                    "feature_name": request.feature_name,
                    "status": request.status,
                    "reason": request.rejection_reason,
                    "source": "audit_backfill",
                },
                created_at=request.reviewed_at,
            ))
            created += 1

    if created:
        await db.flush()
    return created


@router.get("/feedback/mine")
async def list_my_feedback(current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    email = current_user["email"].strip().lower()
    rows = (await db.execute(select(UserFeedback, FeedbackDetails).outerjoin(FeedbackDetails).where(
        UserFeedback.user_email == email).options(defer(FeedbackDetails.screenshot)).order_by(UserFeedback.created_at.desc()).limit(100))).all()
    total = await db.scalar(select(func.count()).select_from(UserFeedback).where(UserFeedback.user_email == email))
    return {"feedback": [_feedback_dict(row, detail) for row, detail in rows], "total": total}


@router.get("/feedback/{feedback_id}/screenshot")
async def feedback_screenshot(feedback_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = await db.get(UserFeedback, feedback_id)
    if not row or (current_user.get("role") != "ADMIN" and row.user_email != current_user["email"].strip().lower()):
        raise HTTPException(404, "Screenshot not found")
    detail = await db.get(FeedbackDetails, feedback_id)
    if not detail or not detail.screenshot:
        raise HTTPException(404, "Screenshot not found")
    return Response(detail.screenshot, media_type=detail.screenshot_type, headers={
        "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    })


@router.get("/admin/feedback")
async def list_feedback(
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(UserFeedback, FeedbackDetails).outerjoin(FeedbackDetails).options(
        defer(FeedbackDetails.screenshot)).order_by(UserFeedback.created_at.desc()))).all()
    return {"feedback": [_feedback_dict(row, detail, include_internal=True) for row, detail in rows], "total": len(rows)}


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
    detail = await db.get(FeedbackDetails, feedback_id)
    previous_reply = detail.admin_reply if detail else None
    previous_notes = detail.internal_notes if detail else None
    reply = payload.reply.strip() if payload.reply is not None else previous_reply
    notes = payload.internal_notes.strip() if payload.internal_notes is not None else previous_notes
    if previous_status == payload.status and previous_reply == reply and previous_notes == notes:
        return {"id": entry.id, "status": entry.status, "reply": reply, "internal_notes": notes}
    if not detail:
        detail = FeedbackDetails(feedback_id=entry.id, title=entry.message[:160], category="PRODUCT", priority="MEDIUM", user_role="UNKNOWN", user_plan="UNKNOWN")
        db.add(detail)
    detail.admin_reply = reply
    detail.internal_notes = notes
    entry.status = payload.status
    entry.reviewed_at = datetime.now(timezone.utc) if payload.status == "REVIEWED" else None
    if payload.status == "RESOLVED":
        entry.reviewed_at = datetime.now(timezone.utc)
    db.add(UserNotification(user_email=entry.user_email, title="Feedback updated",
        message=f"Your feedback is now {payload.status.lower().replace('_', ' ')}. " + ("An admin reply is available in My submissions." if reply else "See My submissions for details.")))
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action="FEEDBACK_STATUS",
        resource_type="feedback",
        resource_id=entry.id,
        details={"target_email": entry.user_email, "from": previous_status, "to": payload.status, "reply_changed": previous_reply != reply, "internal_notes_changed": previous_notes != notes},
    ))
    await db.flush()
    return {"id": entry.id, "status": entry.status, "reply": reply, "internal_notes": notes}


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
    await db.execute(delete(FeedbackDetails).where(FeedbackDetails.feedback_id == feedback_id))
    await db.delete(entry)
    return {"status": "DELETED", "id": feedback_id}


def _access_request_dict(entry: FeatureAccessRequest) -> dict:
    return {
        "id": entry.id,
        "email": entry.user_email,
        "name": entry.user_name,
        "feature_key": entry.feature_key,
        "feature": entry.feature_name,
        "request_message": entry.request_message,
        "status": entry.status,
        "created_at": _utc_iso(entry.requested_at),
        "reviewed_at": _utc_iso(entry.reviewed_at),
        "reviewed_by": entry.reviewed_by,
        "rejection_reason": entry.rejection_reason,
    }


async def _remove_access_grant(entry: FeatureAccessRequest, db: AsyncSession) -> None:
    """Remove a grant and restore only plan changes made by this approval."""
    await db.execute(delete(UserFeatureAccess).where(
        UserFeatureAccess.user_email == entry.user_email,
        UserFeatureAccess.feature_key == entry.feature_key,
    ))
    approval = await db.scalar(
        select(AuditLog)
        .where(AuditLog.action == "ACCESS_APPROVED", AuditLog.resource_id == entry.id)
        .order_by(AuditLog.created_at.desc())
    )
    details = approval.details if approval and isinstance(approval.details, dict) else {}
    restore_plan = details.get("restore_plan", {})
    if not isinstance(restore_plan, dict):
        return
    email = entry.user_email.lower()
    if restore_plan.get("user"):
        account = await db.scalar(select(User).where(User.email == email))
        if account and account.role == "PUBLIC" and account.plan == "SUBSCRIBER":
            account.plan = restore_plan["user"]
    if restore_plan.get("auth_account"):
        auth_account = await db.scalar(select(AuthAccount).where(AuthAccount.email == email))
        if auth_account and auth_account.role == "PUBLIC" and auth_account.plan == "SUBSCRIBER":
            auth_account.plan = restore_plan["auth_account"]


@router.post("/access-requests")
async def create_access_request(
    payload: AccessRequestCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.get("role") != "PUBLIC":
        raise HTTPException(status_code=403, detail="Access requests are available to user accounts only.")
    await _ensure_user_record(current_user, db)
    email = current_user["email"].lower()
    granted = await db.scalar(select(UserFeatureAccess).where(UserFeatureAccess.user_email == email, UserFeatureAccess.feature_key == payload.feature_key))
    if granted:
        return {"status": "APPROVED", "feature_key": payload.feature_key, "feature": payload.feature_name, "message": "Feature access is already approved."}
    pending = await db.scalar(select(FeatureAccessRequest).where(FeatureAccessRequest.user_email == email, FeatureAccessRequest.feature_key == payload.feature_key, FeatureAccessRequest.status == "PENDING"))
    if pending:
        return _access_request_dict(pending)
    entry = FeatureAccessRequest(
        user_email=email,
        user_name=current_user.get("name") or email,
        feature_key=payload.feature_key,
        feature_name=payload.feature_name,
        request_message=(payload.request_message or "").strip() or None,
    )
    db.add(entry)
    await db.flush()
    db.add(AuditLog(
        user_email=email,
        action="ACCESS_REQUESTED",
        resource_type="feature_access",
        resource_id=entry.id,
        details={"target_email": email, "feature_key": entry.feature_key, "requested_plan": "PREMIUM" if entry.feature_key == "PRICE_ALERTS" else None},
    ))
    await notify_admins(f"New AeroPrice Premium access request from {entry.user_name} ({entry.user_email}) for {entry.feature_name}.")
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


async def _require_price_alert_access(current_user: dict, db: AsyncSession) -> str:
    """Authorize the Premium feature with the live, revocable server grant."""
    email = current_user["email"].strip().lower()
    grant = await db.scalar(select(UserFeatureAccess).where(
        UserFeatureAccess.user_email == email,
        UserFeatureAccess.feature_key == "PRICE_ALERTS",
    ))
    if not grant:
        raise HTTPException(status_code=403, detail="Premium Price Alerts access is required. Request access and wait for administrator approval.")
    return email


async def _price_alert_dict(alert: PriceAlert, db: AsyncSession) -> dict:
    current_query = select(func.min(FareObservation.total_fare)).where(
        FareObservation.route == alert.route,
        FareObservation.is_valid == True,
        FareObservation.data_origin.in_(("REAL", "OFFICIAL")),
    )
    if alert.travel_date:
        current_query = current_query.where(FareObservation.travel_date == alert.travel_date)
    current_fare = await db.scalar(current_query)
    return {
        "id": alert.id,
        "route": alert.route,
        "target_fare": alert.target_fare,
        "travel_date": alert.travel_date,
        "notification_frequency": alert.notification_frequency,
        "status": alert.status,
        "current_fare": float(current_fare) if current_fare is not None else None,
        "triggered": alert.triggered_at is not None,
        "created_at": _utc_iso(alert.created_at),
    }


@router.get("/price-alerts")
async def list_price_alerts(current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    email = await _require_price_alert_access(current_user, db)
    rows = (await db.execute(select(PriceAlert).where(
        PriceAlert.user_email == email,
        PriceAlert.status == "ACTIVE",
    ).order_by(PriceAlert.created_at.desc()))).scalars().all()
    return {"alerts": [await _price_alert_dict(row, db) for row in rows]}


@router.post("/price-alerts")
async def create_price_alert(payload: PriceAlertCreate, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    email = await _require_price_alert_access(current_user, db)
    if payload.route[:3] == payload.route[4:]:
        raise HTTPException(status_code=422, detail="Choose two different airports for an alert.")
    alert = PriceAlert(
        user_email=email,
        route=payload.route,
        target_fare=payload.target_fare,
        travel_date=payload.travel_date,
        notification_frequency=payload.notification_frequency,
    )
    db.add(alert)
    await db.flush()
    db.add(AuditLog(
        user_email=email,
        action="PRICE_ALERT_CREATED",
        resource_type="price_alert",
        resource_id=alert.id,
        details={"route": alert.route, "target_fare": alert.target_fare, "frequency": alert.notification_frequency},
    ))
    # Evaluate against any already-collected verified fare immediately; later
    # collection cycles perform the same safe, idempotent evaluation.
    await evaluate_price_alerts(db)
    return await _price_alert_dict(alert, db)


@router.delete("/price-alerts/{alert_id}")
async def delete_price_alert(alert_id: str, current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    email = await _require_price_alert_access(current_user, db)
    alert = await db.get(PriceAlert, alert_id)
    if not alert or alert.user_email != email:
        raise HTTPException(status_code=404, detail="Price alert not found")
    db.add(AuditLog(
        user_email=email,
        action="PRICE_ALERT_DELETED",
        resource_type="price_alert",
        resource_id=alert.id,
        details={"route": alert.route},
    ))
    await db.delete(alert)
    await db.flush()
    return {"status": "DELETED", "id": alert_id}


@router.get("/admin/access-requests")
async def list_access_requests(
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(FeatureAccessRequest).order_by(FeatureAccessRequest.requested_at.desc()))).scalars().all()
    active_premium_users = await db.scalar(
        select(func.count(func.distinct(UserFeatureAccess.user_email))).where(
            UserFeatureAccess.feature_key == "PRICE_ALERTS"
        )
    ) or 0
    return {"requests": [_access_request_dict(row) for row in rows], "total": len(rows), "active_premium_users": int(active_premium_users)}


@router.get("/admin/access-requests/{request_id}")
async def get_access_request_details(
    request_id: str,
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    entry = await db.get(FeatureAccessRequest, request_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Access request not found")
    audit_rows = (await db.execute(
        select(AuditLog)
        .where(AuditLog.resource_type == "feature_access", AuditLog.resource_id == entry.id)
        .order_by(AuditLog.created_at.asc())
    )).scalars().all()
    history = [{
        "action": row.action,
        "actor": row.user_email,
        "created_at": _utc_iso(row.created_at),
        "details": row.details or {},
    } for row in audit_rows]
    if not any(item["action"] == "ACCESS_REQUESTED" for item in history):
        history.insert(0, {
            "action": "ACCESS_REQUESTED",
            "actor": entry.user_email,
            "created_at": _utc_iso(entry.requested_at),
            "details": {"target_email": entry.user_email, "feature_key": entry.feature_key},
        })
    return {"request": _access_request_dict(entry), "history": history}


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
    if entry.status != "PENDING":
        raise HTTPException(status_code=422, detail="Only pending Premium requests can be approved.")
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
    restore_plan = {}
    if entry.feature_key == "PRICE_ALERTS":
        account = await db.scalar(select(User).where(User.email == entry.user_email))
        if account and account.role == "PUBLIC" and account.plan == "FREE":
            restore_plan["user"] = account.plan
            account.plan = "SUBSCRIBER"
        auth_account = await db.scalar(select(AuthAccount).where(AuthAccount.email == entry.user_email))
        if auth_account and auth_account.role == "PUBLIC" and auth_account.plan == "FREE":
            restore_plan["auth_account"] = auth_account.plan
            auth_account.plan = "SUBSCRIBER"
    premium_request = entry.feature_key == "PRICE_ALERTS"
    db.add(UserNotification(
        user_email=entry.user_email,
        title="Premium Access Activated" if premium_request else "Access Approved",
        message="Your Premium access has been approved." if premium_request else f"Your access to {entry.feature_name} has been approved.",
    ))
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action="ACCESS_APPROVED",
        resource_type="feature_access",
        resource_id=entry.id,
        details={"target_email": entry.user_email, "feature_key": entry.feature_key, "restore_plan": restore_plan},
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
    if entry.status != "PENDING":
        raise HTTPException(status_code=422, detail="Only pending Premium requests can be rejected.")
    entry.status = "REJECTED"
    entry.reviewed_at = datetime.now(timezone.utc)
    entry.reviewed_by = current_user.get("email")
    entry.rejection_reason = payload.rejection_reason or "Not approved by the administrator."
    premium_request = entry.feature_key == "PRICE_ALERTS"
    db.add(UserNotification(
        user_email=entry.user_email,
        title="Premium Request Update" if premium_request else "Access Request Update",
        message=("Your Premium access request was not approved. " if premium_request else f"Your request for {entry.feature_name} was not approved. ") + entry.rejection_reason,
    ))
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action="ACCESS_REJECTED",
        resource_type="feature_access",
        resource_id=entry.id,
        details={"target_email": entry.user_email, "feature_key": entry.feature_key, "reason": entry.rejection_reason},
    ))
    await db.flush()
    return _access_request_dict(entry)


@router.post("/admin/access-requests/{request_id}/revoke")
async def revoke_access_request(
    request_id: str,
    payload: AccessDecision,
    current_user=Depends(require_admin_or_local),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a previously approved entitlement while retaining its history."""
    entry = await db.get(FeatureAccessRequest, request_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Access request not found")
    if entry.status != "APPROVED":
        raise HTTPException(status_code=422, detail="Only approved access can be revoked.")
    entry.status = "REVOKED"
    entry.reviewed_at = datetime.now(timezone.utc)
    entry.reviewed_by = current_user.get("email")
    entry.rejection_reason = payload.rejection_reason or "Access revoked by the administrator."
    await _remove_access_grant(entry, db)
    premium_request = entry.feature_key == "PRICE_ALERTS"
    db.add(UserNotification(
        user_email=entry.user_email,
        title="Premium Access Changed" if premium_request else "Access revoked",
        message="Your Premium entitlement has been changed to Standard." if premium_request else f"Your access to {entry.feature_name} was revoked. {entry.rejection_reason}",
    ))
    db.add(AuditLog(
        user_email=current_user.get("email"),
        action="ACCESS_REVOKED",
        resource_type="feature_access",
        resource_id=entry.id,
        details={"target_email": entry.user_email, "feature_key": entry.feature_key, "reason": entry.rejection_reason, "previous_plan": "SUBSCRIBER" if premium_request else None, "new_plan": "FREE" if premium_request else None},
    ))
    await db.flush()
    return _access_request_dict(entry)


@router.get("/notifications")
async def list_notifications(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(UserNotification).where(UserNotification.user_email == current_user["email"].lower()).order_by(UserNotification.created_at.desc()).limit(25))).scalars().all()
    email = current_user["email"].strip().lower()
    total = await db.scalar(select(func.count()).select_from(UserNotification).where(UserNotification.user_email == email))
    unread = await db.scalar(select(func.count()).select_from(UserNotification).where(UserNotification.user_email == email, UserNotification.read_at.is_(None)))
    return {"notifications": [{"id": row.id, "title": row.title, "message": row.message, "created_at": _utc_iso(row.created_at), "read": row.read_at is not None} for row in rows], "total": total, "unread_count": unread}


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
    if total == 0:
        await _backfill_audit_log(db)
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
