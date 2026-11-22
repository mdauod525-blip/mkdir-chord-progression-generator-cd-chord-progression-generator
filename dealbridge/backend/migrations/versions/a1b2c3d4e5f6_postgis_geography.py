"""PostGIS geography columns + GiST indexes (Supabase, Render and Railway Postgres all ship PostGIS).

Revision ID: a1b2c3d4e5f6
Revises: f65c309d8e8b
"""
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "f65c309d8e8b"
branch_labels = None
depends_on = None

TABLES = ("properties", "comparable_sales")


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    for t in TABLES:
        op.execute(
            f"ALTER TABLE {t} ADD COLUMN IF NOT EXISTS geom geography(Point, 4326) "
            "GENERATED ALWAYS AS (CASE WHEN lat IS NOT NULL AND lng IS NOT NULL "
            "THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography END) STORED"
        )
        op.execute(f"CREATE INDEX IF NOT EXISTS ix_{t}_geom ON {t} USING GIST (geom)")


def downgrade() -> None:
    for t in TABLES:
        op.execute(f"DROP INDEX IF EXISTS ix_{t}_geom")
        op.execute(f"ALTER TABLE {t} DROP COLUMN IF EXISTS geom")
