"""
Backtest-method tests (backend/app/analytics/backtest.py).

All fares here are TEST FIXTURES seeded into the in-memory DB — they exist
only to verify the method's math and coverage reporting. No real DGCA data
is fabricated: the NO_DGCA_DATA path is tested explicitly.
"""
from datetime import datetime

import pytest

from app.analytics.backtest import (
    DgcaMonthlyFare,
    compare_to_dgca,
    load_dgca_fares_csv,
    monthly_jevons_series,
    run_backtest,
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
