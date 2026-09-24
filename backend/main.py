"""
AeroPrice India — SIH26056 Backend
FastAPI application entrypoint.

Start: uvicorn main:app --reload --port 8000
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.config import settings
from app.core.database import create_all_tables, AsyncSessionLocal
from app.api.routes import auth, health, fares, index, sources, government, collections, dashboard
from app.api.routes import admin as admin_routes
from app.api.routes import forecasts, exports, anomalies as anomalies_routes, aviation, historical, maps
from app.api.routes.routes_basket import router as routes_router
from app.api.routes.compare import router as compare_router
from app.services.collector import run_collection
from app.services.gov_fetcher import run_gov_fetches, ensure_gov_dataset_registry
from app.seed.routes import seed_route_basket
from app.models.feedback import UserFeedback  # noqa: F401 - register table metadata
from app.models.access import FeatureAccessRequest, UserFeatureAccess, UserNotification  # noqa: F401 - register table metadata
from app.core.rate_limit import limiter, policy_for

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _scheduled_collection():
    async with AsyncSessionLocal() as db:
        await run_collection(db, triggered_by="scheduler")


async def _scheduled_gov_fetch():
    async with AsyncSessionLocal() as db:
        await run_gov_fetches(db)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("AeroPrice India backend starting — SIH26056")
    await create_all_tables()
    logger.info("Database tables verified.")
    async with AsyncSessionLocal() as db:
        seeded = await seed_route_basket(db)
        await ensure_gov_dataset_registry(db)
    if seeded:
        logger.info(f"Seeded {seeded} routes into route_baskets table.")

    if settings.COLLECTION_ENABLED:
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
        logger.info(
            f"Scheduler started. Collection interval: {settings.COLLECTION_INTERVAL_MINUTES}min. "
            "Note: all airline sources will return CHALLENGE_DETECTED until NDC credentials are configured."
        )

        # Refreshes run on the scheduler or on an authenticated UI request.
        # Startup remains fast even if an official publisher is temporarily slow.

    yield

    # Shutdown
    if scheduler.running:
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
    allow_origins=settings.allowed_origins_list,
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
