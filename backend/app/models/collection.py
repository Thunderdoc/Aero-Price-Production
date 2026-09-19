from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text, func
from app.core.database import Base
from app.models.base import new_uuid


class CollectionRun(Base):
    """One scheduled or manual collection attempt."""
    __tablename__ = "collection_runs"

    run_id         = Column(String(36), primary_key=True, default=new_uuid)
    started_at     = Column(DateTime(timezone=True), nullable=False, default=func.now())
    ended_at       = Column(DateTime(timezone=True), nullable=True)
    status         = Column(String(20), default="RUNNING")   # RUNNING, COMPLETED, PARTIAL, FAILED
    triggered_by   = Column(String(50), default="scheduler") # scheduler, admin, manual
    routes_planned = Column(Integer, default=0)
    routes_done    = Column(Integer, default=0)
    sources_used   = Column(Text, nullable=True)    # JSON list
    observations_collected = Column(Integer, default=0)
    observations_rejected  = Column(Integer, default=0)
    error_summary  = Column(Text, nullable=True)    # JSON


class SourceHealth(Base):
    """Live source status — one row per source, upserted each run."""
    __tablename__ = "source_health"

    source_id          = Column(String(50), primary_key=True)
    source_name        = Column(String(100), nullable=False)
    source_type        = Column(String(30), nullable=False)  # AIRLINE_DIRECT, GOV, AGGREGATOR
    enabled            = Column(Boolean, default=False)
    status             = Column(String(30), default="NOT_CONFIGURED")
    # LIVE, DEGRADED, STALE, OFFLINE, CHALLENGE_DETECTED, INSUFFICIENT_DATA, NOT_CONFIGURED
    last_attempt       = Column(DateTime(timezone=True), nullable=True)
    last_success       = Column(DateTime(timezone=True), nullable=True)
    last_failure       = Column(DateTime(timezone=True), nullable=True)
    failure_reason     = Column(Text, nullable=True)
    latency_ms_avg     = Column(Float, nullable=True)
    records_total      = Column(Integer, default=0)
    records_rejected   = Column(Integer, default=0)
    quota_used         = Column(Integer, default=0)
    auth_status        = Column(String(30), default="NOT_CONFIGURED")
    # NOT_CONFIGURED, CONFIGURED, VALID, INVALID, CHALLENGE_DETECTED
    freshness_minutes  = Column(Integer, nullable=True)
    challenge_reason   = Column(Text, nullable=True)   # Why CHALLENGE_DETECTED
    updated_at         = Column(DateTime(timezone=True), nullable=False, default=func.now(), onupdate=func.now())
