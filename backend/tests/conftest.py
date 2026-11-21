"""
pytest configuration for AeroPrice backend tests.
Uses an in-memory SQLite database for isolation.
"""
import os

# SECRET_KEY has no default in app config (fail-closed, Phase 1). The suite
# needs one to import the app at all; this test-only value is used unless the
# environment already provides a real one.
os.environ.setdefault("SECRET_KEY", "pytest-only-test-secret-key-0123456789abcdef")

import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.models.base import Base
from app.models import access, auth_account, fare, feedback, collection, index, government, user  # register all models


@pytest.fixture(scope="function")
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()
