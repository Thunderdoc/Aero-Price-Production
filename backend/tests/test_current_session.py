from datetime import timedelta

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from app.core.auth import create_access_token, get_current_user
from app.core.database import get_db
from app.models.user import User
from main import app


@pytest.mark.asyncio
async def test_valid_token_tracks_live_premium_grant_and_revoke(db):
    account = User(email="session@example.test", name="Session", role="PUBLIC", plan="FREE", is_active=True)
    db.add(account)
    await db.flush()
    token = create_access_token({"sub": account.email, "role": "PUBLIC", "plan": "FREE"})

    account.plan = "SUBSCRIBER"
    await db.flush()
    assert (await get_current_user(token, db))["plan"] == "SUBSCRIBER"
    account.plan = "FREE"
    await db.flush()
    assert (await get_current_user(token, db))["plan"] == "FREE"


@pytest.mark.asyncio
async def test_admin_role_revocation_overrides_old_signed_claims(db):
    account = User(email="former-admin@example.test", name="Former Admin", role="PUBLIC", plan="FREE", is_active=True)
    db.add(account)
    await db.flush()
    token = create_access_token({"sub": account.email, "role": "ADMIN", "plan": "ADMIN"})
    identity = await get_current_user(token, db)
    assert identity["role"] == "PUBLIC"
    assert identity["plan"] == "FREE"


@pytest.mark.asyncio
async def test_expired_app_token_is_rejected_without_firebase_fallback(db):
    token = create_access_token({"sub": "session@example.test"}, expires_delta=timedelta(seconds=-30))
    with patch("app.core.firebase_tokens.verify_firebase_identity", new_callable=AsyncMock) as firebase:
        with pytest.raises(HTTPException) as error:
            await get_current_user(token, db)
        assert error.value.status_code == 401
        firebase.assert_not_awaited()


@pytest.mark.asyncio
async def test_me_requires_valid_auth_and_returns_persisted_entitlement(db):
    account = User(email="me@example.test", name="Current Account", role="PUBLIC", plan="SUBSCRIBER", is_active=True)
    db.add(account)
    await db.flush()
    token = create_access_token({"sub": account.email, "role": "PUBLIC", "plan": "FREE"})
    async def isolated_db():
        yield db
    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/api/auth/me")).status_code == 401
            response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
            assert response.status_code == 200
            assert response.json() == {"email": account.email, "name": account.name, "role": "PUBLIC", "plan": "SUBSCRIBER"}
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_authenticated_feedback_and_premium_request_reach_admin_over_http(db):
    user = User(email="requester@example.test", name="Requester", role="PUBLIC", plan="FREE", is_active=True)
    admin = User(email="reviewer@example.test", name="Reviewer", role="ADMIN", plan="ADMIN", is_active=True)
    db.add_all([user, admin])
    await db.flush()
    user_headers = {"Authorization": f"Bearer {create_access_token({'sub': user.email})}"}
    admin_headers = {"Authorization": f"Bearer {create_access_token({'sub': admin.email})}"}
    async def isolated_db():
        yield db
    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            feedback = await client.post("/api/admin/feedback", headers=user_headers, json={"title": "Route UI", "message": "Improve the filter layout.", "category": "DESIGN", "source_module": "User Portal"})
            assert feedback.status_code in (200, 201)
            request = await client.post("/api/access-requests", headers=user_headers, json={"feature_key": "PRICE_ALERTS", "feature_name": "Price Alerts", "request_message": "Please enable fare alerts."})
            assert request.status_code in (200, 201)
            queue = await client.get("/api/admin/feedback", headers=admin_headers)
            assert queue.status_code == 200
            assert any(row["id"] == feedback.json()["id"] for row in queue.json()["feedback"])
            access = await client.get("/api/admin/access-requests", headers=admin_headers)
            assert access.status_code == 200
            assert any(row["id"] == request.json()["id"] for row in access.json()["requests"])
            assert (await client.get("/api/admin/feedback", headers=user_headers)).status_code == 403
            expired = create_access_token({"sub": user.email}, expires_delta=timedelta(seconds=-30))
            response = await client.post("/api/admin/feedback", headers={"Authorization": f"Bearer {expired}"}, json={"message": "Must not be saved"})
            assert response.status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)
