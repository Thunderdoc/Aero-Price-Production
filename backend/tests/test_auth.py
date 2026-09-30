"""
Unit tests for authentication and RBAC.
Run: pytest tests/test_auth.py -v
"""
import pytest
from types import SimpleNamespace
from sqlalchemy import select
from starlette.requests import Request

from app.api.routes.auth import FirebaseLoginRequest, RegistrationRequest, firebase_login, login, register_account
from app.core.auth import DEMO_USERS, create_access_token, decode_token, verify_password
from app.models.auth_account import AuthAccount


def test_demo_users_populated():
    assert len(DEMO_USERS) >= 4


def test_admin_user_exists():
    assert "admin@aeroprice.in" in DEMO_USERS
    assert DEMO_USERS["admin@aeroprice.in"]["role"] == "ADMIN"


def test_analyst_user_exists():
    assert "dgca@gov.in" in DEMO_USERS
    assert DEMO_USERS["dgca@gov.in"]["role"] == "ANALYST"


def test_public_user_plan():
    user = DEMO_USERS.get("visitor@example.com") or DEMO_USERS.get("user@aeroprice.in")
    assert user is not None
    assert user["role"] == "PUBLIC"


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


async def test_dgca_registration_creates_non_admin_analyst_account(db):
    response = await register_account(
        RegistrationRequest(name="DGCA Analyst", email="dgca.new@example.com", password="secret123", workspace="DGCA"),
        db,
    )

    assert response["user"]["role"] == "ANALYST"
    assert response["user"]["plan"] == "GOVERNMENT"
    account = await db.scalar(select(AuthAccount).where(AuthAccount.email == "dgca.new@example.com"))
    assert account is not None
    assert account.role == "ANALYST"


async def test_verified_google_login_uses_registered_dgca_role(db, monkeypatch):
    await register_account(
        RegistrationRequest(name="DGCA Analyst", email="dgca.new@example.com", password="secret123", workspace="DGCA"),
        db,
    )

    async def verified_identity(_token):
        return {"email": "dgca.new@example.com", "name": "DGCA Analyst", "role": "PUBLIC", "plan": "FREE"}

    monkeypatch.setattr("app.api.routes.auth.verify_firebase_identity", verified_identity)
    response = await firebase_login(FirebaseLoginRequest(id_token="verified-firebase-token"), db)
    assert response.user["role"] == "ANALYST"
    assert response.user["plan"] == "GOVERNMENT"
    assert decode_token(response.access_token)["role"] == "ANALYST"
