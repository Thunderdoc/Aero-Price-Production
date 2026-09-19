"""
Deduplication pipeline stage.

A FareRecord is a duplicate if another record with the same raw_hash already
exists in the database from a collection run in the last 24 hours.
"""
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.fare import FareObservation
from app.collectors.base import FareRecord


async def is_duplicate(db: AsyncSession, record: FareRecord) -> bool:
    """
    Returns True if an observation with the same raw_hash was already stored
    within the deduplication window (24 hours).
    """
    if not record.raw_hash:
        return False
    window = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    existing = await db.scalar(
        select(FareObservation.observation_id)
        .where(and_(
            FareObservation.raw_hash == record.raw_hash,
            FareObservation.collected_at >= window,
        ))
        .limit(1)
    )
    return existing is not None


async def deduplicate_batch(
    db: AsyncSession, records: list[FareRecord]
) -> tuple[list[FareRecord], int]:
    """
    Filter a batch of normalized records against the DB.
    Returns (unique_records, rejected_count).
    """
    unique = []
    rejected = 0
    seen_hashes: set[str] = set()

    for rec in records:
        if rec.raw_hash and rec.raw_hash in seen_hashes:
            rejected += 1
            continue
        if await is_duplicate(db, rec):
            rejected += 1
            continue
        if rec.raw_hash:
            seen_hashes.add(rec.raw_hash)
        unique.append(rec)

    return unique, rejected
