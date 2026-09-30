from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

_database_url = settings.sqlalchemy_database_url
_connect_args = {"timeout": 30} if _database_url.startswith("sqlite") else {}

engine = create_async_engine(
    _database_url,
    connect_args=_connect_args,
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


# Vercel can start several Python workers at the same time.  The schema is
# shared by all of them, so DDL must be serialized across PostgreSQL
# connections rather than run independently from each worker's lifespan.
_POSTGRES_SCHEMA_LOCK = 260956056
_POSTGRES_SCHEMA_VERSION = 2
_tables_initialized = False


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def create_all_tables():
    global _tables_initialized
    if _tables_initialized:
        return

    async with engine.begin() as conn:
        if conn.dialect.name == "sqlite":
            # Local development runs the scheduler and request handlers in
            # the same SQLite file. WAL plus a busy timeout prevents a brief
            # collector write from turning registration/access requests into
            # generic 500 responses.
            await conn.execute(text("PRAGMA journal_mode=WAL"))
            await conn.execute(text("PRAGMA busy_timeout=30000"))
        if conn.dialect.name == "postgresql":
            # Transaction-scoped advisory locking prevents concurrent Vercel
            # cold starts from deadlocking while create_all/ALTER TABLE runs.
            await conn.execute(
                text("SELECT pg_advisory_xact_lock(:lock_key)"),
                {"lock_key": _POSTGRES_SCHEMA_LOCK},
            )
        await conn.run_sync(Base.metadata.create_all)

        if conn.dialect.name == "postgresql":
            # Keep the DDL one-time after the lock is acquired.  Repeating
            # ALTER TABLE on every serverless worker is unnecessary and can
            # block ordinary reads even when no schema change is needed.
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS aeroprice_schema_meta (
                    id SMALLINT PRIMARY KEY,
                    version INTEGER NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """))
            result = await conn.execute(text(
                "SELECT version FROM aeroprice_schema_meta WHERE id = 1"
            ))
            current_version = result.scalar_one_or_none()
            if current_version != _POSTGRES_SCHEMA_VERSION:
                # Render deployments may already contain the original
                # source_health table. create_all() does not alter existing
                # tables, so add telemetry columns introduced later.
                await conn.execute(text("""
                    ALTER TABLE source_health
                    ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS quota_used INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS freshness_minutes INTEGER
                """))
                # The first deployed PostgreSQL schema was narrower than the
                # provider payload contract. Widen it once, idempotently.
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
                await conn.execute(text("""
                    INSERT INTO aeroprice_schema_meta (id, version)
                    VALUES (1, :version)
                    ON CONFLICT (id) DO UPDATE SET
                        version = EXCLUDED.version,
                        updated_at = NOW()
                """), {"version": _POSTGRES_SCHEMA_VERSION})

    _tables_initialized = True
