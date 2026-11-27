import json
from datetime import datetime, timezone

import pytest

from app.api.routes.exports import export_dgca_report
from app.api.routes.historical import historical_summary
from app.models.collection import SourceHealth
from app.models.fare import FareObservation
from app.models.index import IndexObservation


def _fare(identifier, route, amount, origin="PUBLIC_INTERFACE"):
    src, dst = route.split("-")
    return FareObservation(
        observation_id=identifier,
        collection_run_id="test-run",
        origin=src,
        destination=dst,
        route=route,
        airline="IndiGo",
        travel_date="2026-12-01",
        advance_days=7,
        collected_at=datetime(2026, 11, 26, 2, 0, tzinfo=timezone.utc),
        base_fare=amount,
        taxes=0,
        fees=0,
        total_fare=amount,
        currency="INR",
        cabin="ECONOMY",
        source="fast-flights",
        data_origin=origin,
        is_valid=True,
    )


@pytest.mark.asyncio
async def test_dgca_report_combines_index_routes_provenance_and_sources(db):
    db.add_all([
        _fare("one", "DEL-BOM", 7000),
        _fare("two", "DEL-BOM", 9000),
        _fare("hist", "DEL-BLR", 5000, origin="HISTORICAL_PUBLIC"),
        IndexObservation(
            publication_id="pub-1",
            observation_period="2026-11-26",
            index_value=109.77,
            status="PUBLISHED",
            route_count=12,
            coverage_pct=63.2,
            method="JEVONS",
            index_version="v1",
            data_origin="PUBLIC_INTERFACE",
        ),
        SourceHealth(
            source_id="fast-flights",
            source_name="Fast Flights",
            source_type="AGGREGATOR",
            enabled=True,
            status="LIVE",
            last_success=datetime(2026, 11, 26, 2, 0, tzinfo=timezone.utc),
            records_total=2,
        ),
    ])
    await db.commit()

    response = await export_dgca_report(fmt="json", current_user={}, db=db)
    report = json.loads(response.body)

    assert report["index_history"][0]["index_value"] == 109.77
    evidence = {row["route"]: row for row in report["route_evidence"]}
    assert evidence["DEL-BOM"]["median_fare"] == 8000
    assert evidence["DEL-BOM"]["data_origin"] == "PUBLIC_INTERFACE"
    assert "DEL-BLR" not in evidence  # historical rows never feed live evidence
    provenance = {row["data_origin"]: row["records"] for row in report["provenance_counts"]}
    assert provenance["PUBLIC_INTERFACE"] == 2
    assert report["source_health"][0]["status"] == "LIVE"
    assert "NO_DGCA_DATA" in report["benchmark_note"]


@pytest.mark.asyncio
async def test_historical_summary_includes_route_breakdown(db):
    db.add_all([
        _fare("h1", "DEL-BOM", 4000, origin="HISTORICAL_PUBLIC"),
        _fare("h2", "DEL-BOM", 6000, origin="HISTORICAL_PUBLIC"),
        _fare("h3", "DEL-BLR", 7000, origin="HISTORICAL_PUBLIC"),
    ])
    await db.commit()

    result = await historical_summary(db=db, _={})

    assert result["status"] == "READY"
    routes = {row["route"]: row for row in result["routes"]}
    assert routes["DEL-BOM"]["records"] == 2
    assert routes["DEL-BOM"]["average_fare"] == 5000
    assert routes["DEL-BLR"]["max_fare"] == 7000
