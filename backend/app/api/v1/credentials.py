import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.core.security import encrypt_secret
from app.database import get_db
from app.models.global_credentials import GlobalCredentials
from app.models.router import Router
from app.models.ssh_credential import SshCredential
from app.models.user import User
from app.schemas.credentials import (
    CredentialsStatus,
    CredentialsUpdate,
    SshCredentialCreate,
    SshCredentialItem,
    SshCredentialList,
    SshCredentialUpdate,
)

router = APIRouter()

_SINGLE_ROW_ID = 1


# ── Named SSH credentials (CRUD) ─────────────────────────────────────────────

@router.get("/ssh", response_model=SshCredentialList)
async def list_ssh_credentials(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SshCredentialList:
    rows = (await db.execute(select(SshCredential).order_by(SshCredential.name))).scalars().all()
    items = []
    for row in rows:
        count = (
            await db.execute(
                select(func.count()).select_from(Router).where(Router.credential_id == row.id)
            )
        ).scalar() or 0
        items.append(SshCredentialItem(
            id=row.id,
            name=row.name,
            username=row.username,
            has_enable_password=row.enable_password_encrypted is not None,
            router_count=int(count),
            created_at=row.created_at,
            updated_at=row.updated_at,
        ))
    return SshCredentialList(items=items, total=len(items))


@router.post("/ssh", response_model=SshCredentialItem, status_code=status.HTTP_201_CREATED)
async def create_ssh_credential(
    body: SshCredentialCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SshCredentialItem:
    existing = (await db.execute(
        select(SshCredential).where(SshCredential.name == body.name)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Credential name '{body.name}' already exists")

    cred = SshCredential(
        name=body.name,
        username=body.username,
        password_encrypted=encrypt_secret(body.password),
        enable_password_encrypted=encrypt_secret(body.enable_password) if body.enable_password else None,
    )
    db.add(cred)
    await db.flush()
    return SshCredentialItem(
        id=cred.id,
        name=cred.name,
        username=cred.username,
        has_enable_password=cred.enable_password_encrypted is not None,
        router_count=0,
        created_at=cred.created_at,
        updated_at=cred.updated_at,
    )


@router.get("/ssh/{cred_id}", response_model=SshCredentialItem)
async def get_ssh_credential(
    cred_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SshCredentialItem:
    cred = (await db.execute(select(SshCredential).where(SshCredential.id == cred_id))).scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found")
    count = (await db.execute(
        select(func.count()).select_from(Router).where(Router.credential_id == cred_id)
    )).scalar() or 0
    return SshCredentialItem(
        id=cred.id,
        name=cred.name,
        username=cred.username,
        has_enable_password=cred.enable_password_encrypted is not None,
        router_count=int(count),
        created_at=cred.created_at,
        updated_at=cred.updated_at,
    )


@router.put("/ssh/{cred_id}", response_model=SshCredentialItem)
async def update_ssh_credential(
    cred_id: uuid.UUID,
    body: SshCredentialUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> SshCredentialItem:
    cred = (await db.execute(select(SshCredential).where(SshCredential.id == cred_id))).scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found")

    if body.name is not None and body.name != cred.name:
        conflict = (await db.execute(
            select(SshCredential).where(SshCredential.name == body.name)
        )).scalar_one_or_none()
        if conflict:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Credential name '{body.name}' already exists")
        cred.name = body.name

    if body.username is not None:
        cred.username = body.username
    if body.password is not None:
        cred.password_encrypted = encrypt_secret(body.password)
    if body.enable_password is not None:
        cred.enable_password_encrypted = encrypt_secret(body.enable_password)

    db.add(cred)
    await db.flush()
    count = (await db.execute(
        select(func.count()).select_from(Router).where(Router.credential_id == cred_id)
    )).scalar() or 0
    return SshCredentialItem(
        id=cred.id,
        name=cred.name,
        username=cred.username,
        has_enable_password=cred.enable_password_encrypted is not None,
        router_count=int(count),
        created_at=cred.created_at,
        updated_at=cred.updated_at,
    )


@router.delete("/ssh/{cred_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ssh_credential(
    cred_id: uuid.UUID,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    cred = (await db.execute(select(SshCredential).where(SshCredential.id == cred_id))).scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credential not found")
    await db.delete(cred)


# ── Global fallback credential ────────────────────────────────────────────────
# These routes MUST be defined before /{id} style routes (already the case here)

@router.get("/", response_model=CredentialsStatus)
async def get_credentials(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CredentialsStatus:
    creds = (await db.execute(select(GlobalCredentials).where(GlobalCredentials.id == _SINGLE_ROW_ID))).scalar_one_or_none()
    if not creds:
        return CredentialsStatus(is_configured=False)
    return CredentialsStatus(
        is_configured=True,
        username=creds.username,
        has_enable_password=creds.enable_password_encrypted is not None,
        updated_at=creds.updated_at,
    )


@router.put("/", response_model=CredentialsStatus, status_code=status.HTTP_200_OK)
async def update_credentials(
    body: CredentialsUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CredentialsStatus:
    enc_password = encrypt_secret(body.password)
    enc_enable = encrypt_secret(body.enable_password) if body.enable_password else None

    stmt = pg_insert(GlobalCredentials).values(
        id=_SINGLE_ROW_ID,
        username=body.username,
        password_encrypted=enc_password,
        enable_password_encrypted=enc_enable,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["id"],
        set_={
            "username": body.username,
            "password_encrypted": enc_password,
            "enable_password_encrypted": enc_enable,
            "updated_at": func.now(),
        },
    )
    await db.execute(stmt)

    creds = (await db.execute(select(GlobalCredentials).where(GlobalCredentials.id == _SINGLE_ROW_ID))).scalar_one()
    return CredentialsStatus(
        is_configured=True,
        username=creds.username,
        has_enable_password=creds.enable_password_encrypted is not None,
        updated_at=creds.updated_at,
    )
