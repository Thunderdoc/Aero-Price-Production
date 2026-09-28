from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import Settings
from app.models.collection import SourceHealth

async def update_source_health_on_startup(db: AsyncSession) -> None:
    current = Settings()
    sources = [
        ("amadeus", "Amadeus", "AGGREGATOR", current.amadeus_configured),
        ("duffel", "Duffel", "AGGREGATOR", current.duffel_configured),
        ("aviationstack", "AviationStack", "AVIATION", current.aviationstack_configured),
    ]
    now = datetime.now(timezone.utc)
    for source_id, name, source_type, configured in sources:
        row = await db.scalar(select(SourceHealth).where(SourceHealth.source_id == source_id))
        if row is None:
            row = SourceHealth(source_id=source_id, source_name=name, source_type=source_type)
            db.add(row)
        row.enabled = configured
        row.status = "CONFIGURED" if configured else "NOT_CONFIGURED"
        row.auth_status = "CONFIGURED" if configured else "NOT_CONFIGURED"
        row.failure_reason = None if configured else "Missing credentials"
        row.updated_at = now
    await db.flush()
