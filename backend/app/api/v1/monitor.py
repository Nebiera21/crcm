import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ssh
from app.core import snmp as snmp_core
from app.core.dependencies import get_current_user, require_admin, require_operator
from app.database import get_db
from app.models.command_preset import CommandPreset
from app.models.global_credentials import GlobalCredentials
from app.models.router import Router
from app.models.ssh_credential import SshCredential
from app.models.user import User
from app.schemas.command_preset import CommandPresetCreate, CommandPresetItem, CommandPresetList
from app.schemas.monitor import (
    BulkCommandRequest,
    BulkSNMPRequest,
    CommandRunRequest,
    CommandRunResponse,
    TaskStatus,
)
from app.schemas.snmp import SNMPMetrics, SNMPPollRequest

router = APIRouter()


async def _resolve_creds(r: Router, db: AsyncSession):
    """Per-router credential with global fallback."""
    if r.credential_id:
        creds = (await db.execute(
            select(SshCredential).where(SshCredential.id == r.credential_id)
        )).scalar_one_or_none()
        if creds:
            return creds
    return (await db.execute(
        select(GlobalCredentials).where(GlobalCredentials.id == 1)
    )).scalar_one_or_none()


async def _get_device(router_id: uuid.UUID, db: AsyncSession) -> tuple[Router, dict]:
    r = (await db.execute(select(Router).where(Router.id == router_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Router not found")
    if not r.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Router is marked inactive")
    creds = await _resolve_creds(r, db)
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No SSH credentials configured. Set them in Credentials.",
        )
    return r, ssh.build_device_dict(r.ip_address, creds)


# ── Command Presets ───────────────────────────────────────────────────────────

@router.get("/presets", response_model=CommandPresetList)
async def list_presets(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CommandPresetList:
    rows = (await db.execute(
        select(CommandPreset, User.username)
        .join(User, CommandPreset.created_by == User.id, isouter=True)
        .order_by(CommandPreset.command)
    )).all()
    items = [
        CommandPresetItem(
            id=row.CommandPreset.id,
            command=row.CommandPreset.command,
            created_by_username=row.username,
            created_at=row.CommandPreset.created_at,
        )
        for row in rows
    ]
    return CommandPresetList(items=items, total=len(items))


@router.post("/presets", response_model=CommandPresetItem, status_code=status.HTTP_201_CREATED)
async def create_preset(
    body: CommandPresetCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CommandPresetItem:
    existing = (await db.execute(
        select(CommandPreset).where(CommandPreset.command == body.command)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Command already exists in library")
    preset = CommandPreset(command=body.command, created_by=current_user.id)
    db.add(preset)
    await db.flush()
    return CommandPresetItem(
        id=preset.id,
        command=preset.command,
        created_by_username=current_user.username,
        created_at=preset.created_at,
    )


@router.delete("/presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preset(
    preset_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    preset = (await db.execute(
        select(CommandPreset).where(CommandPreset.id == preset_id)
    )).scalar_one_or_none()
    if not preset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preset not found")
    await db.delete(preset)


# ── SSH Commands ──────────────────────────────────────────────────────────────

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
) -> TaskStatus:
    if not body.commands:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one command is required")
    if not body.router_ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one router is required")
    from app.tasks.celery_tasks import bulk_show_commands
    task = bulk_show_commands.delay(
        router_ids=[str(rid) for rid in body.router_ids],
        commands=body.commands,
    )
    return TaskStatus(job_id=task.id, state="PENDING")


# ── SNMP ──────────────────────────────────────────────────────────────────────

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
            detail="Router has no SNMP community configured.",
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


@router.post("/snmp/bulk", response_model=TaskStatus)
async def snmp_poll_bulk(
    body: BulkSNMPRequest,
    _: User = Depends(get_current_user),
) -> TaskStatus:
    if not body.router_ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least one router is required")
    from app.tasks.celery_tasks import bulk_snmp_poll
    task = bulk_snmp_poll.delay(router_ids=[str(rid) for rid in body.router_ids])
    return TaskStatus(job_id=task.id, state="PENDING")
