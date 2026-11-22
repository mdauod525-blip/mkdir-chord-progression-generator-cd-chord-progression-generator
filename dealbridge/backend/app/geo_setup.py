"""PostGIS setup: a generated geography column + GiST index on properties and comparable sales.

Kept separate from the ORM models so the same models run on SQLite in tests. When PostGIS is
not available the geo service falls back to a bounding-box prefilter plus haversine distance.
"""
from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

log = logging.getLogger(__name__)

GEO_TABLES = ("properties", "comparable_sales")


def ensure_postgis(engine: Engine) -> bool:
    with engine.begin() as conn:
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        except Exception as exc:  # extension not installed / not permitted
            log.warning("PostGIS unavailable, using haversine fallback: %s", exc)
            return False
    with engine.begin() as conn:
        for table in GEO_TABLES:
            exists = conn.execute(
                text(
                    "SELECT 1 FROM information_schema.columns WHERE table_name=:t AND column_name='geom'"
                ),
                {"t": table},
            ).scalar()
            if not exists:
                conn.execute(
                    text(
                        f"ALTER TABLE {table} ADD COLUMN geom geography(Point, 4326) "
                        "GENERATED ALWAYS AS (CASE WHEN lat IS NOT NULL AND lng IS NOT NULL "
                        "THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography END) STORED"
                    )
                )
                conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table}_geom ON {table} USING GIST (geom)"))
    return True
