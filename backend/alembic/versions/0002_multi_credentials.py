"""multi credentials

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-18
"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ssh_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("username", sa.String(128), nullable=False),
        sa.Column("password_encrypted", sa.String(512), nullable=False),
        sa.Column("enable_password_encrypted", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ssh_credentials_name", "ssh_credentials", ["name"], unique=True)

    op.add_column(
        "routers",
        sa.Column(
            "credential_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("ssh_credentials.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_routers_credential_id", "routers", ["credential_id"])


def downgrade() -> None:
    op.drop_index("ix_routers_credential_id", table_name="routers")
    op.drop_column("routers", "credential_id")
    op.drop_index("ix_ssh_credentials_name", table_name="ssh_credentials")
    op.drop_table("ssh_credentials")
