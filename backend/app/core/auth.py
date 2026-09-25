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
from app.models.user import User

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


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
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
        # Firebase-authenticated frontend sessions use a Firebase ID token.
        # Verify it server-side before allowing admin-only API access.
        try:
            import os
            from app.core.firebase_admin import firebase_app
            firebase_admin = firebase_app()
            from firebase_admin import auth
            if not firebase_admin:
                raise credentials_exception
            firebase_user = auth.verify_id_token(token)
            email = str(firebase_user.get("email", "")).lower()
            role = "ADMIN" if email in {"admin@aeroprice.in", *[e.strip().lower() for e in os.getenv("FIREBASE_ADMIN_EMAILS", "").split(",") if e.strip()]} else "PUBLIC"
            return {"email": email, "role": role, "plan": "ADMIN" if role == "ADMIN" else "FREE", "name": firebase_user.get("name") or email}
        except Exception:
            raise credentials_exception
    return {"email": email, "role": role, "plan": plan, "name": name}


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
