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
    # All operations originally in this migration already exist:
    # - search_vector column, GIN index, trigger: created in migration 003
    # - ix_audit_logs_timestamp index: created by index=True in migration 001
    pass


def downgrade() -> None:
    pass
