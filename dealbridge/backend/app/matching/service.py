from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DealAnalysis, Investor, Match, Property
from .engine import DealFacts, InvestorProfile, match_investor


def deal_facts(prop: Property, a: DealAnalysis) -> DealFacts:
    return DealFacts(
        property_id=prop.id, market_id=prop.market_id, zip_code=prop.zip_code, property_type=prop.property_type,
        strategy="fix_and_flip", purchase_price=a.purchase_price, total_project_cost=a.total_project_cost,
        cash_required=a.cash_required, loan_amount=a.loan_amount, arv=a.arv, roi_pct=a.roi_pct,
        net_profit=a.net_profit, duration_months=a.duration_months, deal_score=a.score,
        arv_confidence=a.arv_confidence,
        renovation_to_arv=(a.renovation_total / a.arv) if a.arv and a.renovation_total is not None else None,
        needs_manual_review=a.needs_manual_review,
    )


def investor_profile(i: Investor) -> InvestorProfile:
    return InvestorProfile(
        investor_id=i.id, investor_type=i.investor_type, preferred_markets=i.preferred_markets or [],
        preferred_zip_codes=i.preferred_zip_codes or [], available_capital=i.available_capital,
        min_investment=i.min_investment, max_investment=i.max_investment, property_types=i.property_types or [],
        strategies=i.strategies or [], min_roi_pct=i.min_roi_pct, max_duration_months=i.max_duration_months,
        risk_tolerance=i.risk_tolerance, funding_availability=i.funding_availability,
        lending_terms=i.lending_terms or {}, is_active=i.is_active,
    )


def match_property(db: Session, prop: Property, analysis: DealAnalysis) -> list[Match]:
    """Score every active investor against the deal; keep eligible matches, refresh stale ones.

    Demo properties are matched only with demo investors and vice versa.
    """
    facts = deal_facts(prop, analysis)
    investors = db.scalars(select(Investor).where(Investor.is_active.is_(True), Investor.is_demo == prop.is_demo)).all()
    out = []
    for inv in investors:
        r = match_investor(investor_profile(inv), facts)
        m = db.scalar(select(Match).where(Match.investor_id == inv.id, Match.property_id == prop.id))
        if not r.eligible and m is None:
            continue
        if m is None:
            m = Match(investor_id=inv.id, property_id=prop.id)
            db.add(m)
        m.analysis_id = analysis.id
        m.score = r.score
        m.eligible = r.eligible
        m.components = [c.__dict__ for c in r.components]
        m.disqualifiers = r.disqualifiers
        m.explanation = r.explanation
        if not r.eligible and m.status == "suggested":
            m.status = "dismissed"
        out.append(m)
    db.flush()
    return out


def match_investor_all(db: Session, inv: Investor) -> list[Match]:
    """Re-run matching for one investor across all current analyses (after a profile update)."""
    rows = db.execute(
        select(Property, DealAnalysis)
        .join(DealAnalysis, DealAnalysis.property_id == Property.id)
        .where(DealAnalysis.is_current.is_(True), Property.is_demo == inv.is_demo,
               Property.status.notin_(["rejected", "archived"]))
    ).all()
    out = []
    for prop, a in rows:
        r = match_investor(investor_profile(inv), deal_facts(prop, a))
        m = db.scalar(select(Match).where(Match.investor_id == inv.id, Match.property_id == prop.id))
        if not r.eligible and m is None:
            continue
        if m is None:
            m = Match(investor_id=inv.id, property_id=prop.id)
            db.add(m)
        m.analysis_id, m.score, m.eligible = a.id, r.score, r.eligible
        m.components = [c.__dict__ for c in r.components]
        m.disqualifiers, m.explanation = r.disqualifiers, r.explanation
        out.append(m)
    db.flush()
    return out
