from fastapi import APIRouter, Depends
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.monitor import TaskStatus

router = APIRouter()


@router.get("/{job_id}", response_model=TaskStatus)
async def get_task_status(
    job_id: str,
    _: User = Depends(get_current_user),
) -> TaskStatus:
    from app.tasks.celery_tasks import celery_app

    result = celery_app.AsyncResult(job_id)
    state = result.state  # PENDING, STARTED, SUCCESS, FAILURE, REVOKED

    if state == "SUCCESS":
        return TaskStatus(job_id=job_id, state=state, result=result.result)
    elif state == "FAILURE":
        return TaskStatus(job_id=job_id, state=state, error=str(result.result))
    else:
        return TaskStatus(job_id=job_id, state=state)
