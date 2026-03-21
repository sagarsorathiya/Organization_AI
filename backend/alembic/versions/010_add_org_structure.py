"""Add company, department, designation tables and user FK links.

Revision ID: 010
Revises: 009
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Companies ──
    op.create_table(
        "companies",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── Departments ──
    op.create_table(
        "departments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── Designations ──
    op.create_table(
        "designations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("level", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # ── Many-to-Many: Company ↔ Department ──
    op.create_table(
        "company_departments",
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("department_id", UUID(as_uuid=True), sa.ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
    )

    # ── Many-to-Many: Department ↔ Designation ──
    op.create_table(
        "department_designations",
        sa.Column("department_id", UUID(as_uuid=True), sa.ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("designation_id", UUID(as_uuid=True), sa.ForeignKey("designations.id", ondelete="CASCADE"), primary_key=True),
    )

    # ── User table updates ──
    op.add_column("users", sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="SET NULL"), nullable=True))
    op.add_column("users", sa.Column("department_id", UUID(as_uuid=True), sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True))
    op.add_column("users", sa.Column("designation_id", UUID(as_uuid=True), sa.ForeignKey("designations.id", ondelete="SET NULL"), nullable=True))
    op.add_column("users", sa.Column("needs_profile_setup", sa.Boolean, server_default=sa.text("false"), nullable=False))

    op.create_index("idx_users_company", "users", ["company_id"])
    op.create_index("idx_users_department_id", "users", ["department_id"])
    op.create_index("idx_users_designation", "users", ["designation_id"])


def downgrade() -> None:
    op.drop_index("idx_users_designation", table_name="users")
    op.drop_index("idx_users_department_id", table_name="users")
    op.drop_index("idx_users_company", table_name="users")

    op.drop_column("users", "needs_profile_setup")
    op.drop_column("users", "designation_id")
    op.drop_column("users", "department_id")
    op.drop_column("users", "company_id")

    op.drop_table("department_designations")
    op.drop_table("company_departments")
    op.drop_table("designations")
    op.drop_table("departments")
    op.drop_table("companies")
