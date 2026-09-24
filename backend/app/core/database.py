from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

engine = create_async_engine(
    settings.sqlalchemy_database_url,
    echo=settings.LOG_LEVEL == "DEBUG",
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def create_all_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Render deployments may already contain the original source_health
        # table. create_all() does not alter existing tables, so add the
        # telemetry columns introduced after the first production release.
        if conn.dialect.name == "postgresql":
            await conn.execute(text("""
                ALTER TABLE source_health
                ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS quota_used INTEGER DEFAULT 0,
                ADD COLUMN IF NOT EXISTS freshness_minutes INTEGER
            """))
