"""Geographic queries: PostGIS when available, bounding box + haversine otherwise."""
from __future__ import annotations

import math
from datetime import date, timedelta

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..analysis.comps import haversine_miles
from ..db import postgis_available
from ..models import ComparableSale


def comps_near(
    db: Session,
    lat: float | None,
    lng: float | None,
    zip_code: str | None,
    radius_miles: float,
    since: date,
    include_demo: bool = True,
) -> list[ComparableSale]:
    """Closed sales within radius (or same ZIP when the subject has no coordinates)."""
    q = select(ComparableSale).where(ComparableSale.sale_date >= since)
    if not include_demo:
        q = q.where(ComparableSale.is_demo.is_(False))
    if lat is None or lng is None:
        if not zip_code:
            return []
        return list(db.scalars(q.where(ComparableSale.zip_code == zip_code)))

    if postgis_available(db):
        ids = db.execute(
            text(
                "SELECT id FROM comparable_sales WHERE geom IS NOT NULL AND "
                "ST_DWithin(geom, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :m)"
            ),
            {"lat": lat, "lng": lng, "m": radius_miles * 1609.344},
        ).scalars().all()
        near = list(db.scalars(q.where(ComparableSale.id.in_(ids)))) if ids else []
    else:
        dlat = radius_miles / 69.0
        dlng = radius_miles / (69.0 * max(math.cos(math.radians(lat)), 0.01))
        cands = db.scalars(
            q.where(
                ComparableSale.lat.between(lat - dlat, lat + dlat),
                ComparableSale.lng.between(lng - dlng, lng + dlng),
            )
        )
        near = [c for c in cands if haversine_miles(lat, lng, c.lat, c.lng) <= radius_miles]
    # comps without coordinates in the same ZIP are still candidates
    if zip_code:
        near += list(db.scalars(q.where(ComparableSale.zip_code == zip_code, ComparableSale.lat.is_(None))))
    return near


def months_ago(months: int, today: date | None = None) -> date:
    return (today or date.today()) - timedelta(days=int(months * 30.4375))
