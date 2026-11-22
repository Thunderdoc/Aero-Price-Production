"""
30-day backtest method: monthly Jevons index vs an official benchmark.

SIH26056's expected solution requires "at least 30 days of back-tested results
against publicly available DGCA monthly average-fare data". This module
implements the METHOD — it does not fabricate the data the method needs.

Two benchmarks, one method
---------------------------
1. **MoSPI CPI — Transport (base 2024=100)** — the live benchmark
   (``run_backtest_vs_benchmark``). Verified 22 Nov 2026: DGCA does NOT
   publish monthly average fares anywhere public (monthly traffic reports
   carry no fare table; the Tariff Monitoring Unit's 72-route fare
   monitoring is internal only; data.gov.in holds no fare dataset), so the
   SIH26056 premise of "publicly available DGCA monthly average-fare data"
   does not match reality. The owner chose the MoSPI CPI Transport division
   as the honest substitute: a real, public, monthly official series. It is
   an INDEX, not a fare — the comparison is month-over-month percentage
   changes of the two index series, never rupee levels — and it is labelled
   as MoSPI CPI everywhere, never as DGCA data. Values are shipped in
   ``backend/data/mospi_cpi_transport.csv`` (Jan–Oct 2026, each row sourced
   from that month's MoSPI press release, Annexure I).
2. **DGCA monthly average fares** — the original benchmark
   (``run_backtest``), retained for the day genuine DGCA fare data becomes
   available (e.g. via an RTI request). With no dataset it honestly returns
   status ``NO_DGCA_DATA`` — never a comparison against invented fares.

Method
------
1. Build a monthly Jevons index series from stored fare observations: for
   each calendar month, take the median fare per corridor (minimum 3
   observations per corridor-month, same gate as the daily engine), ratio
   each corridor's monthly median against its base-month median, and take
   the weight-normalised geometric mean (same weighted-Jevons formula as
   ``app.services.index_engine``). Base month = first month with >= 10
   matched corridors; that month's index is 100.0.
2. Take the benchmark as an explicit input dataset (``BenchmarkMonthlyValue``
   rows, loaded from a CSV — see ``load_benchmark_csv``).
3. Compare month-over-month percentage changes of the two series over the
   months where BOTH exist: mean absolute difference of the MoM changes and
   the Pearson correlation of the MoM changes.

Coverage honesty
----------------
Both runners always report coverage: how many months were compared, how
many months lacked benchmark data, how many lacked index data. With fewer
than 30 days of real fares they report the actual window covered, never a
padded 30 days.

CSV format for the MoSPI benchmark (``backend/data/mospi_cpi_transport.csv``)::

    period,benchmark,index_value,source,source_url
    2026-10,"MoSPI CPI — Transport (base 2024=100)",106.31,MoSPI CPI press release, October 2026, Annexure I,https://www.pib.gov.in/...

``period`` is ``YYYY-MM``; ``index_value`` is the MoSPI-published Transport
division index (All-India Combined, base 2024=100) for that month; ``source``
names the MoSPI press release it came from. The DGCA format
(``backend/data/dgca_monthly_fares.csv``, not present in the repo) is
``period,avg_fare_inr,source,source_url`` — see ``load_dgca_fares_csv``.
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


# The live backtest benchmark: MoSPI CPI, Division 07 "Transport",
# All-India Combined, base 2024=100. NOTE the name: the old 2012-base CPI
# group was "Transport and communication", but MoSPI retired that grouping
# on 12 Feb 2026 (the series split into Transport and Information and
# communication). The benchmark name must say what the series actually is.
MOSPI_CPI_BENCHMARK_NAME = "MoSPI CPI — Transport (base 2024=100)"
MOSPI_CPI_METHOD = "JEVONS_MONTHLY_VS_MOSPI_CPI_TRANSPORT"


@dataclass
class BenchmarkMonthlyValue:
    """One month of an official index benchmark (not a fare).

    ``value`` is an index level (base 2024=100 for the MoSPI CPI Transport
    series); the backtest compares MoM percentage changes, never levels.
    """

    period: str  # YYYY-MM
    value: float
    source: str  # MoSPI press release this came from — never blank for real data
    benchmark: str = MOSPI_CPI_BENCHMARK_NAME
    source_url: str | None = None


def load_benchmark_csv(
    path: str | Path,
    expected_benchmark: str = MOSPI_CPI_BENCHMARK_NAME,
) -> list[BenchmarkMonthlyValue]:
    """Load monthly benchmark index values from a CSV file.

    Expected columns: ``period,benchmark,index_value,source,source_url``.
    Rows whose ``benchmark`` field names a different benchmark are skipped
    with a warning — benchmarks must never be silently mixed. Rows without
    a ``benchmark`` column are accepted and attributed to
    ``expected_benchmark``.

    Raises FileNotFoundError when the file does not exist — the caller turns
    that into a NO_BENCHMARK_DATA backtest status, never into invented data.
    """
    rows: list[BenchmarkMonthlyValue] = []
    with open(path, newline="", encoding="utf-8") as handle:
        for line in csv.DictReader(handle):
            period = (line.get("period") or "").strip()
            value_raw = (line.get("index_value") or "").strip()
            source = (line.get("source") or "").strip()
            benchmark = (line.get("benchmark") or "").strip() or expected_benchmark
            if not period or not value_raw or not source:
                logger.warning("Skipping incomplete benchmark row: %r", line)
                continue
            if benchmark != expected_benchmark:
                logger.warning(
                    "Skipping row for a different benchmark %r (expected %r): %r",
                    benchmark,
                    expected_benchmark,
                    line,
                )
                continue
            rows.append(
                BenchmarkMonthlyValue(
                    period=period,
                    value=float(value_raw),
                    source=source,
                    benchmark=benchmark,
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


def compare_to_benchmark(
    index_values: list[dict],
    benchmark_rows: list[BenchmarkMonthlyValue],
    benchmark_name: str,
) -> dict:
    """Compare MoM % changes of the index series vs an official benchmark.

    The comparison is on month-over-month percentage changes of the two
    series — never on levels, since the benchmark is an index, not a fare.
    """
    benchmark_by_period = {row.period: row.value for row in benchmark_rows}
    index_periods = {row["period"] for row in index_values}
    compared = sorted(index_periods & set(benchmark_by_period))
    months_missing_benchmark = sorted(index_periods - set(benchmark_by_period))
    months_missing_index = sorted(set(benchmark_by_period) - index_periods)

    index_changes = _mom_changes(index_values, "index_value")
    benchmark_series = [
        {"period": row.period, "value": row.value}
        for row in sorted(benchmark_rows, key=lambda r: r.period)
    ]
    benchmark_changes = _mom_changes(benchmark_series, "value")
    common = sorted(set(index_changes) & set(benchmark_changes))
    diffs = [abs(index_changes[p] - benchmark_changes[p]) for p in common]
    correlation = _pearson(
        [index_changes[p] for p in common], [benchmark_changes[p] for p in common]
    )
    return {
        "benchmark": benchmark_name,
        "compared_months": compared,
        "months_missing_benchmark": months_missing_benchmark,
        "months_missing_index": months_missing_index,
        "mom_comparison_months": common,
        "mom_index_pct": {p: round(index_changes[p], 2) for p in common},
        "mom_benchmark_pct": {p: round(benchmark_changes[p], 2) for p in common},
        "mean_abs_mom_diff_pct": round(sum(diffs) / len(diffs), 2) if diffs else None,
        "mom_correlation": round(correlation, 3) if correlation is not None else None,
    }


def compare_to_dgca(
    index_values: list[dict], dgca_fares: list[DgcaMonthlyFare]
) -> dict:
    """Compare MoM % changes of the index series vs DGCA average fares.

    Kept for the DGCA benchmark path; same math as ``compare_to_benchmark``
    with the DGCA-named response keys.
    """
    generic = compare_to_benchmark(
        index_values,
        [
            BenchmarkMonthlyValue(
                period=row.period,
                value=row.avg_fare_inr,
                source=row.source,
                benchmark="DGCA monthly average fare",
                source_url=row.source_url,
            )
            for row in dgca_fares
        ],
        "DGCA monthly average fare",
    )
    return {
        "compared_months": generic["compared_months"],
        "months_missing_dgca": generic["months_missing_benchmark"],
        "months_missing_index": generic["months_missing_index"],
        "mom_comparison_months": generic["mom_comparison_months"],
        "mom_index_pct": generic["mom_index_pct"],
        "mom_dgca_pct": generic["mom_benchmark_pct"],
        "mean_abs_mom_diff_pct": generic["mean_abs_mom_diff_pct"],
        "mom_correlation": generic["mom_correlation"],
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
            "yet. DGCA does not publish monthly average fares publicly "
            "(verified 22 Nov 2026), so this benchmark cannot be populated "
            "from public sources; the live benchmark is the MoSPI CPI "
            "Transport series (?benchmark=mospi-cpi). No comparison is shown "
            "against invented fares."
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


async def run_backtest_vs_benchmark(
    db: AsyncSession,
    routes: list[dict],
    benchmark_rows: list[BenchmarkMonthlyValue],
    benchmark_name: str,
    method: str,
    start_month: str,
    end_month: str,
) -> dict:
    """Run the backtest against an official index benchmark (MoSPI CPI).

    Statuses:
      NO_BENCHMARK_DATA — no benchmark dataset was supplied.
      INSUFFICIENT_DATA — benchmark data exists but the index side cannot
          be built (or the two series share no month).
      COMPLETED — both series exist for at least one compared month.
    """
    series = await monthly_jevons_series(db, routes, start_month, end_month)
    report: dict = {
        "method": method,
        "benchmark": benchmark_name,
        "required_backtest_days": REQUIRED_BACKTEST_DAYS,
        "window": {"start_month": start_month, "end_month": end_month},
        "index": series,
        "benchmark_months_supplied": [row.period for row in benchmark_rows],
        "benchmark_sources": sorted({row.source for row in benchmark_rows}),
    }
    if not benchmark_rows:
        report["status"] = "NO_BENCHMARK_DATA"
        report["message"] = (
            f"No {benchmark_name} dataset is available in this project yet. "
            "Supply backend/data/mospi_cpi_transport.csv and re-run. "
            "No comparison is shown against invented data."
        )
        report["comparison"] = None
        return report
    if series["status"] != "CALCULATED" or not series["values"]:
        report["status"] = "INSUFFICIENT_DATA"
        report["message"] = series.get("message", "Index series could not be built.")
        report["comparison"] = None
        return report
    comparison = compare_to_benchmark(series["values"], benchmark_rows, benchmark_name)
    report["status"] = "COMPLETED" if comparison["compared_months"] else "INSUFFICIENT_DATA"
    report["message"] = (
        f"Compared {len(comparison['compared_months'])} month(s) where both the "
        f"Jevons index and {benchmark_name} exist."
        if comparison["compared_months"]
        else f"The index series and the {benchmark_name} series share no month, so no comparison can be computed."
    )
    report["comparison"] = comparison
    return report
