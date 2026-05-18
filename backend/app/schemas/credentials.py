from datetime import datetime
from pydantic import BaseModel


class CredentialsUpdate(BaseModel):
    username: str
    password: str
    enable_password: str | None = None


class CredentialsStatus(BaseModel):
    is_configured: bool
    username: str | None = None
    has_enable_password: bool = False
    updated_at: datetime | None = None
