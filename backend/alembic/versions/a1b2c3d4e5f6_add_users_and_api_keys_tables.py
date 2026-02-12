"""add users and user_api_keys tables

Revision ID: a1b2c3d4e5f6
Revises: 3134a9e01ece
Create Date: 2026-02-12 08:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "3134a9e01ece"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("username", sa.String(length=150), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("profile_picture", sa.String(length=500), nullable=True),
        sa.Column(
            "is_verified",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default="true",
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "user_api_keys",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("key_prefix", sa.String(length=10), nullable=False),
        sa.Column("key_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default="true",
            nullable=False,
        ),
        sa.Column("last_used", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_api_keys_user_id", "user_api_keys", ["user_id"], unique=False
    )
    op.create_index(
        "ix_user_api_keys_key_hash", "user_api_keys", ["key_hash"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_user_api_keys_key_hash", table_name="user_api_keys")
    op.drop_index("ix_user_api_keys_user_id", table_name="user_api_keys")
    op.drop_table("user_api_keys")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
