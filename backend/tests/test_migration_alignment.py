"""Model-vs-migration alignment pins (Track C).

The Alembic chain (0001-0007) is the authority for a migrations-built DB.
Where a migration adds a column the model lacks, the MODEL is aligned to
the migration — this test proves the alignment by running the real chain
on a scratch SQLite DB under tmp_path and comparing against the model
metadata. It fails if the model drops one of the aligned columns.

Scope note: this pins ONLY the columns aligned to a migration (created_at
on fare_observations and index_observations, both from 0001). The wider
drift found by the Track C audit (model-only tables/columns, legacy
migration-only tables, type/width mismatches) is reported as open items
in the Track C notes file — fixing those needs a new migration, which
Track C does not create.
"""
import os
from pathlib import Path

from sqlalchemy import DateTime, MetaData, create_engine, text

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


def test_migration_chain_head_is_0007(tmp_path):
    db_path = _migrate_scratch_db(tmp_path)
    engine = create_engine(f"sqlite:///{db_path}")
    with engine.connect() as conn:
        version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    engine.dispose()
    assert version == "0007"


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
