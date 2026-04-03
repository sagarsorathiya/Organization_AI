"""add eval trace and action execution request tables

Revision ID: 014_add_eval_trace_and_action_requests
Revises: 013_add_generated_files_table
Create Date: 2026-04-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "014_eval_trace_actions"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "request_traces",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("phase", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=256), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_request_traces_request_id", "request_traces", ["request_id"])
    op.create_index("ix_request_traces_user_id", "request_traces", ["user_id"])
    op.create_index("ix_request_traces_conversation_id", "request_traces", ["conversation_id"])
    op.create_index("ix_request_traces_message_id", "request_traces", ["message_id"])
    op.create_index("ix_request_traces_phase", "request_traces", ["phase"])
    op.create_index("ix_request_traces_created_at", "request_traces", ["created_at"])

    op.create_table(
        "action_execution_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("action_type", sa.String(length=128), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending_approval"),
        sa.Column("requires_approval", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("request_trace_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["request_trace_id"], ["request_traces.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index("ix_action_execution_requests_status", "action_execution_requests", ["status"])
    op.create_index("ix_action_execution_requests_action_type", "action_execution_requests", ["action_type"])
    op.create_index("ix_action_execution_requests_requested_by", "action_execution_requests", ["requested_by"])
    op.create_index("ix_action_execution_requests_approved_by", "action_execution_requests", ["approved_by"])
    op.create_index("ix_action_execution_requests_idempotency_key", "action_execution_requests", ["idempotency_key"])


def downgrade() -> None:
    op.drop_index("ix_action_execution_requests_idempotency_key", table_name="action_execution_requests")
    op.drop_index("ix_action_execution_requests_approved_by", table_name="action_execution_requests")
    op.drop_index("ix_action_execution_requests_requested_by", table_name="action_execution_requests")
    op.drop_index("ix_action_execution_requests_action_type", table_name="action_execution_requests")
    op.drop_index("ix_action_execution_requests_status", table_name="action_execution_requests")
    op.drop_table("action_execution_requests")

    op.drop_index("ix_request_traces_created_at", table_name="request_traces")
    op.drop_index("ix_request_traces_phase", table_name="request_traces")
    op.drop_index("ix_request_traces_message_id", table_name="request_traces")
    op.drop_index("ix_request_traces_conversation_id", table_name="request_traces")
    op.drop_index("ix_request_traces_user_id", table_name="request_traces")
    op.drop_index("ix_request_traces_request_id", table_name="request_traces")
    op.drop_table("request_traces")
