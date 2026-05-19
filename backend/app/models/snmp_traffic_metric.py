import uuid
from datetime import datetime
from sqlalchemy import BigInteger, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class SnmpTrafficMetric(Base):
    __tablename__ = "snmp_traffic_metrics"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    router_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("routers.id", ondelete="CASCADE"), nullable=False
    )
    interface_name: Mapped[str] = mapped_column(String(64), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    bytes_in: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    bytes_out: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    bits_in_per_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    bits_out_per_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    if_status: Mapped[str | None] = mapped_column(String(8), nullable=True)  # "up" | "down"
