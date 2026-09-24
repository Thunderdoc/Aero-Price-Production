from sqlalchemy import Column, String, Text, DateTime, func
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
