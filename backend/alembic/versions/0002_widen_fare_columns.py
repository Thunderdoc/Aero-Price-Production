"""Widen fare text columns to match provider payloads.

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# (column, new width). Same list drives both dialects below.
_WIDENED = [
    ("airline", 64),
    ("flight_number", 32),
    ("departure_time", 32),
    ("arrival_time", 32),
    ("fare_family", 32),
    ("cabin", 16),
    ("availability_status", 32),
    ("source", 64),
    ("data_origin", 32),
    ("collector_version", 16),
]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        # SQLite has no ALTER COLUMN ... TYPE: batch mode rewrites the table
        # (copy → drop → rename) with the new widths. Without this branch
        # `alembic upgrade head` fails on the dev SQLite DB before reaching
        # later migrations (fixed 21 Nov 2026, Phase 5).
        with op.batch_alter_table("fare_observations") as batch_op:
            for name, width in _WIDENED:
                batch_op.alter_column(name, type_=sa.String(width))
    else:
        for name, width in _WIDENED:
            op.alter_column("fare_observations", name, type_=sa.String(width))


def downgrade() -> None:
    # Reversing these widths can truncate legitimate existing values, so the
    # downgrade is intentionally not destructive.
    raise NotImplementedError("Fare column widening is not safely reversible")
