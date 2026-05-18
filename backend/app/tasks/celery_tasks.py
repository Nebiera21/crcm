import asyncio
from celery import Celery
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "crcm",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    result_expires=86400,
    worker_max_tasks_per_child=50,
    task_acks_late=True,
)


def _fetch_data_for_bulk(router_ids: list[str]) -> tuple:
    """Fetch routers + credentials from DB inside a fresh event loop (Celery worker context)."""
    import uuid
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.router import Router
    from app.models.global_credentials import GlobalCredentials

    async def _query():
        async with AsyncSessionLocal() as db:
            creds = (await db.execute(select(GlobalCredentials).where(GlobalCredentials.id == 1))).scalar_one_or_none()
            if not creds:
                raise ValueError("No SSH credentials configured")

            routers = []
            for rid in router_ids:
                r = (await db.execute(select(Router).where(Router.id == uuid.UUID(rid)))).scalar_one_or_none()
                if r:
                    routers.append(r)
            return creds, routers

    return asyncio.run(_query())


def _fetch_deploy_data(router_ids: list[str]) -> tuple:
    """Returns (creds, {router_id_str: Router})."""
    import uuid
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.router import Router
    from app.models.global_credentials import GlobalCredentials

    async def _query():
        async with AsyncSessionLocal() as db:
            creds = (await db.execute(select(GlobalCredentials).where(GlobalCredentials.id == 1))).scalar_one_or_none()
            if not creds:
                raise ValueError("No SSH credentials configured")
            ids = [uuid.UUID(r) for r in router_ids]
            rows = (await db.execute(select(Router).where(Router.id.in_(ids)))).scalars().all()
            return creds, {str(r.id): r for r in rows}

    return asyncio.run(_query())


def _update_history_results(results: list[dict]) -> None:
    """Write deploy results back to ConfigHistory rows."""
    import uuid
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.config_history import ConfigHistory, DeployStatus

    async def _update():
        async with AsyncSessionLocal() as db:
            for r in results:
                h = (await db.execute(
                    select(ConfigHistory).where(ConfigHistory.id == uuid.UUID(r["history_id"]))
                )).scalar_one_or_none()
                if h:
                    h.config_snapshot = r.get("snapshot")
                    h.status = DeployStatus(r["status"])
                    h.output = r.get("output", "")
            await db.commit()

    asyncio.run(_update())


@celery_app.task(bind=True, name="crcm.bulk_show_commands")
def bulk_show_commands(self, router_ids: list[str], commands: list[str]) -> dict:
    from app.core.ssh import run_commands_sync, build_device_dict

    try:
        creds, routers = _fetch_data_for_bulk(router_ids)
    except ValueError as exc:
        return {"error": str(exc), "results": {}}

    def _run(r) -> tuple[str, dict]:
        device = build_device_dict(r.ip_address, creds)
        results = run_commands_sync(device, commands)
        return str(r.id), {"hostname": r.hostname, "ip_address": r.ip_address, "results": results}

    output: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(_run, r): r for r in routers}
        for future in as_completed(futures):
            r = futures[future]
            try:
                router_id, data = future.result()
                output[router_id] = data
            except Exception as exc:
                output[str(r.id)] = {
                    "hostname": r.hostname,
                    "ip_address": r.ip_address,
                    "error": str(exc),
                }

    return {"results": output}


@celery_app.task(bind=True, max_retries=0, name="crcm.deploy_config")
def deploy_config(self, router_id: str, rendered_config: str, history_id: str, deployed_by: str) -> dict:
    """Deploy rendered config to a single router."""
    from app.core.ssh import build_device_dict, deploy_config_sync, run_commands_sync

    try:
        creds, routers_map = _fetch_deploy_data([router_id])
    except ValueError as exc:
        _update_history_results([{"history_id": history_id, "status": "failed", "output": str(exc)}])
        return {"status": "failed", "error": str(exc)}

    router = routers_map.get(router_id)
    if not router:
        _update_history_results([{"history_id": history_id, "status": "failed", "output": "Router not found"}])
        return {"status": "failed"}

    device = build_device_dict(router.ip_address, creds)

    snapshot: str | None = None
    try:
        res = run_commands_sync(device, ["show running-config"])
        raw = res.get("show running-config", "")
        snapshot = raw if not raw.startswith("ERROR:") else None
    except Exception:
        pass

    config_lines = [line for line in rendered_config.splitlines() if line.strip()]
    success, output = deploy_config_sync(device, config_lines)
    deploy_status = "success" if success else "failed"

    _update_history_results([{
        "history_id": history_id,
        "status": deploy_status,
        "snapshot": snapshot,
        "output": output,
    }])
    return {"status": deploy_status, "history_id": history_id, "router_id": router_id}


@celery_app.task(bind=True, max_retries=0, name="crcm.bulk_deploy_configs")
def bulk_deploy_configs(self, jobs: list[dict]) -> dict:
    """
    Deploy rendered config to multiple routers in parallel.
    jobs: list of {router_id: str, rendered_config: str, history_id: str}
    """
    from app.core.ssh import build_device_dict, deploy_config_sync, run_commands_sync

    router_ids = [j["router_id"] for j in jobs]
    try:
        creds, routers_map = _fetch_deploy_data(router_ids)
    except ValueError as exc:
        failed = [
            {"history_id": j["history_id"], "router_id": j["router_id"], "status": "failed", "output": str(exc)}
            for j in jobs
        ]
        _update_history_results(failed)
        return {"results": failed}

    def do_deploy(job: dict) -> dict:
        router = routers_map.get(job["router_id"])
        if not router:
            return {"history_id": job["history_id"], "router_id": job["router_id"],
                    "status": "failed", "output": "Router not found", "snapshot": None}

        device = build_device_dict(router.ip_address, creds)

        snapshot: str | None = None
        try:
            res = run_commands_sync(device, ["show running-config"])
            raw = res.get("show running-config", "")
            snapshot = raw if not raw.startswith("ERROR:") else None
        except Exception:
            pass

        config_lines = [line for line in job["rendered_config"].splitlines() if line.strip()]
        success, output = deploy_config_sync(device, config_lines)

        return {
            "history_id": job["history_id"],
            "router_id": job["router_id"],
            "hostname": router.hostname,
            "status": "success" if success else "failed",
            "snapshot": snapshot,
            "output": output,
        }

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=min(10, len(jobs))) as pool:
        futures = {pool.submit(do_deploy, j): j for j in jobs}
        for future in as_completed(futures):
            j = futures[future]
            try:
                results.append(future.result())
            except Exception as exc:
                results.append({
                    "history_id": j["history_id"],
                    "router_id": j["router_id"],
                    "status": "failed",
                    "output": str(exc),
                    "snapshot": None,
                })

    _update_history_results(results)
    return {"results": results}
