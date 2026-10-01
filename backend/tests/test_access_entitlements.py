from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.api.routes.admin import approve_access_request, mark_all_notifications_read, mark_notification_read
from app.models.access import FeatureAccessRequest, UserFeatureAccess, UserNotification
from app.models.auth_account import AuthAccount
from app.models.user import AuditLog, User


@pytest.mark.asyncio
async def test_approve_price_alerts_promotes_entitlement_without_changing_role(db):
    account = User(
        email="user@example.test",
        name="Test User",
        role="PUBLIC",
        plan="FREE",
        is_active=True,
        last_login=datetime.now(timezone.utc),
    )
    request = FeatureAccessRequest(
        user_email=account.email,
        user_name=account.name,
        feature_key="PRICE_ALERTS",
        feature_name="Price Alerts",
    )
    db.add_all([account, request])
    await db.flush()

    result = await approve_access_request(
        request.id,
        {"email": "admin@example.test", "role": "ADMIN", "plan": "ADMIN"},
        db,
    )
    await db.flush()

    await db.refresh(account)
    assert result["status"] == "APPROVED"
    assert account.role == "PUBLIC"
    assert account.plan == "SUBSCRIBER"
    assert await db.scalar(select(UserFeatureAccess).where(
        UserFeatureAccess.user_email == account.email,
        UserFeatureAccess.feature_key == "PRICE_ALERTS",
    )) is not None
    notification = await db.scalar(select(UserNotification).where(UserNotification.user_email == account.email))
    assert notification is not None
    assert notification.title == "Access Approved"
    audit = await db.scalar(select(AuditLog).where(AuditLog.action == "ACCESS_APPROVED"))
    assert audit is not None
    assert audit.resource_id == request.id


@pytest.mark.asyncio
async def test_approve_price_alerts_updates_backend_auth_account(db):
    account = AuthAccount(
        email="backend-user@example.test",
        name="Backend User",
        password_hash="stored-hash",
        role="PUBLIC",
        plan="FREE",
        is_active=True,
    )
    request = FeatureAccessRequest(
        user_email=account.email,
        user_name=account.name,
        feature_key="PRICE_ALERTS",
        feature_name="Price Alerts",
    )
    db.add_all([account, request])
    await db.flush()

    await approve_access_request(
        request.id,
        {"email": "admin@example.test", "role": "ADMIN", "plan": "ADMIN"},
        db,
    )
    await db.refresh(account)

    assert account.role == "PUBLIC"
    assert account.plan == "SUBSCRIBER"


@pytest.mark.asyncio
async def test_notification_read_state_is_scoped_to_current_user(db):
    own = UserNotification(user_email="user@example.test", title="Own", message="Own message")
    other = UserNotification(user_email="other@example.test", title="Other", message="Other message")
    db.add_all([own, other])
    await db.flush()

    result = await mark_notification_read(own.id, {"email": "user@example.test"}, db)
    await db.refresh(own)
    await db.refresh(other)
    assert result["read"] is True
    assert own.read_at is not None
    assert other.read_at is None

    second = UserNotification(user_email="user@example.test", title="Second", message="Second message")
    db.add(second)
    await db.flush()
    result = await mark_all_notifications_read({"email": "user@example.test"}, db)
    await db.refresh(second)
    await db.refresh(other)
    assert result["updated"] == 1
    assert second.read_at is not None
    assert other.read_at is None
