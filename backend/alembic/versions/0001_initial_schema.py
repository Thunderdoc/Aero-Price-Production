"""Initial schema — all tables

Revision ID: 0001
Revises:
Create Date: 2026-09-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # fare_observations
    op.create_table(
        "fare_observations",
        sa.Column("observation_id", sa.String(36), primary_key=True),
        sa.Column("collection_run_id", sa.String(36), nullable=True, index=True),
        sa.Column("origin", sa.String(3), nullable=False),
        sa.Column("destination", sa.String(3), nullable=False),
        sa.Column("route", sa.String(7), nullable=False, index=True),
        sa.Column("airline", sa.String(64)),
        sa.Column("flight_number", sa.String(16), nullable=True),
        sa.Column("departure_time", sa.String(32), nullable=True),
        sa.Column("arrival_time", sa.String(32), nullable=True),
        sa.Column("stops", sa.Integer(), default=0),
        sa.Column("travel_date", sa.String(10), nullable=False, index=True),
        sa.Column("advance_days", sa.Integer(), nullable=False, index=True),
        sa.Column("fare_family", sa.String(32)),
        sa.Column("cabin", sa.String(16), default="ECONOMY"),
        sa.Column("base_fare", sa.Numeric(12, 2)),
        sa.Column("taxes", sa.Numeric(12, 2)),
        sa.Column("fees", sa.Numeric(12, 2), nullable=True),
        sa.Column("total_fare", sa.Numeric(12, 2), nullable=False, index=True),
        sa.Column("currency", sa.String(3), default="INR"),
        sa.Column("availability_status", sa.String(32), nullable=True),
        sa.Column("source", sa.String(64)),
        sa.Column("source_url", sa.String(512), nullable=True),
        sa.Column("data_origin", sa.String(32), nullable=False, default="REAL"),
        sa.Column("collector_version", sa.String(16), nullable=True),
        sa.Column("raw_hash", sa.String(64), nullable=True),
        sa.Column("is_valid", sa.Boolean(), default=True),
        sa.Column("quality_flags", sa.JSON(), nullable=True),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "raw_fare_payloads",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("observation_id", sa.String(36), nullable=True),
        sa.Column("collection_run_id", sa.String(36), nullable=True),
        sa.Column("source", sa.String(64)),
        sa.Column("route", sa.String(7)),
        sa.Column("travel_date", sa.String(10)),
        sa.Column("raw_body", sa.Text()),
        sa.Column("content_hash", sa.String(64)),
        sa.Column("collected_at", sa.DateTime(timezone=True)),
    )

    # collection_runs
    op.create_table(
        "collection_runs",
        sa.Column("run_id", sa.String(36), primary_key=True),
        sa.Column("triggered_by", sa.String(64), default="scheduler"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(32), default="RUNNING"),
        sa.Column("routes_planned", sa.Integer(), default=0),
        sa.Column("routes_done", sa.Integer(), default=0),
        sa.Column("observations_collected", sa.Integer(), default=0),
        sa.Column("observations_rejected", sa.Integer(), default=0),
        sa.Column("error_summary", sa.Text(), nullable=True),
    )

    op.create_table(
        "source_health",
        sa.Column("source_id", sa.String(64), primary_key=True),
        sa.Column("source_name", sa.String(128)),
        sa.Column("source_type", sa.String(32)),
        sa.Column("status", sa.String(32), default="UNKNOWN"),
        sa.Column("last_attempt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failure", sa.DateTime(timezone=True), nullable=True),
        sa.Column("records_total", sa.Integer(), default=0),
        sa.Column("latency_ms_avg", sa.Float(), nullable=True),
        sa.Column("challenge_reason", sa.Text(), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("auth_status", sa.String(32), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # index tables
    op.create_table(
        "index_observations",
        sa.Column("publication_id", sa.String(36), primary_key=True),
        sa.Column("observation_period", sa.String(10), nullable=False, index=True),
        sa.Column("index_value", sa.Float(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("index_version", sa.String(16)),
        sa.Column("method", sa.String(64)),
        sa.Column("base_period", sa.String(7)),
        sa.Column("base_value", sa.Float()),
        sa.Column("route_count", sa.Integer()),
        sa.Column("coverage_pct", sa.Float()),
        sa.Column("data_origin", sa.String(32)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "index_publications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("index_value", sa.Float()),
        sa.Column("route_count", sa.Integer()),
        sa.Column("published_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "route_baskets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("route", sa.String(7), nullable=False),
        sa.Column("weight", sa.Float(), default=1.0),
        sa.Column("active", sa.Boolean(), default=True),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # government tables
    op.create_table(
        "gov_datasets",
        sa.Column("dataset_id", sa.String(64), primary_key=True),
        sa.Column("source_name", sa.String(256)),
        sa.Column("organization", sa.String(256)),
        sa.Column("access_type", sa.String(32)),
        sa.Column("api_key_required", sa.String(8)),
        sa.Column("format", sa.String(16)),
        sa.Column("source_url", sa.String(512)),
        sa.Column("status", sa.String(32)),
        sa.Column("last_attempt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_retrieved", sa.DateTime(timezone=True), nullable=True),
        sa.Column("record_count", sa.Integer(), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("reference_period", sa.String(32), nullable=True),
    )

    op.create_table(
        "dgca_monthly_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("domestic_passengers", sa.BigInteger()),
        sa.Column("source", sa.String(32), default="OFFICIAL"),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("year", "month", name="uq_dgca_year_month"),
    )

    op.create_table(
        "mospi_cpi_records",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("period", sa.String(16), nullable=False, unique=True),
        sa.Column("cpi_transport", sa.Float()),
        sa.Column("source", sa.String(32), default="OFFICIAL"),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "dgca_circulars",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(512)),
        sa.Column("date", sa.String(16)),
        sa.Column("category", sa.String(64)),
        sa.Column("url", sa.String(512)),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # user tables
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(256), nullable=False, unique=True),
        sa.Column("name", sa.String(256)),
        sa.Column("role", sa.String(32), default="PUBLIC"),
        sa.Column("plan", sa.String(32), default="FREE"),
        sa.Column("hashed_password", sa.String(256)),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_email", sa.String(256)),
        sa.Column("action", sa.String(128)),
        sa.Column("resource_type", sa.String(64), nullable=True),
        sa.Column("resource_id", sa.String(128), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    for table in [
        "audit_logs", "users", "dgca_circulars", "mospi_cpi_records",
        "dgca_monthly_records", "gov_datasets", "route_baskets",
        "index_publications", "index_observations", "source_health",
        "collection_runs", "raw_fare_payloads", "fare_observations",
    ]:
        op.drop_table(table)
