"""
Read-access tests for the 21 Nov 2026 access decision:
- DGCA self-registration is OPEN (owner decision 22 Nov 2026): anyone may
  register as a DGCA analyst; only ADMIN self-registration is blocked.
- The analyst gate is DROPPED on read-only endpoints, so any signed-in user
  (including PUBLIC) can view forecasts, index history/basket, exports,
  collections reads and source-health.
- Write/admin actions stay gated: collection trigger, anomaly detection run
  and government refresh still require ADMIN/ANALYST.
"""
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.auth import create_access_token
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.user import User
from main import app


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    limiter._buckets.clear()
    yield
    limiter._buckets.clear()


async def _seed_user(db, email, role="PUBLIC", plan="FREE"):
    user = User(email=email, name="Test", role=role, plan=plan, is_active=True)
    db.add(user)
    await db.flush()
    return user


def _headers(email):
    return {"Authorization": f"Bearer {create_access_token({'sub': email})}"}


@pytest.mark.asyncio
async def test_public_user_can_read_forecast(db):
    await _seed_user(db, "public@example.test")

    async def isolated_db():
        yield db

    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/forecast/DEL-BOM", headers=_headers("public@example.test"))
            assert response.status_code == 200
            # No data seeded: the honest answer is INSUFFICIENT_DATA, not 403.
            assert response.json()["status"] in ("INSUFFICIENT_DATA", "NO_DATA", "FORECAST")
            metadata = await client.get("/api/forecasts/metadata", headers=_headers("public@example.test"))
            assert metadata.status_code == 200
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_public_user_can_read_index_basket_and_history(db):
    await _seed_user(db, "public@example.test")

    async def isolated_db():
        yield db

    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            basket = await client.get("/api/index/basket", headers=_headers("public@example.test"))
            assert basket.status_code == 200
            assert basket.json()["total"] >= 10
            assert basket.json()["dgca_weights_status"] == "UNAVAILABLE"
            history = await client.get("/api/index/history", headers=_headers("public@example.test"))
            assert history.status_code == 200
            assert history.json()["count"] == 0
            backtest = await client.get("/api/index/backtest", headers=_headers("public@example.test"))
            assert backtest.status_code == 200
            assert backtest.json()["status"] in (
                "NO_BENCHMARK_DATA",
                "INSUFFICIENT_DATA",
                "COMPLETED",
            )
            assert backtest.json()["benchmark"].startswith("MoSPI CPI")
            dgca_backtest = await client.get(
                "/api/index/backtest?benchmark=dgca", headers=_headers("public@example.test")
            )
            assert dgca_backtest.status_code == 200
            assert dgca_backtest.json()["status"] in (
                "NO_DGCA_DATA",
                "INSUFFICIENT_DATA",
                "COMPLETED",
            )
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_public_user_can_read_collections_and_exports(db):
    await _seed_user(db, "public@example.test")

    async def isolated_db():
        yield db

    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            runs = await client.get("/api/collections", headers=_headers("public@example.test"))
            assert runs.status_code == 200
            health = await client.get("/api/collections/source-health", headers=_headers("public@example.test"))
            assert health.status_code == 200
            exports = await client.get("/api/exports/index-history", headers=_headers("public@example.test"))
            assert exports.status_code == 200
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_write_endpoints_still_gated_for_public_user(db):
    await _seed_user(db, "public@example.test")

    async def isolated_db():
        yield db

    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            trigger = await client.post("/api/collections/trigger", headers=_headers("public@example.test"))
            assert trigger.status_code == 403
            detect = await client.post("/api/anomalies/run-detection", headers=_headers("public@example.test"))
            assert detect.status_code == 403
            refresh = await client.post("/api/government/refresh", headers=_headers("public@example.test"))
            assert refresh.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_read_endpoints_still_require_sign_in(db):
    await _seed_user(db, "public@example.test")

    async def isolated_db():
        yield db

    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/api/forecast/DEL-BOM")).status_code == 401
            assert (await client.get("/api/index/basket")).status_code == 401
            assert (await client.get("/api/index/history")).status_code == 401
            assert (await client.get("/api/collections")).status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)
