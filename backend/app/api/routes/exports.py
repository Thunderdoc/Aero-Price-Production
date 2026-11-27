"""
Exports API — CSV and JSON data exports.
Requires any signed-in user (read-only; analyst gate dropped per the
21 Nov 2026 access decision — write/admin actions stay gated).
Never exports GENERATED_TEST data.
"""
import csv
import io
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.fare import FareObservation
from app.models.government import DgcaMonthlyRecord, MospiCpiRecord, DgcaCircular
from app.models.index import IndexObservation
from app.models.collection import SourceHealth
from app.config.weights import get_route_weights, weights_metadata

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
    current_user=Depends(get_current_user),
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

    fields = [
        "observation_id", "collected_at", "route", "origin", "destination",
        "airline", "flight_number", "travel_date", "advance_days",
        "fare_family", "cabin", "stops",
        "base_fare", "taxes", "fees", "total_fare", "currency",
        "availability_status", "source", "data_origin", "quality_flags",
        "collection_run_id",
    ]

    # Column-only select + chunked CSV streaming (26 Nov 2026 sweep): the
    # old shape loaded 10k full ORM objects and built the whole CSV in one
    # StringIO before returning a one-item “stream”.
    rows = await db.execute(
        select(*[getattr(FareObservation, field) for field in fields])
        .where(and_(*filters))
        .order_by(FareObservation.collected_at.desc())
        .limit(MAX_EXPORT_ROWS)
    )
    observations = rows.all()

    if fmt == "csv":
        def csv_chunks():
            buffer = io.StringIO()
            writer = csv.DictWriter(buffer, fieldnames=fields)
            writer.writeheader()
            yield buffer.getvalue()
            for obs in observations:
                buffer.seek(0)
                buffer.truncate(0)
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
                    "quality_flags": obs.quality_flags or "[]",
                    "collection_run_id": obs.collection_run_id or "",
                })
                yield buffer.getvalue()

        return StreamingResponse(
            csv_chunks(),
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
    current_user=Depends(get_current_user),
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
    current_user=Depends(get_current_user),
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


@router.get("/exports/dgca-report")
async def export_dgca_report(
    fmt: str = Query(default="csv", pattern="^(csv|json)$"),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Combined DGCA analyst report (SIH extra, 26 Nov 2026): index history,
    latest-day route evidence, provenance counts, source health, route
    weights, and the honest benchmark note (MoSPI CPI Transport; DGCA does
    not publish monthly average fares)."""
    generated_at = datetime.now(timezone.utc).isoformat()
    index_rows = (await db.execute(
        select(IndexObservation).order_by(IndexObservation.observation_period.desc()).limit(30)
    )).scalars().all()
    index_history = [
        {
            "observation_period": obs.observation_period,
            "index_value": obs.index_value,
            "status": obs.status,
            "route_count": obs.route_count,
            "coverage_pct": obs.coverage_pct,
            "method": obs.method,
            "data_origin": obs.data_origin,
        }
        for obs in index_rows
    ]
    provenance = [
        {"data_origin": row[0], "records": row[1]}
        for row in (await db.execute(
            select(FareObservation.data_origin, func.count())
            .group_by(FareObservation.data_origin)
            .order_by(func.count().desc())
        )).all()
    ]
    latest_day = await db.scalar(
        select(func.max(func.date(FareObservation.collected_at))).where(
            FareObservation.data_origin.in_(("REAL", "OFFICIAL", "PUBLIC_INTERFACE")),
            FareObservation.is_valid == True,
        )
    )
    route_evidence = []
    if latest_day:
        fare_rows = (await db.execute(
            select(FareObservation.route, FareObservation.total_fare, FareObservation.data_origin).where(
                FareObservation.data_origin.in_(("REAL", "OFFICIAL", "PUBLIC_INTERFACE")),
                FareObservation.is_valid == True,
                FareObservation.currency == "INR",
                FareObservation.cabin == "ECONOMY",
                func.date(FareObservation.collected_at) == latest_day,
            )
        )).all()
        by_route: dict[str, list] = {}
        for row in fare_rows:
            by_route.setdefault(row.route, []).append(row)
        for route, rows in sorted(by_route.items()):
            fares = sorted(row.total_fare for row in rows)
            middle = len(fares) // 2
            median = (fares[middle - 1] + fares[middle]) / 2 if len(fares) % 2 == 0 else fares[middle]
            origins = sorted({row.data_origin for row in rows})
            route_evidence.append({
                "route": route,
                "median_fare": median,
                "min_fare": min(fares),
                "max_fare": max(fares),
                "observations": len(fares),
                "data_origin": origins[0] if len(origins) == 1 else "MIXED",
                "collection_day": str(latest_day),
            })
    source_health = [
        {
            "source_id": row.source_id,
            "source_name": row.source_name,
            "status": row.status,
            "last_success": row.last_success.isoformat() if row.last_success else None,
            "records_total": row.records_total,
        }
        for row in (await db.execute(select(SourceHealth).order_by(SourceHealth.source_id))).scalars().all()
    ]
    report = {
        "generated_at": generated_at,
        "index_history": index_history,
        "route_evidence": route_evidence,
        "provenance_counts": provenance,
        "source_health": source_health,
        "route_weights": get_route_weights(),
        "weights": weights_metadata(),
        "benchmark_note": (
            "Backtest benchmark: MoSPI CPI — Transport (base 2024=100). "
            "DGCA does not publish monthly average fares publicly, so no DGCA fare benchmark exists; "
            "the DGCA path honestly reports NO_DGCA_DATA."
        ),
    }
    if fmt == "json":
        return JSONResponse(
            content=report,
            headers={"Content-Disposition": f"attachment; filename=aeroprice_dgca_report_{_ts()}.json"},
        )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["section", "key", "metric", "value", "detail"])
    writer.writerow(["meta", "generated_at", "", generated_at, ""])
    writer.writerow(["meta", "benchmark_note", "", report["benchmark_note"], ""])
    for item in index_history:
        writer.writerow(["index", item["observation_period"], "index_value", item["index_value"], item["status"]])
    for item in route_evidence:
        writer.writerow(["route", item["route"], "median_fare", item["median_fare"], f"{item['observations']} obs · {item['data_origin']} · {item['collection_day']}"])
    for item in provenance:
        writer.writerow(["provenance", item["data_origin"], "records", item["records"], ""])
    for item in source_health:
        writer.writerow(["source", item["source_id"], "status", item["status"], item["last_success"] or ""])
    for item in report["route_weights"]:
        writer.writerow(["weight", item.get("route", ""), "weight", item.get("weight", ""), report["weights"].get("weight_source", "")])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=aeroprice_dgca_report_{_ts()}.csv"},
    )
