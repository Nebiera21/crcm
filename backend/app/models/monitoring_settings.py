from datetime import datetime
from sqlalchemy import Boolean, Integer, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class MonitoringSettings(Base):
    __tablename__ = "monitoring_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    ping_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    snmp_traffic_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now(), onupdate=func.now())
