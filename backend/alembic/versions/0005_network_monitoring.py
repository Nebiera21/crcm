"""network monitoring tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add wan_interface to routers
    op.add_column("routers", sa.Column(
        "wan_interface", sa.String(64), nullable=True, server_default="FastEthernet4"
    ))

    # Monitoring settings (single row, id=1)
    op.create_table(
        "monitoring_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("retention_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("ping_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("snmp_traffic_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    # Seed the single settings row
    op.execute("INSERT INTO monitoring_settings (id, retention_days, ping_enabled, snmp_traffic_enabled) VALUES (1, 7, true, true)")

    # Ping results
    op.create_table(
        "ping_results",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("router_id", UUID(as_uuid=True), sa.ForeignKey("routers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target", sa.String(4), nullable=False),   # "lan" | "wan"
        sa.Column("timestamp", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column("packet_loss", sa.Float(), nullable=False, server_default="100"),
        sa.Column("is_up", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_ping_results_router_ts", "ping_results", ["router_id", "timestamp"])

    # SNMP traffic metrics
    op.create_table(
        "snmp_traffic_metrics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("router_id", UUID(as_uuid=True), sa.ForeignKey("routers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("interface_name", sa.String(64), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("bytes_in", sa.BigInteger(), nullable=True),
        sa.Column("bytes_out", sa.BigInteger(), nullable=True),
        sa.Column("bits_in_per_sec", sa.Float(), nullable=True),
        sa.Column("bits_out_per_sec", sa.Float(), nullable=True),
        sa.Column("if_status", sa.String(8), nullable=True),   # "up" | "down"
    )
    op.create_index("ix_snmp_traffic_router_ts", "snmp_traffic_metrics", ["router_id", "timestamp"])


def downgrade() -> None:
    op.drop_index("ix_snmp_traffic_router_ts", "snmp_traffic_metrics")
    op.drop_table("snmp_traffic_metrics")
    op.drop_index("ix_ping_results_router_ts", "ping_results")
    op.drop_table("ping_results")
    op.drop_table("monitoring_settings")
    op.drop_column("routers", "wan_interface")
