import uuid
from datetime import datetime
from pydantic import BaseModel


class TestConnectionResult(BaseModel):
    success: bool
    message: str
    latency_ms: int | None = None


class CommandRunRequest(BaseModel):
    router_id: uuid.UUID
    commands: list[str]


class CommandRunResponse(BaseModel):
    router_id: uuid.UUID
    hostname: str
    ip_address: str
    results: dict[str, str]
    executed_at: datetime


class BulkCommandRequest(BaseModel):
    router_ids: list[uuid.UUID]
    commands: list[str]


class TaskStatus(BaseModel):
    job_id: str
    state: str
    result: dict | None = None
    error: str | None = None
