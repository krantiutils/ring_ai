"""add forms and form_responses tables, add form_id to campaigns

Revision ID: b3c4d5e6f7a8
Revises: 3134a9e01ece
Create Date: 2026-02-12 08:39:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "3134a9e01ece"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create form_status enum
    form_status = postgresql.ENUM(
        "draft", "active", "archived", name="form_status", create_type=False
    )
    form_status.create(op.get_bind(), checkfirst=True)

    # Create forms table
    op.create_table(
        "forms",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("org_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("questions", postgresql.JSONB(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "draft", "active", "archived",
                name="form_status",
                create_type=False,
            ),
            server_default="draft",
            nullable=False,
        ),
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
    )
    op.create_index("ix_forms_org_id", "forms", ["org_id"], unique=False)
    op.create_index("ix_forms_status", "forms", ["status"], unique=False)
    op.create_index(
        "ix_forms_org_status", "forms", ["org_id", "status"], unique=False
    )

    # Create form_responses table
    op.create_table(
        "form_responses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("form_id", sa.UUID(), nullable=False),
        sa.Column("contact_id", sa.UUID(), nullable=False),
        sa.Column("answers", postgresql.JSONB(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["form_id"], ["forms.id"]),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_form_responses_form_id", "form_responses", ["form_id"], unique=False
    )
    op.create_index(
        "ix_form_responses_contact_id",
        "form_responses",
        ["contact_id"],
        unique=False,
    )
    op.create_index(
        "ix_form_responses_form_contact",
        "form_responses",
        ["form_id", "contact_id"],
        unique=False,
    )

    # Add form_id FK column to campaigns
    op.add_column(
        "campaigns",
        sa.Column("form_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_campaigns_form_id",
        "campaigns",
        "forms",
        ["form_id"],
        ["id"],
    )


def downgrade() -> None:
    # Drop form_id from campaigns
    op.drop_constraint("fk_campaigns_form_id", "campaigns", type_="foreignkey")
    op.drop_column("campaigns", "form_id")

    # Drop form_responses
    op.drop_index("ix_form_responses_form_contact", table_name="form_responses")
    op.drop_index("ix_form_responses_contact_id", table_name="form_responses")
    op.drop_index("ix_form_responses_form_id", table_name="form_responses")
    op.drop_table("form_responses")

    # Drop forms
    op.drop_index("ix_forms_org_status", table_name="forms")
    op.drop_index("ix_forms_status", table_name="forms")
    op.drop_index("ix_forms_org_id", table_name="forms")
    op.drop_table("forms")

    # Drop enum
    op.execute("DROP TYPE IF EXISTS form_status")
