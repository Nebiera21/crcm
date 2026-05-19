import uuid
from datetime import datetime
from pydantic import BaseModel, field_validator


class CommandPresetCreate(BaseModel):
    command: str

    @field_validator("command")
    @classmethod
    def validate_command(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Command cannot be empty")
        if len(v) > 256:
            raise ValueError("Command must be 256 characters or fewer")
        return v


class CommandPresetItem(BaseModel):
    id: uuid.UUID
    command: str
    created_by_username: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CommandPresetList(BaseModel):
    items: list[CommandPresetItem]
    total: int
