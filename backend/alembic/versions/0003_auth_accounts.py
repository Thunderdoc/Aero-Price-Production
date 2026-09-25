"""Add backend-auth account storage.

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_accounts",
        sa.Column("account_id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="PUBLIC"),
        sa.Column("plan", sa.String(20), nullable=False, server_default="FREE"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_auth_accounts_email", "auth_accounts", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_auth_accounts_email", table_name="auth_accounts")
    op.drop_table("auth_accounts")
