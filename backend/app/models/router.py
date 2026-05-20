import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Router(Base):
    __tablename__ = "routers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(45), unique=True, nullable=False, index=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # SNMP — version selects auth mode; community used for v1/v2c, v3_* for v3
    snmp_community: Mapped[str | None] = mapped_column(String(128), nullable=True)
    snmp_version: Mapped[str] = mapped_column(String(4), nullable=False, default="v2c", server_default="v2c")
    snmp_v3_username: Mapped[str | None] = mapped_column(String(128), nullable=True)
    snmp_v3_auth_protocol: Mapped[str | None] = mapped_column(String(16), nullable=True)
    snmp_v3_auth_password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    snmp_v3_priv_protocol: Mapped[str | None] = mapped_column(String(16), nullable=True)
    snmp_v3_priv_password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    snmp_v3_security_level: Mapped[str | None] = mapped_column(String(16), nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    credential_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ssh_credentials.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    wan_ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    wan_ssh_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    use_wan_ip: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    wan_interface: Mapped[str | None] = mapped_column(String(64), nullable=True, default="FastEthernet4")
    created_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(nullable=False, server_default=func.now(), onupdate=func.now())
