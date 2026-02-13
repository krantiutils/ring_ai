"""Add ab_tests table and campaign A/B test fields.

Revision ID: d1e2f3a4b5c6
Revises: c4d5e6f7a8b9
Create Date: 2026-02-13 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "d1e2f3a4b5c6"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create ab_test_status enum
    ab_test_status = sa.Enum("draft", "active", "completed", name="ab_test_status")
    ab_test_status.create(op.get_bind(), checkfirst=True)

    # Create ab_tests table
    op.create_table(
        "ab_tests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column("status", ab_test_status, nullable=False, server_default="draft"),
        sa.Column("variants", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_ab_tests_org_id", "ab_tests", ["org_id"])
    op.create_index("ix_ab_tests_status", "ab_tests", ["status"])

    # Add A/B test columns to campaigns
    op.add_column(
        "campaigns",
        sa.Column("ab_test_id", UUID(as_uuid=True), sa.ForeignKey("ab_tests.id"), nullable=True),
    )
    op.add_column(
        "campaigns",
        sa.Column("ab_test_variant", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("campaigns", "ab_test_variant")
    op.drop_column("campaigns", "ab_test_id")

    op.drop_index("ix_ab_tests_status", table_name="ab_tests")
    op.drop_index("ix_ab_tests_org_id", table_name="ab_tests")
    op.drop_table("ab_tests")

    sa.Enum(name="ab_test_status").drop(op.get_bind(), checkfirst=True)
