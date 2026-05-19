"""command presets

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-19
"""
from typing import Sequence, Union
import uuid as _uuid
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DEFAULT_COMMANDS = [
    "show version",
    "show interfaces",
    "show ip interface brief",
    "show ip route",
    "show running-config",
    "show logging",
    "show processes cpu",
    "show processes memory",
    "show cdp neighbors",
    "show arp",
]


def upgrade() -> None:
    op.create_table(
        "command_presets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("command", sa.String(256), nullable=False),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_command_presets_command", "command_presets", ["command"], unique=True)

    presets_tbl = sa.table(
        "command_presets",
        sa.column("id", postgresql.UUID),
        sa.column("command", sa.String),
    )
    op.bulk_insert(
        presets_tbl,
        [{"id": _uuid.uuid4(), "command": cmd} for cmd in _DEFAULT_COMMANDS],
    )


def downgrade() -> None:
    op.drop_index("ix_command_presets_command", table_name="command_presets")
    op.drop_table("command_presets")
