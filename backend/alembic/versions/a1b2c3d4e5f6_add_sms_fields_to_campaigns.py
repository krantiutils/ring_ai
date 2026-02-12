"""add sms_message and services fields to campaigns

Revision ID: a1b2c3d4e5f6
Revises: 3134a9e01ece
Create Date: 2026-02-12 08:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '3134a9e01ece'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    campaign_services = sa.Enum('PHONE', 'SMS', 'SMS & PHONE', name='campaign_services')
    campaign_services.create(op.get_bind(), checkfirst=True)

    op.add_column('campaigns', sa.Column('sms_message', sa.Text(), nullable=True))
    op.add_column('campaigns', sa.Column(
        'services',
        campaign_services,
        nullable=True,
    ))


def downgrade() -> None:
    op.drop_column('campaigns', 'services')
    op.drop_column('campaigns', 'sms_message')
    sa.Enum(name='campaign_services').drop(op.get_bind(), checkfirst=True)
