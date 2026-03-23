"""add multi knowledge base support for agents

Revision ID: 012
Revises: 011
Create Date: 2026-03-23
"""

from typing import Sequence, Union

from alembic import op


revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE agents
        ADD COLUMN IF NOT EXISTS knowledge_base_ids JSONB NULL
        """
    )

    op.execute(
        """
        UPDATE agents
        SET knowledge_base_ids = jsonb_build_array(knowledge_base_id::text)
        WHERE knowledge_base_id IS NOT NULL
          AND (knowledge_base_ids IS NULL OR knowledge_base_ids = '[]'::jsonb)
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE agents
        DROP COLUMN IF EXISTS knowledge_base_ids
        """
    )
