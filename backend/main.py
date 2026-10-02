"""
AeroPrice India — SIH26056 Backend
FastAPI application entrypoint.

Start: uvicorn main:app --reload --port 8000
"""
import logging
import os
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import create_all_tables, AsyncSessionLocal
from app.api.routes import auth, health, fares, index, sources, government, collections, dashboard
from app.api.routes import admin as admin_routes
from app.api.routes import forecasts, exports, anomalies as anomalies_routes, aviation, historical, maps
from app.api.routes.routes_basket import router as routes_router
from app.api.routes.compare import router as compare_router
from app.services.collector import run_collection
from app.services.price_alerts import evaluate_price_alerts
from app.services.gov_fetcher import run_gov_fetches, ensure_gov_dataset_registry
from app.seed.routes import seed_route_basket
from app.seed.feedback import seed_demo_feedback
from app.models.feedback import UserFeedback  # noqa: F401 - register table metadata
from app.models.access import FeatureAccessRequest, UserFeatureAccess, UserNotification, PriceAlert  # noqa: F401 - register table metadata
from app.core.rate_limit import limiter, policy_for

IS_VERCEL = os.getenv("VERCEL") == "1"
if not IS_VERCEL:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.interval import IntervalTrigger
else:
    AsyncIOScheduler = None  # type: ignore[assignment]
    IntervalTrigger = None  # type: ignore[assignment]

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
# Provider request URLs can contain server-side credentials in query strings.
# Never emit httpx/httpcore request URLs at production INFO level.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler() if AsyncIOScheduler else None


async def _scheduled_collection():
    async with AsyncSessionLocal() as db:
        await run_collection(db, triggered_by="scheduler")
        await evaluate_price_alerts(db)
        await db.commit()


async def _scheduled_gov_fetch():
    async with AsyncSessionLocal() as db:
        await run_gov_fetches(db)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("AeroPrice India backend starting — SIH26056")
    # Vercel Functions are short-lived request workers. They must not create
    # tables in the read-only deployment filesystem or start APScheduler;
    # persistent live fare data belongs in the configured hosted database.
    if IS_VERCEL:
        # Keep serverless cold start lean. Production migrations are handled by
        # deployment-time configuration; running DDL checks on every new worker
        # makes the first user request wait several seconds.
        if os.getenv("AEROPRICE_INIT_SCHEMA_ON_STARTUP") == "1":
            await create_all_tables()
            logger.info("Vercel serverless mode: schema initialization enabled.")
        else:
            logger.info("Vercel serverless mode: skipped startup schema initialization.")
        yield
        return
    await create_all_tables()
    logger.info("Database tables verified.")
    async with AsyncSessionLocal() as db:
        seeded = await seed_route_basket(db)
        seeded_feedback = 0
        if not settings.is_production:
            seeded_feedback = await seed_demo_feedback(db)
        await db.commit()
        await ensure_gov_dataset_registry(db)
    if seeded:
        logger.info(f"Seeded {seeded} routes into route_baskets table.")
    if seeded_feedback:
        logger.info(f"Seeded {seeded_feedback} development feedback records.")

    if settings.COLLECTION_ENABLED:
        assert scheduler is not None and IntervalTrigger is not None
        scheduler.add_job(
            _scheduled_collection,
            trigger=IntervalTrigger(minutes=settings.COLLECTION_INTERVAL_MINUTES),
            id="collection",
            replace_existing=True,
        )
        # Gov data refresh every 6 hours
        scheduler.add_job(
            _scheduled_gov_fetch,
            trigger=IntervalTrigger(hours=6),
            id="gov_fetch",
            replace_existing=True,
        )
        scheduler.start()
        # Populate a fresh deployment shortly after startup instead of waiting
        # for the first hourly interval. The collection still uses only
        # configured, authorized providers and never creates synthetic fares.
        scheduler.add_job(
            _scheduled_collection,
            trigger="date",
            run_date=datetime.now(timezone.utc) + timedelta(seconds=8),
            id="initial_collection",
            replace_existing=True,
        )
        # Import official government publications after startup instead of
        # leaving a new deployment empty until the first six-hour interval.
        # Providers remain provenance-safe: unavailable/unauthorized feeds
        # report no data rather than creating placeholder records.
        scheduler.add_job(
            _scheduled_gov_fetch,
            trigger="date",
            run_date=datetime.now(timezone.utc) + timedelta(seconds=12),
            id="initial_gov_fetch",
            replace_existing=True,
        )
        logger.info(
            f"Scheduler started. Collection interval: {settings.COLLECTION_INTERVAL_MINUTES}min. "
            "Initial collection scheduled in 8 seconds and government refresh in 12 seconds; "
            "only configured authorized providers will be used."
        )

        # Refreshes run on the scheduler or on an authenticated UI request.
        # Startup remains fast even if an official publisher is temporarily slow.

    yield

    # Shutdown
    if scheduler and scheduler.running:
        scheduler.shutdown()
    logger.info("AeroPrice India backend stopped.")


app = FastAPI(
    title="AeroPrice India API",
    description="SIH26056 — Real-Time Airfare Price Index for India",
    version="2.0.0",
    lifespan=lifespan,
)


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    """Keep internal exception details out of production API responses."""
    logger.exception("Unhandled request error: %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong. Please try again later."},
    )

@app.middleware("http")
async def security_headers(request, call_next):
    policy = policy_for(request.url.path, request.method)
    if policy:
        name, limit, window = policy
        client = request.client.host if request.client else "unknown"
        allowed, retry_after = limiter.allow(client, name, limit, window)
        if not allowed:
            return JSONResponse(status_code=429, content={"detail": "Too many requests. Please try again later."}, headers={"Retry-After": str(retry_after)})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(settings.allowed_origins_list + [
        "https://aero-price-production.vercel.app",
    ])),
    # Render deployments can use a generated *.vercel.app hostname. Local
    # Vite development must also reach this backend, including when the
    # backend runs with ENVIRONMENT=production; otherwise browsers report the
    # misleading generic "Failed to fetch" for every live-data endpoint.
    allow_origin_regex=r"(?:https?://(?:localhost|127\.0\.0\.1|192\.168\.[0-9]{1,3}\.[0-9]{1,3}|10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})(?::[0-9]+)?|https://[a-z0-9-]+\.vercel\.app)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router, prefix="/api")
app.include_router(health.router, prefix="/api")
app.include_router(fares.router, prefix="/api")
app.include_router(index.router, prefix="/api")
app.include_router(sources.router, prefix="/api")
app.include_router(government.router, prefix="/api")
app.include_router(collections.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(admin_routes.router, prefix="/api")
app.include_router(forecasts.router, prefix="/api")
app.include_router(exports.router, prefix="/api")
app.include_router(anomalies_routes.router, prefix="/api")
app.include_router(routes_router, prefix="/api")
app.include_router(compare_router, prefix="/api")
app.include_router(aviation.router, prefix="/api")
app.include_router(historical.router, prefix="/api")
app.include_router(maps.router, prefix="/api")


@app.get("/")
async def root():
    return {
        "project": "AeroPrice India",
        "code": "SIH26056",
        "version": "2.0.0",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/warm")
async def warm():
    """Tiny serverless warm-up endpoint with no database dependency."""
    return {"status": "warm", "timestamp": datetime.now(timezone.utc).isoformat()}
