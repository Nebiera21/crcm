from fastapi import APIRouter
from app.api.v1 import audit, auth, credentials, deploy, history, inventory, monitor, network_monitor, stats, tasks, templates, users

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(users.router, prefix="/users", tags=["users"])
router.include_router(inventory.router, prefix="/inventory/routers", tags=["inventory"])
router.include_router(credentials.router, prefix="/credentials", tags=["credentials"])
router.include_router(monitor.router, prefix="/monitor", tags=["monitor"])
router.include_router(network_monitor.router, prefix="/network-monitor", tags=["network-monitor"])
router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
router.include_router(templates.router, prefix="/templates", tags=["templates"])
router.include_router(deploy.router, prefix="/deploy", tags=["deploy"])
router.include_router(history.router, prefix="/history", tags=["history"])
router.include_router(stats.router, prefix="/stats", tags=["stats"])
router.include_router(audit.router, prefix="/audit", tags=["audit"])
