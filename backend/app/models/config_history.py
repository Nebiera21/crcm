import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Text, Enum as SAEnum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class DeployStatus(str, enum.Enum):
    pending = "pending"
    success = "success"
    failed = "failed"
    rolled_back = "rolled_back"


class ConfigHistory(Base):
    __tablename__ = "config_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    router_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("routers.id", ondelete="CASCADE"), nullable=False, index=True)
    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.id", ondelete="SET NULL"), nullable=True)
    deployed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    config_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    rendered_config: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[DeployStatus] = mapped_column(SAEnum(DeployStatus, name="deploy_status"), nullable=False, default=DeployStatus.pending)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    job_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deployed_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now(), index=True)
