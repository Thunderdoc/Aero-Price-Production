from types import SimpleNamespace

from app.collectors.aggregators.fast_flights import FastFlightsAdapter


def _flight(price=6913):
    dt1 = SimpleNamespace(date=[2026, 10, 16], time=[5])
    dt2 = SimpleNamespace(date=[2026, 10, 16], time=[7, 25])
    leg = SimpleNamespace(departure=dt1, arrival=dt2, duration=145)
    return SimpleNamespace(price=price, airlines=["Air India"], flights=[leg])


def test_fast_flights_mapping_preserves_real_offer_fields():
    record = FastFlightsAdapter._map_flight(
        _flight(), "DEL", "BOM", "DEL-BOM", "2026-10-16", 21
    )
    assert record is not None
    assert record.total_fare == 6913
    assert record.currency == "INR"
    assert record.airline == "Air India"
    assert record.departure_time == "2026-10-16T05:00:00"
    assert record.arrival_time == "2026-10-16T07:25:00"
    assert record.data_origin == "REAL"
    assert record.raw_hash


def test_fast_flights_mapping_rejects_incomplete_offer():
    assert FastFlightsAdapter._map_flight(
        SimpleNamespace(price=0, airlines=[], flights=[]),
        "DEL", "BOM", "DEL-BOM", "2026-10-16", 21,
    ) is None
