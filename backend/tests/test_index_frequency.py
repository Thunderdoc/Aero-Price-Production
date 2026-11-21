"""
Index-history frequency tests: daily (default), weekly and monthly views.

Weekly periods are ISO weeks, monthly periods are calendar months; the
period value is the LAST daily published value in the period — no averaging,
no interpolation.
"""
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.auth import create_access_token
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.index import IndexObservation
from app.models.user import User
from main import app


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    limiter._buckets.clear()
    yield
    limiter._buckets.clear()


async def _seed_published(db, period, value, route_count=12, obs_count=100):
    db.add(
        IndexObservation(
            publication_id=f"pub-{period}",
            observation_period=period,
            index_value=value,
            status="PUBLISHED",
            index_version="v1.0",
            method="JEVONS_MATCHED_SAMPLE",
            base_period="2026-08-01",
            base_value=100.0,
            route_count=route_count,
            observation_count=obs_count,
            coverage_pct=63.2,
            data_origin="DERIVED",
        )
    )


async def _seed_user(db):
    user = User(email="freq@example.test", name="Freq", role="PUBLIC", plan="FREE", is_active=True)
    db.add(user)
    await db.flush()
    return {"Authorization": f"Bearer {create_access_token({'sub': user.email})}"}


@pytest.mark.asyncio
async def test_history_daily_default(db):
    headers = await _seed_user(db)
    await _seed_published(db, "2026-11-01", 100.0)
    await _seed_published(db, "2026-11-02", 101.5)
    await db.flush()

    async def isolated_db():
        yield db

    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/index/history", headers=headers)
    finally:
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 200
    body = response.json()
    assert body["frequency"] == "daily"
    assert body["count"] == 2
    assert [row["period"] for row in body["observations"]] == ["2026-11-02", "2026-11-01"]
    assert body["observations"][0]["value"] == 101.5


@pytest.mark.asyncio
async def test_history_weekly_uses_last_value_in_iso_week(db):
    headers = await _seed_user(db)
    # 2026-11-02 (Mon) .. 2026-11-08 (Sun) are ISO week 45; 2026-11-09 is week 46.
    await _seed_published(db, "2026-11-02", 100.0)
    await _seed_published(db, "2026-11-05", 102.0)
    await _seed_published(db, "2026-11-08", 103.0)
    await _seed_published(db, "2026-11-09", 104.0)
    await db.flush()

    async def isolated_db():
        yield db

    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/index/history?frequency=weekly", headers=headers)
    finally:
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 200
    body = response.json()
    assert body["frequency"] == "weekly"
    assert body["count"] == 2
    by_period = {row["period"]: row for row in body["observations"]}
    assert by_period["2026-W46"]["value"] == 104.0
    # Week 45 takes the LAST daily value (2026-11-08), not the average.
    assert by_period["2026-W45"]["value"] == 103.0
    assert by_period["2026-W45"]["period_end"] == "2026-11-08"


@pytest.mark.asyncio
async def test_history_monthly_uses_last_value_in_month(db):
    headers = await _seed_user(db)
    await _seed_published(db, "2026-10-05", 99.0)
    await _seed_published(db, "2026-10-28", 101.0)
    await _seed_published(db, "2026-11-02", 102.0)
    await db.flush()

    async def isolated_db():
        yield db

    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/index/history?frequency=monthly", headers=headers)
    finally:
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 200
    body = response.json()
    assert body["frequency"] == "monthly"
    assert body["count"] == 2
    by_period = {row["period"]: row for row in body["observations"]}
    assert by_period["2026-10"]["value"] == 101.0
    assert by_period["2026-11"]["value"] == 102.0


@pytest.mark.asyncio
async def test_history_invalid_frequency_rejected(db):
    headers = await _seed_user(db)

    async def isolated_db():
        yield db

    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/index/history?frequency=yearly", headers=headers)
    finally:
        app.dependency_overrides.pop(get_db, None)
    assert response.status_code == 422
