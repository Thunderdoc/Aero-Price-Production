"""
Unit tests for authentication and RBAC.
Run: pytest tests/test_auth.py -v
"""
import pytest
from types import SimpleNamespace
from sqlalchemy import select
from starlette.requests import Request

from app.api.routes.auth import FirebaseLoginRequest, RegistrationRequest, firebase_login, login, register_account
from app.core import auth as auth_core
from app.core.auth import create_access_token, decode_token, verify_password
from app.models.auth_account import AuthAccount


def test_demo_users_removed_from_production_code():
    # Phase 1 (S1/L2): hardcoded demo accounts — including a full ADMIN with a
    # plaintext password — were deleted from app code. Fixtures live only in
    # tests/demo_fixtures.py; no production code path may reference them.
    assert not hasattr(auth_core, "DEMO_USERS")
    assert not hasattr(auth_core, "authenticate_user")


def test_jwt_roundtrip():
    data = {"sub": "test@example.com", "role": "PUBLIC", "plan": "FREE"}
    token = create_access_token(data)
    decoded = decode_token(token)
    assert decoded["sub"] == "test@example.com"
    assert decoded["role"] == "PUBLIC"


def test_invalid_token_returns_none():
    result = decode_token("not-a-real-token")
    assert result is None


async def test_user_registration_persists_a_backend_auth_account(db):
    response = await register_account(
        RegistrationRequest(name="New User", email=" New.User@example.com ", password="secret123"),
        db,
    )

    assert response["status"] == "CREATED"
    account = await db.scalar(select(AuthAccount).where(AuthAccount.email == "new.user@example.com"))
    assert account is not None
    assert account.role == "PUBLIC"
    assert verify_password("secret123", account.password_hash)

    request = Request({
        "type": "http",
        "method": "POST",
        "path": "/api/auth/token",
        "headers": [],
        "client": ("testclient", 1234),
        "server": ("testserver", 80),
        "scheme": "http",
    })
    token_response = await login(request, SimpleNamespace(username="NEW.USER@EXAMPLE.COM", password="secret123"), db)
    assert token_response.user["email"] == "new.user@example.com"
    assert token_response.user["role"] == "PUBLIC"
    assert token_response.access_token


# DGCA self-registration is CLOSED (Phase 1, S2/L4): workspace="DGCA" no
# longer grants ANALYST/GOVERNMENT. The regression test lives in
# test_phase1_security.py::test_dgca_self_registration_is_closed.


async def test_verified_google_login_uses_admin_granted_dgca_role(db, monkeypatch):
    # Analyst role is granted by an admin only (direct DB row here simulates
    # the admin grant); self-registration can no longer create it.
    db.add(AuthAccount(
        email="dgca.new@example.com",
        name="DGCA Analyst",
        password_hash="unused",
        role="ANALYST",
        plan="GOVERNMENT",
    ))
    await db.flush()

    async def verified_identity(_token):
        return {"email": "dgca.new@example.com", "name": "DGCA Analyst", "role": "PUBLIC", "plan": "FREE"}

    monkeypatch.setattr("app.api.routes.auth.verify_firebase_identity", verified_identity)
    response = await firebase_login(FirebaseLoginRequest(id_token="verified-firebase-token"), db)
    assert response.user["role"] == "ANALYST"
    assert response.user["plan"] == "GOVERNMENT"
    assert decode_token(response.access_token)["role"] == "ANALYST"
