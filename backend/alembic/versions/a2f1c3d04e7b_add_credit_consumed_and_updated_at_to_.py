"""add credit_consumed and updated_at to interactions

Revision ID: a2f1c3d04e7b
Revises: 3134a9e01ece
Create Date: 2026-02-12 08:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a2f1c3d04e7b"
down_revision: Union[str, None] = "3134a9e01ece"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "interactions",
        sa.Column("credit_consumed", sa.Float(), nullable=True),
    )
    op.add_column(
        "interactions",
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("interactions", "updated_at")
    op.drop_column("interactions", "credit_consumed")
