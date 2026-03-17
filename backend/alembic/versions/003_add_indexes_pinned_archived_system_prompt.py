"""add indexes, pinned, archived, system_prompt

Revision ID: 003
Revises: 002
Create Date: 2026-02-26
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Performance indexes
    op.create_index("ix_messages_created_at", "messages", ["created_at"])
    op.create_index("ix_conversations_updated_at", "conversations", ["updated_at"])
    op.create_index("ix_messages_conv_created", "messages", ["conversation_id", "created_at"])

    # Pin / archive columns on conversations
    op.add_column("conversations", sa.Column("is_pinned", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("conversations", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))

    # System prompt on user_settings
    op.add_column("user_settings", sa.Column("system_prompt", sa.Text(), nullable=True))

    # Full-text search vector on messages
    op.execute("ALTER TABLE messages ADD COLUMN search_vector tsvector")
    op.execute("""
        CREATE INDEX ix_messages_search ON messages USING gin(search_vector)
    """)
    # Trigger to keep search_vector in sync
    op.execute("""
        CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER messages_search_vector_trigger
        BEFORE INSERT OR UPDATE OF content ON messages
        FOR EACH ROW EXECUTE FUNCTION messages_search_vector_update();
    """)
    # Backfill existing rows
    op.execute("""
        UPDATE messages SET search_vector = to_tsvector('english', COALESCE(content, ''))
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS messages_search_vector_trigger ON messages")
    op.execute("DROP FUNCTION IF EXISTS messages_search_vector_update()")
    op.execute("DROP INDEX IF EXISTS ix_messages_search")
    op.execute("ALTER TABLE messages DROP COLUMN IF EXISTS search_vector")
    op.drop_column("user_settings", "system_prompt")
    op.drop_column("conversations", "archived_at")
    op.drop_column("conversations", "is_pinned")
    op.drop_index("ix_messages_conv_created", "messages")
    op.drop_index("ix_conversations_updated_at", "conversations")
    op.drop_index("ix_messages_created_at", "messages")
