"""Re-tag stored scraped fares from REAL to PUBLIC_INTERFACE.

Scraped Google Flights fares (fast-flights, SerpApi, the external worker, and
the legacy google-flights worker rows) were stored with data_origin="REAL"
and an audit note calling them "production GDS fare". They are real observed
fares from a public interface — not GDS fares. This migration re-tags those
rows and corrects the stored audit note so the historical data tells the
truth. Rows from authorized APIs (Amadeus, Duffel) are untouched.

Revision ID: 0006
Revises: 0005 (Phase 5 owns the Alembic chain — if the chain head moves,
re-link down_revision to the new head before deploying this migration.)
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

SCRAPED_SOURCES = ("fast-flights", "serpapi-google-flights", "googleflights-worker", "google-flights")
OLD_NOTE = "REAL: production GDS fare"
NEW_NOTE = "PUBLIC_INTERFACE: fare collected from the Google Flights public interface (not a GDS fare)"


def _has_payload_column(bind) -> bool:
    """True when raw_fare_payloads has the `payload` column.

    Migration 0001 predates the model's `payload` column (it created
    `raw_body` instead), so a migrations-built DB has no `payload` column
    to re-tag — while a DB built from the models (Base.metadata.create_all,
    the path the app's INIT_SCHEMA uses) does. The re-tag below must run
    where the column exists and skip cleanly where it does not, on both
    SQLite and PostgreSQL. Migration 0007 aligns the table with the model.
    """
    inspector = sa.inspect(bind)
    try:
        columns = {c["name"] for c in inspector.get_columns("raw_fare_payloads")}
    except Exception:
        return False
    return "payload" in columns


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE fare_observations SET data_origin = 'PUBLIC_INTERFACE' "
            "WHERE data_origin = 'REAL' AND source IN :sources"
        ).bindparams(sa.bindparam("sources", expanding=True, value=list(SCRAPED_SOURCES)))
    )
    # The raw-payload audit rows carry the same false label inside their JSON
    # summary note. REPLACE() works identically on SQLite and PostgreSQL.
    # Skipped on migrations-built DBs, where 0001 never created `payload`.
    if _has_payload_column(bind):
        bind.execute(
            sa.text(
                "UPDATE raw_fare_payloads SET payload = REPLACE(payload, :old, :new) "
                "WHERE payload LIKE '%' || :old || '%'"
            ).bindparams(old=OLD_NOTE, new=NEW_NOTE)
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE fare_observations SET data_origin = 'REAL' "
            "WHERE data_origin = 'PUBLIC_INTERFACE' AND source IN :sources"
        ).bindparams(sa.bindparam("sources", expanding=True, value=list(SCRAPED_SOURCES)))
    )
    if _has_payload_column(bind):
        bind.execute(
            sa.text(
                "UPDATE raw_fare_payloads SET payload = REPLACE(payload, :new, :old) "
                "WHERE payload LIKE '%' || :new || '%'"
            ).bindparams(old=OLD_NOTE, new=NEW_NOTE)
        )
