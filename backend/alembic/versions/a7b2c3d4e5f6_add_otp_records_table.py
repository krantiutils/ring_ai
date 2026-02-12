"""add otp_records table

Revision ID: a7b2c3d4e5f6
Revises: 3134a9e01ece
Create Date: 2026-02-12 08:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b2c3d4e5f6"
down_revision: Union[str, None] = "3134a9e01ece"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "otp_records",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("phone_number", sa.String(length=20), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("otp", sa.String(length=20), nullable=False),
        sa.Column(
            "otp_options",
            sa.Enum("personnel", "generated", name="otp_type"),
            nullable=False,
        ),
        sa.Column(
            "sms_send_options",
            sa.Enum("text", "voice", name="delivery_method"),
            nullable=False,
        ),
        sa.Column("voice_input", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_otp_records_org_id", "otp_records", ["org_id"], unique=False)
    op.create_index("ix_otp_records_phone_number", "otp_records", ["phone_number"], unique=False)
    op.create_index("ix_otp_records_created_at", "otp_records", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_otp_records_created_at", table_name="otp_records")
    op.drop_index("ix_otp_records_phone_number", table_name="otp_records")
    op.drop_index("ix_otp_records_org_id", table_name="otp_records")
    op.drop_table("otp_records")

    op.execute("DROP TYPE IF EXISTS otp_type")
    op.execute("DROP TYPE IF EXISTS delivery_method")
