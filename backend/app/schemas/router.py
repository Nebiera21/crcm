import uuid
import ipaddress
from datetime import datetime
from pydantic import BaseModel, field_validator


def _validate_ip(v: str) -> str:
    try:
        ipaddress.ip_address(v.strip())
    except ValueError:
        raise ValueError(f"Invalid IP address: {v!r}")
    return v.strip()


class RouterCreate(BaseModel):
    hostname: str
    ip_address: str
    location: str | None = None
    model: str | None = None
    is_active: bool = True
    snmp_community: str | None = None
    notes: str | None = None

    @field_validator("hostname")
    @classmethod
    def strip_hostname(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Hostname cannot be empty")
        return v

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        return _validate_ip(v)


class RouterUpdate(BaseModel):
    hostname: str | None = None
    ip_address: str | None = None
    location: str | None = None
    model: str | None = None
    is_active: bool | None = None
    snmp_community: str | None = None
    notes: str | None = None

    @field_validator("ip_address", mode="before")
    @classmethod
    def validate_ip(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _validate_ip(v)


class RouterResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    hostname: str
    ip_address: str
    location: str | None
    model: str | None
    is_active: bool
    snmp_community: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class RouterListResponse(BaseModel):
    items: list[RouterResponse]
    total: int


class RouterStats(BaseModel):
    total: int
    active: int


class ImportResult(BaseModel):
    created: int
    skipped_duplicate: int
    errors: list[str]
