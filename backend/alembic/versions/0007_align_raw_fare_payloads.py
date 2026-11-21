"""Align raw_fare_payloads with the RawFarePayload model.

Revision ID: 0007
Revises: 0006

Migration 0001 created raw_fare_payloads with `raw_body` and without the
columns the model (and the collector) actually use: `payload`,
`payload_type`, `parser_version`, `schema_version`, `http_status`,
`latency_ms`, `advance_days`. A migrations-built DB therefore could not
store a RawFarePayload row at all, and migration 0006's re-tag of the
`payload` column failed with "no such column: payload" on both SQLite and
PostgreSQL. This migration adds the model's columns. The legacy 0001-only
columns (`raw_body`, `observation_id`, `content_hash`) are deliberately
left in place — dropping audit columns could destroy preserved data.
"""
from alembic import op
import sqlalchemy as sa


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD COLUMN works natively on both SQLite and PostgreSQL.
    # advance_days is nullable here even though the model declares it
    # NOT NULL: a NOT NULL add would fail on any table with legacy rows.
    # New rows always carry it (the collector sets it).
    op.add_column("raw_fare_payloads", sa.Column("advance_days", sa.Integer(), nullable=True))
    op.add_column("raw_fare_payloads", sa.Column("payload_type", sa.String(10), nullable=True))
    op.add_column("raw_fare_payloads", sa.Column("payload", sa.Text(), nullable=True))
    op.add_column("raw_fare_payloads", sa.Column("parser_version", sa.String(10), nullable=True))
    op.add_column("raw_fare_payloads", sa.Column("schema_version", sa.String(10), nullable=True))
    op.add_column("raw_fare_payloads", sa.Column("http_status", sa.Integer(), nullable=True))
    op.add_column("raw_fare_payloads", sa.Column("latency_ms", sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = (
        "latency_ms",
        "http_status",
        "schema_version",
        "parser_version",
        "payload",
        "payload_type",
        "advance_days",
    )
    if bind.dialect.name == "sqlite":
        # DROP COLUMN needs SQLite >= 3.35; batch mode is safe everywhere.
        with op.batch_alter_table("raw_fare_payloads") as batch_op:
            for name in columns:
                batch_op.drop_column(name)
    else:
        for name in columns:
            op.drop_column("raw_fare_payloads", name)
