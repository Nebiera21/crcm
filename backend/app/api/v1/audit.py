import csv
import io
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogItem, AuditLogListResponse

router = APIRouter()


def _row_to_item(log: AuditLog, username: str | None) -> AuditLogItem:
    return AuditLogItem(
        id=log.id,
        user_id=log.user_id,
        username=username,
        action=log.action,
        resource_type=log.resource_type,
        resource_id=log.resource_id,
        detail=log.detail or {},
        ip_address=log.ip_address,
        created_at=log.created_at,
    )


def _build_query(
    action: str | None,
    resource_type: str | None,
    start_date: datetime | None,
    end_date: datetime | None,
):
    q = select(AuditLog, User.username).join(User, AuditLog.user_id == User.id, isouter=True)
    if action:
        q = q.where(AuditLog.action.ilike(f"%{action}%"))
    if resource_type:
        q = q.where(AuditLog.resource_type == resource_type)
    if start_date:
        q = q.where(AuditLog.created_at >= start_date)
    if end_date:
        q = q.where(AuditLog.created_at <= end_date)
    return q


# /export must be declared BEFORE any /{id} routes to avoid path conflicts
@router.get("/export")
async def export_audit_logs(
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    q = _build_query(action, resource_type, start_date, end_date).order_by(AuditLog.created_at.desc()).limit(10_000)
    rows = (await db.execute(q)).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["created_at", "username", "action", "resource_type", "resource_id", "ip_address", "detail"])
    for row in rows:
        log: AuditLog = row.AuditLog
        writer.writerow([
            log.created_at.isoformat(),
            row.username or "",
            log.action,
            log.resource_type,
            log.resource_id,
            log.ip_address or "",
            json.dumps(log.detail) if log.detail else "",
        ])

    buf.seek(0)
    filename = f"audit_log_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/", response_model=AuditLogListResponse)
async def list_audit_logs(
    action: str | None = Query(None),
    resource_type: str | None = Query(None),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AuditLogListResponse:
    base = _build_query(action, resource_type, start_date, end_date)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(
        base.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    )).all()

    return AuditLogListResponse(
        items=[_row_to_item(row.AuditLog, row.username) for row in rows],
        total=total,
    )
