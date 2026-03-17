"""add feedback, templates, tags, announcements, sharing, bookmarks tables

Revision ID: 006
Revises: 005
Create Date: 2026-03-17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Message Feedback
    op.create_table(
        "message_feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_positive", sa.Boolean(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_message_feedback_message_id", "message_feedback", ["message_id"])
    op.create_index("ix_message_feedback_user_id", "message_feedback", ["user_id"])
    op.create_unique_constraint("uq_feedback_message_user", "message_feedback", ["message_id", "user_id"])

    # Prompt Templates
    op.create_table(
        "prompt_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("category", sa.String(100), nullable=False, server_default="General"),
        sa.Column("is_system", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("usage_count", sa.Integer(), server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_prompt_templates_category", "prompt_templates", ["category"])

    # Conversation Tags
    op.create_table(
        "conversation_tags",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("color", sa.String(7), nullable=False, server_default="#6366f1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_conversation_tags_user_id", "conversation_tags", ["user_id"])
    op.create_unique_constraint("uq_tag_user_name", "conversation_tags", ["user_id", "name"])

    # Conversation Tag Links
    op.create_table(
        "conversation_tag_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tag_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversation_tags.id", ondelete="CASCADE"), nullable=False),
    )
    op.create_index("ix_conversation_tag_links_conversation_id", "conversation_tag_links", ["conversation_id"])
    op.create_index("ix_conversation_tag_links_tag_id", "conversation_tag_links", ["tag_id"])
    op.create_unique_constraint("uq_conv_tag", "conversation_tag_links", ["conversation_id", "tag_id"])

    # Announcements
    op.create_table(
        "announcements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("type", sa.String(20), nullable=False, server_default="info"),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Shared Conversations
    op.create_table(
        "shared_conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("share_token", sa.String(64), unique=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_shared_conversations_conversation_id", "shared_conversations", ["conversation_id"])

    # Message Bookmarks
    op.create_table(
        "message_bookmarks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("note", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_message_bookmarks_user_id", "message_bookmarks", ["user_id"])
    op.create_index("ix_message_bookmarks_message_id", "message_bookmarks", ["message_id"])
    op.create_unique_constraint("uq_bookmark_user_message", "message_bookmarks", ["user_id", "message_id"])


def downgrade() -> None:
    op.drop_table("message_bookmarks")
    op.drop_table("shared_conversations")
    op.drop_table("announcements")
    op.drop_table("conversation_tag_links")
    op.drop_table("conversation_tags")
    op.drop_table("prompt_templates")
    op.drop_table("message_feedback")
