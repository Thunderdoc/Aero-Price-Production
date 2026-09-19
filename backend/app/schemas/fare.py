from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class FareObservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    observation_id: str
    collection_run_id: Optional[str] = None
    route: str
    origin: str
    destination: str
    airline: str
    flight_number: Optional[str] = None
    travel_date: str
    advance_days: int
    fare_family: Optional[str] = None
    cabin: str
    stops: int = 0
    base_fare: float
    taxes: float
    fees: Optional[float] = None
    total_fare: float
    currency: str = "INR"
    availability_status: Optional[str] = None
    source: str
    data_origin: str
    quality_flags: Optional[List[str]] = None
    is_valid: bool = True
    collected_at: Optional[datetime] = None


class FaresListResponse(BaseModel):
    total: int
    offset: int
    limit: int
    status: str
    data_origin: str
    message: Optional[str] = None
    observations: List[FareObservationOut]


class WindowSummary(BaseModel):
    median: Optional[float]
    min: Optional[float]
    max: Optional[float]
    count: int
    data_origin: str
    status: str


class RouteFareSummaryResponse(BaseModel):
    route: str
    has_real_data: bool
    timestamp: str
    windows: dict[str, WindowSummary]
