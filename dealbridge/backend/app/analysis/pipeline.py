"""Orchestrates a full deal analysis for a stored property and persists the result."""
from __future__ import annotations

import hashlib
import json
from datetime import date
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..models import ComparableSale, DealAnalysis, Market, Property, RenovationEstimate
from ..services.geo import comps_near, months_ago
from .assumptions import merged_assumptions
from .comps import Comp, Subject, apply_manual_arv, evaluate_comps
from .financials import DealInputs, analyze_deal
from .renovation import ISSUE_FLAGS, RenovationInput, estimate_renovation
from .scoring import ScoreInputs, score_deal

ENGINE_VERSION = "1.0.0"


def assumptions_for(db: Session, prop: Property, overrides: dict | None = None) -> dict:
    market_values: dict[str, Any] = {}
    if prop.market_id:
        m = db.get(Market, prop.market_id)
        if m and m.assumptions:
            market_values = m.assumptions.values or {}
    a = merged_assumptions(overrides=market_values)
    return merged_assumptions(overrides={**a, **(overrides or {})})


def _comp_from_row(c: ComparableSale) -> Comp:
    return Comp(
        id=c.id, address=f"{c.address_line}, {c.city}, {c.state} {c.zip_code}", sale_price=c.sale_price,
        sale_date=c.sale_date, property_type=c.property_type, sqft=c.sqft, beds=c.beds, baths=c.baths,
        lot_sqft=c.lot_sqft, lat=c.lat, lng=c.lng, zip_code=c.zip_code, subdivision=c.subdivision,
        year_built=c.year_built, condition_at_sale=c.condition_at_sale, sale_type=c.sale_type,
        source_type=c.source_type, verification_status=c.verification_status, data_provider=c.data_provider,
        is_demo=c.is_demo,
    )


def renovation_for(db: Session, prop: Property, a: dict, scope: str | None = None) -> tuple[dict, str]:
    """Use the current manual/contractor estimate if one exists; otherwise the rule-based one."""
    est = db.scalar(
        select(RenovationEstimate)
        .where(RenovationEstimate.property_id == prop.id, RenovationEstimate.is_current.is_(True))
        .order_by(RenovationEstimate.created_at.desc())
    )
    if est and est.method in ("manual", "contractor_bid"):
        return {"scope": est.scope, "line_items": est.line_items, "total": est.total, "flags": [],
                "basis": {"all": f"{est.method.replace('_', ' ')} estimate {est.id}"}}, est.method
    issues = [s for s in (prop.distress_signals or []) if s in ISSUE_FLAGS]
    r = estimate_renovation(
        RenovationInput(
            sqft=prop.sqft, baths=prop.baths, year_built=prop.year_built, stories=prop.stories,
            condition=prop.condition, scope=scope, issues=issues,
            cost_multiplier=float(a["renovation_cost_multiplier"]), contingency_pct=a["contingency_pct"],
        )
    )
    return r.to_dict(), "rule_based"


def compute(
    *,
    subject: Subject,
    comps: list[Comp],
    a: dict,
    renovation: dict,
    purchase_price: float | None,
    condition: str,
    year_built: int | None,
    days_on_market: int | None,
    annual_taxes: float | None,
    hoa_monthly: float | None,
    manual_arv: float | None = None,
    manual_arv_reason: str | None = None,
    acquisition_fee: float | None = None,
    is_demo: bool = False,
    as_of: date | None = None,
) -> dict:
    """Pure analysis (no DB). Used by the pipeline and the standalone calculator."""
    as_of = as_of or date.today()
    arv_res = evaluate_comps(subject, comps, as_of, a)
    if manual_arv:
        arv_res = apply_manual_arv(arv_res, manual_arv, manual_arv_reason)

    fin = None
    mao = None
    if arv_res.arv:
        fin_inputs = DealInputs(
            purchase_price=purchase_price if purchase_price is not None else 0.0,
            arv=arv_res.arv, renovation_total=renovation["total"], assumptions=a,
            scope=renovation["scope"], annual_taxes=annual_taxes, hoa_monthly=hoa_monthly,
            acquisition_fee=acquisition_fee,
        )
        full = analyze_deal(fin_inputs)
        mao = full.mao
        if purchase_price is not None:
            fin = full.to_dict()

    used = [e for e in arv_res.evaluations if e.included]
    score = score_deal(
        ScoreInputs(
            purchase_price=purchase_price,
            arv=arv_res.arv,
            arv_confidence=arv_res.confidence,
            comp_count=arv_res.comp_count,
            avg_comp_similarity=(sum(e.similarity for e in used) / len(used)) if used else None,
            neighborhood_sales_6mo=arv_res.neighborhood_sales_6mo,
            renovation_total=renovation["total"],
            structural_risk="structural_risk" in renovation.get("flags", []),
            year_built=year_built,
            condition=condition,
            net_profit=fin["net_profit"] if fin else None,
            roi_pct=fin["roi_pct"] if fin else None,
            break_even_price=fin["break_even_price"] if fin else None,
            stressed_net_profit=fin["sensitivity"]["combined_stress"] if fin else None,
            days_on_market=days_on_market,
            days_to_contract=float(a["days_to_contract"]),
            min_net_profit=float(a["min_net_profit_for_qualified"]),
            min_comps=int(a["min_comps"]),
            is_demo=is_demo,
            extra_flags=list(arv_res.flags) + list(renovation.get("flags", [])) + (fin["warnings"] if fin else []),
        )
    )
    return {
        "engine_version": ENGINE_VERSION,
        "as_of": as_of.isoformat(),
        "arv": arv_res.to_dict(),
        "renovation": renovation,
        "financials": fin,
        "mao": mao,
        "score": score.to_dict(),
        "assumptions": a,
        "disclaimer": "Estimates only — not an appraisal, guarantee, or investment advice.",
    }


def _hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def analyze_property(
    db: Session,
    prop: Property,
    *,
    purchase_price: float | None = None,
    manual_arv: float | None = None,
    manual_arv_reason: str | None = None,
    assumption_overrides: dict | None = None,
    scope: str | None = None,
    acquisition_fee: float | None = None,
    actor: str = "system",
    force: bool = False,
    as_of: date | None = None,
) -> tuple[DealAnalysis, bool]:
    """Returns (analysis, created). Identical inputs reuse the current analysis (no duplicate)."""
    as_of = as_of or date.today()
    a = assumptions_for(db, prop, assumption_overrides)
    renovation, reno_method = renovation_for(db, prop, a, scope)
    price = purchase_price if purchase_price is not None else prop.list_price

    rows = comps_near(
        db, prop.lat, prop.lng, prop.zip_code, float(a["comp_extended_radius_miles"]),
        months_ago(int(a["comp_max_age_months"]), as_of),
        include_demo=prop.is_demo,  # demo comps are NEVER used for real properties
    )
    rows = [c for c in rows if c.address_key != prop.address_key]  # never comp the subject itself
    comps = [_comp_from_row(c) for c in rows]
    subject = Subject(
        property_type=prop.property_type, sqft=prop.sqft, beds=prop.beds, baths=prop.baths,
        lot_sqft=prop.lot_sqft, lat=prop.lat, lng=prop.lng, zip_code=prop.zip_code,
        subdivision=prop.subdivision, year_built=prop.year_built,
    )

    inputs = {
        "purchase_price": price, "manual_arv": manual_arv, "manual_arv_reason": manual_arv_reason,
        "assumptions": a, "renovation": renovation, "renovation_method": reno_method,
        "acquisition_fee": acquisition_fee, "condition": prop.condition, "sqft": prop.sqft,
        "beds": prop.beds, "baths": prop.baths, "year_built": prop.year_built,
        "dom": prop.days_on_market, "taxes": prop.annual_taxes, "hoa": prop.hoa_monthly,
        "comps": sorted((c.id, c.sale_price, str(c.sale_date), c.verification_status) for c in comps),
        "as_of_month": as_of.strftime("%Y-%m"), "engine": ENGINE_VERSION,
    }
    h = _hash(inputs)
    current = db.scalar(
        select(DealAnalysis).where(DealAnalysis.property_id == prop.id, DealAnalysis.is_current.is_(True))
    )
    if current and current.input_hash == h and not force:
        return current, False

    out = compute(
        subject=subject, comps=comps, a=a, renovation=renovation, purchase_price=price,
        condition=prop.condition, year_built=prop.year_built, days_on_market=prop.days_on_market,
        annual_taxes=prop.annual_taxes, hoa_monthly=prop.hoa_monthly, manual_arv=manual_arv,
        manual_arv_reason=manual_arv_reason, acquisition_fee=acquisition_fee, is_demo=prop.is_demo,
        as_of=as_of,
    )
    fin = out["financials"] or {}
    sc = out["score"]
    arv = out["arv"]

    db.execute(update(DealAnalysis).where(DealAnalysis.property_id == prop.id).values(is_current=False))
    da = DealAnalysis(
        property_id=prop.id, is_current=True, input_hash=h, engine_version=ENGINE_VERSION,
        inputs={k: v for k, v in inputs.items() if k != "comps"}, results=out,
        comps_used=[e for e in arv["evaluations"] if e["included"]],
        purchase_price=price, arv=arv["arv"], arv_method=arv["method"], arv_confidence=arv["confidence"],
        comp_count=arv["comp_count"], renovation_total=renovation["total"],
        total_project_cost=fin.get("total_project_cost"), cash_required=fin.get("cash_invested"),
        loan_amount=fin.get("loan_amount"), net_profit=fin.get("net_profit"), roi_pct=fin.get("roi_pct"),
        annualized_roi_pct=fin.get("annualized_roi_pct"), profit_margin_pct=fin.get("profit_margin_pct"),
        mao=out["mao"], break_even_price=fin.get("break_even_price"), duration_months=fin.get("duration_months"),
        score=sc["score"], score_band=sc["band"], score_components=sc["components"], flags=sc["flags"],
        needs_manual_review=sc["needs_manual_review"], explanation=sc["explanation"], created_by=actor,
    )
    db.add(da)
    if prop.status in ("new", "analyzed", "needs_review"):
        prop.status = "needs_review" if sc["needs_manual_review"] else "analyzed"
    db.flush()
    return da, True
