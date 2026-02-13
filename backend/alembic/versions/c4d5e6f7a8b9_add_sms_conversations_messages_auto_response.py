"""add sms_conversations, sms_messages, and auto_response_rules tables

Revision ID: c4d5e6f7a8b9
Revises: 3134a9e01ece
Create Date: 2026-02-13 12:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, None] = "3134a9e01ece"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SMS Conversations
    op.create_table(
        "sms_conversations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("contact_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("active", "needs_handoff", "closed", name="sms_conversation_status"),
            server_default="active",
            nullable=False,
        ),
        sa.Column("last_message_at", sa.DateTime(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sms_conversations_org_id", "sms_conversations", ["org_id"])
    op.create_index("ix_sms_conversations_contact_id", "sms_conversations", ["contact_id"])
    op.create_index("ix_sms_conversations_org_contact", "sms_conversations", ["org_id", "contact_id"])
    op.create_index("ix_sms_conversations_status", "sms_conversations", ["status"])
    op.create_index("ix_sms_conversations_last_message_at", "sms_conversations", ["last_message_at"])

    # SMS Messages
    op.create_table(
        "sms_messages",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column(
            "direction",
            sa.Enum("inbound", "outbound", name="sms_direction"),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("from_number", sa.String(length=20), nullable=False),
        sa.Column("to_number", sa.String(length=20), nullable=False),
        sa.Column("twilio_sid", sa.String(length=50), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "queued", "sent", "delivered", "failed", "undelivered", "received",
                name="sms_message_status",
            ),
            server_default="queued",
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["sms_conversations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sms_messages_conversation_id", "sms_messages", ["conversation_id"])
    op.create_index("ix_sms_messages_twilio_sid", "sms_messages", ["twilio_sid"])
    op.create_index("ix_sms_messages_direction", "sms_messages", ["direction"])
    op.create_index("ix_sms_messages_created_at", "sms_messages", ["created_at"])

    # Auto-Response Rules
    op.create_table(
        "auto_response_rules",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("keyword", sa.String(length=255), nullable=False),
        sa.Column(
            "match_type",
            sa.Enum("exact", "contains", name="auto_response_match_type"),
            server_default="contains",
            nullable=False,
        ),
        sa.Column("response_template", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("priority", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auto_response_rules_org_id", "auto_response_rules", ["org_id"])
    op.create_index("ix_auto_response_rules_org_active", "auto_response_rules", ["org_id", "is_active"])


def downgrade() -> None:
    op.drop_index("ix_auto_response_rules_org_active", table_name="auto_response_rules")
    op.drop_index("ix_auto_response_rules_org_id", table_name="auto_response_rules")
    op.drop_table("auto_response_rules")

    op.drop_index("ix_sms_messages_created_at", table_name="sms_messages")
    op.drop_index("ix_sms_messages_direction", table_name="sms_messages")
    op.drop_index("ix_sms_messages_twilio_sid", table_name="sms_messages")
    op.drop_index("ix_sms_messages_conversation_id", table_name="sms_messages")
    op.drop_table("sms_messages")

    op.drop_index("ix_sms_conversations_last_message_at", table_name="sms_conversations")
    op.drop_index("ix_sms_conversations_status", table_name="sms_conversations")
    op.drop_index("ix_sms_conversations_org_contact", table_name="sms_conversations")
    op.drop_index("ix_sms_conversations_contact_id", table_name="sms_conversations")
    op.drop_index("ix_sms_conversations_org_id", table_name="sms_conversations")
    op.drop_table("sms_conversations")

    op.execute("DROP TYPE IF EXISTS sms_conversation_status")
    op.execute("DROP TYPE IF EXISTS sms_direction")
    op.execute("DROP TYPE IF EXISTS sms_message_status")
    op.execute("DROP TYPE IF EXISTS auto_response_match_type")
