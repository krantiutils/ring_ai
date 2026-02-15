"""add audio_file and bulk_file to campaigns

Revision ID: b3f9d5e72a1c
Revises: a2f8c4d91b3e
Create Date: 2026-02-12 09:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3f9d5e72a1c"
down_revision: Union[str, None] = "a2f8c4d91b3e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "campaigns",
        sa.Column("audio_file", sa.String(500), nullable=True),
    )
    op.add_column(
        "campaigns",
        sa.Column("bulk_file", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("campaigns", "bulk_file")
    op.drop_column("campaigns", "audio_file")
