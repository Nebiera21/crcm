from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.config_history import ConfigHistory, DeployStatus
from app.models.router import Router
from app.models.template import Template
from app.models.user import User
from app.schemas.stats import DashboardStats, RecentDeployItem

router = APIRouter()


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard_stats(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DashboardStats:
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)

    routers_total = (await db.execute(select(func.count()).select_from(Router))).scalar() or 0
    routers_active = (await db.execute(
        select(func.count()).select_from(Router).where(Router.is_active.is_(True))
    )).scalar() or 0

    templates_total = (await db.execute(select(func.count()).select_from(Template))).scalar() or 0

    deploys_total = (await db.execute(select(func.count()).select_from(ConfigHistory))).scalar() or 0
    deploys_30d = (await db.execute(
        select(func.count()).select_from(ConfigHistory).where(ConfigHistory.deployed_at >= thirty_days_ago)
    )).scalar() or 0
    deploys_30d_success = (await db.execute(
        select(func.count()).select_from(ConfigHistory).where(
            and_(ConfigHistory.deployed_at >= thirty_days_ago, ConfigHistory.status == DeployStatus.success)
        )
    )).scalar() or 0
    deploys_30d_failed = (await db.execute(
        select(func.count()).select_from(ConfigHistory).where(
            and_(ConfigHistory.deployed_at >= thirty_days_ago, ConfigHistory.status == DeployStatus.failed)
        )
    )).scalar() or 0

    recent_rows = (await db.execute(
        select(ConfigHistory, Router.hostname, Router.ip_address)
        .join(Router, ConfigHistory.router_id == Router.id, isouter=True)
        .order_by(ConfigHistory.deployed_at.desc())
        .limit(10)
    )).all()

    recent_deploys = [
        RecentDeployItem(
            id=row.ConfigHistory.id,
            router_hostname=row.hostname,
            router_ip=row.ip_address,
            status=row.ConfigHistory.status,
            deployed_at=row.ConfigHistory.deployed_at,
        )
        for row in recent_rows
    ]

    return DashboardStats(
        routers_total=routers_total,
        routers_active=routers_active,
        templates_total=templates_total,
        deploys_total=deploys_total,
        deploys_last_30d=deploys_30d,
        deploys_success_last_30d=deploys_30d_success,
        deploys_failed_last_30d=deploys_30d_failed,
        recent_deploys=recent_deploys,
    )
