"""add user profile image

Revision ID: 20260314_0002
Revises: 20260314_0001
Create Date: 2026-03-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260314_0002"
down_revision: Union[str, None] = "20260314_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("profile_image_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "profile_image_url")
