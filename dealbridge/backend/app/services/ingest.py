"""Run a connector and upsert its records with de-duplication and provenance."""
from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..connectors.base import ConnectorError, FetchResult, PropertyRecord, SaleRecord
from ..connectors.providers import REGISTRY
from ..models import ComparableSale, DataSource, IngestionRun, Market, PriceHistory, Property, PropertySourceRecord
from .addresses import address_key, zip5
from .audit import alert

# Fields a public-records import may fill but never overwrite once an analyst set them.
FILLABLE = ("county", "parcel_id", "lat", "lng", "beds", "baths", "sqft", "lot_sqft", "year_built", "subdivision")
# Fields public records own (refreshed on each import).
REFRESH = ("assessed_value", "assessment_year", "annual_taxes", "last_sale_price", "last_sale_date")


def connector_for(src: DataSource, client=None):
    cls = REGISTRY.get(src.connector)
    if not cls:
        raise ConnectorError(f"unknown connector {src.connector}")
    return cls(config=dict(src.config or {}), client=client, source_key=src.key,
               license=src.license, permitted_use=src.permitted_use)


def market_for(db: Session, state: str, zip_code: str, county: str | None, city: str | None) -> str | None:
    z = zip5(zip_code)
    markets = db.scalars(select(Market).where(Market.is_active.is_(True))).all()
    for m in markets:
        if z and z in (m.zip_codes or []):
            return m.id
    for m in markets:
        if m.state == state and county and county.lower().replace(" county", "") in [
            c.lower().replace(" county", "") for c in (m.counties or [])
        ]:
            return m.id
    for m in markets:
        if m.state == state and city and city.lower() in [c.lower() for c in (m.cities or [])]:
            return m.id
    return None


def _hash(raw: dict) -> str:
    return hashlib.sha256(json.dumps(raw, sort_keys=True, default=str).encode()).hexdigest()


def upsert_property(db: Session, rec: PropertyRecord, source_key: str) -> tuple[Property, str]:
    key = address_key(rec.address_line, rec.city, rec.state, rec.zip_code)
    prop = db.scalar(select(Property).where(Property.address_key == key))
    if prop is None and rec.parcel_id:
        prop = db.scalar(select(Property).where(Property.parcel_id == rec.parcel_id, Property.state == rec.state))
    p = rec.provenance
    action = "updated"
    if prop is None:
        action = "created"
        prop = Property(
            address_key=key, address_line=rec.address_line, city=rec.city, state=rec.state,
            zip_code=zip5(rec.zip_code) or rec.zip_code, property_type=rec.property_type or "single_family",
            data_provider=p.data_provider, source_url=p.source_url, retrieved_at=p.retrieved_at,
            source_updated_at=p.source_updated_at, license=p.license, permitted_use=p.permitted_use,
            verification_status=p.verification_status,
            market_id=market_for(db, rec.state, rec.zip_code, rec.county, rec.city),
            listing_status="unknown",
        )
        db.add(prop)
    else:
        prop.retrieved_at = p.retrieved_at
    for f in FILLABLE:
        v = getattr(rec, f, None)
        if v is not None and getattr(prop, f) is None:
            setattr(prop, f, v)
    for f in REFRESH:
        v = getattr(rec, f, None)
        if v is not None:
            setattr(prop, f, v)
    # Availability is only recorded from sources that publish it (never from assessments).
    if rec.listing_status:
        if rec.list_price and prop.list_price and rec.list_price < prop.list_price:
            if "price_reduced" not in (prop.opportunity_types or []):
                prop.opportunity_types = [*(prop.opportunity_types or []), "price_reduced"]
        if rec.list_price and rec.list_price != prop.list_price:
            db.add(PriceHistory(property=prop, event_date=datetime.now(UTC).date(),
                                event_type="listed" if prop.list_price is None else "price_change",
                                price=rec.list_price, data_provider=p.data_provider, source_url=p.source_url,
                                license=p.license, verification_status=p.verification_status))
            prop.original_list_price = prop.original_list_price or rec.list_price
            prop.list_price = rec.list_price
        prop.listing_status = rec.listing_status
        prop.listing_url = rec.listing_url or prop.listing_url
    if rec.opportunity_types:
        prop.opportunity_types = sorted(set(prop.opportunity_types or []) | set(rec.opportunity_types))
    db.flush()

    sr = db.scalar(select(PropertySourceRecord).where(
        PropertySourceRecord.source_key == source_key, PropertySourceRecord.external_id == rec.external_id))
    h = _hash(rec.raw)
    if sr is None:
        db.add(PropertySourceRecord(property_id=prop.id, source_key=source_key, external_id=rec.external_id,
                                    raw=json.loads(json.dumps(rec.raw, default=str)), content_hash=h,
                                    data_provider=p.data_provider, source_url=p.source_url,
                                    retrieved_at=p.retrieved_at, license=p.license,
                                    verification_status=p.verification_status))
    else:
        if sr.content_hash == h and action == "updated":
            action = "unchanged"
        sr.raw, sr.content_hash, sr.retrieved_at, sr.property_id = (
            json.loads(json.dumps(rec.raw, default=str)), h, p.retrieved_at, prop.id)
    return prop, action


def upsert_sale(db: Session, rec: SaleRecord) -> str:
    key = address_key(rec.address_line, rec.city, rec.state, rec.zip_code)
    existing = db.scalar(select(ComparableSale).where(
        ComparableSale.address_key == key, ComparableSale.sale_date == rec.sale_date,
        ComparableSale.sale_price == rec.sale_price))
    if existing:
        return "unchanged"
    p = rec.provenance
    db.add(ComparableSale(
        address_key=key, address_line=rec.address_line, city=rec.city, state=rec.state,
        zip_code=zip5(rec.zip_code) or rec.zip_code, county=rec.county, parcel_id=rec.parcel_id, lat=rec.lat,
        lng=rec.lng, property_type=rec.property_type, beds=rec.beds, baths=rec.baths, sqft=rec.sqft,
        lot_sqft=rec.lot_sqft, year_built=rec.year_built, sale_price=rec.sale_price, sale_date=rec.sale_date,
        sale_type=rec.sale_type, source_type=rec.source_type, deed_book_page=rec.deed_book_page,
        data_provider=p.data_provider, source_url=p.source_url, retrieved_at=p.retrieved_at, license=p.license,
        permitted_use=p.permitted_use, verification_status=p.verification_status,
    ))
    return "created"


def store_result(db: Session, run: IngestionRun, result: FetchResult, source_key: str) -> None:
    run.records_fetched = len(result.properties) + len(result.sales)
    for rec in result.properties:
        _, action = upsert_property(db, rec, source_key)
        if action == "created":
            run.records_created += 1
        elif action == "updated":
            run.records_updated += 1
        else:
            run.records_skipped += 1
    for s in result.sales:
        if upsert_sale(db, s) == "created":
            run.records_created += 1
        else:
            run.records_skipped += 1
    run.errors = (run.errors or []) + result.errors[:200]


def run_source(db: Session, src: DataSource, triggered_by: str = "manual", client=None, **params: Any) -> IngestionRun:
    run = IngestionRun(source_key=src.key, triggered_by=triggered_by)
    db.add(run)
    db.flush()
    try:
        conn = connector_for(src, client)
        result = conn.fetch(**params)
        store_result(db, run, result, src.key)
        run.status = "succeeded" if not result.errors else "partial"
    except ConnectorError as exc:
        run.status = "not_configured" if exc.__class__.__name__ == "NotConfigured" else "failed"
        run.errors = [str(exc)]
        if run.status == "failed":
            alert(db, "ingestion", f"Data source {src.name} failed", str(exc), level="warning")
    run.finished_at = datetime.now(UTC)
    src.last_run_at = run.finished_at
    src.last_status = run.status
    db.flush()
    return run


def enrich_property(db: Session, prop: Property, sources: list[DataSource], client=None) -> dict:
    """Attach free public enrichment (FEMA, Census, EPA) to a property. Failures are recorded, not fatal."""
    out: dict[str, Any] = dict(prop.enrichment or {})
    for src in sources:
        try:
            conn = connector_for(src, client)
            if src.connector in ("fema_nfhl", "epa_echo"):
                if prop.lat is None:
                    continue
                res = conn.fetch(lat=prop.lat, lng=prop.lng)
            elif src.connector == "census_acs":
                res = conn.fetch(zip_code=prop.zip_code)
            else:
                continue
            for k, v in res.enrichment.items():
                out[k] = {**v, "retrieved_at": datetime.now(UTC).isoformat()} if isinstance(v, dict) else v
            if "fema" in res.enrichment and res.enrichment["fema"].get("flood_zone"):
                prop.flood_zone = res.enrichment["fema"]["flood_zone"]
        except ConnectorError as exc:
            out.setdefault("_errors", {})[src.key] = str(exc)
    prop.enrichment = out
    return out
