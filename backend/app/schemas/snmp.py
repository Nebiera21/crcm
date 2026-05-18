import uuid
from datetime import datetime
from pydantic import BaseModel


class SNMPPollRequest(BaseModel):
    router_id: uuid.UUID


class SNMPMetrics(BaseModel):
    router_id: uuid.UUID
    hostname: str
    ip_address: str
    community: str
    reachable: bool
    sys_descr: str | None
    sys_name: str | None
    uptime_seconds: int | None
    cpu_5min_percent: int | None
    mem_free_bytes: int | None
    if_number: int | None
    error: str | None
    polled_at: datetime
