"""
Collection orchestration tests: run lifecycle, stale-RUNNING reaper, run lock.

Uses stub adapters (no network, no provider credentials). The reaper and the
run lock are Phase 2's fix for audit findings B2/B3 — these tests pin their
behaviour so a regression fails here first.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.collectors.base import CollectionResult, FareRecord, FareSourceAdapter
from app.models.collection import CollectionRun
from app.models.fare import FareObservation
from app.services import collector as collector_mod
from app.services.collector import (
    CollectionLockedError,
    _acquire_run_lock,
    reap_stale_runs,
    run_collection,
)


class StubSuccessAdapter(FareSourceAdapter):
    """Returns one valid PUBLIC_INTERFACE fare per call."""

    source_id = "stub-success"
    source_name = "Stub Success"
    source_type = "PUBLIC_INTERFACE"

    async def collect(self, route, travel_date, advance_days, collection_run_id):
        origin, destination = route.split("-")
        return CollectionResult(
            source_id=self.source_id,
            route=route,
            travel_date=travel_date,
            advance_days=advance_days,
            status="SUCCESS",
            records=[
                FareRecord(
                    origin=origin,
                    destination=destination,
                    route=route,
                    airline="IndiGo",
                    travel_date=travel_date,
                    advance_days=advance_days,
                    base_fare=4000.0,
                    taxes=500.0,
                    fees=0.0,
                    total_fare=4500.0,
                    data_origin="PUBLIC_INTERFACE",
                    source=self.source_id,
                )
            ],
        )


class StubChallengeAdapter(FareSourceAdapter):
    """Always challenge-detected — produces no records."""

    source_id = "stub-challenge"
    source_name = "Stub Challenge"
    source_type = "AIRLINE_DIRECT"

    async def collect(self, route, travel_date, advance_days, collection_run_id):
        return CollectionResult(
            source_id=self.source_id,
            route=route,
            travel_date=travel_date,
            advance_days=advance_days,
            status="CHALLENGE_DETECTED",
            challenge_reason="Test stub is always blocked",
        )


@pytest.mark.asyncio
async def test_run_lifecycle_completes_and_stores_observations(db, monkeypatch):
    monkeypatch.setattr(collector_mod, "_make_adapters", lambda: [StubSuccessAdapter()])
    run_id = await run_collection(
        db, triggered_by="test", routes=["DEL-BOM"], advance_windows=[7],
        publish_index_after=False,
    )
    run = await db.scalar(select(CollectionRun).where(CollectionRun.run_id == run_id))
    assert run is not None
    assert run.status == "COMPLETED"
    assert run.ended_at is not None
    assert run.routes_planned == 1
    assert run.routes_done == 1
    assert run.observations_collected == 1
    obs = await db.scalars(
        select(FareObservation).where(FareObservation.collection_run_id == run_id)
    )
    rows = obs.all()
    assert len(rows) == 1
    assert rows[0].data_origin == "PUBLIC_INTERFACE"
    assert rows[0].total_fare == 4500.0


@pytest.mark.asyncio
async def test_run_with_no_data_ends_no_data_not_running(db, monkeypatch):
    monkeypatch.setattr(collector_mod, "_make_adapters", lambda: [StubChallengeAdapter()])
    run_id = await run_collection(
        db, triggered_by="test", routes=["DEL-BOM"], advance_windows=[7],
        publish_index_after=False,
    )
    run = await db.scalar(select(CollectionRun).where(CollectionRun.run_id == run_id))
    assert run.status == "NO_DATA"
    assert run.ended_at is not None
    assert run.observations_collected == 0


@pytest.mark.asyncio
async def test_reaper_marks_only_stale_running_runs_failed(db):
    stale = CollectionRun(
        run_id="stale-run",
        triggered_by="test",
        status="RUNNING",
        started_at=datetime.now(timezone.utc) - timedelta(hours=3),
    )
    fresh = CollectionRun(
        run_id="fresh-run",
        triggered_by="test",
        status="RUNNING",
        started_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    done = CollectionRun(
        run_id="done-run",
        triggered_by="test",
        status="COMPLETED",
        started_at=datetime.now(timezone.utc) - timedelta(hours=5),
        ended_at=datetime.now(timezone.utc) - timedelta(hours=5),
    )
    db.add_all([stale, fresh, done])
    await db.commit()

    reaped = await reap_stale_runs(db, stale_after_minutes=30)
    assert reaped == 1
    await db.refresh(stale)
    await db.refresh(fresh)
    await db.refresh(done)
    assert stale.status == "FAILED"
    assert stale.ended_at is not None
    assert fresh.status == "RUNNING"
    assert done.status == "COMPLETED"


@pytest.mark.asyncio
async def test_run_lock_blocks_second_run_while_one_is_running(db):
    db.add(
        CollectionRun(
            run_id="active-run",
            triggered_by="test",
            status="RUNNING",
            started_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        )
    )
    await db.commit()
    with pytest.raises(CollectionLockedError):
        await _acquire_run_lock(db)
    with pytest.raises(CollectionLockedError):
        await run_collection(db, triggered_by="test", routes=["DEL-BOM"], advance_windows=[7])


@pytest.mark.asyncio
async def test_run_lock_acquires_after_stale_run_is_reaped(db, monkeypatch):
    db.add(
        CollectionRun(
            run_id="stale-run",
            triggered_by="test",
            status="RUNNING",
            started_at=datetime.now(timezone.utc) - timedelta(hours=3),
        )
    )
    await db.commit()
    # The lock call itself reaps stale runs first, so it must succeed.
    await _acquire_run_lock(db, stale_after_minutes=30)
    stale = await db.scalar(select(CollectionRun).where(CollectionRun.run_id == "stale-run"))
    assert stale.status == "FAILED"

    monkeypatch.setattr(collector_mod, "_make_adapters", lambda: [StubSuccessAdapter()])
    run_id = await run_collection(
        db, triggered_by="test", routes=["DEL-BOM"], advance_windows=[7],
        publish_index_after=False,
    )
    run = await db.scalar(select(CollectionRun).where(CollectionRun.run_id == run_id))
    assert run.status == "COMPLETED"
