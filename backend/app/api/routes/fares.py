from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, distinct
from typing import Optional
from datetime import datetime, timezone, date, timedelta
import uuid
from app.core.database import get_db
from app.core.config import settings
from app.models.fare import FareObservation
from app.collectors.aggregators.fast_flights import FastFlightsAdapter
from app.processing.quality import validate_batch

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
    current_user: dict | None = None,
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
            "STORED_REAL" if has_real
            else "SANDBOX_TEST_ONLY" if has_sandbox
            else "NO_LIVE_OBSERVATIONS"
        ),
        "message": (
            "These are stored observations, not a guarantee of currently available prices." if has_real
            else (
                "Amadeus sandbox data available — configure AMADEUS_ENV=production "
                "with production credentials for real fare observations."
                if has_sandbox
                else
                "No real airfare observations are stored. Check provider status and trigger a collection run."
            )
        ),
    }


@router.get("/airlines/summary")
async def airline_fare_summary(
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = None,
):
    """Observed airline fares, not airline market share or flight frequency.

    Aggregate only valid INR economy observations from real or official
    sources. Every count is a count of stored quotes, not passengers or flights.
    """
    filters = (
        FareObservation.data_origin.in_(list(_LIVE_ORIGINS)),
        FareObservation.is_valid.is_(True),
        FareObservation.currency == "INR",
        FareObservation.cabin == "ECONOMY",
    )
    aggregate = (
        func.count(FareObservation.observation_id).label("observations"),
        func.avg(FareObservation.total_fare).label("average_fare"),
        func.min(FareObservation.total_fare).label("minimum_fare"),
        func.max(FareObservation.total_fare).label("maximum_fare"),
        func.max(FareObservation.collected_at).label("latest_collected_at"),
    )
    airline_rows = (await db.execute(
        select(
            FareObservation.airline,
            func.count(distinct(FareObservation.route)).label("routes"),
            *aggregate,
        ).where(*filters)
        .group_by(FareObservation.airline)
        .order_by(func.count(FareObservation.observation_id).desc())
    )).all()
    route_rows = (await db.execute(
        select(FareObservation.airline, FareObservation.route, *aggregate)
        .where(*filters)
        .group_by(FareObservation.airline, FareObservation.route)
        .order_by(FareObservation.airline, func.count(FareObservation.observation_id).desc())
    )).all()
    window_rows = (await db.execute(
        select(FareObservation.airline, FareObservation.advance_days, *aggregate)
        .where(*filters)
        .group_by(FareObservation.airline, FareObservation.advance_days)
        .order_by(FareObservation.airline, FareObservation.advance_days)
    )).all()

    def stats(row):
        return {
            "observations": row.observations,
            "average_fare": round(row.average_fare, 2),
            "minimum_fare": row.minimum_fare,
            "maximum_fare": row.maximum_fare,
            "latest_collected_at": row.latest_collected_at.isoformat() if row.latest_collected_at else None,
        }

    routes_by_airline = {}
    for row in route_rows:
        routes_by_airline.setdefault(row.airline, []).append({"route": row.route, **stats(row)})
    windows_by_airline = {}
    for row in window_rows:
        windows_by_airline.setdefault(row.airline, []).append({"advance_days": row.advance_days, **stats(row)})

    total = sum(row.observations for row in airline_rows)
    return {
        "status": "STORED_OBSERVATIONS" if total else "NO_DATA",
        "total_observations": total,
        "basis": "Stored valid INR economy fare quotes; not market share or flight frequency.",
        "airlines": [
            {
                "name": row.airline,
                "routes": row.routes,
                **stats(row),
                "share_of_observed_quotes_pct": round(100 * row.observations / total, 2) if total else 0,
                "route_details": routes_by_airline.get(row.airline, []),
                "booking_windows": windows_by_airline.get(row.airline, []),
            }
            for row in airline_rows
        ],
    }


@router.get("/observation/{observation_id}")
async def get_fare_by_id(
    observation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = None,
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


@router.get("/live")
async def live_fares(
    route: str,
    travel_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = None,
):
    """Query the no-key public fare interface on demand.

    This endpoint deliberately does not write to the database. It provides a
    near-live route result when the deployment has only the verified snapshot;
    scheduled persistence still belongs in the worker/PostgreSQL deployment.
    """
    normalized_route = route.upper()
    travel = travel_date or (date.today() + timedelta(days=7)).isoformat()
    try:
        parsed = date.fromisoformat(travel)
    except ValueError:
        return {"status": "INVALID_DATE", "route": normalized_route, "observations": [], "message": "travel_date must be YYYY-MM-DD"}
    if parsed <= date.today():
        return {"status": "INVALID_DATE", "route": normalized_route, "observations": [], "message": "travel_date must be in the future"}
    advance = max(1, (parsed - date.today()).days)
    result = await FastFlightsAdapter().collect(normalized_route, travel, advance, str(uuid.uuid4()))
    valid, rejected, rejected_count = validate_batch(result.records)
    return {
        "status": result.status if valid else ("NO_DATA" if not result.error else result.status),
        "provider_status": result.status,
        "route": normalized_route,
        "travel_date": travel,
        "source": result.source_id,
        "data_origin": "REAL" if valid else "NO_DATA",
        "observations": [_fare_record_dict(record) for record in valid],
        "rejected_count": rejected_count,
        "error": result.error,
        "latency_ms": result.latency_ms,
    }


@router.get("/summary/{route}")
async def route_fare_summary(
    route: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict | None = None,
):
    """
    Booking-window fare summary for a route.
    Only REAL and OFFICIAL records feed this summary — SANDBOX_TEST is excluded
    because synthetic Amadeus fares would produce meaningless statistics.
    """
    eligible = (
        FareObservation.route == route.upper(),
        FareObservation.data_origin.in_(list(_LIVE_ORIGINS)),
        FareObservation.is_valid.is_(True),
        FareObservation.currency == "INR",
        FareObservation.cabin == "ECONOMY",
    )
    latest_day = await db.scalar(
        select(func.max(func.date(FareObservation.collected_at))).where(*eligible)
    )
    latest_rows = (await db.execute(
        select(FareObservation).where(
            *eligible,
            func.date(FareObservation.collected_at) == latest_day,
        )
    )).scalars().all() if latest_day else []
    latest_fares = sorted(row.total_fare for row in latest_rows)
    midpoint = len(latest_fares) // 2
    latest_median = (
        (latest_fares[midpoint - 1] + latest_fares[midpoint]) / 2
        if len(latest_fares) % 2 == 0 else latest_fares[midpoint]
    ) if latest_fares else None
    overall = {
        "median": latest_median,
        "min": min(latest_fares) if latest_fares else None,
        "max": max(latest_fares) if latest_fares else None,
        "count": len(latest_fares),
        "sample_period": latest_day,
        "last_collected_at": max(
            (row.collected_at for row in latest_rows if row.collected_at), default=None
        ),
        "data_origin": "REAL" if latest_fares else "NO_DATA",
        "status": "STORED_OBSERVATIONS" if latest_fares else "INSUFFICIENT_DATA",
    }
    if overall["last_collected_at"]:
        overall["last_collected_at"] = overall["last_collected_at"].isoformat()

    result = {}
    for window in ADVANCE_WINDOWS:
        rows = await db.execute(
            select(FareObservation).where(
                and_(
                    *eligible,
                    FareObservation.advance_days == window,
                )
            )
        )
        obs = rows.scalars().all()
        if obs:
            fares = [o.total_fare for o in obs]
            ordered_fares = sorted(fares)
            middle = len(ordered_fares) // 2
            result[f"T+{window}"] = {
                "median": (ordered_fares[middle - 1] + ordered_fares[middle]) / 2 if len(ordered_fares) % 2 == 0 else ordered_fares[middle],
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
        "overall": overall,
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


def _fare_record_dict(o) -> dict:
    return {
        "observation_id": None,
        "collection_run_id": None,
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
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "quality_flags": o.quality_flags,
        "is_valid": True,
        "departure_time": o.departure_time,
        "arrival_time": o.arrival_time,
        "stops": o.stops,
    }
