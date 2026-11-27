"""Reconcile the Alembic schema with the SQLAlchemy models.

Revision ID: 0008
Revises: 0007

The live application historically built its schema with
``Base.metadata.create_all`` while migrations 0001-0007 evolved separately.
A database built only by Alembic was therefore missing model tables and
columns, and three redesigned tables still used legacy primary keys that
the current models cannot insert into. This migration closes that gap:

* creates the six model-only tables (``route_basket``, ``dgca_monthly``,
  ``mospi_cpi``, ``mospi_transport_series``, ``ppac_atf_records`` and
  ``datagov_aviation_records``);
* adds every model column missing from shared tables;
* backfills the new primary-key columns from the legacy keys, then moves
  ``index_observations``, ``index_publications`` and ``users`` to the
  primary keys their models declare;
* converts ``dgca_circulars.id`` from the legacy integer key to the
  model's string key;
* aligns the fare amount columns and JSON/text columns whose migration
  types changed application behaviour (Numeric/JSON versus the models'
  Float/Text);
* creates the model indexes missing from a migrations-built database.

Legacy objects are deliberately retained because they may hold data:
``route_baskets``, ``dgca_monthly_records`` and ``mospi_cpi_records``;
``index_publications.id``/``period``/``index_value``;
``users.id``/``hashed_password``; and
``raw_fare_payloads.observation_id``/``content_hash``/``raw_body``. The
current models do not read those legacy tables/columns. Two harmless
migration-only indexes are also retained.

Some wider legacy VARCHAR widths are retained rather than narrowed, since
narrowing could truncate stored values and a wider column is compatible
with the models. ``raw_fare_payloads`` keeps its legacy nullable columns:
backfilling a run id, route, travel date or advance window would invent
audit data, while new collector rows always supply those fields.
"""
from alembic import op
import sqlalchemy as sa


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def _inspector(bind):
    inspector = sa.inspect(bind)
    inspector.clear_cache()
    return inspector


def _has_table(bind, table_name):
    return table_name in _inspector(bind).get_table_names()


def _columns(bind, table_name):
    if not _has_table(bind, table_name):
        return {}
    return {column["name"]: column for column in _inspector(bind).get_columns(table_name)}


def _has_columns(bind, table_name, column_names):
    columns = _columns(bind, table_name)
    return all(name in columns for name in column_names)


def _index_names(bind, table_name):
    if not _has_table(bind, table_name):
        return set()
    return {
        index["name"]
        for index in _inspector(bind).get_indexes(table_name)
        if index.get("name")
    }


def _pk_columns(bind, table_name):
    if not _has_table(bind, table_name):
        return []
    return _inspector(bind).get_pk_constraint(table_name).get("constrained_columns") or []


def _pk_name(bind, table_name):
    if not _has_table(bind, table_name):
        return None
    return _inspector(bind).get_pk_constraint(table_name).get("name")


def _create_table(bind, table_name, *args):
    if not _has_table(bind, table_name):
        op.create_table(table_name, *args)


def _add_column(bind, table_name, column):
    if _has_table(bind, table_name) and column.name not in _columns(bind, table_name):
        op.add_column(table_name, column)


def _create_index(bind, index_name, table_name, columns, unique=False):
    if _has_table(bind, table_name) and index_name not in _index_names(bind, table_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def _backfill(bind, table_name, required_columns, statement):
    if _has_columns(bind, table_name, required_columns):
        bind.execute(sa.text(statement))


def _type_matches(current, desired):
    if isinstance(desired, sa.Text):
        return isinstance(current, sa.Text)
    if isinstance(desired, sa.String):
        return (
            isinstance(current, sa.String)
            and not isinstance(current, sa.Text)
            and current.length == desired.length
        )
    if isinstance(desired, sa.Float):
        return isinstance(current, sa.Float)
    return type(current) is type(desired)


def _alter_columns(bind, table_name, alterations):
    """Alter only columns whose reflected type/nullability still differs."""
    if not _has_table(bind, table_name):
        return
    columns = _columns(bind, table_name)
    pending = []
    for alteration in alterations:
        name = alteration["name"]
        if name not in columns:
            continue
        desired_type = alteration.get("type")
        desired_nullable = alteration.get("nullable")
        needs_type = desired_type is not None and not _type_matches(columns[name]["type"], desired_type)
        needs_nullable = (
            desired_nullable is not None and columns[name]["nullable"] != desired_nullable
        )
        if needs_type or needs_nullable:
            pending.append((alteration, columns[name]["type"]))
    if not pending:
        return

    if bind.dialect.name == "sqlite":
        with op.batch_alter_table(table_name, recreate="always") as batch_op:
            for alteration, existing_type in pending:
                batch_op.alter_column(
                    alteration["name"],
                    type_=alteration.get("type"),
                    nullable=alteration.get("nullable"),
                    existing_type=existing_type,
                )
    else:
        for alteration, existing_type in pending:
            kwargs = {
                "type_": alteration.get("type"),
                "nullable": alteration.get("nullable"),
                "existing_type": existing_type,
            }
            if alteration.get("postgresql_using"):
                kwargs["postgresql_using"] = alteration["postgresql_using"]
            op.alter_column(table_name, alteration["name"], **kwargs)


def _set_primary_key(bind, table_name, columns):
    if not _has_table(bind, table_name) or _pk_columns(bind, table_name) == columns:
        return
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table(table_name, recreate="always") as batch_op:
            # Adding a named primary key replaces the reflected unnamed
            # SQLite primary key in Alembic's batch table copy.
            batch_op.create_primary_key(f"pk_{table_name}", columns)
    else:
        pk_name = _pk_name(bind, table_name)
        if pk_name:
            op.drop_constraint(pk_name, table_name, type_="primary")
        op.create_primary_key(f"pk_{table_name}", table_name, columns)


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # Model-only tables.
    # ------------------------------------------------------------------
    _create_table(
        bind,
        "route_basket",
        sa.Column("route_code", sa.String(7), primary_key=True),
        sa.Column("origin", sa.String(3), nullable=False),
        sa.Column("destination", sa.String(3), nullable=False),
        sa.Column("region", sa.String(30), nullable=False),
        sa.Column("weight", sa.Float(), nullable=True),
        sa.Column("weight_source", sa.String(50), nullable=True),
        sa.Column("dgca_reference", sa.String(50), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=True),
        sa.Column("effective_from", sa.String(10), nullable=True),
        sa.Column("effective_to", sa.String(10), nullable=True),
    )
    _create_table(
        bind,
        "dgca_monthly",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("domestic_passengers", sa.Integer(), nullable=False),
        sa.Column("international_passengers", sa.Integer(), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(10), nullable=True),
    )
    _create_table(
        bind,
        "mospi_cpi",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("cpi_transport", sa.Float(), nullable=False),
        sa.Column("cpi_general", sa.Float(), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(10), nullable=True),
    )
    _create_table(
        bind,
        "mospi_transport_series",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("base_year", sa.Integer(), nullable=False),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("definition", sa.String(80), nullable=False),
        sa.Column("series", sa.String(20), nullable=False),
        sa.Column("publisher_status", sa.String(10), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("base_year", "period", name="uq_mospi_transport_base_period"),
    )
    _create_table(
        bind,
        "ppac_atf_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("effective_date", sa.String(10), nullable=False),
        sa.Column("atf_export_duty_per_litre", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(20), nullable=False),
        sa.Column("measure", sa.String(40), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("effective_date", name="uq_ppac_atf_effective_date"),
    )
    _create_table(
        bind,
        "datagov_aviation_records",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("resource_id", sa.String(120), nullable=False),
        sa.Column("record_hash", sa.String(64), nullable=False),
        sa.Column("record_json", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("resource_id", "record_hash", name="uq_datagov_resource_record"),
    )

    # ------------------------------------------------------------------
    # Model columns missing from shared tables. Columns that become part
    # of a primary key, or are NOT NULL in the model, are added nullable
    # first and tightened below after their backfills.
    # ------------------------------------------------------------------
    _add_column(bind, "collection_runs", sa.Column("sources_used", sa.Text(), nullable=True))
    _add_column(bind, "fare_observations", sa.Column("seats_available", sa.Integer(), nullable=True))
    _add_column(bind, "fare_observations", sa.Column("rejection_reason", sa.String(100), nullable=True))
    _add_column(bind, "feature_access_requests", sa.Column("request_message", sa.Text(), nullable=True))
    _add_column(bind, "gov_datasets", sa.Column("checksum", sa.String(64), nullable=True))
    _add_column(bind, "gov_datasets", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))

    _add_column(bind, "index_observations", sa.Column("id", sa.String(36), nullable=True))
    _add_column(bind, "index_observations", sa.Column("calculation_ts", sa.DateTime(timezone=True), nullable=True))
    _add_column(bind, "index_observations", sa.Column("observation_count", sa.Integer(), nullable=True))
    _add_column(bind, "index_observations", sa.Column("airlines_covered", sa.Integer(), nullable=True))
    _add_column(bind, "index_observations", sa.Column("sources_used", sa.Text(), nullable=True))
    _add_column(bind, "index_observations", sa.Column("regional_breakdown", sa.Text(), nullable=True))

    _add_column(bind, "index_publications", sa.Column("publication_id", sa.String(36), nullable=True))
    _add_column(bind, "index_publications", sa.Column("period_start", sa.String(10), nullable=True))
    _add_column(bind, "index_publications", sa.Column("period_end", sa.String(10), nullable=True))
    _add_column(bind, "index_publications", sa.Column("index_version", sa.String(10), nullable=True))
    _add_column(bind, "index_publications", sa.Column("methodology_hash", sa.String(64), nullable=True))
    _add_column(bind, "index_publications", sa.Column("fare_count", sa.Integer(), nullable=True))
    _add_column(bind, "index_publications", sa.Column("status", sa.String(30), nullable=True))
    _add_column(bind, "index_publications", sa.Column("published_by", sa.String(50), nullable=True))
    _add_column(bind, "index_publications", sa.Column("note", sa.Text(), nullable=True))

    _add_column(bind, "source_health", sa.Column("enabled", sa.Boolean(), nullable=True, server_default=sa.false()))
    _add_column(bind, "source_health", sa.Column("records_rejected", sa.Integer(), nullable=True, server_default=sa.text("0")))
    _add_column(bind, "source_health", sa.Column("quota_used", sa.Integer(), nullable=True, server_default=sa.text("0")))
    _add_column(bind, "source_health", sa.Column("freshness_minutes", sa.Integer(), nullable=True))

    _add_column(bind, "users", sa.Column("user_id", sa.String(36), nullable=True))

    # ------------------------------------------------------------------
    # Backfills. New primary keys copy the legacy keys, which were unique
    # primary keys in the old schema, so no values collide. Other fills
    # use existing row data where available and explicit unknown/zero
    # markers only where the model requires a value.
    # ------------------------------------------------------------------
    _backfill(
        bind,
        "index_observations",
        ("id", "publication_id"),
        "UPDATE index_observations SET id = publication_id WHERE id IS NULL",
    )
    _backfill(
        bind,
        "index_observations",
        ("calculation_ts", "created_at"),
        "UPDATE index_observations SET calculation_ts = COALESCE(created_at, CURRENT_TIMESTAMP) "
        "WHERE calculation_ts IS NULL",
    )
    _backfill(
        bind,
        "index_observations",
        ("observation_count",),
        "UPDATE index_observations SET observation_count = 0 WHERE observation_count IS NULL",
    )
    _backfill(
        bind,
        "index_observations",
        ("airlines_covered",),
        "UPDATE index_observations SET airlines_covered = 0 WHERE airlines_covered IS NULL",
    )

    _backfill(
        bind,
        "index_publications",
        ("publication_id", "id"),
        "UPDATE index_publications SET publication_id = id WHERE publication_id IS NULL",
    )
    _backfill(
        bind,
        "index_publications",
        ("period_start", "period"),
        "UPDATE index_publications SET period_start = period WHERE period_start IS NULL",
    )
    _backfill(
        bind,
        "index_publications",
        ("period_end", "period"),
        "UPDATE index_publications SET period_end = period WHERE period_end IS NULL",
    )
    _backfill(
        bind,
        "index_publications",
        ("index_version",),
        "UPDATE index_publications SET index_version = 'legacy' WHERE index_version IS NULL",
    )
    _backfill(
        bind,
        "index_publications",
        ("fare_count",),
        "UPDATE index_publications SET fare_count = 0 WHERE fare_count IS NULL",
    )
    _backfill(
        bind,
        "index_publications",
        ("status", "published_at"),
        "UPDATE index_publications SET status = CASE WHEN published_at IS NOT NULL "
        "THEN 'PUBLISHED' ELSE 'DRAFT' END WHERE status IS NULL",
    )
    _backfill(
        bind,
        "index_publications",
        ("published_at",),
        "UPDATE index_publications SET published_at = CURRENT_TIMESTAMP WHERE published_at IS NULL",
    )

    _backfill(
        bind,
        "users",
        ("user_id", "id"),
        "UPDATE users SET user_id = id WHERE user_id IS NULL",
    )
    _backfill(
        bind,
        "users",
        ("name", "email"),
        "UPDATE users SET name = email WHERE name IS NULL",
    )
    _backfill(
        bind,
        "users",
        ("created_at",),
        "UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL",
    )

    _backfill(
        bind,
        "fare_observations",
        ("collection_run_id",),
        "UPDATE fare_observations SET collection_run_id = 'legacy' WHERE collection_run_id IS NULL",
    )
    _backfill(
        bind,
        "fare_observations",
        ("airline",),
        "UPDATE fare_observations SET airline = 'UNKNOWN' WHERE airline IS NULL",
    )
    _backfill(
        bind,
        "fare_observations",
        ("source",),
        "UPDATE fare_observations SET source = 'UNKNOWN' WHERE source IS NULL",
    )
    _backfill(
        bind,
        "fare_observations",
        ("taxes",),
        "UPDATE fare_observations SET taxes = 0 WHERE taxes IS NULL",
    )
    _backfill(
        bind,
        "fare_observations",
        ("fees",),
        "UPDATE fare_observations SET fees = 0 WHERE fees IS NULL",
    )
    _backfill(
        bind,
        "fare_observations",
        ("base_fare", "total_fare", "taxes", "fees"),
        "UPDATE fare_observations SET base_fare = COALESCE(base_fare, "
        "total_fare - COALESCE(taxes, 0) - COALESCE(fees, 0), 0) WHERE base_fare IS NULL",
    )
    _backfill(
        bind,
        "fare_observations",
        ("total_fare", "base_fare", "taxes", "fees"),
        "UPDATE fare_observations SET total_fare = COALESCE(total_fare, "
        "COALESCE(base_fare, 0) + COALESCE(taxes, 0) + COALESCE(fees, 0)) "
        "WHERE total_fare IS NULL",
    )

    _backfill(
        bind,
        "gov_datasets",
        ("source_name", "dataset_id"),
        "UPDATE gov_datasets SET source_name = dataset_id WHERE source_name IS NULL",
    )
    _backfill(
        bind,
        "gov_datasets",
        ("organization",),
        "UPDATE gov_datasets SET organization = 'UNKNOWN' WHERE organization IS NULL",
    )
    _backfill(
        bind,
        "gov_datasets",
        ("updated_at", "last_retrieved", "last_attempt"),
        "UPDATE gov_datasets SET updated_at = COALESCE(last_retrieved, last_attempt, CURRENT_TIMESTAMP) "
        "WHERE updated_at IS NULL",
    )

    _backfill(
        bind,
        "source_health",
        ("source_name", "source_id"),
        "UPDATE source_health SET source_name = source_id WHERE source_name IS NULL",
    )
    _backfill(
        bind,
        "source_health",
        ("source_type",),
        "UPDATE source_health SET source_type = 'UNKNOWN' WHERE source_type IS NULL",
    )
    _backfill(
        bind,
        "source_health",
        ("updated_at", "last_success", "last_attempt", "last_failure"),
        "UPDATE source_health SET updated_at = COALESCE(updated_at, last_success, last_attempt, "
        "last_failure, CURRENT_TIMESTAMP) WHERE updated_at IS NULL",
    )

    _backfill(
        bind,
        "collection_runs",
        ("started_at", "ended_at"),
        "UPDATE collection_runs SET started_at = COALESCE(ended_at, CURRENT_TIMESTAMP) "
        "WHERE started_at IS NULL",
    )
    _backfill(
        bind,
        "audit_logs",
        ("action",),
        "UPDATE audit_logs SET action = 'UNKNOWN' WHERE action IS NULL",
    )
    _backfill(
        bind,
        "audit_logs",
        ("created_at",),
        "UPDATE audit_logs SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL",
    )
    _backfill(
        bind,
        "dgca_circulars",
        ("title",),
        "UPDATE dgca_circulars SET title = '' WHERE title IS NULL",
    )
    _backfill(
        bind,
        "dgca_circulars",
        ("date",),
        "UPDATE dgca_circulars SET date = '' WHERE date IS NULL",
    )
    _backfill(
        bind,
        "dgca_circulars",
        ("retrieved_at",),
        "UPDATE dgca_circulars SET retrieved_at = CURRENT_TIMESTAMP WHERE retrieved_at IS NULL",
    )

    # ------------------------------------------------------------------
    # Type and nullability alignment for columns whose migration shape
    # prevented the models from operating as declared.
    # ------------------------------------------------------------------
    _alter_columns(
        bind,
        "fare_observations",
        [
            {"name": "collection_run_id", "nullable": False},
            {"name": "airline", "nullable": False},
            {"name": "base_fare", "type": sa.Float(), "nullable": False, "postgresql_using": "base_fare::double precision"},
            {"name": "taxes", "type": sa.Float(), "nullable": False, "postgresql_using": "taxes::double precision"},
            {"name": "fees", "type": sa.Float(), "nullable": False, "postgresql_using": "fees::double precision"},
            {"name": "total_fare", "type": sa.Float(), "nullable": False, "postgresql_using": "total_fare::double precision"},
            {"name": "source", "nullable": False},
            {"name": "source_url", "type": sa.Text()},
            {"name": "quality_flags", "type": sa.Text(), "postgresql_using": "quality_flags::text"},
        ],
    )
    _alter_columns(
        bind,
        "dgca_circulars",
        [
            {"name": "id", "type": sa.String(36), "nullable": False, "postgresql_using": "id::text"},
            {"name": "title", "type": sa.Text(), "nullable": False},
            {"name": "date", "nullable": False},
            {"name": "url", "type": sa.Text()},
            {"name": "retrieved_at", "nullable": False},
        ],
    )
    _alter_columns(
        bind,
        "gov_datasets",
        [
            {"name": "source_name", "nullable": False},
            {"name": "organization", "nullable": False},
            {"name": "source_url", "type": sa.Text()},
            {"name": "updated_at", "nullable": False},
        ],
    )
    _alter_columns(
        bind,
        "source_health",
        [
            {"name": "source_name", "nullable": False},
            {"name": "source_type", "nullable": False},
            {"name": "updated_at", "nullable": False},
        ],
    )
    _alter_columns(bind, "collection_runs", [{"name": "started_at", "nullable": False}])
    _alter_columns(
        bind,
        "audit_logs",
        [
            {"name": "action", "nullable": False},
            {"name": "created_at", "nullable": False},
        ],
    )
    _alter_columns(
        bind,
        "index_observations",
        [
            {"name": "id", "nullable": False},
            {"name": "calculation_ts", "nullable": False},
            {"name": "status", "nullable": True},
            {"name": "base_period", "type": sa.String(10)},
        ],
    )
    _alter_columns(
        bind,
        "index_publications",
        [
            {"name": "publication_id", "nullable": False},
            {"name": "published_at", "nullable": False},
            {"name": "period_start", "nullable": False},
            {"name": "period_end", "nullable": False},
            {"name": "index_version", "nullable": False},
        ],
    )
    _alter_columns(
        bind,
        "users",
        [
            {"name": "user_id", "nullable": False},
            {"name": "name", "nullable": False},
            {"name": "created_at", "nullable": False},
        ],
    )

    # Move the redesigned tables to the primary keys their models declare.
    # The legacy key columns remain in place with their values preserved.
    _set_primary_key(bind, "index_observations", ["id"])
    _set_primary_key(bind, "index_publications", ["publication_id"])
    _set_primary_key(bind, "users", ["user_id"])

    # The retained legacy key columns are no longer primary keys. Relax
    # their old implicit NOT NULL constraints so model inserts, which do
    # not populate legacy columns, can proceed.
    _alter_columns(
        bind,
        "index_publications",
        [
            {"name": "id", "nullable": True},
            {"name": "period", "nullable": True},
        ],
    )
    _alter_columns(bind, "users", [{"name": "id", "nullable": True}])

    # ------------------------------------------------------------------
    # Model indexes missing from a migrations-built database.
    # ------------------------------------------------------------------
    _create_index(bind, "ix_audit_logs_created_at", "audit_logs", ["created_at"])
    _create_index(bind, "ix_fare_observations_origin", "fare_observations", ["origin"])
    _create_index(bind, "ix_fare_observations_destination", "fare_observations", ["destination"])
    _create_index(bind, "ix_fare_observations_source", "fare_observations", ["source"])
    _create_index(bind, "ix_fare_route_date", "fare_observations", ["route", "travel_date"])
    _create_index(bind, "ix_fare_route_advance", "fare_observations", ["route", "advance_days"])
    _create_index(bind, "ix_fare_collected", "fare_observations", ["collected_at"])
    _create_index(bind, "ix_fare_origin_dest", "fare_observations", ["origin", "destination"])
    _create_index(
        bind,
        "ix_fare_origin_valid_collected",
        "fare_observations",
        ["data_origin", "is_valid", "collected_at"],
    )
    _create_index(
        bind,
        "ix_fare_origin_valid_route_collected",
        "fare_observations",
        ["data_origin", "is_valid", "route", "collected_at"],
    )
    _create_index(bind, "ix_index_observations_publication_id", "index_observations", ["publication_id"])
    _create_index(bind, "ix_raw_fare_payloads_collection_run_id", "raw_fare_payloads", ["collection_run_id"])
    _create_index(bind, "ix_users_email", "users", ["email"], unique=True)


def downgrade() -> None:
    # Reversing this reconciliation would have to drop the reconciled
    # tables/columns and restore legacy primary keys over rows that may
    # already use the model keys. That is not a safe data-preserving
    # downgrade, so it is intentionally not implemented.
    raise NotImplementedError("Migration 0008 schema reconciliation is not safely reversible")
