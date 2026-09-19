from pydantic import BaseModel
from typing import Optional


class PaginationParams(BaseModel):
    limit: int = 100
    offset: int = 0


class StatusResponse(BaseModel):
    status: str
    message: Optional[str] = None
    timestamp: Optional[str] = None


class ProvenanceInfo(BaseModel):
    data_origin: str
    source: Optional[str] = None
    collected_at: Optional[str] = None
    collection_run_id: Optional[str] = None
    data_mode: Optional[str] = None
