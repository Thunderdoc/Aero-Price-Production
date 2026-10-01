"""Admin APIs require an authenticated administrator, including in local QA."""
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI, HTTPException

from app.api.routes.admin import router
from app.core.auth import create_access_token, require_admin_or_local
from app.core.database import get_db


@pytest.mark.parametrize("production", [False, True])
async def test_admin_guard_rejects_missing_token_in_all_environments(monkeypatch, production):
    monkeypatch.setattr("app.core.auth.settings", SimpleNamespace(is_production=production))
    with pytest.raises(HTTPException) as error:
        await require_admin_or_local(None)
    assert error.value.status_code == 401


@pytest.mark.parametrize("role", [None, "PUBLIC", "ANALYST"])
@pytest.mark.parametrize("method,path,payload", [
    ("GET", "/api/admin/audit-log", None),
    ("GET", "/api/admin/feedback", None),
    ("GET", "/api/admin/access-requests", None),
    ("POST", "/api/admin/users", {"name": "Test User", "email": "user@example.test", "role": "PUBLIC"}),
    ("PATCH", "/api/admin/users/user@example.test/role", {"role": "ADMIN"}),
    ("DELETE", "/api/admin/users/user@example.test", {}),
])
async def test_admin_routes_reject_unauthenticated_and_non_admin_callers(db, monkeypatch, role, method, path, payload):
    # Never use configured Firebase credentials, even if a guard regression
    # unexpectedly lets a mutation reach the handler.
    monkeypatch.setattr("app.core.firebase_admin.firebase_app", lambda: None)
    app = FastAPI()
    app.include_router(router, prefix="/api")

    async def isolated_database():
        yield db

    app.dependency_overrides[get_db] = isolated_database
    headers = {}
    if role:
        token = create_access_token({"sub": "caller@example.test", "role": role, "plan": "FREE"})
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.request(method, path, headers=headers, json=payload)
    assert response.status_code == (403 if role else 401)


async def test_admin_guard_accepts_authenticated_admin():
    token = create_access_token({"sub": "admin@example.test", "role": "ADMIN", "plan": "ADMIN"})
    identity = await require_admin_or_local(token)
    assert identity["role"] == "ADMIN"
    assert identity["email"] == "admin@example.test"
