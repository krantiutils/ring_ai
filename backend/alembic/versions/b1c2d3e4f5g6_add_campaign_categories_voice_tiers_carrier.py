"""add campaign categories, premium voice tiers, carrier detection

Revision ID: b1c2d3e4f5g6
Revises: 3134a9e01ece
Create Date: 2026-02-12 09:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5g6"
down_revision: Union[str, None] = "3134a9e01ece"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Campaign categories ---
    campaign_category = sa.Enum("text", "voice", "survey", "combined", name="campaign_category")
    campaign_category.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "campaigns",
        sa.Column("category", campaign_category, nullable=True),
    )
    op.create_index("ix_campaigns_category", "campaigns", ["category"])

    # --- Campaign voice_model_id FK ---
    op.add_column(
        "campaigns",
        sa.Column("voice_model_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_campaigns_voice_model_id",
        "campaigns",
        "voice_models",
        ["voice_model_id"],
        ["id"],
    )

    # --- VoiceModel org_id FK (nullable = global) ---
    op.add_column(
        "voice_models",
        sa.Column("org_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_voice_models_org_id",
        "voice_models",
        "organizations",
        ["org_id"],
        ["id"],
    )
    op.create_index("ix_voice_models_org_id", "voice_models", ["org_id"])

    # --- Contact carrier field ---
    op.add_column(
        "contacts",
        sa.Column("carrier", sa.String(length=50), nullable=True),
    )
    op.create_index("ix_contacts_carrier", "contacts", ["carrier"])


def downgrade() -> None:
    # --- Contact carrier ---
    op.drop_index("ix_contacts_carrier", table_name="contacts")
    op.drop_column("contacts", "carrier")

    # --- VoiceModel org_id ---
    op.drop_index("ix_voice_models_org_id", table_name="voice_models")
    op.drop_constraint("fk_voice_models_org_id", "voice_models", type_="foreignkey")
    op.drop_column("voice_models", "org_id")

    # --- Campaign voice_model_id ---
    op.drop_constraint("fk_campaigns_voice_model_id", "campaigns", type_="foreignkey")
    op.drop_column("campaigns", "voice_model_id")

    # --- Campaign category ---
    op.drop_index("ix_campaigns_category", table_name="campaigns")
    op.drop_column("campaigns", "category")
    sa.Enum(name="campaign_category").drop(op.get_bind(), checkfirst=True)
