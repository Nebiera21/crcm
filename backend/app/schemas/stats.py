import uuid
from datetime import datetime
from pydantic import BaseModel
from app.models.config_history import DeployStatus


class RecentDeployItem(BaseModel):
    id: uuid.UUID
    router_hostname: str | None
    router_ip: str | None
    status: DeployStatus
    deployed_at: datetime


class DashboardStats(BaseModel):
    routers_total: int
    routers_active: int
    templates_total: int
    deploys_total: int
    deploys_last_30d: int
    deploys_success_last_30d: int
    deploys_failed_last_30d: int
    recent_deploys: list[RecentDeployItem]
