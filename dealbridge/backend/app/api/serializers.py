"""Model → dict serialization with role-aware redaction."""
from __future__ import annotations

from datetime import UTC, datetime

from ..models import ComparableSale, DealAnalysis, Investor, Property
from ..security import decrypt, mask_phone


def freshness(retrieved_at: datetime | None, updated: datetime | None = None) -> dict:
    ref = updated or retrieved_at
    if ref is None:
        return {"days": None, "label": "unknown"}
    if ref.tzinfo is None:
        ref = ref.replace(tzinfo=UTC)
    days = (datetime.now(UTC) - ref).days
    label = "fresh" if days <= 7 else "recent" if days <= 30 else "aging" if days <= 90 else "stale"
    return {"days": days, "label": label}


def provenance(obj) -> dict:
    return {
        "data_provider": obj.data_provider,
        "source_url": obj.source_url,
        "retrieved_at": obj.retrieved_at,
        "source_updated_at": obj.source_updated_at,
        "license": obj.license,
        "permitted_use": obj.permitted_use,
        "verification_status": obj.verification_status,
        "freshness": freshness(obj.retrieved_at, obj.source_updated_at),
        "is_demo": obj.is_demo,
    }


def analysis_summary(a: DealAnalysis | None) -> dict | None:
    if a is None:
        return None
    return {
        "id": a.id, "created_at": a.created_at, "score": a.score, "score_band": a.score_band,
        "arv": a.arv, "arv_method": a.arv_method, "arv_confidence": a.arv_confidence, "comp_count": a.comp_count,
        "purchase_price": a.purchase_price, "renovation_total": a.renovation_total,
        "total_project_cost": a.total_project_cost, "cash_required": a.cash_required, "loan_amount": a.loan_amount,
        "net_profit": a.net_profit, "roi_pct": a.roi_pct, "annualized_roi_pct": a.annualized_roi_pct,
        "profit_margin_pct": a.profit_margin_pct, "mao": a.mao, "break_even_price": a.break_even_price,
        "duration_months": a.duration_months, "needs_manual_review": a.needs_manual_review, "flags": a.flags,
    }


def analysis_full(a: DealAnalysis | None) -> dict | None:
    if a is None:
        return None
    return {**analysis_summary(a), "score_components": a.score_components, "explanation": a.explanation,
            "ai_summary": a.ai_summary, "results": a.results, "inputs": a.inputs, "engine_version": a.engine_version}


def current_analysis(p: Property) -> DealAnalysis | None:
    return next((a for a in p.analyses if a.is_current), None)


def property_row(p: Property) -> dict:
    a = current_analysis(p)
    return {
        "id": p.id, "address_line": p.address_line, "unit": p.unit, "city": p.city, "state": p.state,
        "zip_code": p.zip_code, "county": p.county, "lat": p.lat, "lng": p.lng, "market_id": p.market_id,
        "property_type": p.property_type, "beds": p.beds, "baths": p.baths, "sqft": p.sqft,
        "year_built": p.year_built, "condition": p.condition, "listing_status": p.listing_status,
        "list_price": p.list_price, "days_on_market": p.days_on_market, "opportunity_types": p.opportunity_types,
        "status": p.status, "is_demo": p.is_demo, "data_provider": p.data_provider,
        "verification_status": p.verification_status, "updated_at": p.updated_at,
        "analysis": analysis_summary(a),
    }


def property_detail(p: Property, include_sensitive: bool) -> dict:
    d = property_row(p)
    d.update({
        "parcel_id": p.parcel_id, "subdivision": p.subdivision, "lot_sqft": p.lot_sqft, "stories": p.stories,
        "original_list_price": p.original_list_price, "listing_date": p.listing_date, "listing_url": p.listing_url,
        "estimated_market_value": p.estimated_market_value,
        "estimated_market_value_source": p.estimated_market_value_source,
        "assessed_value": p.assessed_value, "assessment_year": p.assessment_year, "annual_taxes": p.annual_taxes,
        "hoa_monthly": p.hoa_monthly, "last_sale_price": p.last_sale_price, "last_sale_date": p.last_sale_date,
        "distress_signals": p.distress_signals, "photos": p.photos, "flood_zone": p.flood_zone,
        "enrichment": p.enrichment, "notes": p.notes, "submitted_by_role": p.submitted_by_role,
        "provenance": provenance(p),
        "price_history": [
            {"date": h.event_date, "event": h.event_type, "price": h.price, "note": h.note,
             "data_provider": h.data_provider, "verification_status": h.verification_status}
            for h in p.price_history
        ],
        "sources": [
            {"source_key": s.source_key, "external_id": s.external_id, "retrieved_at": s.retrieved_at,
             "source_url": s.source_url, "license": s.license}
            for s in p.source_records
        ],
        "analysis": analysis_full(current_analysis(p)),
        "analysis_history": [analysis_summary(a) for a in p.analyses[:10]],
        "assessed_value_note": "Assessed value is a tax figure and is never used as ARV.",
    })
    if include_sensitive:
        d["seller_contact"] = decrypt(p.seller_contact_enc)
        d["access_info"] = decrypt(p.access_info_enc)
    else:
        d["seller_contact"] = d["access_info"] = None
        d["restricted"] = True
    return d


def comp_row(c: ComparableSale) -> dict:
    return {
        "id": c.id, "address_line": c.address_line, "city": c.city, "state": c.state, "zip_code": c.zip_code,
        "lat": c.lat, "lng": c.lng, "property_type": c.property_type, "beds": c.beds, "baths": c.baths,
        "sqft": c.sqft, "lot_sqft": c.lot_sqft, "year_built": c.year_built, "sale_price": c.sale_price,
        "sale_date": c.sale_date, "condition_at_sale": c.condition_at_sale, "sale_type": c.sale_type,
        "source_type": c.source_type, "deed_book_page": c.deed_book_page, "notes": c.notes,
        "subdivision": c.subdivision, **provenance(c),
    }


def investor_row(i: Investor, full_phone: bool = False) -> dict:
    phone = decrypt(i.phone_enc)
    return {
        "id": i.id, "name": i.name, "email": i.email, "phone": phone if full_phone else mask_phone(phone),
        "entity_name": i.entity_name, "investor_type": i.investor_type, "preferred_markets": i.preferred_markets,
        "preferred_zip_codes": i.preferred_zip_codes, "available_capital": i.available_capital,
        "min_investment": i.min_investment, "max_investment": i.max_investment, "property_types": i.property_types,
        "strategies": i.strategies, "min_roi_pct": i.min_roi_pct, "max_duration_months": i.max_duration_months,
        "risk_tolerance": i.risk_tolerance, "experience_level": i.experience_level,
        "funding_availability": i.funding_availability, "lending_terms": i.lending_terms,
        "preferences_notes": i.preferences_notes, "tags": i.tags, "verification_status": i.verification_status,
        "accreditation_status": i.accreditation_status, "proof_of_funds_verified": i.proof_of_funds_verified,
        "pipeline_stage": i.pipeline_stage, "next_follow_up": i.next_follow_up, "email_consent": i.email_consent,
        "sms_consent": i.sms_consent, "unsubscribed": i.unsubscribed, "is_active": i.is_active,
        "is_demo": i.is_demo, "created_at": i.created_at, "updated_at": i.updated_at,
    }
