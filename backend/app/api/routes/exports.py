"""
Exports API — CSV and JSON data exports.
Requires ANALYST or ADMIN role.
Never exports GENERATED_TEST data.
"""
import csv
import io
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.core.database import get_db
from app.core.auth import require_analyst
from app.models.fare import FareObservation
from app.models.government import DgcaMonthlyRecord, MospiCpiRecord, DgcaCircular
from app.models.index import IndexObservation

router = APIRouter()

MAX_EXPORT_ROWS = 10_000


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


@router.get("/exports/fares")
async def export_fares(
    route: str = Query(default=None),
    origin: str = Query(default=None),
    destination: str = Query(default=None),
    advance_days: int = Query(default=None),
    cabin: str = Query(default=None),
    fmt: str = Query(default="csv", pattern="^(csv|json)$"),
    current_user=Depends(require_analyst),
    db: AsyncSession = Depends(get_db),
):
    """
    Export real fare observations. GENERATED_TEST rows are excluded.
    Max 10,000 rows per export.
    """
    filters = [
        FareObservation.data_origin != "GENERATED_TEST",
        FareObservation.is_valid == True,
    ]
    if route:
        filters.append(FareObservation.route == route.upper())
    if origin:
        filters.append(FareObservation.origin == origin.upper())
    if destination:
        filters.append(FareObservation.destination == destination.upper())
    if advance_days is not None:
        filters.append(FareObservation.advance_days == advance_days)
    if cabin:
        filters.append(FareObservation.cabin == cabin.upper())

    rows = await db.execute(
        select(FareObservation)
        .where(and_(*filters))
        .order_by(FareObservation.collected_at.desc())
        .limit(MAX_EXPORT_ROWS)
    )
    observations = rows.scalars().all()

    fields = [
        "observation_id", "collected_at", "route", "origin", "destination",
        "airline", "flight_number", "travel_date", "advance_days",
        "fare_family", "cabin", "stops",
        "base_fare", "taxes", "fees", "total_fare", "currency",
        "availability_status", "source", "data_origin", "quality_flags",
        "collection_run_id",
    ]

    if fmt == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for obs in observations:
            writer.writerow({
                "observation_id": str(obs.observation_id),
                "collected_at": obs.collected_at.isoformat() if obs.collected_at else "",
                "route": obs.route,
                "origin": obs.origin,
                "destination": obs.destination,
                "airline": obs.airline,
                "flight_number": obs.flight_number or "",
                "travel_date": obs.travel_date,
                "advance_days": obs.advance_days,
                "fare_family": obs.fare_family,
                "cabin": obs.cabin,
                "stops": obs.stops,
                "base_fare": obs.base_fare,
                "taxes": obs.taxes,
                "fees": obs.fees or 0,
                "total_fare": obs.total_fare,
                "currency": obs.currency,
                "availability_status": obs.availability_status or "",
                "source": obs.source,
                "data_origin": obs.data_origin,
                "quality_flags": json.dumps(obs.quality_flags or []),
                "collection_run_id": obs.collection_run_id or "",
            })
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=aeroprice_fares_{_ts()}.csv"},
        )

    # JSON export
    data = [
        {
            "observation_id": str(obs.observation_id),
            "collected_at": obs.collected_at.isoformat() if obs.collected_at else None,
            "route": obs.route,
            "origin": obs.origin,
            "destination": obs.destination,
            "airline": obs.airline,
            "flight_number": obs.flight_number,
            "travel_date": obs.travel_date,
            "advance_days": obs.advance_days,
            "fare_family": obs.fare_family,
            "cabin": obs.cabin,
            "stops": obs.stops,
            "base_fare": obs.base_fare,
            "taxes": obs.taxes,
            "fees": obs.fees,
            "total_fare": obs.total_fare,
            "currency": obs.currency,
            "source": obs.source,
            "data_origin": obs.data_origin,
            "quality_flags": obs.quality_flags or [],
        }
        for obs in observations
    ]
    return JSONResponse(
        content={"observations": data, "total": len(data), "max_rows": MAX_EXPORT_ROWS},
        headers={"Content-Disposition": f"attachment; filename=aeroprice_fares_{_ts()}.json"},
    )


@router.get("/exports/index-history")
async def export_index_history(
    fmt: str = Query(default="csv", pattern="^(csv|json)$"),
    current_user=Depends(require_analyst),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        select(IndexObservation).order_by(IndexObservation.observation_period.desc()).limit(365)
    )
    observations = rows.scalars().all()

    records = [
        {
            "observation_period": obs.observation_period,
            "index_value": obs.index_value,
            "status": obs.status,
            "route_count": obs.route_count,
            "coverage_pct": obs.coverage_pct,
            "method": obs.method,
            "index_version": obs.index_version,
            "data_origin": obs.data_origin,
        }
        for obs in observations
    ]

    if fmt == "json":
        return JSONResponse(content={"index_history": records, "total": len(records)})

    output = io.StringIO()
    if records:
        writer = csv.DictWriter(output, fieldnames=list(records[0].keys()))
        writer.writeheader()
        writer.writerows(records)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=aeroprice_index_{_ts()}.csv"},
    )


@router.get("/exports/dgca-monthly")
async def export_dgca_monthly(
    fmt: str = Query(default="csv", pattern="^(csv|json)$"),
    current_user=Depends(require_analyst),
    db: AsyncSession = Depends(get_db),
):
    rows = await db.execute(
        select(DgcaMonthlyRecord).order_by(DgcaMonthlyRecord.year.desc(), DgcaMonthlyRecord.month.desc())
    )
    records = [
        {"year": r.year, "month": r.month, "domestic_passengers": r.domestic_passengers, "source": r.source}
        for r in rows.scalars().all()
    ]
    if fmt == "json":
        return JSONResponse(content={"dgca_monthly": records, "total": len(records)})
    output = io.StringIO()
    if records:
        writer = csv.DictWriter(output, fieldnames=list(records[0].keys()))
        writer.writeheader()
        writer.writerows(records)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=aeroprice_dgca_monthly_{_ts()}.csv"},
    )
