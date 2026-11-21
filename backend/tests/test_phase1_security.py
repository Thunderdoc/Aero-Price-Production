"""Phase 1 regression tests: database + security (audit report §11 Phase 1).

Pins each P0/P1 fix so a regression fails before it reaches a deployment:
fail-closed SECRET_KEY, deleted demo accounts, closed DGCA self-registration,
auth + per-user rate limits on the live-scrape endpoints, health exception
logging, and the snapshot fallback with a missing database file.
"""
import logging
import os
import shutil
import subprocess
import sys
import textwrap
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import jwt as pyjwt
import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy import select
from starlette.requests import Request

from app.api.routes.auth import RegistrationRequest, login, register_account
from app.api.routes.health import health_check
from app.core.auth import create_access_token, decode_token
from app.core.config import Settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.auth_account import AuthAccount
from demo_fixtures import DEMO_ACCOUNTS_ENABLED, DEMO_USERS
from main import app

REPO_ROOT = Path(__file__).resolve().parents[2]
TEST_SECRET = "phase1-test-secret-key-0123456789abcdef"


# ══════════════════════════════════════════════════════════════════════════
# 1. Fail-closed SECRET_KEY (S1/L3)
# ══════════════════════════════════════════════════════════════════════════

def test_secret_key_absent_fails_startup(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings()


def test_secret_key_short_fails_startup(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "too-short")
    with pytest.raises(ValidationError):
        Settings()


def test_secret_key_old_default_is_rejected(monkeypatch):
    # The old placeholder is exactly 32 chars, so length alone would pass it.
    monkeypatch.setenv("SECRET_KEY", "local-development-only-change-me")
    with pytest.raises(ValidationError):
        Settings()


def test_secret_key_valid_long_value_is_accepted(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", TEST_SECRET)
    assert Settings().SECRET_KEY == TEST_SECRET


def test_token_forged_with_wrong_key_is_rejected():
    # PyJWT migration pin: a token signed with any key other than the
    # configured SECRET_KEY must not decode — including a forged ADMIN.
    forged = pyjwt.encode(
        {
            "sub": "attacker@example.test",
            "role": "ADMIN",
            "plan": "ADMIN",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        "a-different-secret-key-0123456789abcdef",
        algorithm="HS256",
    )
    assert decode_token(forged) is None


# ══════════════════════════════════════════════════════════════════════════
# 2. Demo accounts deleted (S1/L2)
# ══════════════════════════════════════════════════════════════════════════

def _login_request(ip: str) -> Request:
    return Request({
        "type": "http",
        "method": "POST",
        "path": "/api/auth/token",
        "headers": [],
        "client": (ip, 1234),
        "server": ("testserver", 80),
        "scheme": "http",
    })


async def test_demo_login_rejected(db):
    """Every old demo credential — including the demo ADMIN — must 401."""
    assert DEMO_ACCOUNTS_ENABLED is False  # the test-only flag defaults off
    for i, (email, info) in enumerate(DEMO_USERS.items()):
        with pytest.raises(HTTPException) as exc:
            await login(
                _login_request(f"10.9.9.{i + 1}"),
                SimpleNamespace(username=email, password=info["password"]),
                db,
            )
        assert exc.value.status_code == 401, f"demo login for {email} must fail"


# ══════════════════════════════════════════════════════════════════════════
# 3. DGCA self-registration closed (S2/L4)
# ══════════════════════════════════════════════════════════════════════════

async def test_dgca_self_registration_is_closed(db):
    for i, workspace in enumerate(("DGCA", "dgca", "ADMIN")):
        email = f"closed-reg-{i}@example.test"
        with pytest.raises(HTTPException) as exc:
            await register_account(
                RegistrationRequest(
                    name="Closed Workspace",
                    email=email,
                    password="secret123",
                    workspace=workspace,
                ),
                db,
            )
        assert exc.value.status_code == 403
        assert await db.scalar(select(AuthAccount).where(AuthAccount.email == email)) is None


# ══════════════════════════════════════════════════════════════════════════
# 4. Auth + per-user rate limit on /api/fares/live and /api/aviation/* (S4)
# ══════════════════════════════════════════════════════════════════════════

def _unique_token() -> tuple[str, dict]:
    email = f"phase1-{uuid.uuid4().hex[:12]}@example.test"
    token = create_access_token({"sub": email, "role": "PUBLIC", "plan": "FREE"})
    return email, {"Authorization": f"Bearer {token}"}


class _NoDataAdapter:
    """Stand-in for FastFlightsAdapter: no network, no records."""

    async def collect(self, *args, **kwargs):
        return SimpleNamespace(
            records=[], status="NO_DATA", error=None,
            source_id="fast-flights-test", latency_ms=1,
        )


async def _request_with_isolated_db(db, method, url, **kwargs):
    async def isolated_db():
        yield db

    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.request(method, url, **kwargs)
    finally:
        app.dependency_overrides.pop(get_db, None)


async def test_fares_live_requires_auth(db):
    limiter._buckets.clear()
    response = await _request_with_isolated_db(db, "GET", "/api/fares/live", params={"route": "DEL-BLR"})
    assert response.status_code == 401


async def test_fares_live_authenticated_and_rate_limited(db):
    limiter._buckets.clear()
    _, headers = _unique_token()
    with patch("app.api.routes.fares.FastFlightsAdapter", _NoDataAdapter):
        for _ in range(10):
            response = await _request_with_isolated_db(
                db, "GET", "/api/fares/live", params={"route": "DEL-BLR"}, headers=headers
            )
            assert response.status_code == 200
            assert response.json()["status"] == "NO_DATA"
        response = await _request_with_isolated_db(
            db, "GET", "/api/fares/live", params={"route": "DEL-BLR"}, headers=headers
        )
        assert response.status_code == 429
        assert response.headers.get("Retry-After") is not None


async def test_aviation_endpoints_require_auth(db):
    limiter._buckets.clear()
    for url in ("/api/aviation/live", "/api/aviation/schedules"):
        response = await _request_with_isolated_db(db, "GET", url)
        assert response.status_code == 401, url


async def test_aviation_schedules_authenticated_without_provider(db):
    limiter._buckets.clear()
    _, headers = _unique_token()
    response = await _request_with_isolated_db(db, "GET", "/api/aviation/schedules", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "POSITION_ONLY"


async def test_aviation_live_authenticated_serves_cached_response(db):
    from app.api.routes import aviation

    limiter._buckets.clear()
    aviation._live_cache.update({
        "expires_at": time.monotonic() + 60,
        "fetched_at": time.monotonic(),
        "aircraft": [],
        "source": "test-cache",
        "data_origin": "TEST",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
    })
    try:
        _, headers = _unique_token()
        response = await _request_with_isolated_db(db, "GET", "/api/aviation/live", headers=headers)
        assert response.status_code == 200
        assert response.json()["provider_status"] == "LIVE"
        assert response.json()["source"] == "test-cache"
    finally:
        aviation._live_cache.update({
            "expires_at": 0.0, "fetched_at": 0.0, "aircraft": [],
            "source": "", "data_origin": "", "retrieved_at": None,
        })


# ══════════════════════════════════════════════════════════════════════════
# 5. Health endpoint logs the DB exception (B26)
# ══════════════════════════════════════════════════════════════════════════

class _BrokenDB:
    async def execute(self, *args, **kwargs):
        raise RuntimeError("connection refused")

    async def scalar(self, *args, **kwargs):
        raise RuntimeError("connection refused")


async def test_health_logs_exception_and_reports_degraded(caplog):
    with caplog.at_level(logging.ERROR, logger="app.api.routes.health"):
        result = await health_check(_BrokenDB())
    assert result["database"] == "error"
    assert result["status"] == "degraded"
    assert result["data_status"] == "NO_LIVE_DATA"
    assert "Health check database probe failed" in caplog.text
    assert "Health check database query failed" in caplog.text


async def test_health_ok_on_working_db(db):
    result = await health_check(db)
    assert result["database"] == "connected"
    assert result["status"] == "ok"


# ══════════════════════════════════════════════════════════════════════════
# 6. Snapshot fallback with a missing database file (B27/S3)
# ══════════════════════════════════════════════════════════════════════════

def _run_snapshot_fallback_subprocess():
    """Import api/index.py with no backend/aeroprice.db and assert the
    entrypoint boots on an empty ephemeral DB (no snapshot flag set).

    Runs in a subprocess: the entrypoint mutates os.environ and imports the
    whole app, so it must not run inside the pytest process. Callers must
    ensure backend/aeroprice.db is absent before calling.
    """
    assert not (REPO_ROOT / "backend" / "aeroprice.db").exists()
    script = textwrap.dedent(f"""
        import importlib.util, os
        spec = importlib.util.spec_from_file_location(
            "aeroprice_vercel_entry", r"{REPO_ROOT / 'api' / 'index.py'}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        assert hasattr(module, "app"), "vercel entrypoint must expose app"
        assert os.environ["DATABASE_URL"].startswith(
            "sqlite+aiosqlite:////tmp/aeroprice.db"), os.environ.get("DATABASE_URL")
        assert "AEROPRICE_SNAPSHOT_FALLBACK" not in os.environ, (
            "no snapshot file, so the fallback flag must stay unset")
        print("SNAPSHOT_FALLBACK_OK")
    """)
    env = {**os.environ, "SECRET_KEY": TEST_SECRET}
    env.pop("DATABASE_URL", None)
    env.pop("AEROPRICE_SNAPSHOT_FALLBACK", None)
    # Pin LOG_LEVEL: main.py does getattr(logging, settings.LOG_LEVEL), and a
    # lowercase value leaked into the suite env crashes the boot — getattr
    # returns the logging.debug/info function and basicConfig raises
    # TypeError (observed in the full-suite run; see test_snapshot_fallback.py).
    env["LOG_LEVEL"] = "INFO"
    proc = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True, text=True, timeout=180, cwd=REPO_ROOT, env=env,
    )
    assert proc.returncode == 0, proc.stderr[-2000:]
    assert "SNAPSHOT_FALLBACK_OK" in proc.stdout
    assert "not found" in proc.stderr  # the missing snapshot was logged, not hidden


def test_snapshot_fallback_with_missing_db_file(tmp_path):
    """api/index.py must import cleanly with no backend/aeroprice.db.

    Suite-robustness: earlier tests can resurrect backend/aeroprice.db as a
    0-byte file (the real engine's default DATABASE_URL points at it and
    aiosqlite creates it on connect), which used to fail this test when the
    full suite ran. Any existing copy is moved aside first and restored
    afterwards, so the test is independent of suite order and of whatever
    the working tree happens to contain.
    """
    db_file = REPO_ROOT / "backend" / "aeroprice.db"
    backup = tmp_path / "aeroprice.db.bak"
    moved = db_file.exists()
    if moved:
        shutil.move(str(db_file), str(backup))
    try:
        _run_snapshot_fallback_subprocess()
    finally:
        if moved:
            shutil.move(str(backup), str(db_file))
