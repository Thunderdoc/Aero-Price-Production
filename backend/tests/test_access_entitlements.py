from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.api.routes.admin import (
    AccessRequestCreate,
    AccessDecision,
    FeedbackCreate,
    UserStatusUpdate,
    approve_access_request,
    create_access_request,
    create_feedback,
    get_access_request_details,
    mark_all_notifications_read,
    mark_notification_read,
    reject_access_request,
    revoke_access_request,
    update_user_status,
    update_user_role,
    UserRoleUpdate,
    create_price_alert,
    list_price_alerts,
    delete_price_alert,
    PriceAlertCreate,
)
from app.api.routes.auth import _disabled_account_error
from app.models.access import FeatureAccessRequest, UserFeatureAccess, UserNotification, PriceAlert
from app.models.auth_account import AuthAccount
from app.models.feedback import UserFeedback
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
    assert notification.title == "Premium Access Activated"
    audit = await db.scalar(select(AuditLog).where(AuditLog.action == "ACCESS_APPROVED"))
    assert audit is not None
    assert audit.resource_id == request.id


@pytest.mark.asyncio
async def test_premium_request_message_is_persisted_and_audited(db):
    result = await create_access_request(
        AccessRequestCreate(
            feature_key="PRICE_ALERTS",
            feature_name="Price Alerts",
            request_message="I need fare alerts for upcoming work travel.",
        ),
        {"email": "requester@example.test", "name": "Requester", "role": "PUBLIC", "plan": "FREE"},
        db,
    )
    await db.flush()

    request = await db.get(FeatureAccessRequest, result["id"])
    audit = await db.scalar(select(AuditLog).where(AuditLog.action == "ACCESS_REQUESTED"))
    assert request is not None
    assert request.request_message == "I need fare alerts for upcoming work travel."
    assert audit is not None
    assert audit.resource_id == request.id
    assert result["request_message"] == request.request_message


@pytest.mark.asyncio
async def test_feedback_submission_is_visible_and_audited(db):
    result = await create_feedback(
        FeedbackCreate(
            title="Route page issue",
            message="The route page keeps loading after I choose Delhi to Bengaluru.",
            category="BUG",
            priority="HIGH",
            source_module="User Portal",
        ),
        {
            "email": "feedback-user@example.test",
            "name": "Feedback User",
            "role": "PUBLIC",
            "plan": "FREE",
        },
        db,
    )
    await db.flush()

    feedback = await db.get(UserFeedback, result["id"])
    audit = await db.scalar(select(AuditLog).where(AuditLog.action == "FEEDBACK_CREATE"))

    assert feedback is not None
    assert feedback.user_email == "feedback-user@example.test"
    assert audit is not None
    assert audit.resource_id == result["id"]
    assert audit.details["category"] == "BUG"


@pytest.mark.asyncio
async def test_premium_revoke_restores_standard_and_records_real_history(db):
    account = User(email="revoke@example.test", name="Revoke User", role="PUBLIC", plan="FREE", is_active=True)
    auth_account = AuthAccount(email=account.email, name=account.name, password_hash="stored-hash", role="PUBLIC", plan="FREE", is_active=True)
    request = FeatureAccessRequest(user_email=account.email, user_name=account.name, feature_key="PRICE_ALERTS", feature_name="Price Alerts", request_message="Please enable Premium.")
    db.add_all([account, auth_account, request])
    await db.flush()
    admin = {"email": "admin@example.test", "role": "ADMIN", "plan": "ADMIN"}

    await approve_access_request(request.id, admin, db)
    revoked = await revoke_access_request(request.id, AccessDecision(rejection_reason="Subscription policy review."), admin, db)
    await db.refresh(account)
    await db.refresh(auth_account)
    history = await get_access_request_details(request.id, admin, db)

    assert revoked["status"] == "REVOKED"
    assert account.plan == "FREE"
    assert auth_account.plan == "FREE"
    assert history["request"]["request_message"] == "Please enable Premium."
    assert [item["action"] for item in history["history"]] == ["ACCESS_REQUESTED", "ACCESS_APPROVED", "ACCESS_REVOKED"]
    notification = await db.scalar(select(UserNotification).where(UserNotification.user_email == account.email, UserNotification.title == "Premium Access Changed"))
    assert notification is not None
    assert notification.title == "Premium Access Changed"
    assert "changed to Standard" in notification.message
    audit = await db.scalar(select(AuditLog).where(AuditLog.action == "ACCESS_REVOKED", AuditLog.resource_id == request.id))
    assert audit is not None
    assert audit.details["previous_plan"] == "SUBSCRIBER"
    assert audit.details["new_plan"] == "FREE"


@pytest.mark.asyncio
async def test_premium_rejection_notifies_user_and_preserves_rejection_state(db):
    request = FeatureAccessRequest(user_email="reject@example.test", user_name="Reject User", feature_key="PRICE_ALERTS", feature_name="Price Alerts")
    db.add(request)
    await db.flush()
    result = await reject_access_request(request.id, AccessDecision(rejection_reason="Please provide more account details."), {"email": "admin@example.test", "role": "ADMIN"}, db)

    notification = await db.scalar(select(UserNotification).where(UserNotification.user_email == request.user_email))
    assert result["status"] == "REJECTED"
    assert notification is not None
    assert notification.title == "Premium Request Update"
    assert "Please provide more account details." in notification.message


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


@pytest.mark.asyncio
async def test_price_alerts_are_server_side_and_require_the_live_premium_grant(db):
    identity = {"email": "premium@example.test", "role": "PUBLIC", "plan": "SUBSCRIBER"}
    with pytest.raises(Exception) as denied:
        await list_price_alerts(identity, db)
    assert getattr(denied.value, "status_code", None) == 403

    db.add(UserFeatureAccess(user_email=identity["email"], feature_key="PRICE_ALERTS", granted_by="admin@example.test"))
    await db.flush()
    created = await create_price_alert(
        PriceAlertCreate(route="DEL-BOM", target_fare=5500, notification_frequency="DAILY"), identity, db,
    )
    await db.flush()
    listed = await list_price_alerts(identity, db)
    assert listed["alerts"][0]["id"] == created["id"]
    assert listed["alerts"][0]["route"] == "DEL-BOM"

    await delete_price_alert(created["id"], identity, db)
    assert await db.get(PriceAlert, created["id"]) is None

@pytest.mark.asyncio
async def test_admin_disable_and_reenable_blocks_and_restores_sign_in(db, monkeypatch):
    email = "status@example.test"
    user = User(email=email, name="Status User", role="PUBLIC", plan="FREE", is_active=True)
    auth_account = AuthAccount(email=email, name="Status User", password_hash="stored-hash", role="PUBLIC", plan="FREE", is_active=True)
    db.add_all([user, auth_account])
    await db.flush()
    monkeypatch.setattr("app.core.firebase_admin.firebase_app", lambda: None)
    admin = {"email": "admin@example.test", "role": "ADMIN", "plan": "ADMIN"}

    disabled = await update_user_status(
        email,
        UserStatusUpdate(is_active=False, reason="Security concern"),
        admin,
        db,
    )
    await db.flush()
    blocked_login = await _disabled_account_error(email, db)
    await db.refresh(user)
    await db.refresh(auth_account)

    assert disabled["status"] == "INACTIVE"
    assert user.is_active is False and auth_account.is_active is False
    assert blocked_login is not None and blocked_login.status_code == 403
    assert "Security concern" in blocked_login.detail

    enabled = await update_user_status(
        email,
        UserStatusUpdate(is_active=True),
        admin,
        db,
    )
    await db.flush()
    await db.refresh(user)
    await db.refresh(auth_account)

    assert enabled["status"] == "ACTIVE"
    assert user.is_active is True and auth_account.is_active is True
    assert await _disabled_account_error(email, db) is None
    events = (await db.execute(select(AuditLog).where(
        AuditLog.resource_type == "user",
        AuditLog.resource_id == email,
    ).order_by(AuditLog.created_at))).scalars().all()
    assert [event.action for event in events] == ["USER_DISABLED", "USER_ENABLED"]


@pytest.mark.asyncio
async def test_role_change_persists_when_firebase_claim_sync_is_temporarily_unavailable(db, monkeypatch):
    account = User(email="role-change@example.test", name="Role Change", role="PUBLIC", plan="SUBSCRIBER", is_active=True)
    db.add(account)
    await db.flush()

    def unavailable():
        raise RuntimeError("Firebase service unavailable")

    monkeypatch.setattr("app.core.firebase_admin.firebase_app", unavailable)
    result = await update_user_role(
        account.email,
        UserRoleUpdate(role="PUBLIC", plan="FREE"),
        {"email": "admin@example.test", "role": "ADMIN"},
        db,
    )
    await db.refresh(account)
    assert result["firebase_sync"] == "DEFERRED"
    assert account.plan == "FREE"
