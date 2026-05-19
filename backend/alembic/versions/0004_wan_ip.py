"""wan ip address fields

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("routers", sa.Column("wan_ip_address", sa.String(45), nullable=True))
    op.add_column("routers", sa.Column("wan_ssh_port", sa.Integer(), nullable=True))
    op.add_column("routers", sa.Column("use_wan_ip", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("config_history", sa.Column("connected_via", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("config_history", "connected_via")
    op.drop_column("routers", "use_wan_ip")
    op.drop_column("routers", "wan_ssh_port")
    op.drop_column("routers", "wan_ip_address")
