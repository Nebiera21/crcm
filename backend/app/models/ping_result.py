import uuid
from datetime import datetime
from sqlalchemy import Boolean, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class PingResult(Base):
    __tablename__ = "ping_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    router_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("routers.id", ondelete="CASCADE"), nullable=False
    )
    target: Mapped[str] = mapped_column(String(4), nullable=False)  # "lan" | "wan"
    timestamp: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    packet_loss: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    is_up: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
