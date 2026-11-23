"""
Scheduled job definitions — the SINGLE scheduler implementation.

All jobs are registered with the AsyncIOScheduler in main.py lifespan.
Each job is a thin wrapper that opens a DB session and calls the relevant service.

The collection job runs the SAME chunked logic as the GitHub Actions workflow
(one route + one advance window per chunk via run_collection_chunk), so there
is exactly one collection implementation with two triggers: HTTP (Actions)
for Vercel deployments, in-process (APScheduler) for local/Render long-lived
hosts. Run only ONE scheduler in production — the run lock makes a second
sweep fail fast with CollectionLockedError instead of doubling up.
"""
import asyncio
import logging
from app.core.database import AsyncSessionLocal
from app.services.collector import (
    run_collection_chunk,
    finalize_collection_day,
    reap_stale_runs,
    ROUTE_BASKET,
    ADVANCE_WINDOWS,
    CollectionLockedError,
    CollectionDisabledError,
)
from app.services.gov_fetcher import run_gov_fetches
from app.services.index_engine import publish_index

logger = logging.getLogger(__name__)

# Seconds to sleep between chunks in the APScheduler sweep. The primary
# throttle for the public-interface source (fast-flights also self-throttles
# per call); 5 s × 95 chunks ≈ 8 min per sweep, well inside the hourly cadence.
CHUNK_DELAY_SECONDS = 5.0


async def job_run_collection():
    """Chunked collection sweep across all routes and advance windows.

    One chunk (route + window) per run_collection_chunk() call, then a single
    finalize step (index publish + price alerts). A held run lock or disabled
    collection ends the sweep cleanly with a log line — never a crash loop.
    """
    logger.info("[scheduler] Starting scheduled chunked collection sweep")
    async with AsyncSessionLocal() as db:
        reaped = await reap_stale_runs(db)
    if reaped:
        logger.info(f"[scheduler] Reaped {reaped} stale RUNNING run(s) before sweep")
    chunks_done = 0
    for route in ROUTE_BASKET:
        for advance_days in ADVANCE_WINDOWS:
            async with AsyncSessionLocal() as db:
                try:
                    run_id = await run_collection_chunk(
                        db, route, advance_days, triggered_by="scheduler"
                    )
                except CollectionLockedError:
                    logger.warning("[scheduler] Another collection run holds the lock — sweep aborted cleanly")
                    return
                except CollectionDisabledError:
                    logger.warning("[scheduler] Collection is disabled — sweep aborted cleanly")
                    return
            chunks_done += 1
            logger.debug(f"[scheduler] Chunk {chunks_done} complete: {route} T+{advance_days} ({run_id})")
            await asyncio.sleep(CHUNK_DELAY_SECONDS)
    async with AsyncSessionLocal() as db:
        result = await finalize_collection_day(db)
    logger.info(
        f"[scheduler] Chunked sweep complete: {chunks_done} chunks, "
        f"index={result.get('index_status')}, alerts_triggered={result.get('alerts_triggered')}"
    )


async def job_gov_refresh():
    """6-hourly government data refresh."""
    logger.info("[scheduler] Starting government data refresh")
    async with AsyncSessionLocal() as db:
        results = await run_gov_fetches(db)
    logger.info(f"[scheduler] Gov refresh complete: {results}")


async def job_publish_index():
    """Daily index publication from real observations."""
    from datetime import date
    # Lazy import for consistency with collector.py (weights.py imports
    # ROUTE_BASKET from collector). The published index uses AAI
    # gravity-model weights, not equal 1.0.
    from app.config.weights import get_route_weights
    today = date.today().isoformat()
    routes = get_route_weights()
    logger.info(f"[scheduler] Publishing index for {today}")
    async with AsyncSessionLocal() as db:
        result = await publish_index(db, today, routes)
    logger.info(f"[scheduler] Index publication: {result.get('status')} — value={result.get('index_value')}")
