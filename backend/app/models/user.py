from sqlalchemy import Column, String, Boolean, DateTime, JSON, func
from app.core.database import Base
from app.models.base import new_uuid


class User(Base):
    __tablename__ = "users"

    user_id    = Column(String(36), primary_key=True, default=new_uuid)
    email      = Column(String(255), unique=True, nullable=False, index=True)
    name       = Column(String(100), nullable=False)
    role       = Column(String(20), default="PUBLIC")   # PUBLIC, ANALYST, ADMIN
    plan       = Column(String(20), default="FREE")     # FREE, SUBSCRIBER, GOVERNMENT, ADMIN
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    """Immutable append-only audit trail."""
    __tablename__ = "audit_logs"

    id            = Column(String(36), primary_key=True, default=new_uuid)
    user_email    = Column(String(256), nullable=True)
    action        = Column(String(128), nullable=False)
    resource_type = Column(String(64), nullable=True)
    resource_id   = Column(String(128), nullable=True)
    details       = Column(JSON, nullable=True)
    ip_address    = Column(String(64), nullable=True)
    created_at    = Column(DateTime(timezone=True), nullable=False, default=func.now(), index=True)
