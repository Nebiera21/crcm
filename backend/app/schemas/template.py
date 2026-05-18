import uuid
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, field_validator
from app.models.template import TemplateCategory


class VariableDefinition(BaseModel):
    name: str
    type: Literal["string", "number", "boolean", "list"] = "string"
    required: bool = True
    default: str | None = None
    description: str | None = None


class TemplateCreate(BaseModel):
    name: str
    category: TemplateCategory = TemplateCategory.custom
    description: str | None = None
    content: str
    variables: list[VariableDefinition] = []

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name cannot be empty")
        return v

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Content cannot be empty")
        return v


class TemplateUpdate(BaseModel):
    name: str | None = None
    category: TemplateCategory | None = None
    description: str | None = None
    content: str | None = None
    variables: list[VariableDefinition] | None = None


class TemplateResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    category: TemplateCategory
    description: str | None
    content: str
    variables: list[VariableDefinition]
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class TemplateListResponse(BaseModel):
    items: list[TemplateResponse]
    total: int


class AdHocPreviewRequest(BaseModel):
    content: str
    variable_values: dict[str, str] = {}


class TemplatePreviewRequest(BaseModel):
    variable_values: dict[str, str] = {}


class PreviewResponse(BaseModel):
    rendered: str
    errors: list[str]
    variables_found: list[str] = []
