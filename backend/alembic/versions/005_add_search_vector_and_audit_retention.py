"""add search_vector column, GIN index, tsvector trigger, audit retention index

Revision ID: 005
Revises: 004
Create Date: 2026-02-27
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # P2/P3/F2: Add tsvector column for full-text search
    op.add_column(
        "messages",
        sa.Column("search_vector", postgresql.TSVECTOR, nullable=True),
    )

    # P2: Create GIN index on search_vector
    op.create_index(
        "ix_messages_search_vector",
        "messages",
        ["search_vector"],
        postgresql_using="gin",
    )

    # Populate existing rows
    op.execute(
        "UPDATE messages SET search_vector = to_tsvector('english', content) WHERE search_vector IS NULL"
    )

    # Auto-update trigger: keep search_vector in sync with content
    op.execute("""
        CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector := to_tsvector('english', NEW.content);
            RETURN NEW;
        END
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        CREATE TRIGGER trg_messages_search_vector
        BEFORE INSERT OR UPDATE OF content ON messages
        FOR EACH ROW EXECUTE FUNCTION messages_search_vector_update();
    """)

    # P9: Index on audit_logs.timestamp for retention queries
    op.create_index(
        "ix_audit_logs_timestamp",
        "audit_logs",
        ["timestamp"],
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_messages_search_vector ON messages")
    op.execute("DROP FUNCTION IF EXISTS messages_search_vector_update()")
    op.drop_index("ix_messages_search_vector", table_name="messages")
    op.drop_column("messages", "search_vector")
    op.drop_index("ix_audit_logs_timestamp", table_name="audit_logs")
