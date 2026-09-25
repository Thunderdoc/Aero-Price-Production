import pytest

from app.collectors.aggregators.googleflights_worker import GoogleFlightsWorkerAdapter


def test_worker_is_disabled_without_explicit_command(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.GOOGLEFLIGHTS_WORKER_COMMAND", "")
    result = __import__("asyncio").run(
        GoogleFlightsWorkerAdapter().collect("DEL-BOM", "2026-10-16", 21, "run")
    )
    assert result.status == "NOT_CONFIGURED"
    assert result.records == []


def test_record_rejects_non_inr_or_missing_airline():
    assert GoogleFlightsWorkerAdapter._record(
        {"price": 5000, "currency": "USD", "airlines": ["IndiGo"]},
        "DEL", "BOM", "DEL-BOM", "2026-10-16", 21,
    ) is None
    assert GoogleFlightsWorkerAdapter._record(
        {"price": 5000, "currency": "INR", "airlines": []},
        "DEL", "BOM", "DEL-BOM", "2026-10-16", 21,
    ) is None


def test_record_preserves_only_returned_optional_fields():
    record = GoogleFlightsWorkerAdapter._record(
        {"price": 5184, "currency": "INR", "airlines": ["IndiGo"],
         "stops": 0, "departure": "2026-10-16 08:00"},
        "DEL", "BOM", "DEL-BOM", "2026-10-16", 21,
    )
    assert record is not None
    assert record.total_fare == 5184
    assert record.flight_number is None
    assert record.arrival_time is None
    assert record.data_origin == "REAL"
