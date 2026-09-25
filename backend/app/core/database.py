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
            # The first deployed PostgreSQL schema was narrower than the
            # provider payload contract.  Widen existing installations
            # idempotently so a newly connected deployment cannot fail when a
            # legitimate carrier name or full timestamp is persisted.
            await conn.execute(text("""
                ALTER TABLE fare_observations
                ALTER COLUMN airline TYPE VARCHAR(64),
                ALTER COLUMN flight_number TYPE VARCHAR(32),
                ALTER COLUMN departure_time TYPE VARCHAR(32),
                ALTER COLUMN arrival_time TYPE VARCHAR(32),
                ALTER COLUMN fare_family TYPE VARCHAR(32),
                ALTER COLUMN cabin TYPE VARCHAR(16),
                ALTER COLUMN availability_status TYPE VARCHAR(32),
                ALTER COLUMN source TYPE VARCHAR(64),
                ALTER COLUMN data_origin TYPE VARCHAR(32),
                ALTER COLUMN collector_version TYPE VARCHAR(16)
            """))
