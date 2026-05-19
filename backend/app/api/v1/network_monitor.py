import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_admin
from app.database import get_db
from app.models.monitoring_settings import MonitoringSettings
from app.models.ping_result import PingResult
from app.models.router import Router
from app.models.snmp_traffic_metric import SnmpTrafficMetric
from app.models.user import User
from app.schemas.network_monitor import (
    AggregatePoint,
    LatestPing,
    LatestTraffic,
    MonitoringSettingsResponse,
    MonitoringSettingsUpdate,
    PingPoint,
    RouterStatus,
    RouterStatusList,
    TrafficPoint,
)

router = APIRouter()

_VALID_HOURS = {1, 6, 24}


async def _get_or_create_settings(db: AsyncSession) -> MonitoringSettings:
    s = (await db.execute(select(MonitoringSettings).where(MonitoringSettings.id == 1))).scalar_one_or_none()
    if not s:
        s = MonitoringSettings(id=1)
        db.add(s)
        await db.flush()
    return s


# ── Settings ──────────────────────────────────────────────────────────────────

@router.get("/settings", response_model=MonitoringSettingsResponse)
async def get_settings(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MonitoringSettings:
    return await _get_or_create_settings(db)


@router.put("/settings", response_model=MonitoringSettingsResponse)
async def update_settings(
    body: MonitoringSettingsUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> MonitoringSettings:
    s = await _get_or_create_settings(db)
    if body.retention_days is not None:
        if body.retention_days < 1 or body.retention_days > 90:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="retention_days must be 1–90")
        s.retention_days = body.retention_days
    if body.ping_enabled is not None:
        s.ping_enabled = body.ping_enabled
    if body.snmp_traffic_enabled is not None:
        s.snmp_traffic_enabled = body.snmp_traffic_enabled
    db.add(s)
    return s


# ── Current status (all routers) ──────────────────────────────────────────────

@router.get("/status", response_model=RouterStatusList)
async def get_status(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RouterStatusList:
    routers = (await db.execute(
        select(Router).where(Router.is_active == True).order_by(Router.hostname)  # noqa: E712
    )).scalars().all()

    if not routers:
        return RouterStatusList(routers=[], total=0)

    router_ids = [r.id for r in routers]

    # Latest ping per (router_id, target) using DISTINCT ON
    latest_ping_rows = (await db.execute(
        text("""
            SELECT DISTINCT ON (router_id, target)
                router_id, target, latency_ms, packet_loss, is_up, timestamp
            FROM ping_results
            WHERE router_id = ANY(:ids)
            ORDER BY router_id, target, timestamp DESC
        """),
        {"ids": router_ids},
    )).mappings().all()

    ping_map: dict[tuple, LatestPing] = {}
    for row in latest_ping_rows:
        key = (str(row["router_id"]), row["target"])
        ping_map[key] = LatestPing(
            target=row["target"],
            latency_ms=row["latency_ms"],
            packet_loss=row["packet_loss"],
            is_up=row["is_up"],
            timestamp=row["timestamp"],
        )

    # Latest traffic per router_id using DISTINCT ON
    latest_traffic_rows = (await db.execute(
        text("""
            SELECT DISTINCT ON (router_id)
                router_id, interface_name, bits_in_per_sec, bits_out_per_sec, if_status, timestamp
            FROM snmp_traffic_metrics
            WHERE router_id = ANY(:ids)
            ORDER BY router_id, timestamp DESC
        """),
        {"ids": router_ids},
    )).mappings().all()

    traffic_map: dict[str, LatestTraffic] = {}
    for row in latest_traffic_rows:
        traffic_map[str(row["router_id"])] = LatestTraffic(
            interface_name=row["interface_name"],
            bits_in_per_sec=row["bits_in_per_sec"],
            bits_out_per_sec=row["bits_out_per_sec"],
            if_status=row["if_status"],
            timestamp=row["timestamp"],
        )

    result_list = []
    for r in routers:
        rid = str(r.id)
        result_list.append(RouterStatus(
            router_id=rid,
            hostname=r.hostname,
            ip_address=r.ip_address,
            wan_ip_address=r.wan_ip_address,
            wan_interface=r.wan_interface,
            has_snmp=bool(r.snmp_community),
            location=r.location,
            lan_ping=ping_map.get((rid, "lan")),
            wan_ping=ping_map.get((rid, "wan")),
            traffic=traffic_map.get(rid),
        ))

    return RouterStatusList(routers=result_list, total=len(result_list))


# ── Ping history ──────────────────────────────────────────────────────────────

@router.get("/ping/{router_id}", response_model=list[PingPoint])
async def get_ping_history(
    router_id: uuid.UUID,
    hours: int = Query(1, ge=1, le=24),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PingPoint]:
    since = datetime.now() - timedelta(hours=hours)
    rows = (await db.execute(
        select(PingResult)
        .where(PingResult.router_id == router_id, PingResult.timestamp >= since)
        .order_by(PingResult.timestamp)
    )).scalars().all()
    return [
        PingPoint(
            timestamp=r.timestamp,
            target=r.target,
            latency_ms=r.latency_ms,
            packet_loss=r.packet_loss,
            is_up=r.is_up,
        )
        for r in rows
    ]


# ── Traffic history (single router) ──────────────────────────────────────────

@router.get("/traffic/{router_id}", response_model=list[TrafficPoint])
async def get_traffic_history(
    router_id: uuid.UUID,
    hours: int = Query(1, ge=1, le=24),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TrafficPoint]:
    since = datetime.now() - timedelta(hours=hours)
    rows = (await db.execute(
        select(SnmpTrafficMetric)
        .where(SnmpTrafficMetric.router_id == router_id, SnmpTrafficMetric.timestamp >= since)
        .order_by(SnmpTrafficMetric.timestamp)
    )).scalars().all()
    return [
        TrafficPoint(
            timestamp=r.timestamp,
            bits_in_per_sec=r.bits_in_per_sec,
            bits_out_per_sec=r.bits_out_per_sec,
            if_status=r.if_status,
        )
        for r in rows
    ]


# ── Aggregate traffic (all routers summed per minute) ────────────────────────

@router.get("/traffic/aggregate", response_model=list[AggregatePoint])
async def get_aggregate_traffic(
    hours: int = Query(1, ge=1, le=24),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[AggregatePoint]:
    since = datetime.now() - timedelta(hours=hours)
    rows = (await db.execute(
        text("""
            SELECT
                date_trunc('minute', timestamp) AS time_bucket,
                SUM(bits_in_per_sec) AS total_in,
                SUM(bits_out_per_sec) AS total_out,
                COUNT(DISTINCT router_id) AS router_count
            FROM snmp_traffic_metrics
            WHERE timestamp >= :since
              AND bits_in_per_sec IS NOT NULL
            GROUP BY time_bucket
            ORDER BY time_bucket
        """),
        {"since": since},
    )).mappings().all()

    return [
        AggregatePoint(
            timestamp=row["time_bucket"],
            total_bits_in=float(row["total_in"] or 0),
            total_bits_out=float(row["total_out"] or 0),
            router_count=int(row["router_count"] or 0),
        )
        for row in rows
    ]
