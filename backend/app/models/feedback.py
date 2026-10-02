from sqlalchemy import Column, String, Text, DateTime, LargeBinary, ForeignKey, func
from app.core.database import Base
from app.models.base import new_uuid


class UserFeedback(Base):
    __tablename__ = "user_feedback"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_email = Column(String(255), nullable=False, index=True)
    user_name = Column(String(255), nullable=False, default="User")
    message = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="NEW")
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)


class FeedbackDetails(Base):
    """Optional structured detail, without changing or discarding legacy messages."""
    __tablename__ = "user_feedback_details"

    feedback_id = Column(String(36), ForeignKey("user_feedback.id", ondelete="CASCADE"), primary_key=True)
    title = Column(String(160), nullable=False)
    category = Column(String(40), nullable=False)
    priority = Column(String(10), nullable=False)
    source_module = Column(String(80), nullable=True)
    user_role = Column(String(20), nullable=False)
    user_plan = Column(String(20), nullable=False)
    admin_reply = Column(Text, nullable=True)
    # Private working notes are deliberately separated from the reply shown in
    # a user's submission history.
    internal_notes = Column(Text, nullable=True)
    screenshot_name = Column(String(100), nullable=True)
    screenshot_type = Column(String(20), nullable=True)
    screenshot = Column(LargeBinary, nullable=True)
