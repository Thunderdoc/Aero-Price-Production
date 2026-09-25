from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.core.auth import authenticate_user, create_access_token, get_password_hash, verify_password
from app.core.database import get_db
from app.models.auth_account import AuthAccount

router = APIRouter(prefix="/auth", tags=["auth"])
_failed_attempts: dict[str, list[float]] = {}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class RegistrationRequest(BaseModel):
    name: str
    email: str
    password: str


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
    """Create a normal user account for the backend-auth deployment."""
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

    db.add(AuthAccount(
        email=email,
        name=name,
        password_hash=get_password_hash(payload.password),
        role="PUBLIC",
        plan="FREE",
    ))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="An account already exists for this email.")
    return {
        "status": "CREATED",
        "user": {"email": email, "name": name, "role": "PUBLIC", "plan": "FREE"},
    }
