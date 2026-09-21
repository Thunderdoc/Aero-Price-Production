from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional
from datetime import datetime, timezone
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.config import settings
from app.models.fare import FareObservation

router = APIRouter(prefix="/fares", tags=["fares"])

ADVANCE_WINDOWS = [1, 7, 15, 30, 45]

# Origins that may appear in the live fares listing
_LIVE_ORIGINS = ("REAL", "OFFICIAL")
# Origins excluded from the live listing regardless of filter (synthetic / test)
_ALWAYS_EXCLUDED = ("GENERATED_TEST", "HISTORICAL_SNAPSHOT")


def _base_query(data_mode: str, requested_origin: Optional[str]):
    """
    Build the base WHERE clause that enforces provenance rules.

    live mode:
      - GENERATED_TEST always excluded
      - SANDBOX_TEST always excluded (synthetic Amadeus data, not real fares)
      - only REAL and OFFICIAL returned
      - caller may narrow further with data_origin filter

    demo mode:
      - GENERATED_TEST always excluded (even in demo mode these are fixtures)
      - SANDBOX_TEST allowed (useful for pipeline testing; labelled in response)
      - caller may request any remaining origin

    Note: SANDBOX_TEST is *never* silently promoted to REAL. The data_origin
    field in the response always reflects the true provenance of each record.
    """
    if data_mode == "demo":
        # Exclude only true test fixtures; allow SANDBOX_TEST for pipeline validation
        q = select(FareObservation).where(
            FareObservation.data_origin.notin_(list(_ALWAYS_EXCLUDED))
        )
    else:
        # Live mode: only verified real/official data
        q = select(FareObservation).where(
            FareObservation.data_origin.in_(list(_LIVE_ORIGINS))
        )

    if requested_origin:
        q = q.where(FareObservation.data_origin == requested_origin)

    return q


@router.get("")
async def list_fares(
    route: Optional[str] = None,
    origin: Optional[str] = None,
    destination: Optional[str] = None,
    airline: Optional[str] = None,
    travel_date: Optional[str] = None,
    cabin: Optional[str] = None,
    advance_days: Optional[int] = None,
    data_origin: Optional[str] = None,
    limit: int = Query(100, le=1000),
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    List fare observations.

    In DATA_MODE=live: returns only REAL and OFFICIAL records.
      SANDBOX_TEST (Amadeus sandbox) is excluded — it contains synthetic fares.
    In DATA_MODE=demo: also returns SANDBOX_TEST for pipeline validation,
      with data_origin clearly labelled in every record.
    GENERATED_TEST is always excluded.
    """
    q = _base_query(settings.DATA_MODE, data_origin)

    if route:
        q = q.where(FareObservation.route == route.upper())
    if origin:
        q = q.where(FareObservation.origin == origin.upper())
    if destination:
        q = q.where(FareObservation.destination == destination.upper())
    if airline:
        q = q.where(FareObservation.airline == airline)
    if travel_date:
        q = q.where(FareObservation.travel_date == travel_date)
    if cabin:
        q = q.where(FareObservation.cabin == cabin.upper())
    if advance_days is not None:
        q = q.where(FareObservation.advance_days == advance_days)

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    rows = await db.execute(q.order_by(FareObservation.collected_at.desc()).limit(limit).offset(offset))
    obs = rows.scalars().all()

    has_real = any(o.data_origin == "REAL" for o in obs)
    has_sandbox = any(o.data_origin == "SANDBOX_TEST" for o in obs)

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "data_mode": settings.DATA_MODE,
        "data_origin_summary": (
            "REAL" if has_real
            else "SANDBOX_TEST" if has_sandbox
            else "NO_DATA"
        ),
        "observations": [_fare_dict(o) for o in obs],
        "status": (
            "LIVE" if has_real
            else "SANDBOX_TEST_ONLY" if has_sandbox
            else "NO_LIVE_OBSERVATIONS"
        ),
        "message": (
            None if has_real
            else (
                "Amadeus sandbox data available — configure AMADEUS_ENV=production "
                "with production credentials for real fare observations."
                if has_sandbox
                else
                "No real airfare observations. "
                "Set AMADEUS_API_KEY + AMADEUS_API_SECRET and trigger a collection run."
            )
        ),
    }


@router.get("/{observation_id}")
async def get_fare_by_id(
    observation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return a single fare observation by ID. Includes full provenance."""
    from fastapi import HTTPException
    obs = await db.get(FareObservation, observation_id)
    if not obs or obs.data_origin in _ALWAYS_EXCLUDED:
        raise HTTPException(status_code=404, detail="Observation not found")
    if settings.DATA_MODE == "live" and obs.data_origin not in _LIVE_ORIGINS:
        raise HTTPException(
            status_code=403,
            detail=f"Observation has data_origin={obs.data_origin} which is not available in live mode.",
        )
    return _fare_dict(obs)


@router.get("/summary/{route}")
async def route_fare_summary(
    route: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Booking-window fare summary for a route.
    Only REAL and OFFICIAL records feed this summary — SANDBOX_TEST is excluded
    because synthetic Amadeus fares would produce meaningless statistics.
    """
    result = {}
    for window in ADVANCE_WINDOWS:
        rows = await db.execute(
            select(FareObservation).where(
                and_(
                    FareObservation.route == route.upper(),
                    FareObservation.advance_days == window,
                    FareObservation.data_origin.in_(list(_LIVE_ORIGINS)),
                    FareObservation.is_valid == True,
                )
            )
        )
        obs = rows.scalars().all()
        if obs:
            fares = [o.total_fare for o in obs]
            result[f"T+{window}"] = {
                "median": sorted(fares)[len(fares) // 2],
                "min": min(fares),
                "max": max(fares),
                "count": len(fares),
                "data_origin": "REAL",
                "status": "AVAILABLE",
            }
        else:
            result[f"T+{window}"] = {
                "median": None,
                "min": None,
                "max": None,
                "count": 0,
                "data_origin": "NO_DATA",
                "status": "INSUFFICIENT_DATA",
            }

    return {
        "route": route.upper(),
        "windows": result,
        "has_real_data": any(v["status"] == "AVAILABLE" for v in result.values()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _fare_dict(o: FareObservation) -> dict:
    return {
        "observation_id": o.observation_id,
        "collection_run_id": o.collection_run_id,
        "route": o.route,
        "origin": o.origin,
        "destination": o.destination,
        "airline": o.airline,
        "flight_number": o.flight_number,
        "travel_date": o.travel_date,
        "advance_days": o.advance_days,
        "fare_family": o.fare_family,
        "cabin": o.cabin,
        "base_fare": o.base_fare,
        "taxes": o.taxes,
        "fees": o.fees,
        "total_fare": o.total_fare,
        "currency": o.currency,
        "availability_status": o.availability_status,
        "source": o.source,
        "data_origin": o.data_origin,
        "collected_at": o.collected_at.isoformat() if o.collected_at else None,
        "quality_flags": o.quality_flags,
        "is_valid": o.is_valid,
    }
