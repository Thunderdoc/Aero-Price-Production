"""
Unit tests for authentication and RBAC.
Run: pytest tests/test_auth.py -v
"""
import pytest
from app.core.auth import DEMO_USERS, create_access_token, decode_token


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
