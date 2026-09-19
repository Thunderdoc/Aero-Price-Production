"""
Scheduled job definitions.

All jobs are registered with the AsyncIOScheduler in main.py lifespan.
Each job is a thin wrapper that opens a DB session and calls the relevant service.
"""
import logging
from app.core.database import AsyncSessionLocal
from app.services.collector import run_collection
from app.services.gov_fetcher import run_gov_fetches
from app.services.index_engine import publish_index
from app.services.collector import ROUTE_BASKET

logger = logging.getLogger(__name__)


async def job_run_collection():
    """Hourly fare collection across all routes and advance windows."""
    logger.info("[scheduler] Starting scheduled collection run")
    async with AsyncSessionLocal() as db:
        run_id = await run_collection(db, triggered_by="scheduler")
    logger.info(f"[scheduler] Collection run complete: {run_id}")


async def job_gov_refresh():
    """6-hourly government data refresh."""
    logger.info("[scheduler] Starting government data refresh")
    async with AsyncSessionLocal() as db:
        results = await run_gov_fetches(db)
    logger.info(f"[scheduler] Gov refresh complete: {results}")


async def job_publish_index():
    """Daily index publication from real observations."""
    from datetime import date
    today = date.today().isoformat()
    routes = [{"route": r, "weight": 1.0} for r in ROUTE_BASKET]
    logger.info(f"[scheduler] Publishing index for {today}")
    async with AsyncSessionLocal() as db:
        result = await publish_index(db, today, routes)
    logger.info(f"[scheduler] Index publication: {result.get('status')} — value={result.get('index_value')}")
