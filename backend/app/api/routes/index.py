import os
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.analytics.backtest import (
    MOSPI_CPI_BENCHMARK_NAME,
    MOSPI_CPI_METHOD,
    load_benchmark_csv,
    load_dgca_fares_csv,
    run_backtest,
    run_backtest_vs_benchmark,
)
from app.config.weights import get_route_weights, weights_metadata
from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.fare import FareObservation
from app.models.index import IndexObservation, IndexPublication, RouteBasket
from app.services.index_engine import (
    BASE_PERIOD_POLICY,
    INDEX_ELIGIBLE_ORIGINS,
    MIN_CORRIDORS_TO_PUBLISH,
)

router = APIRouter(prefix="/index", tags=["index"])

# Weights come from the documented weights config (AAI gravity-model
# weights today — DGCA traffic weights are unavailable; see
# backend/app/config/weights.py).
ROUTE_BASKET = get_route_weights()

# MoSPI CPI Transport index values for the backtest — the live benchmark,
# shipped in the repo (backend/data/mospi_cpi_transport.csv, Jan–Oct 2026,
# each row sourced from that month's MoSPI press release, Annexure I).
# DGCA monthly average fares are the original benchmark, but DGCA does not
# publish them publicly (verified 22 Nov 2026), so that CSV is NOT in the
# repo and benchmark=dgca honestly reports NO_DGCA_DATA. See
# backend/app/analytics/backtest.py for both formats.
_BACKEND_DIR = Path(__file__).resolve().parents[3]
DEFAULT_MOSPI_CPI_CSV = _BACKEND_DIR / "data" / "mospi_cpi_transport.csv"
DEFAULT_DGCA_FARES_CSV = _BACKEND_DIR / "data" / "dgca_monthly_fares.csv"

_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _base_response(extra: dict) -> dict:
    """Fields every /index/current response carries, whatever its status."""
    base = {
        "base_period": "First verified collection day",
        "base_period_note": BASE_PERIOD_POLICY,
        "base_value": 100.0,
        "method": "JEVONS_MATCHED_SAMPLE",
        "version": "v1.0",
        "index_origins": list(INDEX_ELIGIBLE_ORIGINS),
        "weights": weights_metadata(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    base.update(extra)
    return base


@router.get("/current")
async def current_index(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Current index value. Returns INSUFFICIENT_DATA if fewer than
    MIN_CORRIDORS_TO_PUBLISH real matched corridors exist."""
    real_fare_count = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(FareObservation.data_origin.in_(list(INDEX_ELIGIBLE_ORIGINS)))
        .where(FareObservation.is_valid == True)
    )

    covered_routes = await db.scalar(
        select(func.count(FareObservation.route.distinct()))
        .where(FareObservation.data_origin.in_(list(INDEX_ELIGIBLE_ORIGINS)))
        .where(FareObservation.is_valid == True)
    ) or 0

    if covered_routes < MIN_CORRIDORS_TO_PUBLISH:
        return _base_response({
            "status": "INSUFFICIENT_DATA",
            "index_value": None,
            "message": f"Index not published. Requires ≥{MIN_CORRIDORS_TO_PUBLISH} matched corridors with real observations. Currently: {covered_routes}.",
            "covered_routes_count": covered_routes,
            "required_routes": MIN_CORRIDORS_TO_PUBLISH,
            "real_observations": real_fare_count or 0,
            "route_count": covered_routes,
            "coverage_pct": covered_routes / max(len(ROUTE_BASKET), 1) * 100,
        })

    latest = await db.scalar(
        select(IndexObservation)
        .where(IndexObservation.status == "PUBLISHED")
        .where(IndexObservation.data_origin.in_(["REAL", "OFFICIAL", "DERIVED"]))
        .order_by(IndexObservation.calculation_ts.desc())
        .limit(1)
    )

    if not latest:
        return _base_response({
            "status": "INSUFFICIENT_DATA",
            "index_value": None,
            "message": "No published index yet. The matched-sample calculation needs verified fares in both the first and current collection periods.",
            "covered_routes_count": covered_routes,
            "required_routes": MIN_CORRIDORS_TO_PUBLISH,
            "real_observations": real_fare_count or 0,
            "route_count": covered_routes,
            "coverage_pct": covered_routes / max(len(ROUTE_BASKET), 1) * 100,
            "data_origin": "DERIVED",
        })

    return _base_response({
        "status": "PUBLISHED",
        "index_value": latest.index_value,
        "base_period": latest.base_period,
        "observation_period": latest.observation_period,
        "route_count": latest.route_count,
        "observation_count": latest.observation_count,
        "coverage_pct": latest.coverage_pct,
        "data_origin": "DERIVED",
        "covered_routes_count": covered_routes,
        "required_routes": MIN_CORRIDORS_TO_PUBLISH,
        "real_observations": real_fare_count or 0,
        "calculation_ts": latest.calculation_ts.isoformat() if latest.calculation_ts else None,
    })


@router.get("/basket")
async def route_basket(
    current_user: dict = Depends(get_current_user),
):
    """Index route basket and weights.

    Read-only: any signed-in user may view it (analyst gate dropped per the
    21 Nov 2026 access decision — write/admin actions stay gated).
    """
    metadata = weights_metadata()
    return {
        "routes": ROUTE_BASKET,
        "total": len(ROUTE_BASKET),
        "weight_source_note": metadata["weight_source_note"],
        "weight_source": metadata["weight_source"],
        "weights_version": metadata["weights_version"],
        "dgca_weights_status": metadata["dgca_weights_status"],
        "dgca_weights_note": metadata["dgca_weights_note"],
        "min_corridors_to_publish": MIN_CORRIDORS_TO_PUBLISH,
    }


def _aggregate_history(
    daily: list[dict], frequency: str
) -> list[dict]:
    """Aggregate daily published values to weekly/monthly end-of-period values.

    Weekly periods are ISO weeks (YYYY-Www); monthly periods are YYYY-MM.
    The period value is the LAST daily published value in the period — no
    averaging, no interpolation, no invented points.
    """
    if frequency == "daily":
        return daily
    grouped: dict[str, dict] = {}
    for row in daily:  # daily is newest-first; keep the first row per period
        day = datetime.strptime(row["period"], "%Y-%m-%d").date()
        if frequency == "weekly":
            iso = day.isocalendar()
            key = f"{iso.year}-W{iso.week:02d}"
        else:
            key = day.strftime("%Y-%m")
        if key not in grouped:
            grouped[key] = {**row, "period": key, "period_end": row["period"]}
    # Newest period first, matching the daily ordering.
    return [grouped[key] for key in sorted(grouped, reverse=True)]


@router.get("/history")
async def index_history(
    limit: int = Query(30, ge=1, le=365),
    # Plain default (not Query(...)) so direct calls in tests get "daily";
    # invalid values are rejected with 422 below, matching Query validation.
    frequency: str = "daily",
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Published historical index observations only.

    Insufficient-data calculation attempts are operational audit records, not
    index history. Returning them here made the dashboard look like it had a
    broken or empty published series.

    `frequency` aggregates the daily published series: `weekly` and `monthly`
    return the last published daily value in each ISO week / calendar month.
    Read-only: any signed-in user may view it (analyst gate dropped per the
    21 Nov 2026 access decision).
    """
    if frequency not in ("daily", "weekly", "monthly"):
        raise HTTPException(
            status_code=422,
            detail="frequency must be one of: daily, weekly, monthly",
        )
    # Fetch enough daily rows to fill `limit` aggregated periods.
    fetch_limit = min(365, limit * {"daily": 1, "weekly": 7, "monthly": 31}[frequency])
    ranked = select(
        IndexObservation.id.label("id"),
        func.row_number().over(
            partition_by=IndexObservation.observation_period,
            order_by=(IndexObservation.calculation_ts.desc(), IndexObservation.id.desc()),
        ).label("period_rank"),
    ).where(
        IndexObservation.status == "PUBLISHED",
        IndexObservation.data_origin.in_(["REAL", "OFFICIAL", "DERIVED"]),
    ).subquery()
    rows = await db.execute(
        select(IndexObservation)
        .join(ranked, IndexObservation.id == ranked.c.id)
        .where(ranked.c.period_rank == 1)
        .order_by(IndexObservation.observation_period.desc())
        .limit(fetch_limit)
    )
    obs = rows.scalars().all()
    daily = [
        {
            "period": o.observation_period,
            "value": o.index_value,
            "status": o.status,
            "route_count": o.route_count,
            "observation_count": o.observation_count,
            "data_origin": "DERIVED",
        }
        for o in obs
    ]
    aggregated = _aggregate_history(daily, frequency)[:limit]
    return {
        "frequency": frequency,
        "count": len(aggregated),
        "observations": aggregated,
    }


@router.get("/backtest")
async def index_backtest(
    benchmark: str = Query(default="mospi-cpi", pattern=r"^(mospi-cpi|dgca)$"),
    start_month: Optional[str] = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    end_month: Optional[str] = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Backtest the monthly Jevons index against an official benchmark.

    SIH26056 requires >= 30 days of back-tested results against DGCA monthly
    average-fare data. Verified 22 Nov 2026, DGCA does not publish monthly
    average fares publicly, so the live benchmark is the MoSPI CPI
    Transport division (All-India Combined, base 2024=100), shipped in
    backend/data/mospi_cpi_transport.csv and honestly labelled as MoSPI CPI
    — never as DGCA data. The method (monthly Jevons series vs the
    benchmark's MoM % changes, with coverage reporting) is implemented in
    backend/app/analytics/backtest.py. ``benchmark=dgca`` keeps the original
    DGCA path (DGCA_FARES_CSV, default backend/data/dgca_monthly_fares.csv),
    which honestly reports NO_DGCA_DATA until genuine DGCA fare data is
    supplied. Read-only: any signed-in user may view it.
    """
    if benchmark == "dgca":
        csv_path = os.getenv("DGCA_FARES_CSV") or str(DEFAULT_DGCA_FARES_CSV)
        try:
            dgca_fares = load_dgca_fares_csv(csv_path)
        except FileNotFoundError:
            dgca_fares = []
        except (ValueError, OSError) as exc:
            raise HTTPException(
                status_code=500,
                detail=f"DGCA fares file at {csv_path} could not be read: {exc}",
            )
        benchmark_rows = None
    else:
        csv_path = os.getenv("MOSPI_CPI_CSV") or str(DEFAULT_MOSPI_CPI_CSV)
        try:
            benchmark_rows = load_benchmark_csv(csv_path)
        except FileNotFoundError:
            benchmark_rows = []
        except (ValueError, OSError) as exc:
            raise HTTPException(
                status_code=500,
                detail=f"MoSPI CPI file at {csv_path} could not be read: {exc}",
            )
        dgca_fares = None

    if start_month is None or end_month is None:
        bounds = await db.execute(
            select(
                func.min(FareObservation.collected_at),
                func.max(FareObservation.collected_at),
            ).where(
                FareObservation.data_origin.in_(list(INDEX_ELIGIBLE_ORIGINS)),
                FareObservation.is_valid == True,
            )
        )
        earliest_dt, latest_dt = bounds.one()
        today_month = datetime.now(timezone.utc).strftime("%Y-%m")
        start_month = start_month or (
            earliest_dt.strftime("%Y-%m") if earliest_dt else today_month
        )
        end_month = end_month or (
            latest_dt.strftime("%Y-%m") if latest_dt else today_month
        )
    if end_month < start_month:
        raise HTTPException(status_code=400, detail="end_month must not precede start_month")

    if benchmark == "dgca":
        return await run_backtest(db, ROUTE_BASKET, dgca_fares, start_month, end_month)
    return await run_backtest_vs_benchmark(
        db,
        ROUTE_BASKET,
        benchmark_rows,
        MOSPI_CPI_BENCHMARK_NAME,
        MOSPI_CPI_METHOD,
        start_month,
        end_month,
    )
