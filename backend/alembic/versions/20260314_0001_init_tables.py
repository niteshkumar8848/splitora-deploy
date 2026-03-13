"""init tables

Revision ID: 20260314_0001
Revises:
Create Date: 2026-03-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260314_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


split_type_enum = sa.Enum("EQUAL", "PERCENTAGE", "CUSTOM", name="splittype")
expense_status_enum = sa.Enum("ACTIVE", "REVERSED", name="expensestatus")
settlement_status_enum = sa.Enum("PENDING", "CONFIRMED", "REJECTED", "CANCELLED", name="settlementstatus")


def upgrade() -> None:
    split_type_enum.create(op.get_bind(), checkfirst=True)
    expense_status_enum.create(op.get_bind(), checkfirst=True)
    settlement_status_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("upi_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_phone"), "users", ["phone"], unique=True)

    op.create_table(
        "groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invite_code", sa.String(length=20), nullable=False),
        sa.Column("budget", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_groups_invite_code"), "groups", ["invite_code"], unique=True)

    op.create_table(
        "group_members",
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("group_id", "user_id"),
    )

    op.create_table(
        "expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("paid_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("split_type", split_type_enum, nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("is_reversal", sa.Boolean(), nullable=False),
        sa.Column("reversed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", expense_status_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"]),
        sa.ForeignKeyConstraint(["paid_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["reversed_by"], ["expenses.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "expense_splits",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expense_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("share_amount", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["expense_id"], ["expenses.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "settlements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_user", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_user", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("status", settlement_status_enum, nullable=False),
        sa.Column("razorpay_order_id", sa.String(length=100), nullable=True),
        sa.Column("razorpay_payment_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["from_user"], ["users.id"]),
        sa.ForeignKeyConstraint(["group_id"], ["groups.id"]),
        sa.ForeignKeyConstraint(["to_user"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("settlements")
    op.drop_table("expense_splits")
    op.drop_table("expenses")
    op.drop_table("group_members")
    op.drop_index(op.f("ix_groups_invite_code"), table_name="groups")
    op.drop_table("groups")
    op.drop_index(op.f("ix_users_phone"), table_name="users")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    settlement_status_enum.drop(op.get_bind(), checkfirst=True)
    expense_status_enum.drop(op.get_bind(), checkfirst=True)
    split_type_enum.drop(op.get_bind(), checkfirst=True)
