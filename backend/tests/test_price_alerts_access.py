"""
Price-alerts access tests (21 Nov 2026 decision): Price Alerts are unlocked
for every signed-in user. The old Premium grant check 403'd signed-in users
without a UserFeatureAccess PRICE_ALERTS row; no grant row is needed now.
Unauthenticated requests still 401.
"""
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.auth import create_access_token
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.fare import FareObservation
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
async def test_public_user_without_grant_can_use_price_alerts(db):
    # No UserFeatureAccess row is seeded anywhere: the grant must not gate.
    await _seed_user(db, "public@example.test")
    db.add(
        FareObservation(
            collection_run_id="run-1",
            origin="DEL",
            destination="BOM",
            route="DEL-BOM",
            airline="IndiGo",
            travel_date="2026-11-28",
            advance_days=7,
            base_fare=4000.0,
            taxes=500.0,
            fees=0.0,
            total_fare=4500.0,
            data_origin="PUBLIC_INTERFACE",
            source="fast-flights",
            is_valid=True,
        )
    )
    await db.flush()

    async def isolated_db():
        yield db

    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            listed = await client.get("/api/price-alerts", headers=_headers("public@example.test"))
            assert listed.status_code == 200, listed.text
            assert listed.json()["alerts"] == []

            created = await client.post(
                "/api/price-alerts",
                headers=_headers("public@example.test"),
                json={"route": "DEL-BOM", "target_fare": 5000.0, "travel_date": "2026-11-28"},
            )
            assert created.status_code == 200, created.text
            body = created.json()
            assert body["route"] == "DEL-BOM"
            # current_fare reflects the PUBLIC_INTERFACE fare, not None.
            assert body["current_fare"] == 4500.0

            listed2 = await client.get("/api/price-alerts", headers=_headers("public@example.test"))
            assert len(listed2.json()["alerts"]) == 1

            deleted = await client.delete(
                f"/api/price-alerts/{body['id']}", headers=_headers("public@example.test")
            )
            assert deleted.status_code == 200
            assert deleted.json()["status"] == "DELETED"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_price_alerts_still_require_sign_in(db):
    await _seed_user(db, "public@example.test")

    async def isolated_db():
        yield db

    app.dependency_overrides[get_db] = isolated_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/api/price-alerts")).status_code == 401
            assert (
                await client.post(
                    "/api/price-alerts",
                    json={"route": "DEL-BOM", "target_fare": 5000.0},
                )
            ).status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)
