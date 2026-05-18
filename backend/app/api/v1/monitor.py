import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ssh
from app.core import snmp as snmp_core
from app.core.dependencies import get_current_user, require_operator
from app.database import get_db
from app.models.global_credentials import GlobalCredentials
from app.models.router import Router
from app.models.user import User
from app.schemas.monitor import (
    BulkCommandRequest,
    CommandRunRequest,
    CommandRunResponse,
    TaskStatus,
)
from app.schemas.snmp import SNMPMetrics, SNMPPollRequest

router = APIRouter()


async def _get_device(router_id: uuid.UUID, db: AsyncSession) -> tuple[Router, dict]:
    r = (await db.execute(select(Router).where(Router.id == router_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Router not found")
    if not r.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Router is marked inactive")

    creds = (await db.execute(select(GlobalCredentials).where(GlobalCredentials.id == 1))).scalar_one_or_none()
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No SSH credentials configured. Set them in Admin → Credentials.",
        )

    return r, ssh.build_device_dict(r.ip_address, creds)


@router.get("/commands/available", response_model=list[str])
async def available_commands(_: User = Depends(get_current_user)) -> list[str]:
    return ssh.SHOW_COMMANDS


@router.post("/commands", response_model=CommandRunResponse)
async def run_commands(
    body: CommandRunRequest,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommandRunResponse:
    if not body.commands:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one command is required")

    r, device = await _get_device(body.router_id, db)
    results = await ssh.run_commands(device, body.commands)

    return CommandRunResponse(
        router_id=r.id,
        hostname=r.hostname,
        ip_address=r.ip_address,
        results=results,
        executed_at=datetime.now(timezone.utc),
    )


@router.post("/commands/bulk", response_model=TaskStatus)
async def run_commands_bulk(
    body: BulkCommandRequest,
    _: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
) -> TaskStatus:
    if not body.commands:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one command is required")
    if not body.router_ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one router is required")

    creds = (await db.execute(select(GlobalCredentials).where(GlobalCredentials.id == 1))).scalar_one_or_none()
    if not creds:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No SSH credentials configured")

    from app.tasks.celery_tasks import bulk_show_commands

    task = bulk_show_commands.delay(
        router_ids=[str(rid) for rid in body.router_ids],
        commands=body.commands,
    )
    return TaskStatus(job_id=task.id, state="PENDING")


# Static path must come before any /{id} patterns — no conflicts here since monitor has no param routes
@router.post("/snmp/poll", response_model=SNMPMetrics)
async def snmp_poll(
    body: SNMPPollRequest,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SNMPMetrics:
    r = (await db.execute(select(Router).where(Router.id == body.router_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Router not found")
    if not r.snmp_community:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Router has no SNMP community configured. Set it in the Inventory page.",
        )

    metrics = await snmp_core.snmp_poll(r.ip_address, r.snmp_community)

    return SNMPMetrics(
        router_id=r.id,
        hostname=r.hostname,
        ip_address=r.ip_address,
        community=r.snmp_community,
        reachable=metrics["reachable"],
        sys_descr=metrics.get("sys_descr"),
        sys_name=metrics.get("sys_name"),
        uptime_seconds=metrics.get("uptime_seconds"),
        cpu_5min_percent=metrics.get("cpu_5min_percent"),
        mem_free_bytes=metrics.get("mem_free_bytes"),
        if_number=metrics.get("if_number"),
        error=metrics.get("error"),
        polled_at=datetime.now(timezone.utc),
    )
