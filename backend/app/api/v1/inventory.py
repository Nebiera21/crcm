import io
import ipaddress
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import ssh
from app.core.dependencies import get_current_user, require_admin
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.global_credentials import GlobalCredentials
from app.models.router import Router
from app.models.ssh_credential import SshCredential
from app.models.user import User
from app.schemas.monitor import TestConnectionResult
from app.schemas.router import (
    ImportResult,
    RouterCreate,
    RouterListResponse,
    RouterResponse,
    RouterStats,
    RouterUpdate,
)

router = APIRouter()


async def _audit(
    db: AsyncSession,
    user_id: uuid.UUID,
    action: str,
    resource_id: str,
    detail: dict,
    request: Request,
) -> None:
    db.add(AuditLog(
        user_id=user_id,
        action=action,
        resource_type="router",
        resource_id=resource_id,
        detail=detail,
        ip_address=request.client.host if request.client else None,
    ))


# /stats must be defined before /{router_id} to avoid UUID parse conflict
@router.get("/stats", response_model=RouterStats)
async def router_stats(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RouterStats:
    total = (await db.execute(select(func.count()).select_from(Router))).scalar() or 0
    active = (await db.execute(select(func.count()).select_from(Router).where(Router.is_active == True))).scalar() or 0  # noqa: E712
    return RouterStats(total=total, active=active)


@router.get("/", response_model=RouterListResponse)
async def list_routers(
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> RouterListResponse:
    q = select(Router)
    if search:
        like = f"%{search}%"
        q = q.where(or_(
            Router.hostname.ilike(like),
            Router.ip_address.ilike(like),
            Router.location.ilike(like),
        ))
    if is_active is not None:
        q = q.where(Router.is_active == is_active)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    rows = (await db.execute(q.order_by(Router.hostname).offset(skip).limit(limit))).scalars().all()
    return RouterListResponse(items=list(rows), total=total)


# /import must be defined before /{router_id} to avoid UUID parse conflict
@router.post("/import", response_model=ImportResult)
async def import_routers(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> ImportResult:
    import pandas as pd

    content = await file.read()
    filename = (file.filename or "").lower()
    errors: list[str] = []

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only .csv, .xlsx, .xls files are accepted",
            )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse file: {exc}",
        )

    df.columns = df.columns.str.strip().str.lower()
    required = {"hostname", "ip_address"}
    missing = required - set(df.columns)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Missing required columns: {', '.join(sorted(missing))}",
        )

    created = 0
    skipped = 0

    for row_num, row in enumerate(df.itertuples(index=False), start=2):
        hostname = str(getattr(row, "hostname", "") or "").strip()
        ip_raw = str(getattr(row, "ip_address", "") or "").strip()

        if not hostname or not ip_raw:
            errors.append(f"Row {row_num}: hostname and ip_address are required")
            continue

        try:
            ipaddress.ip_address(ip_raw)
        except ValueError:
            errors.append(f"Row {row_num}: invalid IP address {ip_raw!r}")
            continue

        exists = (await db.execute(select(Router).where(Router.ip_address == ip_raw))).scalar_one_or_none()
        if exists:
            skipped += 1
            continue

        wan_ip_raw = str(getattr(row, "wan_ip_address", "") or "").strip() or None
        if wan_ip_raw:
            try:
                ipaddress.ip_address(wan_ip_raw)
            except ValueError:
                errors.append(f"Row {row_num}: invalid WAN IP address {wan_ip_raw!r} — skipping WAN IP")
                wan_ip_raw = None

        wan_port_raw = getattr(row, "wan_ssh_port", None)
        wan_port: int | None = None
        if wan_port_raw is not None:
            try:
                wan_port = int(wan_port_raw)
                if not (1 <= wan_port <= 65535):
                    raise ValueError
            except (ValueError, TypeError):
                errors.append(f"Row {row_num}: invalid wan_ssh_port {wan_port_raw!r} — using default 22")
                wan_port = None

        use_wan_raw = str(getattr(row, "use_wan_ip", "") or "").strip().lower()
        use_wan = use_wan_raw in ("true", "1", "yes")

        db.add(Router(
            hostname=hostname,
            ip_address=ip_raw,
            location=str(getattr(row, "location", "") or "").strip() or None,
            model=str(getattr(row, "model", "") or "").strip() or None,
            notes=str(getattr(row, "notes", "") or "").strip() or None,
            is_active=True,
            wan_ip_address=wan_ip_raw,
            wan_ssh_port=wan_port,
            use_wan_ip=use_wan,
        ))
        created += 1

    if created:
        await db.flush()
        await _audit(
            db, current_user.id, "router.import", "bulk",
            {"created": created, "skipped": skipped, "errors": len(errors)},
            request,
        )

    return ImportResult(created=created, skipped_duplicate=skipped, errors=errors)


@router.post("/", response_model=RouterResponse, status_code=status.HTTP_201_CREATED)
async def create_router(
    body: RouterCreate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Router:
    existing = (await db.execute(select(Router).where(Router.ip_address == body.ip_address))).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"IP address {body.ip_address} is already in use",
        )

    r = Router(**body.model_dump())
    db.add(r)
    await db.flush()
    await _audit(db, current_user.id, "router.create", str(r.id), {"hostname": r.hostname, "ip": r.ip_address}, request)
    return r


@router.get("/{router_id}", response_model=RouterResponse)
async def get_router(
    router_id: uuid.UUID,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Router:
    r = (await db.execute(select(Router).where(Router.id == router_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Router not found")
    return r


@router.put("/{router_id}", response_model=RouterResponse)
async def update_router(
    router_id: uuid.UUID,
    body: RouterUpdate,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Router:
    r = (await db.execute(select(Router).where(Router.id == router_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Router not found")

    update_data = body.model_dump(exclude_unset=True)

    new_ip = update_data.get("ip_address")
    if new_ip and new_ip != r.ip_address:
        conflict = (await db.execute(select(Router).where(Router.ip_address == new_ip))).scalar_one_or_none()
        if conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"IP address {new_ip} is already in use")

    for field, value in update_data.items():
        setattr(r, field, value)

    db.add(r)
    await _audit(db, current_user.id, "router.update", str(router_id), update_data, request)
    return r


@router.delete("/{router_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_router(
    router_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    r = (await db.execute(select(Router).where(Router.id == router_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Router not found")

    await _audit(db, current_user.id, "router.delete", str(router_id), {"hostname": r.hostname, "ip": r.ip_address}, request)
    await db.delete(r)


@router.post("/{router_id}/test-connection", response_model=TestConnectionResult)
async def test_connection(
    router_id: uuid.UUID,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TestConnectionResult:
    r = (await db.execute(select(Router).where(Router.id == router_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Router not found")

    if r.credential_id:
        creds = (await db.execute(select(SshCredential).where(SshCredential.id == r.credential_id))).scalar_one_or_none()
    else:
        creds = (await db.execute(select(GlobalCredentials).where(GlobalCredentials.id == 1))).scalar_one_or_none()

    if not creds:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No SSH credentials configured. Set them in Admin → Credentials.",
        )

    device = ssh.build_device_dict(r.ip_address, creds)
    success, message, latency_ms = await ssh.test_connection(device)

    if not success and ssh._is_timeout(message) and r.use_wan_ip and r.wan_ip_address:
        wan_port = r.wan_ssh_port or 22
        wan_device = ssh.build_device_dict(r.wan_ip_address, creds, port=wan_port, timeout=30)
        success, wan_message, latency_ms = await ssh.test_connection(wan_device)
        message = f"Connected via WAN IP ({r.wan_ip_address}:{wan_port})" if success else wan_message

    return TestConnectionResult(success=success, message=message, latency_ms=latency_ms)
