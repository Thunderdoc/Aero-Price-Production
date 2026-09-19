"""
Z-score based anomaly detection for fare observations.
Flags outliers per route/advance_days/cabin bucket.
"""
import logging
import math
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from app.models.fare import FareObservation

logger = logging.getLogger(__name__)

Z_THRESHOLD = 3.0
MIN_SAMPLE_FOR_ZSCORE = 10


async def detect_anomalies(db: AsyncSession, lookback_days: int = 30) -> dict:
    """
    For each route/advance_days bucket with sufficient observations:
    - Compute mean and stddev of total_fare
    - Mark observations with |z-score| > Z_THRESHOLD as outliers
    Returns summary dict.
    """
    since = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    # Get all non-generated observations in lookback window
    rows = await db.execute(
        select(FareObservation)
        .where(and_(
            FareObservation.data_origin.in_(["REAL", "OFFICIAL"]),
            FareObservation.is_valid == True,
            FareObservation.collected_at >= since.isoformat(),
        ))
    )
    observations = rows.scalars().all()

    if not observations:
        return {"status": "NO_DATA", "buckets_analyzed": 0, "anomalies_flagged": 0}

    # Group by route + advance_days + cabin
    buckets: dict[tuple, list] = {}
    for obs in observations:
        key = (obs.route, obs.advance_days, obs.cabin)
        buckets.setdefault(key, []).append(obs)

    total_flagged = 0
    buckets_analyzed = 0

    for key, bucket_obs in buckets.items():
        if len(bucket_obs) < MIN_SAMPLE_FOR_ZSCORE:
            continue

        fares = [o.total_fare for o in bucket_obs if o.total_fare is not None]
        if len(fares) < MIN_SAMPLE_FOR_ZSCORE:
            continue

        mean = sum(fares) / len(fares)
        variance = sum((f - mean) ** 2 for f in fares) / len(fares)
        stddev = math.sqrt(variance)

        if stddev == 0:
            continue

        buckets_analyzed += 1

        for obs in bucket_obs:
            if obs.total_fare is None:
                continue
            z = abs((obs.total_fare - mean) / stddev)
            if z > Z_THRESHOLD:
                flags = list(obs.quality_flags or [])
                if "OUTLIER" not in flags:
                    flags.append("OUTLIER")
                    obs.quality_flags = flags
                    total_flagged += 1

    await db.commit()

    logger.info(
        f"Anomaly detection: {buckets_analyzed} buckets, {total_flagged} flagged. "
        f"Lookback: {lookback_days} days, threshold: z>{Z_THRESHOLD}"
    )

    return {
        "status": "COMPLETED",
        "buckets_analyzed": buckets_analyzed,
        "anomalies_flagged": total_flagged,
        "z_threshold": Z_THRESHOLD,
        "min_sample": MIN_SAMPLE_FOR_ZSCORE,
        "lookback_days": lookback_days,
    }


async def get_anomaly_summary(db: AsyncSession) -> dict:
    """Quick summary of flagged observations for the API."""
    total = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(FareObservation.data_origin.in_(["REAL", "OFFICIAL"]))
    )
    # SQLite JSON array column check — filter by quality_flags containing OUTLIER
    # Using a simple LIKE since SQLite doesn't have JSON_CONTAINS
    flagged = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(
            FareObservation.quality_flags.like('%OUTLIER%')
        )
    )
    return {
        "total_observations": total or 0,
        "flagged_anomalies": flagged or 0,
        "flag_rate_pct": round((flagged or 0) / max(total or 1, 1) * 100, 2),
    }
