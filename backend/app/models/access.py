from sqlalchemy import Column, String, DateTime, Text, Float, UniqueConstraint, func
from app.core.database import Base
from app.models.base import new_uuid


class FeatureAccessRequest(Base):
    __tablename__ = "feature_access_requests"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_email = Column(String(255), nullable=False, index=True)
    user_name = Column(String(255), nullable=False, default="User")
    feature_key = Column(String(80), nullable=False, index=True)
    feature_name = Column(String(255), nullable=False)
    request_message = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="PENDING", index=True)
    requested_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(String(255), nullable=True)
    rejection_reason = Column(Text, nullable=True)


class UserFeatureAccess(Base):
    __tablename__ = "user_feature_access"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_email = Column(String(255), nullable=False, index=True)
    feature_key = Column(String(80), nullable=False, index=True)
    granted_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    granted_by = Column(String(255), nullable=False)
    __table_args__ = (UniqueConstraint("user_email", "feature_key", name="uq_user_feature_access"),)


class UserNotification(Base):
    __tablename__ = "user_notifications"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_email = Column(String(255), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    read_at = Column(DateTime(timezone=True), nullable=True)


class PriceAlert(Base):
    """A Premium user's server-side fare threshold; never browser-local state."""
    __tablename__ = "price_alerts"

    id = Column(String(36), primary_key=True, default=new_uuid)
    user_email = Column(String(255), nullable=False, index=True)
    route = Column(String(7), nullable=False, index=True)
    target_fare = Column(Float, nullable=False)
    travel_date = Column(String(10), nullable=True)
    notification_frequency = Column(String(16), nullable=False, default="IMMEDIATE")
    status = Column(String(16), nullable=False, default="ACTIVE", index=True)
    last_observed_fare = Column(Float, nullable=True)
    triggered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
