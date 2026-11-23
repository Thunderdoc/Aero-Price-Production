"""Serverless pool discipline + schema self-heal (23 Nov 2026).

Regression tests for the intermittent HTTP 500s on random read endpoints
after Push 5: SQLAlchemy's default pool (5 + 10 overflow) let concurrent
Vercel instances exhaust the Supabase Nano's max_connections=60. The fix
caps each instance at one connection plus one overflow. The schema-version
bump (v7) makes the created_at drift fix self-healing on boot instead of a
manual DDL.
"""

from app.core.database import (
    _POSTGRES_SCHEMA_VERSION,
    _engine_options_for,
)


def test_postgres_pool_is_capped_for_serverless():
    opts = _engine_options_for(
        "postgresql+asyncpg://user:pw@host:5432/db", echo=False
    )
    assert opts["pool_size"] == 1
    assert opts["max_overflow"] == 1
    assert opts["pool_timeout"] == 10
    assert opts["pool_pre_ping"] is True
    assert opts["pool_recycle"] == 300
    # No SQLite-only options leak into the Postgres config.
    assert "connect_args" not in opts


def test_sqlite_options_unchanged():
    opts = _engine_options_for("sqlite:///:memory:", echo=False)
    assert opts["connect_args"] == {"timeout": 30}
    assert "pool_size" not in opts
    assert "max_overflow" not in opts


def test_postgres_schema_version_is_7():
    # v7 adds the created_at columns (drift alignment to migration 0001)
    # to the boot-time DDL so any live DB missing them self-heals.
    assert _POSTGRES_SCHEMA_VERSION == 7
