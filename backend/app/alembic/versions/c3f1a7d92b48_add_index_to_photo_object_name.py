"""Add index to Photo.object_name

La unicidad de object_name (photos_object_name_key) traia un indice implicito y
f4cc8eadd474 la elimino sin reponerlo, dejando cada lookup por object_name en
seq scan. Se repone como indice no unico: la deduplicacion pasó a content_hash.

Revision ID: c3f1a7d92b48
Revises: ae6f478b8221
Create Date: 2026-07-17 00:00:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'c3f1a7d92b48'
down_revision = 'ae6f478b8221'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'photos' AND indexname = 'ix_photos_object_name'
        ) THEN
            CREATE INDEX ix_photos_object_name ON photos (object_name);
        END IF;
    END;
    $$;
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_photos_object_name;")
