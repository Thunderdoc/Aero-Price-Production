"""Create price_alerts, user_feedback and user_feedback_details.

These three tables are defined by the models (app/models/access.py,
app/models/feedback.py) but no migration 0001-0004 ever created them, so a
database built by Alembic alone was missing them — the same root cause as
the conftest fixture gap (access/feedback models were never registered).
Columns mirror the models exactly.

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "price_alerts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_email", sa.String(255), nullable=False),
        sa.Column("route", sa.String(7), nullable=False),
        sa.Column("target_fare", sa.Float(), nullable=False),
        sa.Column("travel_date", sa.String(10), nullable=True),
        sa.Column("notification_frequency", sa.String(16), nullable=False, server_default="IMMEDIATE"),
        sa.Column("status", sa.String(16), nullable=False, server_default="ACTIVE"),
        sa.Column("last_observed_fare", sa.Float(), nullable=True),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_price_alerts_user_email", "price_alerts", ["user_email"])
    op.create_index("ix_price_alerts_route", "price_alerts", ["route"])
    op.create_index("ix_price_alerts_status", "price_alerts", ["status"])

    op.create_table(
        "user_feedback",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_email", sa.String(255), nullable=False),
        sa.Column("user_name", sa.String(255), nullable=False, server_default="User"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="NEW"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_user_feedback_user_email", "user_feedback", ["user_email"])

    op.create_table(
        "user_feedback_details",
        sa.Column("feedback_id", sa.String(36), sa.ForeignKey("user_feedback.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("priority", sa.String(10), nullable=False),
        sa.Column("source_module", sa.String(80), nullable=True),
        sa.Column("user_role", sa.String(20), nullable=False),
        sa.Column("user_plan", sa.String(20), nullable=False),
        sa.Column("admin_reply", sa.Text(), nullable=True),
        sa.Column("internal_notes", sa.Text(), nullable=True),
        sa.Column("screenshot_name", sa.String(100), nullable=True),
        sa.Column("screenshot_type", sa.String(20), nullable=True),
        sa.Column("screenshot", sa.LargeBinary(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("user_feedback_details")
    op.drop_index("ix_user_feedback_user_email", table_name="user_feedback")
    op.drop_table("user_feedback")
    op.drop_index("ix_price_alerts_status", table_name="price_alerts")
    op.drop_index("ix_price_alerts_route", table_name="price_alerts")
    op.drop_index("ix_price_alerts_user_email", table_name="price_alerts")
    op.drop_table("price_alerts")
