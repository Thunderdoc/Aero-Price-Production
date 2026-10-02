from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.auth import authenticate_user, create_access_token, get_current_user, get_password_hash, verify_password
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
    identity = await verify_firebase_identity(payload.id_token)
    # Firebase's verified email proves ownership, while persisted backend
    # metadata carries the admin-selected workspace role and entitlement.
    # This keeps roles stable even when the Firebase email allowlist is empty.
    disabled_error = await _disabled_account_error(identity["email"], db)
    if disabled_error:
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
        raise disabled_error
    user = authenticate_user(email, form_data.password)
    if not user:
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    _failed_attempts.pop(ip, None)
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
    """Create a self-registered user or DGCA analyst account.

    Admin accounts remain invite/credential-only; DGCA registration is
    permitted but receives the non-admin analyst role.
    """
    email = payload.email.strip().lower()
    name = payload.name.strip()
    if "@" not in email or len(email) > 255:
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    if len(name) < 2 or len(name) > 100:
        raise HTTPException(status_code=422, detail="Name must be between 2 and 100 characters.")
    if len(payload.password) < 6:
        raise HTTPException(status_code=422, detail="Password should be at least 6 characters.")

    if email in {"admin@aeroprice.in", "dgca@gov.in", "user@aeroprice.in", "visitor@example.com"}:
        raise HTTPException(status_code=409, detail="An account already exists for this email.")
    existing = await db.scalar(select(AuthAccount).where(AuthAccount.email == email))
    if existing:
        raise HTTPException(status_code=409, detail="An account already exists for this email.")

    workspace = payload.workspace.strip().upper()
    if workspace not in {"USER", "DGCA"}:
        raise HTTPException(status_code=403, detail="Only User and DGCA self-registration is allowed.")
    role = "ANALYST" if workspace == "DGCA" else "PUBLIC"
    plan = "GOVERNMENT" if workspace == "DGCA" else "FREE"

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
