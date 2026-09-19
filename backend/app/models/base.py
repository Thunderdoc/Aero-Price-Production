from sqlalchemy import Column, String, DateTime, func
from sqlalchemy.dialects.sqlite import TEXT
from app.core.database import Base
import uuid


def new_uuid() -> str:
    return str(uuid.uuid4())
