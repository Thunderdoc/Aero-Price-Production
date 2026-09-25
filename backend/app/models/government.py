from sqlalchemy import Column, String, Float, Integer, DateTime, Text, UniqueConstraint, func
from app.core.database import Base
from app.models.base import new_uuid


class GovDataset(Base):
    """Registry of government data sources and their last retrieval status."""
    __tablename__ = "gov_datasets"

    dataset_id      = Column(String(50), primary_key=True)
    source_name     = Column(String(100), nullable=False)
    organization    = Column(String(100), nullable=False)
    access_type     = Column(String(20), default="PUBLIC")
    api_key_required = Column(String(5), default="NO")
    format          = Column(String(10), default="HTML")
    status          = Column(String(30), default="NOT_CONFIGURED")
    source_url      = Column(Text, nullable=True)
    last_retrieved  = Column(DateTime(timezone=True), nullable=True)
    last_attempt    = Column(DateTime(timezone=True), nullable=True)
    record_count    = Column(Integer, nullable=True)
    checksum        = Column(String(64), nullable=True)
    reference_period = Column(String(20), nullable=True)
    failure_reason  = Column(Text, nullable=True)
    updated_at      = Column(DateTime(timezone=True), nullable=False, default=func.now())


class DgcaMonthlyRecord(Base):
    """DGCA monthly domestic passenger traffic."""
    __tablename__ = "dgca_monthly"

    id                   = Column(String(36), primary_key=True, default=new_uuid)
    month                = Column(Integer, nullable=False)
    year                 = Column(Integer, nullable=False)
    domestic_passengers  = Column(Integer, nullable=False)
    international_passengers = Column(Integer, default=0)
    retrieved_at         = Column(DateTime(timezone=True), nullable=False, default=func.now())
    source               = Column(String(10), default="OFFICIAL")


class MospiCpiRecord(Base):
    """MoSPI CPI Transport sub-index."""
    __tablename__ = "mospi_cpi"

    id              = Column(String(36), primary_key=True, default=new_uuid)
    period          = Column(String(7), nullable=False)   # YYYY-MM
    cpi_transport   = Column(Float, nullable=False)
    cpi_general     = Column(Float, nullable=True)
    retrieved_at    = Column(DateTime(timezone=True), nullable=False, default=func.now())
    source          = Column(String(10), default="OFFICIAL")


class MospiTransportSeries(Base):
    """Publisher values kept separate across CPI base years and definitions."""
    __tablename__ = "mospi_transport_series"
    __table_args__ = (UniqueConstraint("base_year", "period", name="uq_mospi_transport_base_period"),)

    id = Column(String(36), primary_key=True, default=new_uuid)
    base_year = Column(Integer, nullable=False)
    period = Column(String(7), nullable=False)
    value = Column(Float, nullable=False)
    definition = Column(String(80), nullable=False)
    series = Column(String(20), nullable=False)
    publisher_status = Column(String(10), nullable=True)
    source_url = Column(Text, nullable=False)
    retrieved_at = Column(DateTime(timezone=True), nullable=False, default=func.now())


class PpacAtfRecord(Base):
    """Official PPAC ATF export-duty observations.

    This is deliberately a duty series, not a retail/airport fuel-price
    series. Keeping the measure explicit prevents it being used as a false
    proxy for ticket prices or current ATF quotes.
    """
    __tablename__ = "ppac_atf_records"
    __table_args__ = (UniqueConstraint("effective_date", name="uq_ppac_atf_effective_date"),)

    id = Column(String(36), primary_key=True, default=new_uuid)
    effective_date = Column(String(10), nullable=False)
    atf_export_duty_per_litre = Column(Float, nullable=True)
    unit = Column(String(20), nullable=False, default="INR_PER_LITRE")
    measure = Column(String(40), nullable=False, default="ATF_EXPORT_DUTY")
    source_url = Column(Text, nullable=False)
    retrieved_at = Column(DateTime(timezone=True), nullable=False, default=func.now())


class DataGovAviationRecord(Base):
    """Raw records imported from a configured data.gov.in resource API."""
    __tablename__ = "datagov_aviation_records"
    __table_args__ = (UniqueConstraint("resource_id", "record_hash", name="uq_datagov_resource_record"),)

    id = Column(String(36), primary_key=True, default=new_uuid)
    resource_id = Column(String(120), nullable=False)
    record_hash = Column(String(64), nullable=False)
    record_json = Column(Text, nullable=False)
    source_url = Column(Text, nullable=False)
    retrieved_at = Column(DateTime(timezone=True), nullable=False, default=func.now())


class DgcaCircular(Base):
    """DGCA circulars and press releases."""
    __tablename__ = "dgca_circulars"

    id           = Column(String(36), primary_key=True, default=new_uuid)
    title        = Column(Text, nullable=False)
    date         = Column(String(10), nullable=False)
    category     = Column(String(30), nullable=True)
    url          = Column(Text, nullable=True)
    retrieved_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
