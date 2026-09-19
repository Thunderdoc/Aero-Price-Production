from sqlalchemy import Column, String, Boolean, DateTime, func
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
    __tablename__ = "audit_log"

    log_id     = Column(String(36), primary_key=True, default=new_uuid)
    timestamp  = Column(DateTime(timezone=True), nullable=False, default=func.now(), index=True)
    actor      = Column(String(255), nullable=False)    # email or "system"
    action     = Column(String(50), nullable=False)     # LOGIN, LOGOUT, SOURCE_ENABLE...
    target     = Column(String(255), nullable=True)
    old_value  = Column(String, nullable=True)
    new_value  = Column(String, nullable=True)
    detail     = Column(String, nullable=True)
    ip_address = Column(String(45), nullable=True)
    session_id = Column(String(36), nullable=True)
