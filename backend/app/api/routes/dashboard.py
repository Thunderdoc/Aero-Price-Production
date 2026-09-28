from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, timezone, timedelta
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.fare import FareObservation
from app.models.collection import CollectionRun, SourceHealth
from app.services.source_health import is_live_now
from app.models.government import DgcaMonthlyRecord, MospiTransportSeries
from app.models.index import IndexObservation

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

AIRPORT_STATES = {
    "DEL": "Delhi",
    "BOM": "Maharashtra",
    "BLR": "Karnataka",
    "MAA": "Tamil Nadu",
    "CCU": "West Bengal",
    "HYD": "Telangana",
    "LKO": "Uttar Pradesh",
    "JAI": "Rajasthan",
    "SXR": "Jammu & Kashmir",
    "PAT": "Bihar",
    "GAU": "Assam",
    "IMF": "Manipur",
}


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    values = sorted(values)
    midpoint = len(values) // 2
    return values[midpoint] if len(values) % 2 else (values[midpoint - 1] + values[midpoint]) / 2


def _movement_status(change_pct: float) -> str:
    if change_pct >= 10:
        return "SIGNIFICANT_INCREASE"
    if change_pct >= 2:
        return "MODERATE_INCREASE"
    if change_pct <= -10:
        return "SIGNIFICANT_DECREASE"
    if change_pct <= -2:
        return "MODERATE_DECREASE"
    return "STABLE"


async def calculate_fare_movement(db: AsyncSession) -> dict:
    """Compare the latest two verified collection dates; never invent a trend."""
    rows = (await db.execute(
        select(FareObservation).where(
            FareObservation.data_origin.in_(["REAL", "OFFICIAL"]),
            FareObservation.is_valid == True,
        ).order_by(FareObservation.collected_at.asc())
    )).scalars().all()
    periods = sorted({row.collected_at.date() for row in rows if row.collected_at})
    if len(periods) < 2:
        return {"available": False, "price_drops": None, "routes": [], "states": {}, "message": "A second verified collection is required before movement can be calculated."}

    grouped: dict[str, dict[object, list[float]]] = {}
    for row in rows:
        if not row.collected_at:
            continue
        grouped.setdefault(row.route, {}).setdefault(row.collected_at.date(), []).append(float(row.total_fare))

    # A fresh corridor collection may introduce a newer date with no matching
    # previous collection for that route. Find the most recent *comparable*
    # date pair instead of allowing that valid new data to blank the map.
    previous_period = current_period = None
    for current_candidate in reversed(periods):
        for previous_candidate in reversed([day for day in periods if day < current_candidate]):
            if any(previous_candidate in values and current_candidate in values for values in grouped.values()):
                previous_period, current_period = previous_candidate, current_candidate
                break
        if current_period is not None:
            break
    if previous_period is None or current_period is None:
        return {"available": False, "price_drops": None, "routes": [], "states": {}, "modeled_states": {}, "message": "A comparable second verified collection is required before movement can be calculated."}

    route_changes = []
    state_changes: dict[str, list[float]] = {}
    for route, values_by_period in grouped.items():
        previous = _median(values_by_period.get(previous_period, []))
        current = _median(values_by_period.get(current_period, []))
        if previous is None or current is None or previous <= 0:
            continue
        change_pct = round(((current - previous) / previous) * 100, 2)
        route_changes.append({
            "route": route,
            "previous_fare": round(previous, 2),
            "current_fare": round(current, 2),
            "change_pct": change_pct,
            "status": _movement_status(change_pct),
        })
        origin, destination = route.split("-", 1)
        for airport in (origin, destination):
            state = AIRPORT_STATES.get(airport)
            if state:
                state_changes.setdefault(state, []).append(change_pct)

    states = {
        state: {"change_pct": round(_median(changes) or 0, 2), "status": _movement_status(_median(changes) or 0), "routes": len(changes)}
        for state, changes in state_changes.items()
    }

    # New routes have an honest current price but cannot have a price *change*
    # until another collection runs. Expose a deterministic benchmark estimate
    # rather than pretending it is a verified movement. The estimate compares
    # each state's real latest median against the latest national route median.
    latest_period = periods[-1]
    latest_state_prices: dict[str, list[float]] = {}
    latest_all_prices: list[float] = []
    for row in rows:
        if not row.collected_at or row.collected_at.date() != latest_period:
            continue
        price = float(row.total_fare)
        latest_all_prices.append(price)
        for airport in (row.origin, row.destination):
            state = AIRPORT_STATES.get(airport)
            if state:
                latest_state_prices.setdefault(state, []).append(price)
    latest_national_median = _median(latest_all_prices)
    modeled_states = {}
    if latest_national_median and latest_national_median > 0:
        for state, prices in latest_state_prices.items():
            if state in states:
                continue
            state_median = _median(prices)
            if state_median is None:
                continue
            relative_pct = round(((state_median - latest_national_median) / latest_national_median) * 100, 2)
            modeled_states[state] = {
                "change_pct": relative_pct,
                "status": _movement_status(relative_pct),
                "routes": len(prices),
                "provenance": "MODELED",
                "basis": "Current verified state median compared with the latest verified national route median",
                "period": latest_period.isoformat(),
            }
    return {
        "available": bool(route_changes),
        "current_period": current_period.isoformat(),
        "previous_period": previous_period.isoformat(),
        "price_drops": sum(1 for item in route_changes if item["change_pct"] < 0),
        "routes_with_change": len(route_changes),
        "routes": sorted(route_changes, key=lambda item: item["route"]),
        "states": states,
        "modeled_states": modeled_states,
        "message": None if route_changes else "No comparable verified routes are available yet.",
    }


@router.get("")
async def dashboard_summary(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Single endpoint for the Overview page. No hardcoded values."""
    now = datetime.now(timezone.utc)
    since_24h = now - timedelta(hours=24)

    real_obs_total = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(FareObservation.data_origin.in_(["REAL", "OFFICIAL"]))
    ) or 0

    real_obs_24h = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(and_(
            FareObservation.data_origin.in_(["REAL", "OFFICIAL"]),
            FareObservation.collected_at >= since_24h,
        ))
    ) or 0

    sources = await db.execute(select(SourceHealth))
    source_rows = sources.scalars().all()
    live_sources = [s for s in source_rows if is_live_now(s)]
    challenge_sources = [s for s in source_rows if s.status == "CHALLENGE_DETECTED"]

    last_run = await db.scalar(
        select(CollectionRun.ended_at)
        .where(CollectionRun.status.in_(["COMPLETED", "PARTIAL"]))
        .order_by(CollectionRun.started_at.desc())
        .limit(1)
    )

    dgca_latest = await db.scalar(
        select(DgcaMonthlyRecord).order_by(
            DgcaMonthlyRecord.year.desc(), DgcaMonthlyRecord.month.desc()
        ).limit(1)
    )

    latest_index = await db.scalar(
        select(IndexObservation)
        .where(IndexObservation.status == "PUBLISHED")
        .where(IndexObservation.data_origin.in_(["REAL", "OFFICIAL", "DERIVED"]))
        .order_by(IndexObservation.calculation_ts.desc())
        .limit(1)
    )
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    collection_runs_today = await db.scalar(
        select(func.count()).select_from(CollectionRun)
        .where(CollectionRun.started_at >= day_start)
        .where(CollectionRun.status.in_(["COMPLETED", "PARTIAL"]))
    ) or 0
    current_fare_rate = await db.scalar(
        select(func.avg(FareObservation.total_fare))
        .where(FareObservation.data_origin.in_(["REAL", "OFFICIAL"]))
        .where(FareObservation.is_valid == True)
    )
    routes_tracked = await db.scalar(
        select(func.count(FareObservation.route.distinct()))
        .where(FareObservation.data_origin.in_(["REAL", "OFFICIAL"]))
        .where(FareObservation.is_valid == True)
    ) or 0
    latest_cpi = await db.scalar(
        select(MospiTransportSeries)
        .order_by(MospiTransportSeries.base_year.desc(), MospiTransportSeries.period.desc())
        .limit(1)
    )
    index_status = latest_index.status if latest_index else "NOT_PUBLISHED"
    index_value = latest_index.index_value if latest_index else None
    movement = await calculate_fare_movement(db)
    note = (
        "Verified airfare observations are available. Route trends require a later collection for comparison."
        if latest_index else
        "No published live airfare index yet."
    )

    return {
        "timestamp": now.isoformat(),
        # Flat fields are consumed by the Overview UI. Keep the nested blocks for
        # API clients that already use the earlier dashboard response shape.
        "real_observations": real_obs_total,
        "sources_live": len(live_sources),
        "sources_challenge_detected": len(challenge_sources),
        "gov_datasets_connected": 1 if dgca_latest else 0,
        "collection_runs_today": collection_runs_today,
        "index_status": index_status,
        "index_value": index_value,
        "current_fare_rate": round(current_fare_rate, 2) if current_fare_rate is not None else None,
        "routes_tracked": routes_tracked,
        "price_drops": movement["price_drops"],
        "cpi_transport": latest_cpi.value if latest_cpi else None,
        "cpi_period": latest_cpi.period if latest_cpi else None,
        "cpi_base_year": latest_cpi.base_year if latest_cpi else None,
        "note": note,
        "index": {
            "value": index_value,
            "status": index_status,
            "message": note,
            "data_origin": latest_index.data_origin if latest_index else "NO_DATA",
        },
        "observations": {
            "total_real": real_obs_total,
            "last_24h": real_obs_24h,
            "data_status": "LIVE" if live_sources else "NO_LIVE_DATA",
        },
        "sources": {
            "live": len(live_sources),
            "challenge_detected": len(challenge_sources),
            "total": len(source_rows),
        },
        "last_collection": last_run.isoformat() if last_run else None,
        "government_data": {
            "dgca_available": dgca_latest is not None,
            "dgca_latest_period": f"{dgca_latest.year}-{dgca_latest.month:02d}" if dgca_latest else None,
        },
    }


@router.get("/fare-movement")
async def fare_movement(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Verified route/state fare movement from the latest two collection dates."""
    return await calculate_fare_movement(db)
