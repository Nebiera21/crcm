import uuid
from datetime import datetime
from pydantic import BaseModel


class AuditLogItem(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    username: str | None
    action: str
    resource_type: str
    resource_id: str
    detail: dict
    ip_address: str | None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogItem]
    total: int
