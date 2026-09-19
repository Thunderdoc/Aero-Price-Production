from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text, func
from app.core.database import Base
from app.models.base import new_uuid


class IndexObservation(Base):
    """Computed index value for a given period."""
    __tablename__ = "index_observations"

    id                  = Column(String(36), primary_key=True, default=new_uuid)
    publication_id      = Column(String(36), nullable=False, index=True)
    observation_period  = Column(String(10), nullable=False)  # YYYY-MM-DD
    calculation_ts      = Column(DateTime(timezone=True), nullable=False, default=func.now())

    # Index value
    index_value         = Column(Float, nullable=True)   # None = INSUFFICIENT_DATA
    status              = Column(String(30), default="INSUFFICIENT_DATA")
    # PUBLISHED, INSUFFICIENT_DATA, CALCULATION_ERROR

    # Methodology
    index_version       = Column(String(10), default="v1.0")
    method              = Column(String(30), default="JEVONS_MATCHED_SAMPLE")
    base_period         = Column(String(10), default="2025-01")
    base_value          = Column(Float, default=100.0)

    # Coverage
    route_count         = Column(Integer, default=0)
    observation_count   = Column(Integer, default=0)
    airlines_covered    = Column(Integer, default=0)
    sources_used        = Column(Text, nullable=True)  # JSON

    # Quality
    coverage_pct        = Column(Float, default=0.0)
    data_origin         = Column(String(20), default="GENERATED_TEST")

    # Regional breakdown (stored as JSON)
    regional_breakdown  = Column(Text, nullable=True)


class IndexPublication(Base):
    """Immutable published index snapshot — never modified after publication."""
    __tablename__ = "index_publications"

    publication_id    = Column(String(36), primary_key=True, default=new_uuid)
    published_at      = Column(DateTime(timezone=True), nullable=False, default=func.now())
    period_start      = Column(String(10), nullable=False)
    period_end        = Column(String(10), nullable=False)
    index_version     = Column(String(10), nullable=False)
    methodology_hash  = Column(String(64), nullable=True)  # SHA-256 of methodology config
    fare_count        = Column(Integer, default=0)
    route_count       = Column(Integer, default=0)
    status            = Column(String(30), default="DRAFT")  # DRAFT, PUBLISHED, SUPERSEDED
    published_by      = Column(String(50), nullable=True)
    note              = Column(Text, nullable=True)


class RouteBasket(Base):
    """Configured route basket for index calculation."""
    __tablename__ = "route_basket"

    route_code     = Column(String(7), primary_key=True)  # DEL-BOM
    origin         = Column(String(3), nullable=False)
    destination    = Column(String(3), nullable=False)
    region         = Column(String(30), nullable=False)
    weight         = Column(Float, default=1.0)
    weight_source  = Column(String(50), default="CONFIGURED")  # DGCA_OFFICIAL, CONFIGURED
    dgca_reference = Column(String(50), nullable=True)
    active         = Column(Boolean, default=True)
    effective_from = Column(String(10), nullable=True)
    effective_to   = Column(String(10), nullable=True)
