import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.dependencies import get_current_user, require_admin, require_operator
from app.core import templates as tpl_engine
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.template import Template
from app.models.user import User
from app.schemas.template import (
    AdHocPreviewRequest,
    PreviewResponse,
    TemplateCreate,
    TemplateListResponse,
    TemplatePreviewRequest,
    TemplateResponse,
    TemplateUpdate,
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
        resource_type="template",
        resource_id=resource_id,
        detail=detail,
        ip_address=request.client.host if request.client else None,
    ))


# Static paths must come before /{template_id} to avoid UUID parse conflicts

@router.post("/preview", response_model=PreviewResponse)
async def preview_adhoc(
    body: AdHocPreviewRequest,
    _: User = Depends(get_current_user),
) -> PreviewResponse:
    """Render arbitrary Jinja2 content without saving. Used by the template editor."""
    rendered, errors = tpl_engine.render_template(body.content, body.variable_values)
    found = tpl_engine.extract_variable_names(body.content)
    return PreviewResponse(rendered=rendered, errors=errors, variables_found=found)


@router.get("/", response_model=TemplateListResponse)
async def list_templates(
    search: str | None = Query(None),
    category: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TemplateListResponse:
    q = select(Template)
    if search:
        like = f"%{search}%"
        q = q.where(or_(Template.name.ilike(like), Template.description.ilike(like)))
    if category:
        q = q.where(Template.category == category)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    rows = (await db.execute(q.order_by(Template.name).offset(skip).limit(limit))).scalars().all()
    return TemplateListResponse(items=list(rows), total=total)


@router.post("/", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    body: TemplateCreate,
    request: Request,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
) -> Template:
    existing = (await db.execute(select(Template).where(Template.name == body.name))).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Template name '{body.name}' already exists",
        )

    data = body.model_dump()
    data["variables"] = [v.model_dump() for v in body.variables]
    data["created_by"] = current_user.id

    t = Template(**data)
    db.add(t)
    await db.flush()
    await _audit(db, current_user.id, "template.create", str(t.id), {"name": t.name, "category": t.category.value}, request)
    return t


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Template:
    t = (await db.execute(select(Template).where(Template.id == template_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return t


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: uuid.UUID,
    body: TemplateUpdate,
    request: Request,
    current_user: User = Depends(require_operator),
    db: AsyncSession = Depends(get_db),
) -> Template:
    t = (await db.execute(select(Template).where(Template.id == template_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    update_data = body.model_dump(exclude_unset=True)

    if "name" in update_data and update_data["name"] != t.name:
        conflict = (await db.execute(select(Template).where(Template.name == update_data["name"]))).scalar_one_or_none()
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Template name '{update_data['name']}' already exists",
            )

    # JSONB requires flag_modified so SQLAlchemy tracks the mutation
    if "variables" in update_data:
        t.variables = update_data.pop("variables")
        flag_modified(t, "variables")

    for field, value in update_data.items():
        setattr(t, field, value)

    db.add(t)
    await _audit(db, current_user.id, "template.update", str(template_id), {k: str(v) for k, v in update_data.items()}, request)
    return t


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    t = (await db.execute(select(Template).where(Template.id == template_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    await _audit(db, current_user.id, "template.delete", str(template_id), {"name": t.name}, request)
    await db.delete(t)


@router.post("/{template_id}/preview", response_model=PreviewResponse)
async def preview_template(
    template_id: uuid.UUID,
    body: TemplatePreviewRequest,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PreviewResponse:
    """Render an existing saved template with the given variable values."""
    t = (await db.execute(select(Template).where(Template.id == template_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")

    rendered, errors = tpl_engine.render_template(t.content, body.variable_values)
    found = tpl_engine.extract_variable_names(t.content)
    return PreviewResponse(rendered=rendered, errors=errors, variables_found=found)
