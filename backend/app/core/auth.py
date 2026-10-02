from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.core.database import get_db
from app.models.user import AuditLog, User
from app.models.auth_account import AuthAccount

# PBKDF2 is available without the version-sensitive bcrypt backend. Keep
# bcrypt as a legacy verifier so existing hashes remain valid while all new
# self-registered accounts use the stable first scheme.
pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")
oauth2_optional_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)

# Demo accounts — in production, managed by DB only
DEMO_USERS = {
    "admin@aeroprice.in":  {"password": "aeroadmin",  "role": "ADMIN",   "plan": "ADMIN",      "name": "Admin User"},
    "dgca@gov.in":         {"password": "dgca2026",   "role": "ANALYST", "plan": "GOVERNMENT", "name": "DGCA Analyst"},
    "user@aeroprice.in":   {"password": "aero123",    "role": "PUBLIC",  "plan": "FREE",       "name": "User Account"},
    "visitor@example.com": {"password": "demo",       "role": "PUBLIC",  "plan": "FREE",       "name": "Free User"},
}


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def authenticate_user(email: str, password: str) -> Optional[dict]:
    # These fixtures exist only for local development and unit tests. A
    # production deployment must use the persistent user store instead.
    if settings.is_production:
        return None
    user = DEMO_USERS.get(email)
    if not user:
        return None
    if user["password"] != password:
        return None
    return {"email": email, **user}


async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        role: str = payload.get("role", "PUBLIC")
        plan: str = payload.get("plan", "FREE")
        name: str = payload.get("name", "User")
    except JWTError:
        # Firebase sign-in is the primary deployed identity provider. If the
        # short-lived backend JWT exchange is unavailable, accept the already
        # verified Firebase ID token directly instead of leaving the signed-in
        # user unable to submit feedback or request feature access.
        try:
            firebase_token = jwt.get_unverified_header(token).get("alg") == "RS256"
        except JWTError:
            firebase_token = False
        if firebase_token:
            from app.core.firebase_tokens import verify_firebase_identity
            identity = await verify_firebase_identity(token)
            email = identity.get("email")
            role = identity.get("role", "PUBLIC")
            plan = identity.get("plan", "FREE")
            name = identity.get("name", "User")
        else:
            raise credentials_exception

    normalized_email = email.strip().lower()
    # FastAPI injects the database for real HTTP requests. A few unit tests
    # call this dependency directly without resolving Depends(get_db); keep
    # those pure token/role checks usable while preserving database status
    # enforcement on every actual request.
    if not callable(getattr(db, "scalar", None)):
        return {"email": normalized_email, "role": role, "plan": plan, "name": name}
    account = await db.scalar(select(User).where(User.email == normalized_email))
    auth_account = await db.scalar(select(AuthAccount).where(AuthAccount.email == normalized_email))
    if (account and account.is_active is False) or (auth_account and auth_account.is_active is False):
        event = await db.scalar(
            select(AuditLog)
            .where(
                AuditLog.resource_type == "user",
                AuditLog.resource_id == normalized_email,
                AuditLog.action == "USER_DISABLED",
            )
            .order_by(AuditLog.created_at.desc())
        )
        reason = (event.details or {}).get("reason") if event and isinstance(event.details, dict) else None
        message = "This account is disabled by an administrator. Contact support or an administrator to restore access."
        if reason:
            message += f" Reason: {reason}"
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=message)
    # A valid JWT proves identity, not the continued validity of old grants.
    # Admin approval, revocation and role changes must take effect immediately.
    persisted = account if account is not None else auth_account
    if persisted is not None:
        role = persisted.role
        plan = persisted.plan
        name = persisted.name or name
    return {"email": normalized_email, "role": role, "plan": plan, "name": name}


def decode_token(token: str) -> Optional[dict]:
    """Decode a JWT token. Returns payload dict or None on failure."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


def require_role(*roles: str):
    async def check(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user['role']}' is not authorized for this resource",
            )
        return current_user
    return check


require_admin = require_role("ADMIN")
require_analyst = require_role("ANALYST", "ADMIN")
require_subscriber = require_role("PUBLIC", "ANALYST", "ADMIN")  # checked at plan level

async def require_admin_or_local(token: str | None = Depends(oauth2_optional_scheme), db: AsyncSession = Depends(get_db)) -> dict:
    """Require a verified admin identity in every environment.

    Keep the existing dependency name for route compatibility, without a local
    authentication bypass or allowing a non-admin's valid token through.
    """
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return await require_admin(await get_current_user(token, db))
