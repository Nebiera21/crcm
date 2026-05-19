import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_operator
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.config_history import ConfigHistory, DeployStatus
from app.models.router import Router
from app.models.user import User
from app.schemas.deploy import HistoryDetail, HistoryListItem, HistoryListResponse, RollbackJobResponse

router = APIRouter()


async def _audit(db, user_id, action, resource_id, detail, request) -> None:
    db.add(AuditLog(
        user_id=user_id,
        action=action,
        resource_type="deploy",
        resource_id=resource_id,
        detail=detail,
        ip_address=request.client.host if request.client else None,
    ))


def _to_list_item(h: ConfigHistory, hostname: str | None, ip: str | None) -> HistoryListItem:
    return HistoryListItem(
        id=h.id,
        router_id=h.router_id,
        router_hostname=hostname,
        router_ip=ip,
        template_id=h.template_id,
        deployed_by=h.deployed_by,
        status=h.status,
        job_id=h.job_id,
        deployed_at=h.deployed_at,
        can_rollback=h.config_snapshot is not None and h.status == DeployStatus.success,
        connected_via=h.connected_via,
    )


@router.get("/", response_model=HistoryListResponse)
async def list_history(
    router_id: uuid.UUID | None = Query(None),
    status_filter: DeployStatus | None = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HistoryListResponse:
    base = (
        select(ConfigHistory, Router.hostname, Router.ip_address)
        .join(Router, ConfigHistory.router_id == Router.id, isouter=True)
    )
    if router_id:
        base = base.where(ConfigHistory.router_id == router_id)
    if status_filter:
        base = base.where(ConfigHistory.status == status_filter)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(
        base.order_by(ConfigHistory.deployed_at.desc()).offset(skip).limit(limit)
    )).all()

    items = [_to_list_item(row.ConfigHistory, row.hostname, row.ip_address) for row in rows]
    return HistoryListResponse(items=items, total=total)


@router.get("/{history_id}", response_model=HistoryDetail)
async def get_history(
    history_id: uuid.UUID,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HistoryDetail:
    row = (await db.execute(
        select(ConfigHistory, Router.hostname, Router.ip_address)
        .join(Router, ConfigHistory.router_id == Router.id, isouter=True)
        .where(ConfigHistory.id == history_id)
    )).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="History record not found")

    h = row.ConfigHistory
    return HistoryDetail(
        **_to_list_item(h, row.hostname, row.ip_address).model_dump(),
        rendered_config=h.rendered_config,
        config_snapshot=h.config_snapshot,
        output=h.output,
    )


@router.post("/{history_id}/rollback", response_model=RollbackJobResponse)
async def rollback(
    history_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
) -> RollbackJobResponse:
    h = (await db.execute(select(ConfigHistory).where(ConfigHistory.id == history_id))).scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="History record not found")
    if not h.config_snapshot:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No config snapshot available — cannot rollback this deployment",
        )

    new_h = ConfigHistory(
        router_id=h.router_id,
        template_id=None,
        deployed_by=current_user.id,
        rendered_config=h.config_snapshot,
        status=DeployStatus.pending,
    )
    db.add(new_h)
    await db.flush()

    from app.tasks.celery_tasks import bulk_deploy_configs
    task = bulk_deploy_configs.delay([{
        "router_id": str(new_h.router_id),
        "rendered_config": h.config_snapshot,
        "history_id": str(new_h.id),
    }])
    new_h.job_id = task.id

    h.status = DeployStatus.rolled_back

    await _audit(
        db, current_user.id, "deploy.rollback", str(history_id),
        {"new_history_id": str(new_h.id), "router_id": str(h.router_id)},
        request,
    )

    await db.commit()
    return RollbackJobResponse(job_id=task.id, history_id=new_h.id)
