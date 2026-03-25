"""add generated files table

Revision ID: 013
Revises: 012
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op


revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS generated_files (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            filename VARCHAR(512) NOT NULL,
            extension VARCHAR(20) NOT NULL,
            mime_type VARCHAR(255) NOT NULL,
            size_bytes BIGINT NOT NULL,
            content BYTEA NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute("CREATE INDEX IF NOT EXISTS ix_generated_files_user_id ON generated_files (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_generated_files_conversation_id ON generated_files (conversation_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_generated_files_message_id ON generated_files (message_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS generated_files")
