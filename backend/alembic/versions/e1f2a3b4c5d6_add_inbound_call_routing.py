"""add inbound call routing tables and update interactions

Revision ID: e1f2a3b4c5d6
Revises: d1e2f3a4b5c6
Create Date: 2026-02-13 23:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- gateway_phones table ---
    op.create_table(
        "gateway_phones",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("gateway_id", sa.String(length=255), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("phone_number", sa.String(length=20), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("auto_answer", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("system_instruction", sa.Text(), nullable=True),
        sa.Column("voice_name", sa.String(length=50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("gateway_id"),
    )
    op.create_index("ix_gateway_phones_gateway_id", "gateway_phones", ["gateway_id"], unique=True)
    op.create_index("ix_gateway_phones_org_id", "gateway_phones", ["org_id"], unique=False)
    op.create_index(
        "ix_gateway_phones_org_active",
        "gateway_phones",
        ["org_id", "is_active"],
        unique=False,
    )

    # --- inbound_routing_rules table ---
    inbound_routing_match_type = sa.Enum(
        "all", "prefix", "exact", "contact_only",
        name="inbound_routing_match_type",
    )
    inbound_routing_action = sa.Enum(
        "answer", "reject", "forward",
        name="inbound_routing_action",
    )

    op.create_table(
        "inbound_routing_rules",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("caller_pattern", sa.String(length=255), nullable=True),
        sa.Column("match_type", inbound_routing_match_type, server_default="all", nullable=False),
        sa.Column("action", inbound_routing_action, server_default="answer", nullable=False),
        sa.Column("forward_to", sa.String(length=20), nullable=True),
        sa.Column("system_instruction", sa.Text(), nullable=True),
        sa.Column("voice_name", sa.String(length=50), nullable=True),
        sa.Column("time_start", sa.Time(), nullable=True),
        sa.Column("time_end", sa.Time(), nullable=True),
        sa.Column("days_of_week", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("priority", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inbound_routing_rules_org_id", "inbound_routing_rules", ["org_id"], unique=False)
    op.create_index(
        "ix_inbound_routing_rules_org_active",
        "inbound_routing_rules",
        ["org_id", "is_active"],
        unique=False,
    )
    op.create_index(
        "ix_inbound_routing_rules_org_priority",
        "inbound_routing_rules",
        ["org_id", "priority"],
        unique=False,
    )

    # --- interactions table updates ---
    # Add org_id column (nullable for existing rows)
    op.add_column("interactions", sa.Column("org_id", sa.UUID(), nullable=True))
    op.create_foreign_key("fk_interactions_org_id", "interactions", "organizations", ["org_id"], ["id"])
    op.create_index("ix_interactions_org_id", "interactions", ["org_id"], unique=False)

    # Make campaign_id nullable (was NOT NULL — inbound calls have no campaign)
    op.alter_column("interactions", "campaign_id", existing_type=sa.UUID(), nullable=True)

    # Make contact_id nullable (inbound calls from unknown numbers)
    op.alter_column("interactions", "contact_id", existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    # --- interactions rollback ---
    op.alter_column("interactions", "contact_id", existing_type=sa.UUID(), nullable=False)
    op.alter_column("interactions", "campaign_id", existing_type=sa.UUID(), nullable=False)
    op.drop_index("ix_interactions_org_id", table_name="interactions")
    op.drop_constraint("fk_interactions_org_id", "interactions", type_="foreignkey")
    op.drop_column("interactions", "org_id")

    # --- inbound_routing_rules rollback ---
    op.drop_index("ix_inbound_routing_rules_org_priority", table_name="inbound_routing_rules")
    op.drop_index("ix_inbound_routing_rules_org_active", table_name="inbound_routing_rules")
    op.drop_index("ix_inbound_routing_rules_org_id", table_name="inbound_routing_rules")
    op.drop_table("inbound_routing_rules")
    sa.Enum(name="inbound_routing_match_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="inbound_routing_action").drop(op.get_bind(), checkfirst=True)

    # --- gateway_phones rollback ---
    op.drop_index("ix_gateway_phones_org_active", table_name="gateway_phones")
    op.drop_index("ix_gateway_phones_org_id", table_name="gateway_phones")
    op.drop_index("ix_gateway_phones_gateway_id", table_name="gateway_phones")
    op.drop_table("gateway_phones")
