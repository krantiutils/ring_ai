"""add playback tracking fields to interactions

Revision ID: b3c4d5e6f7a8
Revises: 3134a9e01ece
Create Date: 2026-02-12 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = '3134a9e01ece'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'interactions',
        sa.Column('audio_duration_seconds', sa.Integer(), nullable=True),
    )
    op.add_column(
        'interactions',
        sa.Column('playback_duration_seconds', sa.Integer(), nullable=True),
    )
    op.add_column(
        'interactions',
        sa.Column('playback_percentage', sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('interactions', 'playback_percentage')
    op.drop_column('interactions', 'playback_duration_seconds')
    op.drop_column('interactions', 'audio_duration_seconds')
