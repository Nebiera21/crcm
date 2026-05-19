"""
Periodic monitoring tasks: ping + SNMP traffic polling for all active routers.
Imported by celery_tasks.py so Celery Beat can discover them.
"""
import asyncio
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

from app.config import get_settings
from app.tasks.celery_tasks import celery_app, _celery_session

settings = get_settings()


def _redis_client():
    import redis as redis_lib
    return redis_lib.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def _fetch_monitoring_data() -> tuple:
    """Returns (monitoring_settings_dict, list[Router])."""
    from sqlalchemy import select
    from app.models.router import Router
    from app.models.monitoring_settings import MonitoringSettings

    SessionLocal = _celery_session()

    async def _query():
        async with SessionLocal() as db:
            cfg = (await db.execute(select(MonitoringSettings).where(MonitoringSettings.id == 1))).scalar_one_or_none()
            routers = (await db.execute(
                select(Router).where(Router.is_active == True)  # noqa: E712
            )).scalars().all()
            return cfg, list(routers)

    return asyncio.run(_query())


def _save_ping_results(results: list[dict]) -> None:
    from sqlalchemy import text
    from app.models.ping_result import PingResult

    SessionLocal = _celery_session()

    async def _save():
        async with SessionLocal() as db:
            for r in results:
                db.add(PingResult(
                    id=uuid.uuid4(),
                    router_id=uuid.UUID(r["router_id"]),
                    target=r["target"],
                    latency_ms=r.get("latency_ms"),
                    packet_loss=r.get("packet_loss", 100.0),
                    is_up=r.get("is_up", False),
                ))
            await db.commit()

    asyncio.run(_save())


def _save_traffic_results(results: list[dict]) -> None:
    from app.models.snmp_traffic_metric import SnmpTrafficMetric

    SessionLocal = _celery_session()

    async def _save():
        async with SessionLocal() as db:
            for r in results:
                db.add(SnmpTrafficMetric(
                    id=uuid.uuid4(),
                    router_id=uuid.UUID(r["router_id"]),
                    interface_name=r["interface_name"],
                    bytes_in=r.get("bytes_in"),
                    bytes_out=r.get("bytes_out"),
                    bits_in_per_sec=r.get("bits_in_per_sec"),
                    bits_out_per_sec=r.get("bits_out_per_sec"),
                    if_status=r.get("if_status"),
                ))
            await db.commit()

    asyncio.run(_save())


def _compute_rate(router_id: str, bytes_in: int | None, bytes_out: int | None, rc) -> tuple[float | None, float | None]:
    """
    Compute bits/sec rate from current counters vs previous reading stored in Redis.
    Returns (bits_in_per_sec, bits_out_per_sec). Both None on first reading.
    """
    key = f"nm:traffic:prev:{router_id}"
    now = time.time()

    prev_raw = rc.get(key)
    rate_in: float | None = None
    rate_out: float | None = None

    if prev_raw and bytes_in is not None and bytes_out is not None:
        try:
            prev = json.loads(prev_raw)
            elapsed = now - prev["ts"]
            if 5 <= elapsed <= 120:  # sanity: between 5s and 2min
                d_in = bytes_in - prev["bi"]
                d_out = bytes_out - prev["bo"]
                # Handle 32-bit counter wrap
                if d_in < 0:
                    d_in += 2**32
                if d_out < 0:
                    d_out += 2**32
                rate_in = round((d_in * 8) / elapsed, 2)
                rate_out = round((d_out * 8) / elapsed, 2)
        except (KeyError, TypeError, ValueError):
            pass

    if bytes_in is not None and bytes_out is not None:
        rc.setex(key, 120, json.dumps({"bi": bytes_in, "bo": bytes_out, "ts": now}))

    return rate_in, rate_out


@celery_app.task(bind=True, max_retries=0, name="crcm.poll_all_monitoring")
def poll_all_monitoring(self) -> dict:
    """
    Ping + SNMP traffic poll every active router. Scheduled by Celery Beat every 30s.
    """
    from app.core.ping import ping_host_sync
    from app.core.snmp import snmp_traffic_sync

    cfg, routers = _fetch_monitoring_data()
    if not routers:
        return {"polled": 0}

    ping_enabled = cfg.ping_enabled if cfg else True
    snmp_enabled = cfg.snmp_traffic_enabled if cfg else True

    rc = _redis_client()
    all_ping: list[dict] = []
    all_traffic: list[dict] = []

    def _poll(router) -> tuple[list[dict], dict | None]:
        pings: list[dict] = []
        traffic: dict | None = None

        if ping_enabled:
            lan = ping_host_sync(router.ip_address)
            pings.append({
                "router_id": str(router.id),
                "target": "lan",
                "latency_ms": lan.get("latency_ms"),
                "packet_loss": lan.get("packet_loss", 100.0),
                "is_up": lan.get("is_up", False),
            })
            if router.wan_ip_address:
                wan = ping_host_sync(router.wan_ip_address)
                pings.append({
                    "router_id": str(router.id),
                    "target": "wan",
                    "latency_ms": wan.get("latency_ms"),
                    "packet_loss": wan.get("packet_loss", 100.0),
                    "is_up": wan.get("is_up", False),
                })

        if snmp_enabled and router.snmp_community and router.wan_interface:
            t = snmp_traffic_sync(router.ip_address, router.snmp_community, router.wan_interface)
            if t.get("reachable"):
                traffic = {
                    "router_id": str(router.id),
                    "interface_name": router.wan_interface,
                    "bytes_in": t.get("bytes_in"),
                    "bytes_out": t.get("bytes_out"),
                    "if_status": t.get("if_status"),
                }

        return pings, traffic

    with ThreadPoolExecutor(max_workers=min(20, len(routers))) as pool:
        futures = {pool.submit(_poll, r): r for r in routers}
        for future in as_completed(futures):
            try:
                pings, traffic = future.result()
                all_ping.extend(pings)
                if traffic:
                    # Compute rate using Redis prev values
                    rate_in, rate_out = _compute_rate(
                        traffic["router_id"],
                        traffic.get("bytes_in"),
                        traffic.get("bytes_out"),
                        rc,
                    )
                    traffic["bits_in_per_sec"] = rate_in
                    traffic["bits_out_per_sec"] = rate_out
                    all_traffic.append(traffic)
            except Exception:
                pass

    if all_ping:
        _save_ping_results(all_ping)
    if all_traffic:
        _save_traffic_results(all_traffic)

    return {
        "polled": len(routers),
        "ping_results": len(all_ping),
        "traffic_results": len(all_traffic),
    }


@celery_app.task(bind=True, max_retries=0, name="crcm.cleanup_monitoring_data")
def cleanup_monitoring_data(self) -> dict:
    """
    Delete ping_results and snmp_traffic_metrics older than retention_days.
    Runs hourly.
    """
    from sqlalchemy import delete
    from app.models.monitoring_settings import MonitoringSettings
    from app.models.ping_result import PingResult
    from app.models.snmp_traffic_metric import SnmpTrafficMetric

    SessionLocal = _celery_session()

    async def _cleanup():
        from sqlalchemy import select as _select
        async with SessionLocal() as db:
            cfg = (await db.execute(
                _select(MonitoringSettings).where(MonitoringSettings.id == 1)
            )).scalar_one_or_none()
            retention = cfg.retention_days if cfg else 7
            cutoff = datetime.now() - timedelta(days=retention)

            r1 = await db.execute(delete(PingResult).where(PingResult.timestamp < cutoff))
            r2 = await db.execute(delete(SnmpTrafficMetric).where(SnmpTrafficMetric.timestamp < cutoff))
            await db.commit()
            return r1.rowcount, r2.rowcount

    ping_deleted, traffic_deleted = asyncio.run(_cleanup())
    return {"ping_deleted": ping_deleted, "traffic_deleted": traffic_deleted}
