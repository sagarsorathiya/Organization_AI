"""add missing last_reviewed_by column to knowledge_documents

Revision ID: 011
Revises: 010
Create Date: 2026-03-23
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Some environments were created before this column was introduced in ORM models.
    # Add it conditionally to avoid duplicate-column failures.
    op.execute(
        """
        ALTER TABLE knowledge_documents
        ADD COLUMN IF NOT EXISTS last_reviewed_by UUID NULL
        """
    )

    # Add FK only if it does not already exist.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'fk_knowledge_documents_last_reviewed_by_users'
            ) THEN
                ALTER TABLE knowledge_documents
                ADD CONSTRAINT fk_knowledge_documents_last_reviewed_by_users
                FOREIGN KEY (last_reviewed_by)
                REFERENCES users(id)
                ON DELETE SET NULL;
            END IF;
        END$$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE knowledge_documents
        DROP CONSTRAINT IF EXISTS fk_knowledge_documents_last_reviewed_by_users
        """
    )
    op.execute(
        """
        ALTER TABLE knowledge_documents
        DROP COLUMN IF EXISTS last_reviewed_by
        """
    )
