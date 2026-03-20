"""add V2 tables: agents, ai_memories, agent_skills, skill_executions,
knowledge_bases, knowledge_documents, document_chunks, scheduled_tasks,
task_executions, notifications; add agent_id FK to conversations

Revision ID: 009
Revises: 008
Create Date: 2026-06-15
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON


revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- Knowledge Bases ----
    op.create_table(
        "knowledge_bases",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("department", sa.String(100)),
        sa.Column("is_public", sa.Boolean, server_default="true"),
        sa.Column("allowed_roles", JSON),
        sa.Column("embedding_model", sa.String(100), server_default="'nomic-embed-text'"),
        sa.Column("chunk_size", sa.Integer, server_default="500"),
        sa.Column("chunk_overlap", sa.Integer, server_default="50"),
        sa.Column("document_count", sa.Integer, server_default="0"),
        sa.Column("total_chunks", sa.Integer, server_default="0"),
        sa.Column("last_synced_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ---- Knowledge Documents ----
    op.create_table(
        "knowledge_documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("knowledge_base_id", UUID(as_uuid=True), sa.ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("file_name", sa.String(300)),
        sa.Column("file_type", sa.String(20)),
        sa.Column("file_size", sa.Integer),
        sa.Column("file_hash", sa.String(64)),
        sa.Column("status", sa.String(20), server_default="'pending'"),
        sa.Column("chunk_count", sa.Integer, server_default="0"),
        sa.Column("error_message", sa.Text),
        sa.Column("review_date", sa.DateTime(timezone=True)),
        sa.Column("version", sa.Integer, server_default="1"),
        sa.Column("uploaded_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ---- Document Chunks ----
    op.create_table(
        "document_chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("metadata", JSON),
        sa.Column("embedding_vector", JSON),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_document_chunks_doc_idx", "document_chunks", ["document_id", "chunk_index"])

    # ---- Agents ----
    op.create_table(
        "agents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("icon", sa.String(10)),
        sa.Column("category", sa.String(50)),
        sa.Column("system_prompt", sa.Text, nullable=False),
        sa.Column("temperature", sa.Float, server_default="0.7"),
        sa.Column("preferred_model", sa.String(100)),
        sa.Column("max_tokens", sa.Integer),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("is_default", sa.Boolean, server_default="false"),
        sa.Column("is_system", sa.Boolean, server_default="false"),
        sa.Column("allowed_roles", JSON),
        sa.Column("allowed_departments", JSON),
        sa.Column("knowledge_base_id", UUID(as_uuid=True), sa.ForeignKey("knowledge_bases.id", ondelete="SET NULL")),
        sa.Column("usage_count", sa.Integer, server_default="0"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ---- AI Memories ----
    op.create_table(
        "ai_memories",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("department", sa.String(100)),
        sa.Column("scope", sa.String(20), nullable=False, server_default="'user'"),
        sa.Column("category", sa.String(30), nullable=False, server_default="'fact'"),
        sa.Column("key", sa.String(200), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("confidence", sa.Float, server_default="1.0"),
        sa.Column("source", sa.String(20), server_default="'explicit'"),
        sa.Column("access_count", sa.Integer, server_default="0"),
        sa.Column("last_accessed", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_ai_memories_user_scope_cat", "ai_memories", ["user_id", "scope", "category"])
    op.create_unique_constraint("uq_ai_memories_user_scope_key", "ai_memories", ["user_id", "scope", "key"])

    # ---- Agent Skills ----
    op.create_table(
        "agent_skills",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="SET NULL")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("icon", sa.String(10)),
        sa.Column("category", sa.String(50)),
        sa.Column("skill_type", sa.String(30), server_default="'prompt_chain'"),
        sa.Column("steps", JSON, nullable=False),
        sa.Column("input_schema", JSON),
        sa.Column("output_format", sa.String(20), server_default="'markdown'"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("is_system", sa.Boolean, server_default="false"),
        sa.Column("requires_approval", sa.Boolean, server_default="false"),
        sa.Column("usage_count", sa.Integer, server_default="0"),
        sa.Column("avg_rating", sa.Float),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ---- Skill Executions ----
    op.create_table(
        "skill_executions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("skill_id", UUID(as_uuid=True), sa.ForeignKey("agent_skills.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), server_default="'pending'"),
        sa.Column("inputs", JSON),
        sa.Column("result", sa.Text),
        sa.Column("error_message", sa.Text),
        sa.Column("duration_ms", sa.Integer),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )

    # ---- Scheduled Tasks ----
    op.create_table(
        "scheduled_tasks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("task_type", sa.String(50), nullable=False),
        sa.Column("cron_expression", sa.String(100), nullable=False),
        sa.Column("timezone", sa.String(50), server_default="'UTC'"),
        sa.Column("config", JSON),
        sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="SET NULL")),
        sa.Column("target_users", JSON),
        sa.Column("target_departments", JSON),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("last_run_at", sa.DateTime(timezone=True)),
        sa.Column("last_status", sa.String(20)),
        sa.Column("last_error", sa.Text),
        sa.Column("next_run_at", sa.DateTime(timezone=True)),
        sa.Column("run_count", sa.Integer, server_default="0"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # ---- Task Executions ----
    op.create_table(
        "task_executions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("scheduled_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), server_default="'running'"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("duration_ms", sa.Integer),
        sa.Column("result_summary", sa.Text),
        sa.Column("error_message", sa.Text),
        sa.Column("affected_users", sa.Integer),
    )

    # ---- Notifications ----
    op.create_table(
        "notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("content", sa.Text),
        sa.Column("type", sa.String(20), server_default="'info'"),
        sa.Column("source", sa.String(50)),
        sa.Column("is_read", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_notifications_user_read", "notifications", ["user_id", "is_read"])

    # ---- Add agent_id FK to conversations ----
    op.add_column(
        "conversations",
        sa.Column("agent_id", UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="SET NULL")),
    )


def downgrade() -> None:
    op.drop_column("conversations", "agent_id")
    op.drop_index("ix_notifications_user_read", table_name="notifications")
    op.drop_table("notifications")
    op.drop_table("task_executions")
    op.drop_table("scheduled_tasks")
    op.drop_table("skill_executions")
    op.drop_table("agent_skills")
    op.drop_constraint("uq_ai_memories_user_scope_key", "ai_memories")
    op.drop_index("ix_ai_memories_user_scope_cat", table_name="ai_memories")
    op.drop_table("ai_memories")
    op.drop_table("agents")
    op.drop_index("ix_document_chunks_doc_idx", table_name="document_chunks")
    op.drop_table("document_chunks")
    op.drop_table("knowledge_documents")
    op.drop_table("knowledge_bases")
