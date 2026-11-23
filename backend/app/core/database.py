from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

def _engine_options_for(database_url: str, echo: bool) -> dict:
    """Engine options for one database URL (pure helper, unit-tested).

    SQLite keeps its writer-wait timeout. PostgreSQL gets serverless pool
    discipline (23 Nov 2026): the live database is a Supabase Nano with
    max_connections=60, shared by every Vercel function instance.
    SQLAlchemy's defaults (pool_size=5, max_overflow=10) let one burst of
    concurrent page loads open up to 15 connections per instance and
    exhaust the database, surfacing as intermittent HTTP 500s on random
    read endpoints. One connection per instance (plus one overflow for the
    startup DDL racing a first request) keeps the total far under the cap;
    pre-ping drops stale connections left by frozen instances, and recycle
    bounds their age.
    """
    options: dict = {"echo": echo, "future": True}
    if database_url.startswith("sqlite"):
        # Collection and government refresh jobs can overlap briefly on the
        # local development database. Let SQLite wait for the writer instead
        # of failing immediately with a database-locked error.
        options["connect_args"] = {"timeout": 30}
    else:
        options.update(
            {
                "pool_size": 1,
                "max_overflow": 1,
                "pool_timeout": 10,
                "pool_pre_ping": True,
                "pool_recycle": 300,
            }
        )
    return options


_engine_options = _engine_options_for(
    settings.sqlalchemy_database_url, settings.LOG_LEVEL == "DEBUG"
)

engine = create_async_engine(settings.sqlalchemy_database_url, **_engine_options)

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
_POSTGRES_SCHEMA_VERSION = 7
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
        if conn.dialect.name == "postgresql":
            # Transaction-scoped advisory locking prevents concurrent Vercel
            # cold starts from deadlocking while create_all/ALTER TABLE runs.
            await conn.execute(
                text("SELECT pg_advisory_xact_lock(:lock_key)"),
                {"lock_key": _POSTGRES_SCHEMA_LOCK},
            )
        await conn.run_sync(Base.metadata.create_all)

        if conn.dialect.name == "sqlite":
            # SQLite create_all does not add columns to an existing table.
            columns = await conn.exec_driver_sql("PRAGMA table_info(feature_access_requests)")
            if "request_message" not in {row[1] for row in columns.fetchall()}:
                await conn.execute(text(
                    "ALTER TABLE feature_access_requests ADD COLUMN request_message TEXT"
                ))
            feedback_columns = await conn.exec_driver_sql("PRAGMA table_info(user_feedback_details)")
            if "internal_notes" not in {row[1] for row in feedback_columns.fetchall()}:
                await conn.execute(text(
                    "ALTER TABLE user_feedback_details ADD COLUMN internal_notes TEXT"
                ))

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
                await conn.execute(text(
                    "ALTER TABLE feature_access_requests ADD COLUMN IF NOT EXISTS request_message TEXT"
                ))
                await conn.execute(text(
                    "ALTER TABLE user_feedback_details ADD COLUMN IF NOT EXISTS internal_notes TEXT"
                ))
                # Render deployments may already contain the original
                # source_health table. create_all() does not alter existing
                # tables, so add telemetry columns introduced later.
                await conn.execute(text("""
                    ALTER TABLE source_health
                    ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS quota_used INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS freshness_minutes INTEGER
                """))
                # Schema v7 (23 Nov 2026): the models gained created_at on
                # fare_observations and index_observations (drift alignment
                # to migration 0001). create_all() does not add columns to
                # existing tables, so a live DB built from the older models
                # is missing them and every ORM row query fails until they
                # exist. IF NOT EXISTS makes this a no-op on DBs that
                # already have them.
                await conn.execute(text("""
                    ALTER TABLE fare_observations
                    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
                """))
                await conn.execute(text("""
                    ALTER TABLE index_observations
                    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()
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
                    CREATE INDEX IF NOT EXISTS ix_fare_origin_valid_collected
                    ON fare_observations (data_origin, is_valid, collected_at)
                """))
                await conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS ix_fare_origin_valid_route_collected
                    ON fare_observations (data_origin, is_valid, route, collected_at)
                """))
                await conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS ix_collection_status_started
                    ON collection_runs (status, started_at DESC)
                """))
                await conn.execute(text("""
                    INSERT INTO aeroprice_schema_meta (id, version)
                    VALUES (1, :version)
                    ON CONFLICT (id) DO UPDATE SET
                        version = EXCLUDED.version,
                        updated_at = NOW()
                """), {"version": _POSTGRES_SCHEMA_VERSION})

    _tables_initialized = True
