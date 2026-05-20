"""add snmp v3 fields to routers

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("routers", sa.Column("snmp_version", sa.String(4), nullable=False, server_default="v2c"))
    op.add_column("routers", sa.Column("snmp_v3_username", sa.String(128), nullable=True))
    op.add_column("routers", sa.Column("snmp_v3_auth_protocol", sa.String(16), nullable=True))
    op.add_column("routers", sa.Column("snmp_v3_auth_password_encrypted", sa.Text(), nullable=True))
    op.add_column("routers", sa.Column("snmp_v3_priv_protocol", sa.String(16), nullable=True))
    op.add_column("routers", sa.Column("snmp_v3_priv_password_encrypted", sa.Text(), nullable=True))
    op.add_column("routers", sa.Column("snmp_v3_security_level", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("routers", "snmp_v3_security_level")
    op.drop_column("routers", "snmp_v3_priv_password_encrypted")
    op.drop_column("routers", "snmp_v3_priv_protocol")
    op.drop_column("routers", "snmp_v3_auth_password_encrypted")
    op.drop_column("routers", "snmp_v3_auth_protocol")
    op.drop_column("routers", "snmp_v3_username")
    op.drop_column("routers", "snmp_version")
