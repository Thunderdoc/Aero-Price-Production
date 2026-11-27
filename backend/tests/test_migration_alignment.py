"""Model-vs-migration alignment pins.

The Alembic chain is the authority for a migrations-built DB. Migration
0008 reconciles that chain with the current SQLAlchemy models: every
model table and column must exist after ``alembic upgrade head``, the
redesigned tables must use the primary keys their models declare, and
the legacy migration-only tables must remain in place. This test proves
that by running the real chain on a scratch SQLite DB under tmp_path and
comparing against the model metadata.

Scope note: table/column presence and the reconciled primary keys are
pinned. Deliberately retained legacy tables/columns, wider legacy
VARCHAR widths, and the legacy nullable ``raw_fare_payloads`` columns are
documented in migration 0008 rather than treated as failures here.
"""
import os
from pathlib import Path

from sqlalchemy import DateTime, MetaData, String, create_engine, text

from app.models.base import Base
from app.models import access, auth_account, fare, feedback, collection, index, government, user  # noqa: F401
from app.models.fare import FareObservation
from app.models.index import IndexObservation

BACKEND_DIR = Path(__file__).resolve().parents[1]

# (table, model class, column) aligned to migration 0001.
ALIGNED_COLUMNS = [
    ("fare_observations", FareObservation, "created_at"),
    ("index_observations", IndexObservation, "created_at"),
]


def _migrate_scratch_db(tmp_path):
    """Run `alembic upgrade head` against a scratch SQLite DB.

    The URL is overridden to tmp_path — the repo's backend/aeroprice.db
    (alembic.ini's default) is never touched.

    The Config is built WITHOUT a filename on purpose: passing
    alembic.ini makes env.py call logging.config.fileConfig, which
    disables existing loggers (disable_existing_loggers=True) and broke
    test_phase1_security's caplog assertion for every test after this
    one. With no config file, env.py skips fileConfig entirely and the
    suite's logging is untouched.
    """
    db_path = tmp_path / "migrated.db"
    from alembic import command
    from alembic.config import Config

    cfg = Config()
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite+aiosqlite:///{db_path}")
    command.upgrade(cfg, "head")
    return db_path


def test_migration_chain_head_is_0008(tmp_path):
    db_path = _migrate_scratch_db(tmp_path)
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.connect() as conn:
        version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    engine.dispose()
    assert version == "0008"


def test_model_columns_aligned_to_migrations(tmp_path):
    """Every ALIGNED_COLUMNS entry exists in BOTH the migrated DB and the
    model metadata, with matching type family and nullability."""
    db_path = _migrate_scratch_db(tmp_path)
    engine = create_engine(f"sqlite:///{db_path}")
    metadata = MetaData()
    metadata.reflect(bind=engine)
    engine.dispose()

    for table_name, model_cls, column_name in ALIGNED_COLUMNS:
        assert table_name in metadata.tables, f"migrated DB lacks table {table_name}"
        assert column_name in metadata.tables[table_name].columns, (
            f"migrated DB table {table_name} lacks column {column_name}"
        )
        assert column_name in model_cls.__table__.columns, (
            f"model {model_cls.__name__} lacks column {column_name} "
            f"that migration 0001 adds to {table_name} — align the model"
        )
        mig_col = metadata.tables[table_name].columns[column_name]
        model_col = model_cls.__table__.columns[column_name]
        assert isinstance(mig_col.type, DateTime), f"{table_name}.{column_name} migrated type is not DateTime"
        assert isinstance(model_col.type, DateTime), f"{table_name}.{column_name} model type is not DateTime"
        assert mig_col.nullable == model_col.nullable, (
            f"{table_name}.{column_name} nullability differs: "
            f"migration={mig_col.nullable} model={model_col.nullable}"
        )


def test_0008_reconciles_model_tables_columns_and_primary_keys(tmp_path):
    """A migrations-only DB contains the full model schema after 0008."""
    db_path = _migrate_scratch_db(tmp_path)
    engine = create_engine(f"sqlite:///{db_path}")
    metadata = MetaData()
    metadata.reflect(bind=engine)
    engine.dispose()

    for table_name, model_table in Base.metadata.tables.items():
        assert table_name in metadata.tables, f"migrated DB lacks model table {table_name}"
        migrated_columns = set(metadata.tables[table_name].columns.keys())
        model_columns = set(model_table.columns.keys())
        assert model_columns <= migrated_columns, (
            f"{table_name} is missing model columns "
            f"{sorted(model_columns - migrated_columns)}"
        )

    # Legacy migration-only tables are retained, not dropped by 0008.
    for legacy_table in ("route_baskets", "dgca_monthly_records", "mospi_cpi_records"):
        assert legacy_table in metadata.tables

    expected_primary_keys = {
        "index_observations": ["id"],
        "index_publications": ["publication_id"],
        "users": ["user_id"],
        "dgca_circulars": ["id"],
    }
    for table_name, expected in expected_primary_keys.items():
        actual = [column.name for column in metadata.tables[table_name].primary_key.columns]
        assert actual == expected, f"{table_name} primary key is {actual}, expected {expected}"

    assert isinstance(metadata.tables["dgca_circulars"].columns["id"].type, String)
    assert metadata.tables["users"].columns["id"].nullable is True
    assert metadata.tables["index_publications"].columns["id"].nullable is True
    assert metadata.tables["index_publications"].columns["period"].nullable is True
