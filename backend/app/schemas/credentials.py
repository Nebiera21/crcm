import uuid
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


class SshCredentialCreate(BaseModel):
    name: str
    username: str
    password: str
    enable_password: str | None = None


class SshCredentialUpdate(BaseModel):
    name: str | None = None
    username: str | None = None
    password: str | None = None
    enable_password: str | None = None


class SshCredentialItem(BaseModel):
    id: uuid.UUID
    name: str
    username: str
    has_enable_password: bool
    router_count: int
    created_at: datetime
    updated_at: datetime


class SshCredentialList(BaseModel):
    items: list[SshCredentialItem]
    total: int
