from datetime import datetime
from sqlalchemy import Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class GlobalCredentials(Base):
    """Single-row table (id always = 1). Use upsert to update."""

    __tablename__ = "global_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    username: Mapped[str] = mapped_column(String(128), nullable=False)
    password_encrypted: Mapped[str] = mapped_column(String(512), nullable=False)
    enable_password_encrypted: Mapped[str | None] = mapped_column(String(512), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now(), onupdate=func.now())
