"""add credits and credit_transactions tables

Revision ID: b3c4d5e6f7a8
Revises: 3134a9e01ece
Create Date: 2026-02-12 09:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "3134a9e01ece"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Credits table — one row per org
    op.create_table(
        "credits",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("balance", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_purchased", sa.Float(), nullable=False, server_default="0"),
        sa.Column("total_consumed", sa.Float(), nullable=False, server_default="0"),
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
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id"),
    )
    op.create_index("ix_credits_org_id", "credits", ["org_id"], unique=True)

    # Credit transactions table — immutable log
    op.create_table(
        "credit_transactions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("credit_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column(
            "type",
            sa.Enum("purchase", "consume", "refund", name="credit_transaction_type"),
            nullable=False,
        ),
        sa.Column("reference_id", sa.String(length=255), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["credit_id"], ["credits.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_credit_transactions_org_id", "credit_transactions", ["org_id"])
    op.create_index("ix_credit_transactions_credit_id", "credit_transactions", ["credit_id"])
    op.create_index("ix_credit_transactions_type", "credit_transactions", ["type"])
    op.create_index("ix_credit_transactions_created_at", "credit_transactions", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_credit_transactions_created_at", table_name="credit_transactions")
    op.drop_index("ix_credit_transactions_type", table_name="credit_transactions")
    op.drop_index("ix_credit_transactions_credit_id", table_name="credit_transactions")
    op.drop_index("ix_credit_transactions_org_id", table_name="credit_transactions")
    op.drop_table("credit_transactions")

    op.drop_index("ix_credits_org_id", table_name="credits")
    op.drop_table("credits")

    op.execute("DROP TYPE IF EXISTS credit_transaction_type")
