"""Opportunities (manual approval before distribution), matches, and the private marketplace."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..config import get_settings
from ..db import get_db
from ..matching.service import match_property
from ..models import (
    DealAnalysis,
    Investor,
    InvestorInterest,
    Match,
    Opportunity,
    OpportunityAccessGrant,
    Property,
    User,
)
from ..security import decrypt
from ..services import ai
from ..services.audit import alert, audit
from ..services.notifications import notify_investor
from ..services.settings_store import get_setting
from .deps import admin_only, approved_investor, client_ip, staff
from .serializers import analysis_summary, investor_row

router = APIRouter(prefix="/api", tags=["marketplace"])


def _opp(db: Session, oid: str) -> Opportunity:
    o = db.get(Opportunity, oid)
    if not o:
        raise HTTPException(404, "opportunity not found")
    return o


def _analysis(db: Session, o: Opportunity) -> DealAnalysis | None:
    return db.get(DealAnalysis, o.analysis_id) if o.analysis_id else None


def opportunity_view(db: Session, o: Opportunity, viewer: User, investor_id: str | None = None) -> dict:
    p = db.get(Property, o.property_id)
    a = _analysis(db, o)
    r = (a.results if a else {}) or {}
    fin = r.get("financials") or {}
    arv = r.get("arv") or {}
    granted = viewer.role in ("admin", "analyst") or (
        investor_id is not None and db.scalar(select(OpportunityAccessGrant).where(
            OpportunityAccessGrant.opportunity_id == o.id, OpportunityAccessGrant.investor_id == investor_id)) is not None)
    view = {
        "id": o.id, "property_id": o.property_id, "title": o.title, "summary": o.summary, "status": o.status, "published_at": o.published_at,
        "is_demo": o.is_demo or p.is_demo,
        "location": {"city": p.city, "state": p.state, "zip_code": p.zip_code, "county": p.county,
                     # exact address/coordinates only for staff or investors granted access
                     "address_line": p.address_line if granted else None,
                     "lat": p.lat if granted else (round(p.lat, 2) if p.lat else None),
                     "lng": p.lng if granted else (round(p.lng, 2) if p.lng else None)},
        "property": {"type": p.property_type, "beds": p.beds, "baths": p.baths, "sqft": p.sqft,
                     "year_built": p.year_built, "condition": p.condition, "flood_zone": p.flood_zone,
                     "opportunity_types": p.opportunity_types, "photos": p.photos},
        "asking_price": p.list_price, "listing_status": p.listing_status,
        "analysis": analysis_summary(a),
        "financial_breakdown": {k: fin.get(k) for k in (
            "acquisition_costs", "renovation_total", "holding_costs", "selling_costs", "financing_costs",
            "total_project_cost", "net_profit", "roi_pct", "annualized_roi_pct", "cash_invested", "loan_amount",
            "break_even_price", "duration_months", "sensitivity", "breakdown")} if fin else None,
        "renovation": (r.get("renovation") or {}).get("line_items"),
        "comparable_sales": [
            {k: e.get(k) for k in ("sale_price", "sale_date", "distance_miles", "adjusted_price", "similarity",
                                   "verification_status", "data_provider", "is_demo")}
            | ({"address": e.get("address")} if granted else {})
            for e in (arv.get("evaluations") or []) if e.get("included")
        ],
        "arv_confidence": arv.get("confidence"), "comp_count": arv.get("comp_count"),
        "risk_assessment": {"flags": a.flags if a else [], "score_components": a.score_components if a else [],
                            "explanation": (a.ai_summary or a.explanation) if a else None},
        "source": {"data_provider": p.data_provider, "verification_status": p.verification_status,
                   "retrieved_at": p.retrieved_at, "license": p.license},
        "documents": [d for d in (o.documents or []) if granted or not d.get("restricted")],
        "access_granted": granted,
        "disclosure": get_setting(db, "disclosure_text"),
    }
    if granted:
        view["seller_contact"] = decrypt(p.seller_contact_enc)
        view["access_info"] = decrypt(p.access_info_enc)
    return view


# ------------------------------------------------------------------ staff: opportunities
class OppIn(BaseModel):
    property_id: str
    title: str | None = Field(default=None, max_length=255)
    summary: str | None = Field(default=None, max_length=5000)
    visibility: Literal["approved_investors", "matched_only"] = "approved_investors"
    generate_ai_summary: bool = False


@router.get("/opportunities")
def list_opportunities(db: Session = Depends(get_db), user: User = Depends(staff), status: str | None = None):
    stmt = select(Opportunity).order_by(Opportunity.updated_at.desc())
    if status:
        stmt = stmt.where(Opportunity.status == status)
    out = []
    for o in db.scalars(stmt):
        p = db.get(Property, o.property_id)
        n_int = len(db.scalars(select(InvestorInterest.id).where(InvestorInterest.opportunity_id == o.id)).all())
        out.append({"id": o.id, "title": o.title, "status": o.status, "visibility": o.visibility,
                    "property_id": o.property_id, "city": p.city, "state": p.state, "is_demo": o.is_demo,
                    "analysis": analysis_summary(_analysis(db, o)), "interest_count": n_int,
                    "approved_at": o.approved_at, "published_at": o.published_at})
    return out


@router.post("/opportunities", status_code=201)
def create_opportunity(body: OppIn, request: Request, db: Session = Depends(get_db), user: User = Depends(staff)):
    p = db.get(Property, body.property_id)
    if not p:
        raise HTTPException(404, "property not found")
    a = db.scalar(select(DealAnalysis).where(DealAnalysis.property_id == p.id, DealAnalysis.is_current.is_(True)))
    if not a:
        raise HTTPException(400, "analyze the property before creating an opportunity")
    if db.scalar(select(Opportunity).where(Opportunity.property_id == p.id)):
        raise HTTPException(409, "an opportunity already exists for this property")
    summary = body.summary
    if not summary and body.generate_ai_summary:
        try:
            summary = ai.generate(db, "investor_summary", ai.facts_for_analysis(p, a), entity_id=a.id)
        except ai.AIUnavailable:
            summary = None
    o = Opportunity(property_id=p.id, analysis_id=a.id, title=body.title or f"{p.property_type.replace('_', ' ').title()} in {p.city}, {p.state}",
                    summary=summary or a.explanation, visibility=body.visibility, is_demo=p.is_demo)
    db.add(o)
    audit(db, "opportunity.create", user.id, "opportunity", None, {"property_id": p.id}, client_ip(request))
    db.commit()
    return opportunity_view(db, o, user)


@router.get("/opportunities/{oid}")
def get_opportunity(oid: str, db: Session = Depends(get_db), user: User = Depends(staff)):
    o = _opp(db, oid)
    v = opportunity_view(db, o, user)
    v["interests"] = [
        {"id": x.id, "investor_id": x.investor_id, "investor_name": i.name, "kind": x.kind, "message": x.message,
         "indicated_amount": x.indicated_amount, "preferred_times": x.preferred_times, "status": x.status,
         "created_at": x.created_at}
        for x, i in db.execute(select(InvestorInterest, Investor).join(Investor, Investor.id == InvestorInterest.investor_id)
                               .where(InvestorInterest.opportunity_id == oid).order_by(InvestorInterest.created_at.desc()))
    ]
    v["access_grants"] = [{"investor_id": g.investor_id, "reason": g.reason, "created_at": g.created_at}
                          for g in db.scalars(select(OpportunityAccessGrant).where(OpportunityAccessGrant.opportunity_id == oid))]
    return v


class TransitionIn(BaseModel):
    action: Literal["submit", "approve", "publish", "unpublish", "under_contract", "close", "withdraw"]
    override_review_reason: str | None = Field(default=None, max_length=1000)
    legal_review_confirmed: bool = False


TRANSITIONS = {
    "submit": ({"draft"}, "pending_approval"),
    "approve": ({"pending_approval"}, "approved"),
    "publish": ({"approved"}, "published"),
    "unpublish": ({"published"}, "approved"),
    "under_contract": ({"published", "approved"}, "under_contract"),
    "close": ({"under_contract", "published"}, "closed"),
    "withdraw": ({"draft", "pending_approval", "approved", "published", "under_contract"}, "withdrawn"),
}


@router.post("/opportunities/{oid}/transition")
def transition(oid: str, body: TransitionIn, request: Request, db: Session = Depends(get_db),
               user: User = Depends(staff)):
    o = _opp(db, oid)
    allowed, new = TRANSITIONS[body.action]
    if o.status not in allowed:
        raise HTTPException(409, f"cannot {body.action} from status {o.status}")
    if body.action in ("approve", "publish") and user.role != "admin":
        raise HTTPException(403, "only an admin can approve or publish")
    a = _analysis(db, o)
    if body.action == "approve":
        if a and a.needs_manual_review and not body.override_review_reason:
            raise HTTPException(400, "analysis is flagged for manual review; document the review in override_review_reason")
        o.approved_by, o.approved_at = user.id, datetime.now(UTC)
    if body.action == "publish":
        if not body.legal_review_confirmed and not o.is_demo:
            raise HTTPException(400, "confirm that counsel has reviewed investor-facing materials and solicitation "
                                     "approach (legal_review_confirmed) before publishing real opportunities")
        o.published_at = datetime.now(UTC)
    o.status = new
    audit(db, f"opportunity.{body.action}", user.id, "opportunity", o.id,
          {"override_review_reason": body.override_review_reason, "legal_review_confirmed": body.legal_review_confirmed},
          client_ip(request))
    db.commit()
    return {"id": o.id, "status": o.status}


class NotifyIn(BaseModel):
    min_match_score: float | None = None
    channel: Literal["email", "sms"] = "email"


@router.post("/opportunities/{oid}/notify")
def notify_matches(oid: str, body: NotifyIn, db: Session = Depends(get_db), user: User = Depends(admin_only)):
    """Email eligible, consenting, approved-portal investors about a PUBLISHED opportunity."""
    o = _opp(db, oid)
    if o.status != "published":
        raise HTTPException(400, "only published opportunities can be sent to investors")
    a = _analysis(db, o)
    p = db.get(Property, o.property_id)
    min_score = body.min_match_score if body.min_match_score is not None else float(get_setting(db, "match_min_score"))
    matches = db.scalars(select(Match).where(Match.property_id == p.id, Match.eligible.is_(True),
                                             Match.score >= min_score)).all()
    s = get_settings()
    ctx = {"opportunity": {
        "title": o.title, "location": f"{p.city}, {p.state}", "score": f"{a.score:.0f}" if a and a.score else "n/a",
        "band": a.score_band if a else "", "arv": f"${a.arv:,.0f}" if a and a.arv else "n/a",
        "total_cost": f"${a.total_project_cost:,.0f}" if a and a.total_project_cost else "n/a",
        "net_profit": f"${a.net_profit:,.0f}" if a and a.net_profit is not None else "n/a",
        "roi": f"{a.roi_pct:.1f}%" if a and a.roi_pct is not None else "n/a",
        "url": f"{s.public_app_url}/portal/opportunities/{o.id}"}}
    results = {}
    for m in matches:
        inv = db.get(Investor, m.investor_id)
        portal = db.scalar(select(User).where(User.investor_id == inv.id))
        if not portal or not portal.is_approved:
            results[inv.id] = "skipped_no_approved_portal_account"
            continue
        n = notify_investor(db, inv, "new_deal_alert" if body.channel == "email" else "new_deal_sms", ctx,
                            channel=body.channel, user_id=user.id, opportunity_id=o.id)
        results[inv.id] = n.status
        if n.status in ("sent", "dry_run"):
            m.status = "presented"
            if inv.pipeline_stage in ("new", "contacted", "qualified"):
                inv.pipeline_stage = "opportunity_presented"
    audit(db, "opportunity.notify", user.id, "opportunity", o.id, {"results": results})
    db.commit()
    return {"results": results}


class GrantIn(BaseModel):
    investor_id: str
    reason: str = Field(min_length=3, max_length=500, description="e.g. 'NDA signed 2026-11-20'")


@router.post("/opportunities/{oid}/access-grants", status_code=201)
def grant_access(oid: str, body: GrantIn, db: Session = Depends(get_db), user: User = Depends(admin_only)):
    _opp(db, oid)
    if not db.get(Investor, body.investor_id):
        raise HTTPException(404, "investor not found")
    if db.scalar(select(OpportunityAccessGrant).where(OpportunityAccessGrant.opportunity_id == oid,
                                                      OpportunityAccessGrant.investor_id == body.investor_id)):
        raise HTTPException(409, "already granted")
    db.add(OpportunityAccessGrant(opportunity_id=oid, investor_id=body.investor_id, granted_by=user.id,
                                  reason=body.reason))
    audit(db, "opportunity.access_grant", user.id, "opportunity", oid, {"investor_id": body.investor_id})
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ matches
@router.get("/matches")
def list_matches(db: Session = Depends(get_db), user: User = Depends(staff), property_id: str | None = None,
                 investor_id: str | None = None, eligible: bool | None = True, min_score: float | None = None):
    stmt = (select(Match, Investor, Property).join(Investor, Investor.id == Match.investor_id)
            .join(Property, Property.id == Match.property_id).order_by(Match.score.desc()))
    if property_id:
        stmt = stmt.where(Match.property_id == property_id)
    if investor_id:
        stmt = stmt.where(Match.investor_id == investor_id)
    if eligible is not None:
        stmt = stmt.where(Match.eligible.is_(eligible))
    if min_score is not None:
        stmt = stmt.where(Match.score >= min_score)
    return [{"id": m.id, "score": m.score, "eligible": m.eligible, "status": m.status, "explanation": m.explanation,
             "components": m.components, "disqualifiers": m.disqualifiers, "updated_at": m.updated_at,
             "investor": {"id": i.id, "name": i.name, "investor_type": i.investor_type, "is_demo": i.is_demo},
             "property": {"id": p.id, "address_line": p.address_line, "city": p.city, "state": p.state,
                          "is_demo": p.is_demo}}
            for m, i, p in db.execute(stmt.limit(500))]


@router.post("/matches/run/{pid}")
def rerun_matches(pid: str, db: Session = Depends(get_db), user: User = Depends(staff)):
    p = db.scalar(select(Property).where(Property.id == pid).options(selectinload(Property.analyses)))
    if not p:
        raise HTTPException(404, "property not found")
    a = next((x for x in p.analyses if x.is_current), None)
    if not a:
        raise HTTPException(400, "analyze the property first")
    ms = match_property(db, p, a)
    db.commit()
    return {"eligible": sum(1 for m in ms if m.eligible), "evaluated": len(ms)}


class MatchStatusIn(BaseModel):
    status: Literal["suggested", "approved_to_present", "presented", "dismissed"]


@router.post("/matches/{mid}/status")
def match_status(mid: str, body: MatchStatusIn, db: Session = Depends(get_db), user: User = Depends(staff)):
    m = db.get(Match, mid)
    if not m:
        raise HTTPException(404, "not found")
    m.status = body.status
    db.commit()
    return {"id": m.id, "status": m.status}


# ------------------------------------------------------------------ investor marketplace
def _visible(db: Session, o: Opportunity, user: User) -> bool:
    if user.role in ("admin", "analyst"):
        return True
    if o.status != "published":
        return False
    inv = db.get(Investor, user.investor_id)
    if inv is None or o.is_demo != inv.is_demo:
        return False
    if o.visibility == "matched_only":
        return db.scalar(select(Match).where(Match.property_id == o.property_id, Match.investor_id == inv.id,
                                             Match.eligible.is_(True))) is not None
    return True


@router.get("/marketplace")
def marketplace(db: Session = Depends(get_db), user: User = Depends(approved_investor)):
    opps = db.scalars(select(Opportunity).where(Opportunity.status == "published").order_by(Opportunity.published_at.desc()))
    inv_id = user.investor_id
    saved = set()
    if inv_id:
        saved = {x.opportunity_id for x in db.scalars(select(InvestorInterest).where(
            InvestorInterest.investor_id == inv_id, InvestorInterest.kind == "saved"))}
    out = []
    for o in opps:
        if not _visible(db, o, user):
            continue
        v = opportunity_view(db, o, user, inv_id)
        m = db.scalar(select(Match).where(Match.property_id == o.property_id, Match.investor_id == inv_id)) if inv_id else None
        v["my_match"] = {"score": m.score, "eligible": m.eligible, "explanation": m.explanation} if m else None
        v["saved"] = o.id in saved
        out.append(v)
    return out


@router.get("/marketplace/{oid}")
def marketplace_item(oid: str, db: Session = Depends(get_db), user: User = Depends(approved_investor)):
    o = _opp(db, oid)
    if not _visible(db, o, user):
        raise HTTPException(404, "opportunity not found")
    audit(db, "marketplace.view", user.id, "opportunity", oid)
    db.commit()
    return opportunity_view(db, o, user, user.investor_id)


class InterestIn(BaseModel):
    kind: Literal["saved", "interested", "info_request", "schedule_discussion", "nonbinding_eoi", "withdrawn"]
    message: str | None = Field(default=None, max_length=5000)
    indicated_amount: float | None = Field(default=None, ge=0)
    preferred_times: str | None = Field(default=None, max_length=500)
    acknowledge_nonbinding: bool = False


@router.post("/marketplace/{oid}/interest", status_code=201)
def express_interest(oid: str, body: InterestIn, request: Request, db: Session = Depends(get_db),
                     user: User = Depends(approved_investor)):
    o = _opp(db, oid)
    if not user.investor_id or not _visible(db, o, user):
        raise HTTPException(404, "opportunity not found")
    if body.kind == "nonbinding_eoi" and not body.acknowledge_nonbinding:
        raise HTTPException(400, "acknowledge that an expression of interest is nonbinding and not a commitment")
    if body.kind == "saved":
        existing = db.scalar(select(InvestorInterest).where(InvestorInterest.opportunity_id == oid,
                                                            InvestorInterest.investor_id == user.investor_id,
                                                            InvestorInterest.kind == "saved"))
        if existing:
            db.delete(existing)  # toggle
            db.commit()
            return {"saved": False}
    x = InvestorInterest(opportunity_id=oid, investor_id=user.investor_id, kind=body.kind, message=body.message,
                         indicated_amount=body.indicated_amount if body.kind == "nonbinding_eoi" else None,
                         preferred_times=body.preferred_times, acknowledged_nonbinding=body.acknowledge_nonbinding)
    db.add(x)
    inv = db.get(Investor, user.investor_id)
    if body.kind in ("interested", "nonbinding_eoi", "schedule_discussion") and inv.pipeline_stage in (
            "new", "contacted", "qualified", "opportunity_presented"):
        inv.pipeline_stage = "interested"
    if body.kind != "saved":
        alert(db, "deal", f"{inv.name}: {body.kind.replace('_', ' ')} on {o.title}", body.message, entity_id=o.id)
    audit(db, f"interest.{body.kind}", user.id, "opportunity", oid, None, client_ip(request))
    db.commit()
    return {"id": x.id, "kind": x.kind, "saved": body.kind == "saved" or None,
            "note": "Expressions of interest are nonbinding and are not offers or commitments."}


@router.get("/portal/activity")
def my_activity(db: Session = Depends(get_db), user: User = Depends(approved_investor)):
    if not user.investor_id:
        return {"interests": [], "profile": None}
    rows = db.execute(select(InvestorInterest, Opportunity).join(Opportunity, Opportunity.id == InvestorInterest.opportunity_id)
                      .where(InvestorInterest.investor_id == user.investor_id)
                      .order_by(InvestorInterest.created_at.desc())).all()
    return {"interests": [{"id": x.id, "kind": x.kind, "opportunity_id": o.id, "title": o.title,
                           "opportunity_status": o.status, "status": x.status, "created_at": x.created_at,
                           "indicated_amount": x.indicated_amount} for x, o in rows],
            "profile": investor_row(db.get(Investor, user.investor_id), full_phone=True)}
