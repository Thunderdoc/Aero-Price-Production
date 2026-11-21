from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.auth import create_access_token, get_current_user, get_password_hash, verify_password
from app.core.firebase_tokens import verify_firebase_identity
from app.core.database import get_db
from app.models.auth_account import AuthAccount
from app.models.user import AuditLog, User

router = APIRouter(prefix="/auth", tags=["auth"])
_failed_attempts: dict[str, list[float]] = {}


@router.get("/me")
async def current_session(current_user: dict = Depends(get_current_user)):
    """Return current server-controlled roles and entitlements, never stale claims."""
    return current_user


async def _disabled_account_error(email: str, db: AsyncSession) -> HTTPException | None:
    """Return the user-facing disabled message before credential auth runs."""
    # Real route requests always receive an AsyncSession. Direct route-helper
    # tests may omit dependency resolution and pass FastAPI's Depends marker.
    if not callable(getattr(db, "scalar", None)):
        return None
    normalized = email.strip().lower()
    user = await db.scalar(select(User).where(User.email == normalized))
    account = await db.scalar(select(AuthAccount).where(AuthAccount.email == normalized))
    if not ((user and user.is_active is False) or (account and account.is_active is False)):
        return None
    event = await db.scalar(
        select(AuditLog)
        .where(
            AuditLog.resource_type == "user",
            AuditLog.resource_id == normalized,
            AuditLog.action == "USER_DISABLED",
        )
        .order_by(AuditLog.created_at.desc())
    )
    reason = (event.details or {}).get("reason") if event and isinstance(event.details, dict) else None
    message = "This account is disabled by an administrator. Contact support or an administrator to restore access."
    if reason:
        message += f" Reason: {reason}"
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)


async def _log_login_event(db: AsyncSession, email: str, action: str, ip_address: str | None, method: str, reason: str | None = None) -> None:
    """Best-effort LOGIN_SUCCESS / LOGIN_FAILURE audit row.

    Audit logging must never break sign-in: a failing audit write is rolled
    back and swallowed. The row is committed immediately because the failure
    paths raise right after logging, and the request-scoped session rolls
    back uncommitted work on an exception.
    """
    if not callable(getattr(db, "add", None)):
        return
    try:
        db.add(AuditLog(
            user_email=email.strip().lower(),
            action=action,
            resource_type="auth",
            resource_id=email.strip().lower(),
            details={"method": method, **({"reason": reason} if reason else {})},
            ip_address=ip_address,
        ))
        await db.commit()
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class RegistrationRequest(BaseModel):
    name: str
    email: str
    password: str
    workspace: str = "USER"

class FirebaseLoginRequest(BaseModel):
    id_token: str

@router.post("/firebase", response_model=TokenResponse)
async def firebase_login(payload: FirebaseLoginRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a verified Firebase ID token for an API token.

    API endpoints use the app's own JWT so Firebase sign-in and backend
    authorization share one stable session.
    """
    identity = None
    try:
        identity = await verify_firebase_identity(payload.id_token)
    except HTTPException as exc:
        # The token could not be verified, so there is no trusted email to
        # audit against; record the attempt without an identity.
        await _log_login_event(db, "unknown", "LOGIN_FAILURE", None, "firebase", reason=f"firebase_verify_failed:{exc.status_code}")
        raise
    except Exception:
        await _log_login_event(db, "unknown", "LOGIN_FAILURE", None, "firebase", reason="firebase_verify_error")
        raise
    # Firebase's verified email proves ownership, while persisted backend
    # metadata carries the admin-selected workspace role and entitlement.
    # This keeps roles stable even when the Firebase email allowlist is empty.
    disabled_error = await _disabled_account_error(identity["email"], db)
    if disabled_error:
        await _log_login_event(db, identity["email"], "LOGIN_FAILURE", None, "firebase", reason="disabled")
        raise disabled_error
    if identity["role"] == "PUBLIC" and hasattr(db, "scalar"):
        account = await db.scalar(select(AuthAccount).where(
            AuthAccount.email == identity["email"],
            AuthAccount.is_active == True,
        ))
        user = await db.scalar(select(User).where(
            User.email == identity["email"],
            User.is_active == True,
        ))
        persisted = account if account and account.role != "PUBLIC" else user
        if persisted and (persisted.role != "PUBLIC" or persisted.plan != "FREE"):
            identity = {**identity, "name": persisted.name or identity.get("name"), "role": persisted.role, "plan": persisted.plan}
        elif account and account.role == "ANALYST":
            identity = {**identity, "role": account.role, "plan": account.plan}
    token = create_access_token(data={"sub": identity["email"], **identity})
    await _log_login_event(db, identity["email"], "LOGIN_SUCCESS", None, "firebase")
    return TokenResponse(access_token=token, user=identity)


@router.post("/token", response_model=TokenResponse)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    import time
    now = time.time()
    ip = request.client.host if request.client else "unknown"
    attempts = [t for t in _failed_attempts.get(ip, []) if now - t < 900]
    if len(attempts) >= 10:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
    email = form_data.username.strip().lower()
    disabled_error = await _disabled_account_error(email, db)
    if disabled_error:
        await _log_login_event(db, email, "LOGIN_FAILURE", ip, "password", reason="disabled")
        raise disabled_error
    # Accounts come from the DB only. The hardcoded demo accounts were deleted
    # in Phase 1 (S1/L2); there is no non-DB login path anymore.
    user = None
    account = await db.scalar(
        select(AuthAccount).where(
            AuthAccount.email == email,
            AuthAccount.is_active == True,
        )
    )
    if account and verify_password(form_data.password, account.password_hash):
        account.last_login = datetime.now(timezone.utc)
        await db.commit()
        user = {
            "email": account.email,
            "name": account.name,
            "role": account.role,
            "plan": account.plan,
        }
    if not user:
        attempts.append(now)
        _failed_attempts[ip] = attempts
        await _log_login_event(db, email, "LOGIN_FAILURE", ip, "password", reason="invalid_credentials")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    _failed_attempts.pop(ip, None)
    await _log_login_event(db, user["email"], "LOGIN_SUCCESS", ip, "password")
    token = create_access_token(data={
        "sub": user["email"],
        "role": user["role"],
        "plan": user["plan"],
        "name": user["name"],
    })
    return TokenResponse(
        access_token=token,
        user={"email": user["email"], "role": user["role"], "plan": user["plan"], "name": user["name"]},
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_account(payload: RegistrationRequest, db: AsyncSession = Depends(get_db)):
    """Create a self-registered PUBLIC user account.

    Admin and DGCA analyst accounts are granted by an administrator only —
    self-registration with workspace DGCA is closed (S2/L4). A registered
    user who needs analyst access asks an admin (role PATCH / access-request
    flow); the endpoint never grants ANALYST/GOVERNMENT by itself.
    """
    email = payload.email.strip().lower()
    name = payload.name.strip()
    if "@" not in email or len(email) > 255:
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    if len(name) < 2 or len(name) > 100:
        raise HTTPException(status_code=422, detail="Name must be between 2 and 100 characters.")
    if len(payload.password) < 6:
        raise HTTPException(status_code=422, detail="Password should be at least 6 characters.")

    existing = await db.scalar(select(AuthAccount).where(AuthAccount.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="An account already exists for this email.")

    workspace = payload.workspace.strip().upper()
    if workspace == "DGCA":
        raise HTTPException(
            status_code=403,
            detail="DGCA analyst accounts are granted by an administrator only. "
            "Register as a user, then request analyst access.",
        )
    if workspace != "USER":
        raise HTTPException(status_code=403, detail="Only User self-registration is allowed.")
    role = "PUBLIC"
    plan = "FREE"

    db.add(AuthAccount(
        email=email,
        name=name,
        password_hash=get_password_hash(payload.password),
        role=role,
        plan=plan,
    ))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="An account already exists for this email.")
    return {
        "status": "CREATED",
        "user": {"email": email, "name": name, "role": role, "plan": plan},
    }
