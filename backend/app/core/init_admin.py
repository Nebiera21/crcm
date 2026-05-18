from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.user import User, UserRole
from app.core.security import hash_password
from app.config import get_settings


async def create_first_admin(db: AsyncSession) -> None:
    result = await db.execute(select(func.count()).select_from(User))
    if result.scalar() > 0:
        return

    settings = get_settings()
    admin = User(
        username=settings.FIRST_ADMIN_USERNAME,
        email=settings.FIRST_ADMIN_EMAIL,
        password_hash=hash_password(settings.FIRST_ADMIN_PASSWORD),
        role=UserRole.admin,
        is_active=True,
    )
    db.add(admin)
    await db.commit()
    print(f"[CRCM] Created first admin user: {settings.FIRST_ADMIN_USERNAME}")
