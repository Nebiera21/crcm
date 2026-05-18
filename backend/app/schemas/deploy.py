import uuid
from datetime import datetime
from pydantic import BaseModel, field_validator
from app.models.config_history import DeployStatus


class DeployRequest(BaseModel):
    router_ids: list[uuid.UUID]
    template_id: uuid.UUID | None = None
    rendered_config: str

    @field_validator("router_ids")
    @classmethod
    def at_least_one(cls, v: list) -> list:
        if not v:
            raise ValueError("At least one router must be specified")
        return v

    @field_validator("rendered_config")
    @classmethod
    def config_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("rendered_config cannot be empty")
        return v


class DeployJobResponse(BaseModel):
    job_id: str
    history_ids: list[uuid.UUID]


class RollbackJobResponse(BaseModel):
    job_id: str
    history_id: uuid.UUID


class HistoryListItem(BaseModel):
    id: uuid.UUID
    router_id: uuid.UUID
    router_hostname: str | None
    router_ip: str | None
    template_id: uuid.UUID | None
    deployed_by: uuid.UUID | None
    status: DeployStatus
    job_id: str | None
    deployed_at: datetime
    can_rollback: bool


class HistoryDetail(HistoryListItem):
    rendered_config: str | None
    config_snapshot: str | None
    output: str | None


class HistoryListResponse(BaseModel):
    items: list[HistoryListItem]
    total: int
