"""add campaign retry and relaunch columns

Revision ID: b3c4d5e6f7a8
Revises: 3134a9e01ece
Create Date: 2026-02-12 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "3134a9e01ece"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Track how many times this campaign has been retried at the campaign level
    op.add_column(
        "campaigns",
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
    )

    # Per-campaign retry configuration (backoff_minutes, max_retries)
    op.add_column(
        "campaigns",
        sa.Column("retry_config", postgresql.JSONB(), nullable=True),
    )

    # Link relaunched campaigns back to the original
    op.add_column(
        "campaigns",
        sa.Column(
            "source_campaign_id",
            sa.Uuid(),
            sa.ForeignKey("campaigns.id"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("campaigns", "source_campaign_id")
    op.drop_column("campaigns", "retry_config")
    op.drop_column("campaigns", "retry_count")
