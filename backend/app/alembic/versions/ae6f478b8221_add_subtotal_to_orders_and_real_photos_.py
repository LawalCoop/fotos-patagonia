"""Add subtotal to orders and real_photos_sold to earnings

Revision ID: ae6f478b8221
Revises: b783c052b57f
Create Date: 2026-03-04 16:36:55.538990

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ae6f478b8221'
down_revision = 'b783c052b57f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add columns as nullable first
    op.add_column('earnings', sa.Column('real_photos_sold', sa.Float(), nullable=True))
    op.add_column('orders', sa.Column('subtotal', sa.Float(), nullable=True))
    
    # 2. Update existing data
    # For orders, subtotal = total
    op.execute("UPDATE orders SET subtotal = total WHERE subtotal IS NULL")
    # For earnings, real_photos_sold = quantity from order_items
    op.execute("UPDATE earnings SET real_photos_sold = order_items.quantity FROM order_items WHERE earnings.order_item_id = order_items.id")

    # 3. Set to NOT NULL
    op.alter_column('earnings', 'real_photos_sold', nullable=False)
    op.alter_column('orders', 'subtotal', nullable=False)


def downgrade() -> None:
    op.drop_column('orders', 'subtotal')
    op.drop_column('earnings', 'real_photos_sold')
