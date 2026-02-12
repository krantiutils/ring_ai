"""add kyc_verifications table and user kyc fields

Revision ID: b1c2d3e4f5a6
Revises: 3134a9e01ece
Create Date: 2026-02-12 08:41:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "3134a9e01ece"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add is_kyc_verified and is_admin columns to users table
    op.add_column(
        "users",
        sa.Column(
            "is_kyc_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "is_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # Create kyc_verifications table
    op.create_table(
        "kyc_verifications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("document_type", sa.String(length=30), nullable=False),
        sa.Column("document_front_url", sa.String(length=500), nullable=False),
        sa.Column("document_back_url", sa.String(length=500), nullable=False),
        sa.Column("selfie_url", sa.String(length=500), nullable=False),
        sa.Column(
            "submitted_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_kyc_verifications_user_id",
        "kyc_verifications",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_kyc_verifications_user_id", table_name="kyc_verifications")
    op.drop_table("kyc_verifications")
    op.drop_column("users", "is_admin")
    op.drop_column("users", "is_kyc_verified")
