import uuid
from datetime import datetime
from pydantic import BaseModel


class MonitoringSettingsResponse(BaseModel):
    model_config = {"from_attributes": True}
    retention_days: int
    ping_enabled: bool
    snmp_traffic_enabled: bool
    updated_at: datetime


class MonitoringSettingsUpdate(BaseModel):
    retention_days: int | None = None
    ping_enabled: bool | None = None
    snmp_traffic_enabled: bool | None = None


class LatestPing(BaseModel):
    target: str
    latency_ms: float | None
    packet_loss: float
    is_up: bool
    timestamp: datetime


class LatestTraffic(BaseModel):
    interface_name: str
    bits_in_per_sec: float | None
    bits_out_per_sec: float | None
    if_status: str | None
    timestamp: datetime


class RouterStatus(BaseModel):
    router_id: str
    hostname: str
    ip_address: str
    wan_ip_address: str | None
    wan_interface: str | None
    snmp_version: str
    has_snmp: bool
    location: str | None
    lan_ping: LatestPing | None
    wan_ping: LatestPing | None
    traffic: LatestTraffic | None


class RouterStatusList(BaseModel):
    routers: list[RouterStatus]
    total: int


class PingPoint(BaseModel):
    timestamp: datetime
    target: str
    latency_ms: float | None
    packet_loss: float
    is_up: bool


class TrafficPoint(BaseModel):
    timestamp: datetime
    bits_in_per_sec: float | None
    bits_out_per_sec: float | None
    if_status: str | None


class AggregatePoint(BaseModel):
    timestamp: datetime
    total_bits_in: float
    total_bits_out: float
    router_count: int
