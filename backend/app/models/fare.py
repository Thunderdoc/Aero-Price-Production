"""
Canonical fare observation — one record per observed itinerary per collection run.

data_origin taxonomy:
  REAL           – Collected from a live, authenticated PRODUCTION source.
                   All 5 production conditions must have passed (auth, response,
                   parse, field validation, DB persist). Enters the analytical path.
  SANDBOX_TEST   – Amadeus sandbox or any test-environment response.
                   Same schema as REAL but contains synthetic fares.
                   Stored for pipeline validation; NEVER enters analytical path.
  OFFICIAL       – Fetched from a government/authoritative dataset (DGCA, MoSPI).
                   Enters the analytical path.
  DERIVED        – Computed from REAL or OFFICIAL observations (index, forecasts).
  GENERATED_TEST – Deterministic demo fixtures. Never enters any production path.
"""
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text, Index, func
from app.core.database import Base
from app.models.base import new_uuid


class FareObservation(Base):
    __tablename__ = "fare_observations"

    observation_id    = Column(String(36), primary_key=True, default=new_uuid)
    collection_run_id = Column(String(36), nullable=False, index=True)

    # Route
    origin      = Column(String(3), nullable=False, index=True)
    destination = Column(String(3), nullable=False, index=True)
    route       = Column(String(7), nullable=False, index=True)   # DEL-BOM

    # Flight
    airline        = Column(String(10), nullable=False)
    flight_number  = Column(String(10), nullable=True)
    departure_time = Column(String(5), nullable=True)   # HH:MM
    arrival_time   = Column(String(5), nullable=True)
    stops          = Column(Integer, default=0)

    # Dates
    travel_date    = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    advance_days   = Column(Integer, nullable=False, index=True)     # T+1, T+7...
    collected_at   = Column(DateTime(timezone=True), nullable=False, default=func.now(), index=True)

    # Fare
    fare_family = Column(String(20), nullable=True)   # SAVER, FLEX, BUSINESS
    cabin       = Column(String(10), default="ECONOMY")
    base_fare   = Column(Float, nullable=False)
    taxes       = Column(Float, nullable=False, default=0.0)
    fees        = Column(Float, nullable=False, default=0.0)
    total_fare  = Column(Float, nullable=False)
    currency    = Column(String(3), default="INR")

    # Availability
    availability_status = Column(String(20), default="AVAILABLE")  # AVAILABLE, SOLD_OUT, LIMITED
    seats_available     = Column(Integer, nullable=True)

    # Provenance
    source           = Column(String(50), nullable=False, index=True)
    source_url       = Column(Text, nullable=True)
    data_origin      = Column(String(20), nullable=False, default="GENERATED_TEST")
    collector_version = Column(String(10), nullable=True)
    raw_hash         = Column(String(64), nullable=True)   # SHA-256 of raw payload

    # Quality
    quality_flags = Column(Text, nullable=True)  # JSON array: ["OUTLIER", "LOW_SAMPLE"]
    is_valid      = Column(Boolean, default=True)
    rejection_reason = Column(String(100), nullable=True)

    __table_args__ = (
        Index("ix_fare_route_date", "route", "travel_date"),
        Index("ix_fare_route_advance", "route", "advance_days"),
        Index("ix_fare_collected", "collected_at"),
        Index("ix_fare_origin_dest", "origin", "destination"),
    )


class RawFarePayload(Base):
    """Preserved raw source response for auditability."""
    __tablename__ = "raw_fare_payloads"

    id                = Column(String(36), primary_key=True, default=new_uuid)
    collection_run_id = Column(String(36), nullable=False, index=True)
    source            = Column(String(50), nullable=False)
    route             = Column(String(7), nullable=False)
    travel_date       = Column(String(10), nullable=False)
    advance_days      = Column(Integer, nullable=False)
    collected_at      = Column(DateTime(timezone=True), nullable=False, default=func.now())
    payload_type      = Column(String(10), default="JSON")  # JSON, HTML, XML
    payload           = Column(Text, nullable=True)
    parser_version    = Column(String(10), nullable=True)
    schema_version    = Column(String(10), nullable=True)
    http_status       = Column(Integer, nullable=True)
    latency_ms        = Column(Integer, nullable=True)
