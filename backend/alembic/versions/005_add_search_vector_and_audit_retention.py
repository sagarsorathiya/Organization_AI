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
    # search_vector column, GIN index, and trigger already created in migration 003
    # This migration only adds the audit_logs timestamp index

    # P9: Index on audit_logs.timestamp for retention queries
    op.create_index(
        "ix_audit_logs_timestamp",
        "audit_logs",
        ["timestamp"],
    )


def downgrade() -> None:
    op.drop_index("ix_audit_logs_timestamp", table_name="audit_logs")
