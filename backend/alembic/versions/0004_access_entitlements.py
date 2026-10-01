"""Add access requests, feature entitlements, and user notifications.

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa


revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feature_access_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_email", sa.String(255), nullable=False),
        sa.Column("user_name", sa.String(255), nullable=False, server_default="User"),
        sa.Column("feature_key", sa.String(80), nullable=False),
        sa.Column("feature_name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.String(255), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
    )
    op.create_index("ix_feature_access_requests_user_email", "feature_access_requests", ["user_email"])
    op.create_index("ix_feature_access_requests_feature_key", "feature_access_requests", ["feature_key"])
    op.create_index("ix_feature_access_requests_status", "feature_access_requests", ["status"])

    op.create_table(
        "user_feature_access",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_email", sa.String(255), nullable=False),
        sa.Column("feature_key", sa.String(80), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("granted_by", sa.String(255), nullable=False),
        sa.UniqueConstraint("user_email", "feature_key", name="uq_user_feature_access"),
    )
    op.create_index("ix_user_feature_access_user_email", "user_feature_access", ["user_email"])
    op.create_index("ix_user_feature_access_feature_key", "user_feature_access", ["feature_key"])

    op.create_table(
        "user_notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_email", sa.String(255), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_user_notifications_user_email", "user_notifications", ["user_email"])


def downgrade() -> None:
    op.drop_index("ix_user_notifications_user_email", table_name="user_notifications")
    op.drop_table("user_notifications")
    op.drop_index("ix_user_feature_access_feature_key", table_name="user_feature_access")
    op.drop_index("ix_user_feature_access_user_email", table_name="user_feature_access")
    op.drop_table("user_feature_access")
    op.drop_index("ix_feature_access_requests_status", table_name="feature_access_requests")
    op.drop_index("ix_feature_access_requests_feature_key", table_name="feature_access_requests")
    op.drop_index("ix_feature_access_requests_user_email", table_name="feature_access_requests")
    op.drop_table("feature_access_requests")
