"""add scheduled status and scheduled_at to campaigns

Revision ID: a2f8c4d91b3e
Revises: 3134a9e01ece
Create Date: 2026-02-12 08:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a2f8c4d91b3e"
down_revision: Union[str, None] = "3134a9e01ece"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add 'scheduled' value to campaign_status enum
    op.execute("ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'scheduled' AFTER 'draft'")

    # Add scheduled_at column
    op.add_column(
        "campaigns",
        sa.Column("scheduled_at", sa.DateTime(), nullable=True),
    )

    # Index for scheduler polling: find scheduled campaigns that are due
    op.create_index(
        "ix_campaigns_scheduled_at",
        "campaigns",
        ["scheduled_at"],
        unique=False,
        postgresql_where=sa.text("status = 'scheduled'"),
    )


def downgrade() -> None:
    op.drop_index("ix_campaigns_scheduled_at", table_name="campaigns")
    op.drop_column("campaigns", "scheduled_at")
    # Note: PostgreSQL does not support removing enum values.
    # To fully revert, the enum type would need to be recreated.
