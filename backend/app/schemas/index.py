from pydantic import BaseModel
from typing import Optional, List


class IndexResponse(BaseModel):
    status: str
    index_value: Optional[float] = None
    base_value: Optional[float] = None
    base_period: Optional[str] = None
    n: Optional[int] = None
    required: Optional[int] = None
    covered_routes: Optional[List[str]] = None
    missing_routes: Optional[List[str]] = None
    observation_period: Optional[str] = None
    method: Optional[str] = None
    version: Optional[str] = None
    data_origin: Optional[str] = None
    message: Optional[str] = None
