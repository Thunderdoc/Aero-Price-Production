from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from app.core.auth import authenticate_user, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])
_failed_attempts: dict[str, list[float]] = {}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@router.post("/token", response_model=TokenResponse)
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    import time
    now = time.time()
    ip = request.client.host if request.client else "unknown"
    attempts = [t for t in _failed_attempts.get(ip, []) if now - t < 900]
    if len(attempts) >= 10:
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
    user = authenticate_user(form_data.username, form_data.password)
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
