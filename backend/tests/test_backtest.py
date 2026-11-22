"""
Backtest-method tests (backend/app/analytics/backtest.py).

All fares here are TEST FIXTURES seeded into the in-memory DB — they exist
only to verify the method's math and coverage reporting. No real DGCA data
is fabricated: the NO_DGCA_DATA path is tested explicitly. The MoSPI CPI
Transport benchmark values pinned in test_shipped_mospi_csv_has_verified_months
are REAL published values (MoSPI press releases, Annexure I) — see
backend/data/mospi_cpi_transport.README.md.
"""
from datetime import datetime
from pathlib import Path

import pytest

from app.analytics.backtest import (
    MOSPI_CPI_BENCHMARK_NAME,
    MOSPI_CPI_METHOD,
    BenchmarkMonthlyValue,
    DgcaMonthlyFare,
    compare_to_benchmark,
    compare_to_dgca,
    load_benchmark_csv,
    load_dgca_fares_csv,
    monthly_jevons_series,
    run_backtest,
    run_backtest_vs_benchmark,
)
from app.models.fare import FareObservation
from app.services.collector import ROUTE_BASKET as COLLECTION_ROUTE_BASKET

ROUTES = [{"route": r, "weight": 1.0} for r in COLLECTION_ROUTE_BASKET[:12]]


async def _seed_month(db, month, fare_by_route):
    """Seed 3 observations per route mid-month (test fixtures)."""
    day = f"{month}-15"
    for route, fare in fare_by_route.items():
        origin, destination = route.split("-")
        for i in range(3):
            db.add(
                FareObservation(
                    collection_run_id=f"seed-{month}",
                    origin=origin,
                    destination=destination,
                    route=route,
                    airline="IndiGo",
                    travel_date=day,
                    advance_days=7,
                    base_fare=fare - 500.0,
                    taxes=500.0,
                    fees=0.0,
                    total_fare=fare + i,  # median is fare + 1
                    data_origin="REAL",
                    source="manual-collection",
                    is_valid=True,
                    collected_at=datetime.fromisoformat(f"{day}T10:00:00"),
                )
            )
    await db.flush()


@pytest.mark.asyncio
async def test_monthly_series_base_month_is_100(db):
    routes = COLLECTION_ROUTE_BASKET[:12]
    await _seed_month(db, "2026-08", {r: 5000.0 for r in routes})
    await _seed_month(db, "2026-09", {r: 5500.0 for r in routes})
    series = await monthly_jevons_series(db, ROUTES, "2026-08", "2026-09")
    assert series["status"] == "CALCULATED"
    assert series["base_month"] == "2026-08"
    assert series["values"][0] == {
        "period": "2026-08",
        "index_value": 100.0,
        "n": 12,
        "covered_routes": sorted(routes),
    }
    assert series["values"][1]["period"] == "2026-09"
    assert series["values"][1]["index_value"] == round((5501 / 5001) * 100, 2)


@pytest.mark.asyncio
async def test_monthly_series_reports_missing_months_without_interpolating(db):
    routes = COLLECTION_ROUTE_BASKET[:12]
    await _seed_month(db, "2026-08", {r: 5000.0 for r in routes})
    # September has fares on only 2 corridors — below the 10-corridor gate.
    await _seed_month(db, "2026-09", {r: 5500.0 for r in routes[:2]})
    series = await monthly_jevons_series(db, ROUTES, "2026-08", "2026-09")
    assert series["status"] == "CALCULATED"
    assert [v["period"] for v in series["values"]] == ["2026-08"]
    assert series["months_missing_index"] == ["2026-09"]


@pytest.mark.asyncio
async def test_run_backtest_without_dgca_data_is_honest(db):
    routes = COLLECTION_ROUTE_BASKET[:12]
    await _seed_month(db, "2026-08", {r: 5000.0 for r in routes})
    await _seed_month(db, "2026-09", {r: 5500.0 for r in routes})
    report = await run_backtest(db, ROUTES, [], "2026-08", "2026-09")
    assert report["status"] == "NO_DGCA_DATA"
    assert report["comparison"] is None
    assert report["index"]["status"] == "CALCULATED"
    assert "No DGCA monthly average-fare dataset" in report["message"]


@pytest.mark.asyncio
async def test_run_backtest_compares_mom_changes(db):
    routes = COLLECTION_ROUTE_BASKET[:12]
    await _seed_month(db, "2026-08", {r: 5000.0 for r in routes})
    await _seed_month(db, "2026-09", {r: 5500.0 for r in routes})
    await _seed_month(db, "2026-10", {r: 6300.0 for r in routes})
    dgca = [
        DgcaMonthlyFare("2026-08", 5000.0, "DGCA fixture A"),
        DgcaMonthlyFare("2026-09", 5501.0, "DGCA fixture A"),
        DgcaMonthlyFare("2026-10", 6301.0, "DGCA fixture A"),
    ]
    report = await run_backtest(db, ROUTES, dgca, "2026-08", "2026-10")
    assert report["status"] == "COMPLETED"
    comparison = report["comparison"]
    assert comparison["compared_months"] == ["2026-08", "2026-09", "2026-10"]
    assert comparison["months_missing_dgca"] == []
    # Both series rise ~10% then ~14.5%, so the MoM difference is ~0 and the
    # MoM changes track each other (the two months' changes differ, so the
    # correlation is defined — constant changes have zero variance).
    assert comparison["mean_abs_mom_diff_pct"] is not None
    assert comparison["mean_abs_mom_diff_pct"] < 0.05
    assert comparison["mom_correlation"] is not None
    assert comparison["mom_correlation"] > 0.99


def test_compare_to_dgca_reports_coverage_gaps():
    index_values = [
        {"period": "2026-08", "index_value": 100.0},
        {"period": "2026-09", "index_value": 110.0},
        {"period": "2026-10", "index_value": 105.0},
    ]
    dgca = [
        DgcaMonthlyFare("2026-08", 5000.0, "DGCA fixture A"),
        DgcaMonthlyFare("2026-09", 5500.0, "DGCA fixture A"),
        # October DGCA data missing; November DGCA-only.
        DgcaMonthlyFare("2026-11", 6000.0, "DGCA fixture A"),
    ]
    comparison = compare_to_dgca(index_values, dgca)
    assert comparison["compared_months"] == ["2026-08", "2026-09"]
    assert comparison["months_missing_dgca"] == ["2026-10"]
    assert comparison["months_missing_index"] == ["2026-11"]


def test_load_dgca_fares_csv(tmp_path):
    csv_file = tmp_path / "dgca.csv"
    csv_file.write_text(
        "period,avg_fare_inr,source,source_url\n"
        "2026-09,5500.00,DGCA Monthly Sep 2026,https://example.test/dgca\n"
        "2026-08,5000.00,DGCA Monthly Aug 2026,\n"
        "2026-10,,DGCA Monthly Oct 2026,\n",  # incomplete row: skipped
        encoding="utf-8",
    )
    rows = load_dgca_fares_csv(csv_file)
    assert [r.period for r in rows] == ["2026-08", "2026-09"]
    assert rows[1].avg_fare_inr == 5500.00
    assert rows[1].source_url == "https://example.test/dgca"
    assert rows[0].source_url is None


def test_load_dgca_fares_csv_missing_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_dgca_fares_csv(tmp_path / "does-not-exist.csv")


def test_load_benchmark_csv(tmp_path):
    csv_file = tmp_path / "benchmark.csv"
    csv_file.write_text(
        "period,benchmark,index_value,source,source_url\n"
        f"2026-09,{MOSPI_CPI_BENCHMARK_NAME},106.12,MoSPI CPI Sep 2026,https://example.test/mospi-sep\n"
        f"2026-08,{MOSPI_CPI_BENCHMARK_NAME},105.90,MoSPI CPI Aug 2026,\n"
        "2026-10,Some Other Benchmark,107.00,Wrong benchmark,https://example.test/other\n"  # skipped: wrong benchmark
        f"2026-07,{MOSPI_CPI_BENCHMARK_NAME},,MoSPI CPI Jul 2026,\n",  # incomplete row: skipped
        encoding="utf-8",
    )
    rows = load_benchmark_csv(csv_file)
    assert [r.period for r in rows] == ["2026-08", "2026-09"]
    assert rows[1].value == 106.12
    assert rows[1].benchmark == MOSPI_CPI_BENCHMARK_NAME
    assert rows[1].source_url == "https://example.test/mospi-sep"
    assert rows[0].source_url is None


def test_load_benchmark_csv_missing_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_benchmark_csv(tmp_path / "does-not-exist.csv")


def test_compare_to_benchmark_reports_coverage_gaps():
    index_values = [
        {"period": "2026-08", "index_value": 100.0},
        {"period": "2026-09", "index_value": 110.0},
        {"period": "2026-10", "index_value": 105.0},
    ]
    benchmark = [
        BenchmarkMonthlyValue("2026-08", 105.90, "MoSPI fixture A"),
        BenchmarkMonthlyValue("2026-09", 106.12, "MoSPI fixture A"),
        # October benchmark data missing; November benchmark-only.
        BenchmarkMonthlyValue("2026-11", 106.50, "MoSPI fixture A"),
    ]
    comparison = compare_to_benchmark(index_values, benchmark, MOSPI_CPI_BENCHMARK_NAME)
    assert comparison["benchmark"] == MOSPI_CPI_BENCHMARK_NAME
    assert comparison["compared_months"] == ["2026-08", "2026-09"]
    assert comparison["months_missing_benchmark"] == ["2026-10"]
    assert comparison["months_missing_index"] == ["2026-11"]
    assert "mom_dgca_pct" not in comparison


@pytest.mark.asyncio
async def test_run_backtest_vs_benchmark_without_data_is_honest(db):
    routes = COLLECTION_ROUTE_BASKET[:12]
    await _seed_month(db, "2026-08", {r: 5000.0 for r in routes})
    await _seed_month(db, "2026-09", {r: 5500.0 for r in routes})
    report = await run_backtest_vs_benchmark(
        db, ROUTES, [], MOSPI_CPI_BENCHMARK_NAME, MOSPI_CPI_METHOD, "2026-08", "2026-09"
    )
    assert report["status"] == "NO_BENCHMARK_DATA"
    assert report["comparison"] is None
    assert report["benchmark"] == MOSPI_CPI_BENCHMARK_NAME
    assert report["method"] == MOSPI_CPI_METHOD
    assert report["index"]["status"] == "CALCULATED"
    assert "No MoSPI CPI" in report["message"]


@pytest.mark.asyncio
async def test_run_backtest_vs_benchmark_compares_mom_changes(db):
    routes = COLLECTION_ROUTE_BASKET[:12]
    await _seed_month(db, "2026-08", {r: 5000.0 for r in routes})
    await _seed_month(db, "2026-09", {r: 5500.0 for r in routes})
    await _seed_month(db, "2026-10", {r: 6300.0 for r in routes})
    # Fixture benchmark tracking the same MoM moves as the seeded fares
    # (medians 5001 -> 5501 -> 6301): ~+10% then ~+14.5%.
    benchmark = [
        BenchmarkMonthlyValue("2026-08", 100.00, "MoSPI fixture A"),
        BenchmarkMonthlyValue("2026-09", 110.00, "MoSPI fixture A"),
        BenchmarkMonthlyValue("2026-10", 126.00, "MoSPI fixture A"),
    ]
    report = await run_backtest_vs_benchmark(
        db,
        ROUTES,
        benchmark,
        MOSPI_CPI_BENCHMARK_NAME,
        MOSPI_CPI_METHOD,
        "2026-08",
        "2026-10",
    )
    assert report["status"] == "COMPLETED"
    comparison = report["comparison"]
    assert comparison["benchmark"] == MOSPI_CPI_BENCHMARK_NAME
    assert comparison["compared_months"] == ["2026-08", "2026-09", "2026-10"]
    assert comparison["months_missing_benchmark"] == []
    assert comparison["mean_abs_mom_diff_pct"] is not None
    assert comparison["mean_abs_mom_diff_pct"] < 0.05
    assert comparison["mom_correlation"] is not None
    assert comparison["mom_correlation"] > 0.99


def test_shipped_mospi_csv_has_verified_months():
    """Pin the shipped MoSPI CPI Transport values against accidental edits.

    These are REAL published values from the MoSPI CPI press releases
    (Annexure I, Division 07 Transport, All-India Combined, base 2024=100).
    See backend/data/mospi_cpi_transport.README.md for the sources and
    cross-checks. Update this test only when appending a newly released
    month from its official press release.
    """
    csv_path = Path(__file__).resolve().parents[1] / "data" / "mospi_cpi_transport.csv"
    rows = load_benchmark_csv(csv_path)
    expected = {
        "2026-01": 100.64,
        "2026-02": 100.69,
        "2026-03": 100.73,
        "2026-04": 100.84,
        "2026-05": 102.73,
        "2026-06": 105.45,
        "2026-07": 105.63,
        "2026-08": 105.90,
        "2026-09": 106.12,
        "2026-10": 106.31,
    }
    assert [r.period for r in rows] == sorted(expected)
    assert len(rows) == 10
    for row in rows:
        assert row.value == expected[row.period]
        assert row.benchmark == MOSPI_CPI_BENCHMARK_NAME
        assert row.source.strip()
        assert row.source_url and row.source_url.startswith("https://")
