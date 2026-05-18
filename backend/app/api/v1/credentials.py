from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_admin
from app.core.security import encrypt_secret
from app.database import get_db
from app.models.global_credentials import GlobalCredentials
from app.models.user import User
from app.schemas.credentials import CredentialsStatus, CredentialsUpdate

router = APIRouter()

_SINGLE_ROW_ID = 1


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
