"""
30-day backtest method: Jevons index vs DGCA monthly average fares.

SIH26056's expected solution requires "at least 30 days of back-tested results
against publicly available DGCA monthly average-fare data". This module
implements the METHOD — it does not fabricate the data the method needs.

Method
------
1. Build a monthly Jevons index series from stored REAL/OFFICIAL fare
   observations: for each calendar month, take the median fare per corridor
   (minimum 3 observations per corridor-month, same gate as the daily engine),
   ratio each corridor's monthly median against its base-month median, and
   take the weight-normalised geometric mean (same weighted-Jevons formula as
   ``app.services.index_engine``). Base month = first month with >= 10 matched
   corridors; that month's index is 100.0.
2. Take DGCA monthly average fares as an explicit input dataset
   (``DgcaMonthlyFare`` rows, loaded from a CSV — see ``load_dgca_fares_csv``).
   The DGCA dataset is NOT in this repo: DGCA publishes monthly average fares
   in statistical reports, and no DGCA average-fare dataset has been
   downloaded into the project yet.
3. Compare month-over-month percentage changes of the two series over the
   months where BOTH exist: mean absolute difference of the MoM changes and
   the Pearson correlation of the MoM changes.

Coverage honesty
----------------
``run_backtest`` always reports coverage: how many months were compared, how
many months lacked DGCA data, how many lacked index data. With no DGCA
dataset it returns status ``NO_DGCA_DATA`` — never a comparison against
invented fares. With fewer than 30 days of real fares it reports the actual
window covered, never a padded 30 days.

CSV format for the DGCA dataset (``backend/data/dgca_monthly_fares.csv``,
not present in the repo until downloaded)::

    period,avg_fare_inr,source,source_url
    2026-08,5432.10,DGCA Monthly Statistical Report Aug 2026,https://dgca.gov.in/...

``period`` is ``YYYY-MM``; ``avg_fare_inr`` is the DGCA-published domestic
average fare for that month; ``source`` names the DGCA document it came from.
"""
import csv
import logging
import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fare import FareObservation
from app.services.index_engine import (
    INDEX_ELIGIBLE_ORIGINS,
    MIN_CORRIDORS_TO_PUBLISH,
    MIN_OBS_PER_CORRIDOR,
)

logger = logging.getLogger(__name__)

METHOD = "JEVONS_MONTHLY_VS_DGCA_AVG_FARE"
BASE_VALUE = 100.0
REQUIRED_BACKTEST_DAYS = 30


@dataclass
class DgcaMonthlyFare:
    """One month of DGCA-published domestic average fare."""

    period: str  # YYYY-MM
    avg_fare_inr: float
    source: str  # DGCA document this came from — never blank for real data
    source_url: str | None = None


def load_dgca_fares_csv(path: str | Path) -> list[DgcaMonthlyFare]:
    """Load DGCA monthly average fares from a CSV file.

    Raises FileNotFoundError when the file does not exist — the caller turns
    that into a NO_DGCA_DATA backtest status, never into invented data.
    """
    rows: list[DgcaMonthlyFare] = []
    with open(path, newline="", encoding="utf-8") as handle:
        for line in csv.DictReader(handle):
            period = (line.get("period") or "").strip()
            avg_raw = (line.get("avg_fare_inr") or "").strip()
            source = (line.get("source") or "").strip()
            if not period or not avg_raw or not source:
                logger.warning("Skipping incomplete DGCA fare row: %r", line)
                continue
            rows.append(
                DgcaMonthlyFare(
                    period=period,
                    avg_fare_inr=float(avg_raw),
                    source=source,
                    source_url=(line.get("source_url") or "").strip() or None,
                )
            )
    return sorted(rows, key=lambda r: r.period)


def _month_bounds(period: str) -> tuple[date, date]:
    """First and last day (inclusive) of a YYYY-MM month."""
    year, month = int(period[:4]), int(period[5:7])
    first = date(year, month, 1)
    if month == 12:
        last = date(year + 1, 1, 1)
    else:
        last = date(year, month + 1, 1)
    return first, last - timedelta(days=1)


def _iter_months(start_month: str, end_month: str) -> list[str]:
    months: list[str] = []
    year, month = int(start_month[:4]), int(start_month[5:7])
    end_year, end_m = int(end_month[:4]), int(end_month[5:7])
    while (year, month) <= (end_year, end_m):
        months.append(f"{year:04d}-{month:02d}")
        month += 1
        if month == 13:
            month, year = 1, year + 1
    return months


async def _monthly_median_fare(
    db: AsyncSession, route: str, period: str
) -> float | None:
    """Median total_fare for a route in one calendar month.

    Index-eligible origins only (REAL, OFFICIAL, PUBLIC_INTERFACE — see
    app.services.index_engine.INDEX_ELIGIBLE_ORIGINS). SANDBOX_TEST and
    GENERATED_TEST are permanently excluded.
    """
    first, last = _month_bounds(period)
    # Bound datetimes, not ISO strings: SQLite stores naive timestamps with a
    # space separator, so lexical string comparison would miss same-day rows
    # (same reason as in app.services.index_engine).
    period_start = datetime(first.year, first.month, first.day, 0, 0, 0)
    period_end = datetime(last.year, last.month, last.day, 23, 59, 59)
    rows = await db.execute(
        select(FareObservation.total_fare).where(
            and_(
                FareObservation.route == route,
                FareObservation.data_origin.in_(list(INDEX_ELIGIBLE_ORIGINS)),
                FareObservation.is_valid == True,
                FareObservation.collected_at >= period_start,
                FareObservation.collected_at <= period_end,
            )
        )
    )
    fares = sorted(r[0] for r in rows.fetchall())
    if len(fares) < MIN_OBS_PER_CORRIDOR:
        return None
    mid = len(fares) // 2
    return fares[mid] if len(fares) % 2 == 1 else (fares[mid - 1] + fares[mid]) / 2


async def monthly_jevons_series(
    db: AsyncSession,
    routes: list[dict],
    start_month: str,
    end_month: str,
) -> dict:
    """Monthly Jevons index values over a month range.

    Base month = first month with >= MIN_CORRIDORS_TO_PUBLISH matched
    corridors (index 100.0). Later months are ratios against the base month's
    per-corridor medians. Months that cannot be matched are reported, not
    interpolated.
    """
    months = _iter_months(start_month, end_month)
    medians: dict[str, dict[str, float]] = {}
    for period in months:
        medians[period] = {}
        for route_info in routes:
            route = route_info["route"]
            median = await _monthly_median_fare(db, route, period)
            if median is not None and median > 0:
                medians[period][route] = median

    base_month = next(
        (p for p in months if len(medians[p]) >= MIN_CORRIDORS_TO_PUBLISH), None
    )
    if base_month is None:
        return {
            "status": "INSUFFICIENT_DATA",
            "base_month": None,
            "values": [],
            "months_missing_index": months,
            "message": (
                f"No month in {start_month}..{end_month} has "
                f">={MIN_CORRIDORS_TO_PUBLISH} corridors with >= "
                f"{MIN_OBS_PER_CORRIDOR} verified observations each."
            ),
        }

    base = medians[base_month]
    values: list[dict] = []
    missing: list[str] = []
    for period in months:
        if period < base_month:
            continue
        matched = {
            route: medians[period][route]
            for route in medians[period]
            if route in base
        }
        if len(matched) < MIN_CORRIDORS_TO_PUBLISH:
            missing.append(period)
            continue
        weights = {
            r["route"]: r.get("weight", 1.0) for r in routes if r["route"] in matched
        }
        total_weight = sum(weights.values())
        log_sum = sum(
            (weights[route] / total_weight) * math.log(median / base[route])
            for route, median in matched.items()
        )
        values.append(
            {
                "period": period,
                "index_value": round(math.exp(log_sum) * BASE_VALUE, 2),
                "n": len(matched),
                "covered_routes": sorted(matched),
            }
        )
    return {
        "status": "CALCULATED" if values else "INSUFFICIENT_DATA",
        "base_month": base_month,
        "base_value": BASE_VALUE,
        "values": values,
        "months_missing_index": missing,
    }


def _mom_changes(series: list[dict], key: str) -> dict[str, float]:
    """Month-over-month % change per period (first period has no change)."""
    changes: dict[str, float] = {}
    for prev, current in zip(series, series[1:]):
        if prev[key]:
            changes[current["period"]] = (current[key] - prev[key]) / prev[key] * 100
    return changes


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    """Pearson correlation, pure Python. None when undefined (<2 pairs or zero variance)."""
    n = len(xs)
    if n < 2:
        return None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)
    if var_x == 0 or var_y == 0:
        return None
    return cov / math.sqrt(var_x * var_y)


def compare_to_dgca(
    index_values: list[dict], dgca_fares: list[DgcaMonthlyFare]
) -> dict:
    """Compare MoM % changes of the index series vs DGCA average fares."""
    dgca_by_period = {row.period: row.avg_fare_inr for row in dgca_fares}
    index_periods = {row["period"] for row in index_values}
    compared = sorted(index_periods & set(dgca_by_period))
    months_missing_dgca = sorted(index_periods - set(dgca_by_period))
    months_missing_index = sorted(set(dgca_by_period) - index_periods)

    index_changes = _mom_changes(index_values, "index_value")
    dgca_series = [
        {"period": row.period, "avg_fare_inr": row.avg_fare_inr}
        for row in sorted(dgca_fares, key=lambda r: r.period)
    ]
    dgca_changes = _mom_changes(dgca_series, "avg_fare_inr")
    common = sorted(set(index_changes) & set(dgca_changes))
    diffs = [abs(index_changes[p] - dgca_changes[p]) for p in common]
    correlation = _pearson(
        [index_changes[p] for p in common], [dgca_changes[p] for p in common]
    )
    return {
        "compared_months": compared,
        "months_missing_dgca": months_missing_dgca,
        "months_missing_index": months_missing_index,
        "mom_comparison_months": common,
        "mom_index_pct": {p: round(index_changes[p], 2) for p in common},
        "mom_dgca_pct": {p: round(dgca_changes[p], 2) for p in common},
        "mean_abs_mom_diff_pct": round(sum(diffs) / len(diffs), 2) if diffs else None,
        "mom_correlation": round(correlation, 3) if correlation is not None else None,
    }


async def run_backtest(
    db: AsyncSession,
    routes: list[dict],
    dgca_fares: list[DgcaMonthlyFare],
    start_month: str,
    end_month: str,
) -> dict:
    """Run the full backtest and report coverage honestly.

    Statuses:
      NO_DGCA_DATA — no DGCA monthly average-fare dataset was supplied.
      INSUFFICIENT_DATA — DGCA data exists but the index side cannot be built.
      COMPLETED — both series exist for at least one compared month.
    """
    series = await monthly_jevons_series(db, routes, start_month, end_month)
    report: dict = {
        "method": METHOD,
        "required_backtest_days": REQUIRED_BACKTEST_DAYS,
        "window": {"start_month": start_month, "end_month": end_month},
        "index": series,
        "dgca_months_supplied": [row.period for row in dgca_fares],
        "dgca_sources": sorted({row.source for row in dgca_fares}),
    }
    if not dgca_fares:
        report["status"] = "NO_DGCA_DATA"
        report["message"] = (
            "No DGCA monthly average-fare dataset is available in this project "
            "yet. Download the DGCA monthly average fares (DGCA statistical "
            "reports) into backend/data/dgca_monthly_fares.csv and re-run. "
            "No comparison is shown against invented fares."
        )
        report["comparison"] = None
        return report
    if series["status"] != "CALCULATED" or not series["values"]:
        report["status"] = "INSUFFICIENT_DATA"
        report["message"] = series.get("message", "Index series could not be built.")
        report["comparison"] = None
        return report
    comparison = compare_to_dgca(series["values"], dgca_fares)
    report["status"] = "COMPLETED" if comparison["compared_months"] else "INSUFFICIENT_DATA"
    report["message"] = (
        f"Compared {len(comparison['compared_months'])} month(s) where both the "
        f"Jevons index and DGCA average fares exist."
        if comparison["compared_months"]
        else "The index series and the DGCA series share no month, so no comparison can be computed."
    )
    report["comparison"] = comparison
    return report
