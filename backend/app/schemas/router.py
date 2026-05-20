import uuid
import ipaddress
from datetime import datetime
from pydantic import BaseModel, field_validator

_SNMP_VERSIONS = {"v1", "v2c", "v3"}
_AUTH_PROTOCOLS = {"MD5", "SHA", "SHA224", "SHA256", "SHA384", "SHA512"}
_PRIV_PROTOCOLS = {"DES", "AES", "AES128", "AES192", "AES256"}
_SECURITY_LEVELS = {"noAuthNoPriv", "authNoPriv", "authPriv"}


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

    # SNMP
    snmp_community: str | None = None
    snmp_version: str = "v2c"
    snmp_v3_username: str | None = None
    snmp_v3_auth_protocol: str | None = None
    snmp_v3_auth_password: str | None = None   # write-only, not stored (encrypted by API)
    snmp_v3_priv_protocol: str | None = None
    snmp_v3_priv_password: str | None = None   # write-only, not stored (encrypted by API)
    snmp_v3_security_level: str | None = None

    notes: str | None = None
    credential_id: uuid.UUID | None = None
    wan_ip_address: str | None = None
    wan_ssh_port: int | None = None
    use_wan_ip: bool = False
    wan_interface: str | None = "FastEthernet4"

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

    @field_validator("wan_ip_address", mode="before")
    @classmethod
    def validate_wan_ip(cls, v: str | None) -> str | None:
        if not v or not str(v).strip():
            return None
        return _validate_ip(str(v).strip())

    @field_validator("snmp_version")
    @classmethod
    def validate_snmp_version(cls, v: str) -> str:
        if v not in _SNMP_VERSIONS:
            raise ValueError(f"snmp_version must be one of: {', '.join(sorted(_SNMP_VERSIONS))}")
        return v

    @field_validator("snmp_v3_auth_protocol", mode="before")
    @classmethod
    def validate_auth_proto(cls, v: str | None) -> str | None:
        if v and v.upper() not in _AUTH_PROTOCOLS:
            raise ValueError(f"snmp_v3_auth_protocol must be one of: {', '.join(sorted(_AUTH_PROTOCOLS))}")
        return v.upper() if v else None

    @field_validator("snmp_v3_priv_protocol", mode="before")
    @classmethod
    def validate_priv_proto(cls, v: str | None) -> str | None:
        if v and v.upper() not in _PRIV_PROTOCOLS:
            raise ValueError(f"snmp_v3_priv_protocol must be one of: {', '.join(sorted(_PRIV_PROTOCOLS))}")
        return v.upper() if v else None

    @field_validator("snmp_v3_security_level", mode="before")
    @classmethod
    def validate_sec_level(cls, v: str | None) -> str | None:
        if v and v not in _SECURITY_LEVELS:
            raise ValueError(f"snmp_v3_security_level must be one of: {', '.join(sorted(_SECURITY_LEVELS))}")
        return v


class RouterUpdate(BaseModel):
    hostname: str | None = None
    ip_address: str | None = None
    location: str | None = None
    model: str | None = None
    is_active: bool | None = None

    snmp_community: str | None = None
    snmp_version: str | None = None
    snmp_v3_username: str | None = None
    snmp_v3_auth_protocol: str | None = None
    snmp_v3_auth_password: str | None = None   # write-only
    snmp_v3_priv_protocol: str | None = None
    snmp_v3_priv_password: str | None = None   # write-only
    snmp_v3_security_level: str | None = None

    notes: str | None = None
    credential_id: uuid.UUID | None = None
    wan_ip_address: str | None = None
    wan_ssh_port: int | None = None
    use_wan_ip: bool | None = None
    wan_interface: str | None = None

    @field_validator("ip_address", mode="before")
    @classmethod
    def validate_ip(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return _validate_ip(v)

    @field_validator("wan_ip_address", mode="before")
    @classmethod
    def validate_wan_ip(cls, v: str | None) -> str | None:
        if not v or not str(v).strip():
            return None
        return _validate_ip(str(v).strip())

    @field_validator("snmp_version", mode="before")
    @classmethod
    def validate_snmp_version(cls, v: str | None) -> str | None:
        if v and v not in _SNMP_VERSIONS:
            raise ValueError(f"snmp_version must be one of: {', '.join(sorted(_SNMP_VERSIONS))}")
        return v

    @field_validator("snmp_v3_auth_protocol", mode="before")
    @classmethod
    def validate_auth_proto(cls, v: str | None) -> str | None:
        if v and v.upper() not in _AUTH_PROTOCOLS:
            raise ValueError(f"snmp_v3_auth_protocol must be one of: {', '.join(sorted(_AUTH_PROTOCOLS))}")
        return v.upper() if v else None

    @field_validator("snmp_v3_priv_protocol", mode="before")
    @classmethod
    def validate_priv_proto(cls, v: str | None) -> str | None:
        if v and v.upper() not in _PRIV_PROTOCOLS:
            raise ValueError(f"snmp_v3_priv_protocol must be one of: {', '.join(sorted(_PRIV_PROTOCOLS))}")
        return v.upper() if v else None

    @field_validator("snmp_v3_security_level", mode="before")
    @classmethod
    def validate_sec_level(cls, v: str | None) -> str | None:
        if v and v not in _SECURITY_LEVELS:
            raise ValueError(f"snmp_v3_security_level must be one of: {', '.join(sorted(_SECURITY_LEVELS))}")
        return v


class RouterResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    hostname: str
    ip_address: str
    location: str | None
    model: str | None
    is_active: bool
    snmp_community: str | None
    snmp_version: str
    snmp_v3_username: str | None
    snmp_v3_auth_protocol: str | None
    snmp_v3_priv_protocol: str | None
    snmp_v3_security_level: str | None
    notes: str | None
    credential_id: uuid.UUID | None
    wan_ip_address: str | None
    wan_ssh_port: int | None
    use_wan_ip: bool
    wan_interface: str | None
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
