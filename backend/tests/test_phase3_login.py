"""
Phase 3 (login) regression tests.

Covers the 21 Nov 2026 access decision: read-only endpoints are open to any
signed-in user (analyst gate dropped), write/admin actions stay gated, the
session snapshot is exempt from the strict auth rate-limit bucket, the
evaluator seed refuses to run without its env password, CORS rejects unknown
origins, logins are audited, and admin-initiated password reset works.
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.requests import Request

from app.api.routes.auth import RegistrationRequest, login, register_account, _failed_attempts
from app.core.auth import create_access_token
from app.core.database import get_db
from app.core.rate_limit import limiter, policy_for
from app.models.auth_account import AuthAccount
from app.models.user import AuditLog, User
from app.seed.evaluator import EVALUATOR_EMAIL, seed_evaluator
from main import app


@pytest.fixture(autouse=True)
def _isolate_rate_limit_and_lockout():
    # The limiter and the login lockout are module-global and keyed by IP;
    # other test modules share the same test client IP. Clear both so this
    # module's results never depend on run order.
    limiter._buckets.clear()
    _failed_attempts.clear()
    yield
    limiter._buckets.clear()
    _failed_attempts.clear()


def _login_request():
    return Request({
        "type": "http",
        "method": "POST",
        "path": "/api/auth/token",
        "headers": [],
        "client": ("testclient", 1234),
        "server": ("testserver", 80),
        "scheme": "http",
    })


async def _make_account(db, email, role="PUBLIC", plan="FREE", password="secret123"):
    await register_account(
        RegistrationRequest(name="Test User", email=email, password=password),
        db,
    )
    account = await db.scalar(select(AuthAccount).where(AuthAccount.email == email))
    assert account is not None
    if role != "PUBLIC" or plan != "FREE":
        account.role = role
        account.plan = plan
        await db.flush()
    return account


def _headers(email):
    return {"Authorization": f"Bearer {create_access_token({'sub': email})}"}


# ── Gate drop: read-only endpoints open to any signed-in user ───────────────

READ_ENDPOINTS = [
    "/api/forecast/DEL-BOM?advance_days=7",
    "/api/forecasts/metadata",
    "/api/exports/fares?fmt=json",
    "/api/exports/index-history?fmt=json",
    "/api/exports/dgca-monthly?fmt=json",
    "/api/collections",
    "/api/collections/source-health",
    "/api/index/basket",
    "/api/index/history",
]


@pytest.mark.parametrize("path", READ_ENDPOINTS)
async def test_public_user_can_read_formerly_analyst_endpoints(db, path):
    await _make_account(db, "reader@example.test")
    async def isolated_db():
        yield db
    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get(path)).status_code == 401
            response = await client.get(path, headers=_headers("reader@example.test"))
            assert response.status_code == 200, f"{path} -> {response.status_code} {response.text[:200]}"
    finally:
        app.dependency_overrides.pop(get_db, None)


# ── Writes / admin actions stay gated ───────────────────────────────────────

GATED_CALLS = [
    ("POST", "/api/anomalies/run-detection", None),
    ("POST", "/api/government/refresh", None),
    ("POST", "/api/collections/trigger", None),
    ("POST", "/api/historical/backfill", None),
    ("POST", "/api/sources/no-such-source/enable", None),
    ("GET", "/api/admin/users", None),
]


@pytest.mark.parametrize("method,path,_body", GATED_CALLS)
async def test_public_user_still_blocked_from_writes_and_admin(db, method, path, _body):
    await _make_account(db, "reader@example.test")
    async def isolated_db():
        yield db
    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.request(method, path, headers=_headers("reader@example.test"))
            assert response.status_code == 403, f"{method} {path} -> {response.status_code}"
    finally:
        app.dependency_overrides.pop(get_db, None)


# ── /me exempt from the strict auth bucket ──────────────────────────────────

def test_me_is_exempt_from_strict_auth_bucket():
    assert policy_for("/api/auth/me", "GET") == ("session", 240, 60)


def test_login_and_register_keep_the_strict_auth_bucket():
    assert policy_for("/api/auth/token", "POST") == ("auth", 60, 900)
    assert policy_for("/api/auth/register", "POST") == ("auth", 60, 900)


# ── Evaluator seed ──────────────────────────────────────────────────────────

async def test_evaluator_seed_refuses_without_env_password(db, monkeypatch):
    monkeypatch.delenv("EVALUATOR_PASSWORD", raising=False)
    with pytest.raises(RuntimeError, match="EVALUATOR_PASSWORD is not set"):
        await seed_evaluator(db)
    assert await db.scalar(select(AuthAccount).where(AuthAccount.email == EVALUATOR_EMAIL)) is None


async def test_evaluator_seed_refuses_a_short_password(db, monkeypatch):
    monkeypatch.setenv("EVALUATOR_PASSWORD", "short")
    with pytest.raises(ValueError, match="at least 8 characters"):
        await seed_evaluator(db)


async def test_evaluator_seed_creates_analyst_account_and_login_works(db, monkeypatch):
    monkeypatch.setenv("EVALUATOR_PASSWORD", "evaluator-pass-123")
    result = await seed_evaluator(db)
    assert result == {"email": EVALUATOR_EMAIL, "role": "ANALYST", "plan": "GOVERNMENT", "status": "created"}
    account = await db.scalar(select(AuthAccount).where(AuthAccount.email == EVALUATOR_EMAIL))
    assert account is not None and account.role == "ANALYST" and account.plan == "GOVERNMENT"
    token_response = await login(_login_request(), SimpleNamespace(username=EVALUATOR_EMAIL, password="evaluator-pass-123"), db)
    assert token_response.user["role"] == "ANALYST"


async def test_evaluator_seed_rerun_rotates_the_password(db, monkeypatch):
    monkeypatch.setenv("EVALUATOR_PASSWORD", "evaluator-pass-123")
    await seed_evaluator(db)
    monkeypatch.setenv("EVALUATOR_PASSWORD", "evaluator-pass-456")
    result = await seed_evaluator(db)
    assert result["status"] == "updated"
    with pytest.raises(HTTPException) as old:
        await login(_login_request(), SimpleNamespace(username=EVALUATOR_EMAIL, password="evaluator-pass-123"), db)
    assert old.value.status_code == 401
    token_response = await login(_login_request(), SimpleNamespace(username=EVALUATOR_EMAIL, password="evaluator-pass-456"), db)
    assert token_response.user["email"] == EVALUATOR_EMAIL


# ── CORS: exact origins only ────────────────────────────────────────────────

async def test_cors_rejects_unknown_vercel_origins(db):
    async def isolated_db():
        yield db
    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            evil = await client.options(
                "/api/warm",
                headers={
                    "Origin": "https://someone-else.vercel.app",
                    "Access-Control-Request-Method": "GET",
                },
            )
            assert evil.status_code == 400
            assert evil.headers.get("access-control-allow-origin") != "https://someone-else.vercel.app"
            ok = await client.options(
                "/api/warm",
                headers={
                    "Origin": "https://aero-price-production.vercel.app",
                    "Access-Control-Request-Method": "GET",
                },
            )
            assert ok.status_code == 200
            assert ok.headers.get("access-control-allow-origin") == "https://aero-price-production.vercel.app"
            local = await client.get("/api/warm", headers={"Origin": "http://localhost:5173"})
            assert local.headers.get("access-control-allow-origin") == "http://localhost:5173"
    finally:
        app.dependency_overrides.pop(get_db, None)


# ── Login audit trail ───────────────────────────────────────────────────────

async def test_login_success_and_failure_are_audited(db):
    await _make_account(db, "audited@example.test")
    await login(_login_request(), SimpleNamespace(username="audited@example.test", password="secret123"), db)
    success = await db.scalar(
        select(AuditLog).where(AuditLog.action == "LOGIN_SUCCESS", AuditLog.resource_id == "audited@example.test")
    )
    assert success is not None
    assert success.details["method"] == "password"
    with pytest.raises(HTTPException) as failure:
        await login(_login_request(), SimpleNamespace(username="audited@example.test", password="wrong-password"), db)
    assert failure.value.status_code == 401
    failed = await db.scalar(
        select(AuditLog).where(AuditLog.action == "LOGIN_FAILURE", AuditLog.resource_id == "audited@example.test")
    )
    assert failed is not None
    assert failed.details["reason"] == "invalid_credentials"


# ── Admin-initiated password reset ──────────────────────────────────────────

async def _admin_headers(db):
    admin = User(email="admin@example.test", name="Admin", role="ADMIN", plan="ADMIN", is_active=True)
    db.add(admin)
    await db.flush()
    return _headers("admin@example.test")


async def test_admin_can_reset_a_user_password(db):
    await _make_account(db, "resetme@example.test")
    headers = await _admin_headers(db)
    async def isolated_db():
        yield db
    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/admin/users/resetme@example.test/reset-password",
                headers=headers,
                json={"new_password": "brand-new-pass-1"},
            )
            assert response.status_code == 200, response.text
            assert response.json()["status"] == "PASSWORD_RESET"
    finally:
        app.dependency_overrides.pop(get_db, None)
    with pytest.raises(HTTPException) as old:
        await login(_login_request(), SimpleNamespace(username="resetme@example.test", password="secret123"), db)
    assert old.value.status_code == 401
    token_response = await login(_login_request(), SimpleNamespace(username="resetme@example.test", password="brand-new-pass-1"), db)
    assert token_response.user["email"] == "resetme@example.test"
    reset_row = await db.scalar(
        select(AuditLog).where(AuditLog.action == "PASSWORD_RESET", AuditLog.resource_id == "resetme@example.test")
    )
    assert reset_row is not None


async def test_password_reset_is_admin_only_and_404s_without_a_backend_account(db):
    await _make_account(db, "reader@example.test")
    firebase_only = User(email="googleonly@example.test", name="Google Only", role="PUBLIC", plan="FREE", is_active=True)
    db.add(firebase_only)
    await db.flush()
    headers = await _admin_headers(db)
    async def isolated_db():
        yield db
    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.post(
                "/api/admin/users/reader@example.test/reset-password",
                headers=_headers("reader@example.test"),
                json={"new_password": "brand-new-pass-1"},
            )
            assert denied.status_code == 403
            missing = await client.post(
                "/api/admin/users/nobody@example.test/reset-password",
                headers=headers,
                json={"new_password": "brand-new-pass-1"},
            )
            assert missing.status_code == 404
            google = await client.post(
                "/api/admin/users/googleonly@example.test/reset-password",
                headers=headers,
                json={"new_password": "brand-new-pass-1"},
            )
            assert google.status_code == 404
            assert "Firebase" in google.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_db, None)


# ── Auth config snapshot ────────────────────────────────────────────────────

async def test_auth_config_is_admin_only_and_reports_no_secrets(db):
    await _make_account(db, "reader@example.test")
    headers = await _admin_headers(db)
    async def isolated_db():
        yield db
    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.get("/api/admin/auth-config", headers=_headers("reader@example.test"))
            assert denied.status_code == 403
            response = await client.get("/api/admin/auth-config", headers=headers)
            assert response.status_code == 200
            body = response.json()
            assert body["backend_auth"]["demo_accounts_in_code"] is False
            assert body["backend_auth"]["password_reset"].startswith("admin-initiated only")
            assert body["jwt"]["secret_is_default"] is False
            assert body["cors"]["wildcard_vercel_allowed"] is False
            assert "https://aero-price-production.vercel.app" in body["cors"]["allowed_origins"]
            assert isinstance(body["firebase"]["project_id_configured"], bool)
    finally:
        app.dependency_overrides.pop(get_db, None)
