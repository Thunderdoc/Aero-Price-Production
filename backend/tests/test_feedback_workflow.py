import base64

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.routes import admin as routes
from app.models.access import UserNotification
from app.models.feedback import UserFeedback, FeedbackDetails
from app.models.user import AuditLog, User


@pytest.mark.parametrize("role,plan", [("PUBLIC", "FREE"), ("PUBLIC", "SUBSCRIBER"), ("ANALYST", "GOVERNMENT"), ("ADMIN", "ADMIN")])
async def test_feedback_is_persisted_with_private_history_and_notifications(db, role, plan):
    identity = {"email": "sender@example.test", "name": "Sender", "role": role, "plan": plan}
    db.add(User(email="admin@example.test", name="Admin", role="ADMIN", plan="ADMIN"))
    await db.flush()
    result = await routes.create_feedback(routes.FeedbackCreate(message="The route filter needs improvement", title="Route filter", category="BUG", priority="HIGH", source_module="routes"), identity, db)
    history = await routes.list_my_feedback(identity, db)
    assert history["feedback"][0]["id"] == result["id"]
    assert history["feedback"][0]["title"] == "Route filter"
    assert history["feedback"][0]["role"] == role
    assert (await routes.list_my_feedback({"email": "other@example.test"}, db))["feedback"] == []
    notifications = (await db.execute(select(UserNotification))).scalars().all()
    assert {row.user_email for row in notifications} == {"sender@example.test", "admin@example.test"}


async def test_positive_feedback_from_dgca_is_visible_in_the_admin_queue(db):
    identity = {"email": "analyst@example.test", "name": "DGCA Analyst", "role": "ANALYST", "plan": "GOVERNMENT"}
    entry = await routes.create_feedback(routes.FeedbackCreate(
        message="The route insights are clear and useful.", title="Great route insights.", category="PRAISE",
        source_module="DGCA Portal",
    ), identity, db)
    admin_queue = await routes.list_feedback({"role": "ADMIN"}, db)
    item = next(row for row in admin_queue["feedback"] if row["id"] == entry["id"])
    assert item["category"] == "PRAISE"
    assert item["role"] == "ANALYST"
    assert item["source_module"] == "DGCA Portal"


async def test_stale_feedback_session_cannot_downgrade_premium(db):
    user = User(email="premium@example.test", name="Premium", role="PUBLIC", plan="SUBSCRIBER")
    db.add(user)
    await db.flush()
    await routes.create_feedback(routes.FeedbackCreate(message="Useful product"), {"email": user.email, "role": "PUBLIC", "plan": "FREE"}, db)
    assert user.plan == "SUBSCRIBER"


async def test_feedback_review_notifies_once_and_keeps_the_admin_reply(db):
    sender = {"email": "sender@example.test", "name": "Sender", "role": "PUBLIC", "plan": "FREE"}
    admin = {"email": "admin@example.test", "role": "ADMIN"}
    entry = await routes.create_feedback(routes.FeedbackCreate(message="A filter is broken", title="Filter"), sender, db)
    update = routes.FeedbackUpdate(status="RESOLVED", reply="The filter has been corrected.")
    await routes.update_feedback(entry["id"], update, admin, db)
    await routes.update_feedback(entry["id"], update, admin, db)
    history = await routes.list_my_feedback(sender, db)
    assert history["feedback"][0]["reply"] == update.reply
    notifications = (await db.execute(select(UserNotification).where(UserNotification.title == "Feedback updated"))).scalars().all()
    assert len(notifications) == 1
    assert len((await db.execute(select(AuditLog).where(AuditLog.action == "FEEDBACK_STATUS"))).scalars().all()) == 1


async def test_feedback_internal_notes_are_available_only_to_admins(db):
    sender = {"email": "sender@example.test", "name": "Sender", "role": "PUBLIC", "plan": "FREE"}
    admin = {"email": "admin@example.test", "role": "ADMIN"}
    entry = await routes.create_feedback(routes.FeedbackCreate(message="A filter is broken", title="Filter"), sender, db)

    await routes.update_feedback(
        entry["id"],
        routes.FeedbackUpdate(status="IN_PROGRESS", reply="We are investigating this.", internal_notes="Reproduced on Firefox; assign to search team."),
        admin,
        db,
    )

    mine = await routes.list_my_feedback(sender, db)
    queue = await routes.list_feedback(admin, db)
    assert mine["feedback"][0]["reply"] == "We are investigating this."
    assert "internal_notes" not in mine["feedback"][0]
    assert queue["feedback"][0]["internal_notes"] == "Reproduced on Firefox; assign to search team."


async def test_attachment_is_private_and_invalid_image_types_are_rejected(db):
    sender = {"email": "sender@example.test", "role": "PUBLIC", "plan": "FREE"}
    image = base64.b64encode(b"\x89PNG\r\n\x1a\n" + bytes(40)).decode()
    entry = await routes.create_feedback(routes.FeedbackCreate(message="An issue", screenshot=routes.FeedbackScreenshot(name="screen.png", content_type="image/png", data_base64=image)), sender, db)
    assert (await routes.feedback_screenshot(entry["id"], sender, db)).media_type == "image/png"
    with pytest.raises(HTTPException) as exc:
        await routes.feedback_screenshot(entry["id"], {"email": "other@example.test", "role": "PUBLIC"}, db)
    assert exc.value.status_code == 404
    with pytest.raises(HTTPException) as exc:
        await routes.create_feedback(routes.FeedbackCreate(message="An issue", screenshot=routes.FeedbackScreenshot(name="fake.png", content_type="image/png", data_base64=base64.b64encode(b"<svg><script>bad</script></svg>").decode())), sender, db)
    assert exc.value.status_code == 422


async def test_notification_unread_count_includes_items_outside_the_latest_page(db):
    db.add_all([UserNotification(user_email="sender@example.test", title=f"Item {i}", message="Message") for i in range(30)])
    db.add(UserNotification(user_email="other@example.test", title="Private", message="Other account"))
    await db.flush()
    result = await routes.list_notifications({"email": "sender@example.test"}, db)
    assert len(result["notifications"]) == 25
    assert result["unread_count"] == 30
    assert result["total"] == 30
