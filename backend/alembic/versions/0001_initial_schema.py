"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-15
"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

user_role_enum = postgresql.ENUM("admin", "operator", "readonly", name="user_role", create_type=False)
template_category_enum = postgresql.ENUM("vlan", "interface", "acl", "ntp", "snmp", "custom", name="template_category", create_type=False)
deploy_status_enum = postgresql.ENUM("pending", "success", "failed", "rolled_back", name="deploy_status", create_type=False)


def upgrade() -> None:
    op.execute(sa.text("CREATE TYPE user_role AS ENUM ('admin', 'operator', 'readonly')"))
    op.execute(sa.text("CREATE TYPE template_category AS ENUM ('vlan', 'interface', 'acl', 'ntp', 'snmp', 'custom')"))
    op.execute(sa.text("CREATE TYPE deploy_status AS ENUM ('pending', 'success', 'failed', 'rolled_back')"))

    # users
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", user_role_enum, nullable=False, server_default="readonly"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # routers
    op.create_table(
        "routers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("hostname", sa.String(255), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=False),
        sa.Column("location", sa.String(255), nullable=True),
        sa.Column("model", sa.String(128), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("snmp_community", sa.String(128), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_routers_ip_address", "routers", ["ip_address"], unique=True)

    # global_credentials (single-row, id always = 1)
    op.create_table(
        "global_credentials",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String(128), nullable=False),
        sa.Column("password_encrypted", sa.String(512), nullable=False),
        sa.Column("enable_password_encrypted", sa.String(512), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # templates
    op.create_table(
        "templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", template_category_enum, nullable=False, server_default="custom"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("variables", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_templates_name", "templates", ["name"], unique=True)

    # config_history
    op.create_table(
        "config_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("router_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("routers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("templates.id", ondelete="SET NULL"), nullable=True),
        sa.Column("deployed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("config_snapshot", sa.Text, nullable=True),
        sa.Column("rendered_config", sa.Text, nullable=True),
        sa.Column("status", deploy_status_enum, nullable=False, server_default="pending"),
        sa.Column("output", sa.Text, nullable=True),
        sa.Column("job_id", sa.String(255), nullable=True),
        sa.Column("deployed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_config_history_router_id", "config_history", ["router_id"])
    op.create_index("ix_config_history_deployed_at", "config_history", ["deployed_at"])

    # audit_logs
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("resource_type", sa.String(64), nullable=True),
        sa.Column("resource_id", sa.String(255), nullable=True),
        sa.Column("detail", postgresql.JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("config_history")
    op.drop_table("templates")
    op.drop_table("global_credentials")
    op.drop_table("routers")
    op.drop_table("users")

    op.execute("DROP TYPE IF EXISTS deploy_status")
    op.execute("DROP TYPE IF EXISTS template_category")
    op.execute("DROP TYPE IF EXISTS user_role")
