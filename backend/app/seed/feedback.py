"""Development-only feedback fixtures for reviewing the admin workflow."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feedback import FeedbackDetails, UserFeedback


DEMO_FEEDBACK = (
    {
        "email": "riya.sharma.demo@example.test",
        "name": "Riya Sharma (Demo)",
        "title": "Route results are not loading",
        "message": "The route search stays on the loading state after I choose Delhi to Bengaluru. Refreshing the page shows the same issue.",
        "category": "BUG",
        "priority": "HIGH",
        "source_module": "Route Explorer",
        "role": "PUBLIC",
        "plan": "FREE",
        "status": "NEW",
    },
    {
        "email": "aman.verma.demo@example.test",
        "name": "Aman Verma (Demo)",
        "title": "Feedback drawer is clipped on smaller screens",
        "message": "On a laptop at 125% browser zoom, the feedback details panel cuts off the action buttons. The panel should remain usable without horizontal scrolling.",
        "category": "DESIGN",
        "priority": "MEDIUM",
        "source_module": "Admin Feedback",
        "role": "PUBLIC",
        "plan": "SUBSCRIBER",
        "status": "IN_PROGRESS",
    },
    {
        "email": "neha.patel.demo@example.test",
        "name": "Neha Patel (Demo)",
        "title": "Fare comparison shows a stale price",
        "message": "The comparison card shows yesterday's fare after I refresh the route. Please show the source timestamp beside the price.",
        "category": "DATA",
        "priority": "HIGH",
        "source_module": "Fare Comparison",
        "role": "PUBLIC",
        "plan": "SUBSCRIBER",
        "status": "NEW",
    },
    {
        "email": "vikram.singh.demo@example.test",
        "name": "Vikram Singh (Demo)",
        "title": "Add airline filtering to route search",
        "message": "Please add an airline filter so I can compare only Air India and IndiGo routes instead of scanning every result.",
        "category": "PRODUCT",
        "priority": "LOW",
        "source_module": "Route Explorer",
        "role": "PUBLIC",
        "plan": "FREE",
        "status": "REVIEWED",
    },
    {
        "email": "kavya.rao.demo@example.test",
        "name": "Kavya Rao (Demo)",
        "title": "DGCA dashboard export fails",
        "message": "Exporting the monthly DGCA statistics returns an error instead of downloading a CSV. The table itself loads correctly.",
        "category": "BUG",
        "priority": "HIGH",
        "source_module": "DGCA Dashboard",
        "role": "ANALYST",
        "plan": "GOVERNMENT",
        "status": "RESOLVED",
    },
    {
        "email": "arjun.mehta.demo@example.test",
        "name": "Arjun Mehta (Demo)",
        "title": "Helpful platform, add saved routes",
        "message": "The fare trend view is useful. Saving favourite routes would make it easier to check the same corridors each morning.",
        "category": "PRODUCT",
        "priority": "LOW",
        "source_module": "Dashboard",
        "role": "PUBLIC",
        "plan": "FREE",
        "status": "REVIEWED",
    },
)


async def seed_demo_feedback(db: AsyncSession) -> int:
    """Insert the local demo feedback set once and return inserted count."""
    existing = set((await db.execute(
        select(FeedbackDetails.title).where(FeedbackDetails.source_module.is_not(None))
    )).scalars().all())
    now = datetime.now(timezone.utc)
    inserted = 0
    for index, item in enumerate(DEMO_FEEDBACK):
        if item["title"] in existing:
            continue
        entry = UserFeedback(
            user_email=item["email"],
            user_name=item["name"],
            message=item["message"],
            status=item["status"],
            created_at=now - timedelta(hours=index * 7 + 1),
            reviewed_at=(now - timedelta(hours=index * 7)) if item["status"] in {"REVIEWED", "RESOLVED"} else None,
        )
        db.add(entry)
        await db.flush()
        db.add(FeedbackDetails(
            feedback_id=entry.id,
            title=item["title"],
            category=item["category"],
            priority=item["priority"],
            source_module=f"DEMO_SEED · {item['source_module']}",
            user_role=item["role"],
            user_plan=item["plan"],
        ))
        existing.add(item["title"])
        inserted += 1
    if inserted:
        await db.flush()
    return inserted
