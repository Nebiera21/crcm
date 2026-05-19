import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_operator
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.config_history import ConfigHistory, DeployStatus
from app.models.router import Router
from app.models.user import User
from app.schemas.deploy import DeployJobResponse, DeployRequest

router = APIRouter()


async def _audit(db: AsyncSession, user_id: uuid.UUID, action: str, resource_id: str, detail: dict, request: Request) -> None:
    db.add(AuditLog(
        user_id=user_id,
        action=action,
        resource_type="deploy",
        resource_id=resource_id,
        detail=detail,
        ip_address=request.client.host if request.client else None,
    ))


@router.post("/", response_model=DeployJobResponse, status_code=status.HTTP_201_CREATED)
async def deploy(
    body: DeployRequest,
    request: Request,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
) -> DeployJobResponse:
    # Validate all routers exist
    for rid in body.router_ids:
        r = (await db.execute(select(Router).where(Router.id == rid))).scalar_one_or_none()
        if not r:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Router {rid} not found")

    # Create pending history records (IDs generated on Python side)
    history_records: list[ConfigHistory] = []
    for rid in body.router_ids:
        h = ConfigHistory(
            router_id=rid,
            template_id=body.template_id,
            deployed_by=current_user.id,
            rendered_config=body.rendered_config,
            status=DeployStatus.pending,
        )
        db.add(h)
        history_records.append(h)

    await db.flush()

    jobs = [
        {
            "router_id": str(h.router_id),
            "rendered_config": body.rendered_config,
            "history_id": str(h.id),
        }
        for h in history_records
    ]

    # Dispatch Celery task — import here to avoid circular imports at startup
    from app.tasks.celery_tasks import bulk_deploy_configs
    task = bulk_deploy_configs.delay(jobs)

    for h in history_records:
        h.job_id = task.id

    await _audit(
        db, current_user.id, "deploy.start", task.id,
        {"router_count": len(body.router_ids), "template_id": str(body.template_id) if body.template_id else None},
        request,
    )

    # Commit before Celery worker can pick up the task and try to UPDATE the records
    await db.commit()

    return DeployJobResponse(job_id=task.id, history_ids=[h.id for h in history_records])
