from sqlalchemy import Boolean, Column, DateTime, String, func

from app.core.database import Base
from app.models.base import new_uuid


class AuthAccount(Base):
    """Credentials for accounts created through the backend auth path."""

    __tablename__ = "auth_accounts"

    account_id = Column(String(36), primary_key=True, default=new_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="PUBLIC")
    plan = Column(String(20), nullable=False, default="FREE")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
