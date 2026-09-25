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


def upgrade() -> None:
    op.alter_column("fare_observations", "airline", type_=sa.String(64))
    op.alter_column("fare_observations", "flight_number", type_=sa.String(32))
    op.alter_column("fare_observations", "departure_time", type_=sa.String(32))
    op.alter_column("fare_observations", "arrival_time", type_=sa.String(32))
    op.alter_column("fare_observations", "fare_family", type_=sa.String(32))
    op.alter_column("fare_observations", "cabin", type_=sa.String(16))
    op.alter_column("fare_observations", "availability_status", type_=sa.String(32))
    op.alter_column("fare_observations", "source", type_=sa.String(64))
    op.alter_column("fare_observations", "data_origin", type_=sa.String(32))
    op.alter_column("fare_observations", "collector_version", type_=sa.String(16))


def downgrade() -> None:
    # Reversing these widths can truncate legitimate existing values, so the
    # downgrade is intentionally not destructive.
    raise NotImplementedError("Fare column widening is not safely reversible")
