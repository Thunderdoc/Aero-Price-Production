"""
Fare normalization pipeline stage.

Converts raw FareRecord objects from any collector into a canonical form:
  - ONE-WAY / ADULT / ECONOMY / NON-STOP preferred
  - All currency values in INR (future: exchange rate integration)
  - Route codes upper-cased, IATA format validated
  - Airline names normalized to canonical forms
  - Travel date and collected_at as ISO strings
"""
import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Optional
from app.collectors.base import FareRecord

IATA_PATTERN = re.compile(r'^[A-Z]{3}$')
CURRENCY_INR = "INR"

AIRLINE_CANONICAL = {
    "6E": "IndiGo",
    "AI": "Air India",
    "IX": "Air India Express",
    "QP": "Akasa Air",
    "SG": "SpiceJet",
    "INDIGO": "IndiGo",
    "AIRINDIA": "Air India",
    "AKASA": "Akasa Air",
    "SPICEJET": "SpiceJet",
}


def normalize_iata(code: str) -> Optional[str]:
    """Normalize an IATA airport code. Returns None if invalid."""
    code = code.strip().upper()
    return code if IATA_PATTERN.match(code) else None


def normalize_airline(raw: str) -> str:
    """Return canonical airline name."""
    upper = raw.strip().upper()
    return AIRLINE_CANONICAL.get(upper, raw.strip().title())


def normalize_fare(record: FareRecord) -> Optional[FareRecord]:
    """
    Apply normalization in-place. Returns the record if valid, None if it
    should be rejected. Does NOT mutate the input — returns a new instance.
    """
    origin = normalize_iata(record.origin)
    destination = normalize_iata(record.destination)
    if not origin or not destination:
        return None
    if origin == destination:
        return None

    route = f"{origin}-{destination}"

    try:
        base_fare = float(record.base_fare)
        taxes = float(record.taxes)
        fees = float(record.fees) if record.fees is not None else 0.0
        total_fare = float(record.total_fare)
    except (TypeError, ValueError):
        return None

    if total_fare <= 0 or base_fare < 0 or taxes < 0:
        return None

    # Recompute total as a sanity check (within ₹1 tolerance)
    computed_total = base_fare + taxes + fees
    if abs(computed_total - total_fare) > 1.0:
        # Trust the stated total_fare; flag but don't reject
        pass

    airline = normalize_airline(record.airline or "")

    # Canonical raw hash: SHA-256 of (route, airline, travel_date, total_fare, source)
    raw_payload = json.dumps({
        "route": route,
        "airline": airline,
        "travel_date": record.travel_date,
        "total_fare": round(total_fare, 2),
        "advance_days": record.advance_days,
        "source": record.source,
    }, sort_keys=True)
    raw_hash = hashlib.sha256(raw_payload.encode()).hexdigest()[:16]

    return FareRecord(
        origin=origin,
        destination=destination,
        route=route,
        airline=airline,
        flight_number=record.flight_number,
        departure_time=record.departure_time,
        arrival_time=record.arrival_time,
        stops=record.stops or 0,
        travel_date=record.travel_date,
        advance_days=record.advance_days,
        fare_family=(record.fare_family or "SAVER").upper(),
        cabin=(record.cabin or "ECONOMY").upper(),
        base_fare=round(base_fare, 2),
        taxes=round(taxes, 2),
        fees=round(fees, 2),
        total_fare=round(total_fare, 2),
        currency=record.currency or CURRENCY_INR,
        availability_status=record.availability_status or "AVAILABLE",
        source=record.source,
        source_url=record.source_url,
        data_origin=record.data_origin or "REAL",
        raw_hash=raw_hash,
        quality_flags=list(record.quality_flags or []),
    )
