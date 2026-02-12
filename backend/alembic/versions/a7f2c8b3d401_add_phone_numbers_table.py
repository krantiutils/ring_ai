"""add phone_numbers table

Revision ID: a7f2c8b3d401
Revises: 3134a9e01ece
Create Date: 2026-02-12 08:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a7f2c8b3d401"
down_revision: Union[str, None] = "3134a9e01ece"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "phone_numbers",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("phone_number", sa.String(length=20), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column(
            "is_active", sa.Boolean(), server_default="true", nullable=False
        ),
        sa.Column(
            "is_broker", sa.Boolean(), server_default="false", nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_phone_numbers_org_id", "phone_numbers", ["org_id"], unique=False
    )
    op.create_index(
        "ix_phone_numbers_org_active",
        "phone_numbers",
        ["org_id", "is_active"],
        unique=False,
    )
    op.create_index(
        "ix_phone_numbers_org_broker",
        "phone_numbers",
        ["org_id", "is_broker"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_phone_numbers_org_broker", table_name="phone_numbers")
    op.drop_index("ix_phone_numbers_org_active", table_name="phone_numbers")
    op.drop_index("ix_phone_numbers_org_id", table_name="phone_numbers")
    op.drop_table("phone_numbers")
