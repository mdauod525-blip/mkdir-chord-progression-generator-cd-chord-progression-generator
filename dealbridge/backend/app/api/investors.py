"""Investor network, verification workflow, CRM and the investor's own profile."""
from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..matching.service import match_investor_all
from ..models import (
    FollowUp,
    Interaction,
    Investor,
    InvestorTransaction,
    InvestorVerification,
    Match,
    Notification,
    Property,
    User,
)
from ..security import encrypt
from ..services.audit import audit
from ..services.notifications import notify_investor
from .deps import client_ip, get_current_user, staff
from .serializers import investor_row

router = APIRouter(prefix="/api", tags=["investors"])

InvestorType = Literal["individual", "investment_group", "private_lender", "hard_money_lender", "investment_company",
                       "jv_partner", "wholesaler", "contractor_investor"]
Strategy = Literal["fix_and_flip", "buy_and_hold", "brrrr", "wholesale", "lending", "jv_equity"]
Stage = Literal["new", "contacted", "qualified", "opportunity_presented", "interested", "due_diligence",
                "negotiation", "funded_closed", "not_interested"]
PIPELINE = list(Stage.__args__)  # type: ignore[attr-defined]


class Preferences(BaseModel):
    entity_name: str | None = Field(default=None, max_length=200)
    investor_type: InvestorType = "individual"
    preferred_markets: list[str] = []
    preferred_zip_codes: list[str] = []
    available_capital: float | None = Field(default=None, ge=0)
    min_investment: float | None = Field(default=None, ge=0)
    max_investment: float | None = Field(default=None, ge=0)
    property_types: list[str] = []
    strategies: list[Strategy] = ["fix_and_flip"]
    min_roi_pct: float | None = Field(default=None, ge=0, le=500)
    max_duration_months: float | None = Field(default=None, gt=0, le=60)
    risk_tolerance: Literal["low", "medium", "high"] = "medium"
    experience_level: Literal["none", "beginner", "intermediate", "experienced", "professional"] = "none"
    funding_availability: Literal["immediate", "within_30_days", "within_90_days", "not_currently"] = "within_30_days"
    lending_terms: dict = {}
    preferences_notes: str | None = Field(default=None, max_length=5000)
    phone: str | None = Field(default=None, max_length=30)
    email_consent: bool | None = None
    sms_consent: bool | None = None


class InvestorIn(Preferences):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    tags: list[str] = []
    consent_source: str | None = Field(default=None, max_length=200, description="where/how consent was captured")
    pipeline_stage: Stage = "new"


def _apply(inv: Investor, data: dict, consent_source: str | None) -> None:
    now = datetime.now(UTC)
    if "phone" in data:
        inv.phone_enc = encrypt(data.pop("phone"))
    for ch in ("email", "sms"):
        k = f"{ch}_consent"
        if k in data and data[k] is not None:
            val = data.pop(k)
            if val and not getattr(inv, k):
                setattr(inv, f"{k}_at", now)
                inv.consent_source = consent_source or inv.consent_source or "profile update"
                if ch == "email":
                    inv.unsubscribed = False
            setattr(inv, k, val)
        data.pop(k, None)
    if data.get("min_investment") and data.get("max_investment") and data["min_investment"] > data["max_investment"]:
        raise HTTPException(400, "min_investment cannot exceed max_investment")
    for k, v in data.items():
        setattr(inv, k, v)


def _get(db: Session, iid: str) -> Investor:
    inv = db.get(Investor, iid)
    if not inv:
        raise HTTPException(404, "investor not found")
    return inv


# ------------------------------------------------------------------ staff: investor database
@router.get("/investors")
def list_investors(db: Session = Depends(get_db), user: User = Depends(staff), q: str | None = None,
                   stage: str | None = None, investor_type: str | None = None, verified: bool | None = None,
                   demo: bool | None = None, min_capital: float | None = None):
    stmt = select(Investor).order_by(Investor.created_at.desc())
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Investor.name).like(like) | func.lower(Investor.email).like(like)
                          | func.lower(func.coalesce(Investor.entity_name, "")).like(like))
    if stage:
        stmt = stmt.where(Investor.pipeline_stage == stage)
    if investor_type:
        stmt = stmt.where(Investor.investor_type == investor_type)
    if verified is not None:
        stmt = stmt.where((Investor.verification_status == "verified") == verified)
    if demo is not None:
        stmt = stmt.where(Investor.is_demo.is_(demo))
    if min_capital is not None:
        stmt = stmt.where(Investor.available_capital >= min_capital)
    return [investor_row(i) for i in db.scalars(stmt)]


@router.post("/investors", status_code=201)
def create_investor(body: InvestorIn, request: Request, db: Session = Depends(get_db), user: User = Depends(staff)):
    data = body.model_dump()
    cs = data.pop("consent_source")
    if (body.email_consent or body.sms_consent) and not cs:
        raise HTTPException(400, "record where consent was obtained (consent_source)")
    inv = Investor(name=data.pop("name"), email=data.pop("email").lower(), owner_user_id=user.id)
    _apply(inv, data, cs)
    db.add(inv)
    db.flush()
    audit(db, "investor.create", user.id, "investor", inv.id, None, client_ip(request))
    match_investor_all(db, inv)
    db.commit()
    return investor_row(inv)


@router.get("/investors/{iid}")
def get_investor(iid: str, db: Session = Depends(get_db), user: User = Depends(staff)):
    inv = _get(db, iid)
    d = investor_row(inv, full_phone=user.role == "admin")
    d["verifications"] = [
        {"id": v.id, "kind": v.kind, "status": v.status, "document_reference": v.document_reference,
         "reviewed_at": v.reviewed_at, "notes": v.notes, "created_at": v.created_at}
        for v in db.scalars(select(InvestorVerification).where(InvestorVerification.investor_id == iid))
    ]
    d["interactions"] = [
        {"id": x.id, "kind": x.kind, "direction": x.direction, "subject": x.subject, "body": x.body,
         "occurred_at": x.occurred_at, "opportunity_id": x.opportunity_id}
        for x in db.scalars(select(Interaction).where(Interaction.investor_id == iid)
                            .order_by(Interaction.occurred_at.desc()).limit(100))
    ]
    d["follow_ups"] = [
        {"id": f.id, "due_date": f.due_date, "note": f.note, "done": f.done}
        for f in db.scalars(select(FollowUp).where(FollowUp.investor_id == iid).order_by(FollowUp.due_date))
    ]
    d["transactions"] = [
        {"id": t.id, "description": t.description, "role": t.role, "amount": t.amount, "closed_on": t.closed_on,
         "outcome": t.outcome}
        for t in db.scalars(select(InvestorTransaction).where(InvestorTransaction.investor_id == iid))
    ]
    d["matches"] = [
        {"id": m.id, "property_id": m.property_id, "score": m.score, "eligible": m.eligible, "status": m.status,
         "address": p.address_line + ", " + p.city}
        for m, p in db.execute(select(Match, Property).join(Property, Property.id == Match.property_id)
                               .where(Match.investor_id == iid).order_by(Match.score.desc()))
    ]
    return d


@router.put("/investors/{iid}")
def update_investor(iid: str, body: InvestorIn, request: Request, db: Session = Depends(get_db),
                    user: User = Depends(staff)):
    inv = _get(db, iid)
    data = body.model_dump()
    cs = data.pop("consent_source")
    inv.name = data.pop("name")
    inv.email = data.pop("email").lower()
    _apply(inv, data, cs)
    audit(db, "investor.update", user.id, "investor", inv.id, None, client_ip(request))
    match_investor_all(db, inv)
    db.commit()
    return investor_row(inv)


class StageIn(BaseModel):
    stage: Stage
    note: str | None = None


@router.post("/investors/{iid}/stage")
def set_stage(iid: str, body: StageIn, db: Session = Depends(get_db), user: User = Depends(staff)):
    inv = _get(db, iid)
    old = inv.pipeline_stage
    inv.pipeline_stage = body.stage
    db.add(Interaction(investor_id=iid, kind="system", direction="internal", subject=f"Stage {old} → {body.stage}",
                       body=body.note, user_id=user.id))
    audit(db, "investor.stage", user.id, "investor", iid, {"from": old, "to": body.stage})
    db.commit()
    return investor_row(inv)


# ------------------------------------------------------------------ verification workflow
class VerificationIn(BaseModel):
    kind: Literal["identity", "accreditation", "proof_of_funds", "entity"]
    document_reference: str | None = Field(default=None, max_length=500,
                                           description="Pointer to the document in secure storage — never the document itself")
    notes: str | None = None


class VerificationDecision(BaseModel):
    status: Literal["approved", "rejected"]
    notes: str | None = None


@router.post("/investors/{iid}/verifications", status_code=201)
def add_verification(iid: str, body: VerificationIn, db: Session = Depends(get_db), user: User = Depends(staff)):
    inv = _get(db, iid)
    v = InvestorVerification(investor_id=iid, **body.model_dump())
    db.add(v)
    if inv.verification_status == "unverified":
        inv.verification_status = "pending"
    db.commit()
    return {"id": v.id, "status": v.status}


@router.post("/verifications/{vid}/decision")
def decide_verification(vid: str, body: VerificationDecision, db: Session = Depends(get_db),
                        user: User = Depends(staff)):
    v = db.get(InvestorVerification, vid)
    if not v:
        raise HTTPException(404, "not found")
    v.status, v.notes, v.reviewed_by, v.reviewed_at = body.status, body.notes, user.id, datetime.now(UTC)
    inv = _get(db, v.investor_id)
    db.flush()
    all_v = db.scalars(select(InvestorVerification).where(InvestorVerification.investor_id == inv.id)).all()
    if v.kind == "proof_of_funds" and body.status == "approved":
        inv.proof_of_funds_verified = True
    if v.kind == "accreditation" and body.status == "approved":
        inv.accreditation_status = "third_party_verified"
    if any(x.kind == "identity" and x.status == "approved" for x in all_v):
        inv.verification_status = "verified"
    elif body.status == "rejected" and v.kind == "identity":
        inv.verification_status = "rejected"
    audit(db, "verification.decision", user.id, "investor", inv.id, {"kind": v.kind, "status": body.status})
    db.commit()
    return {"investor": investor_row(inv)}


class ApproveUserIn(BaseModel):
    approved: bool


@router.post("/investors/{iid}/portal-access")
def approve_portal(iid: str, body: ApproveUserIn, db: Session = Depends(get_db), user: User = Depends(staff)):
    """Approve the investor's login for the private marketplace."""
    inv = _get(db, iid)
    u = db.scalar(select(User).where(User.investor_id == iid))
    if not u:
        raise HTTPException(400, "this investor has no login account")
    if body.approved and inv.verification_status != "verified":
        raise HTTPException(400, "verify the investor's identity before granting marketplace access")
    u.is_approved = body.approved
    audit(db, "investor.portal_access", user.id, "investor", iid, {"approved": body.approved})
    db.commit()
    return {"user_id": u.id, "is_approved": u.is_approved}


# ------------------------------------------------------------------ CRM
@router.get("/crm/pipeline")
def pipeline(db: Session = Depends(get_db), user: User = Depends(staff), demo: bool | None = None):
    stmt = select(Investor).where(Investor.is_active.is_(True))
    if demo is not None:
        stmt = stmt.where(Investor.is_demo.is_(demo))
    cols: dict[str, list] = {s: [] for s in PIPELINE}
    for inv in db.scalars(stmt):
        cols.setdefault(inv.pipeline_stage, []).append({
            "id": inv.id, "name": inv.name, "entity_name": inv.entity_name, "investor_type": inv.investor_type,
            "available_capital": inv.available_capital, "next_follow_up": inv.next_follow_up,
            "verification_status": inv.verification_status, "is_demo": inv.is_demo})
    return {"stages": PIPELINE, "columns": cols}


class InteractionIn(BaseModel):
    kind: Literal["email", "call", "sms", "meeting", "note"]
    direction: Literal["inbound", "outbound", "internal"] = "outbound"
    subject: str | None = Field(default=None, max_length=255)
    body: str | None = Field(default=None, max_length=10000)
    opportunity_id: str | None = None
    occurred_at: datetime | None = None


@router.post("/investors/{iid}/interactions", status_code=201)
def log_interaction(iid: str, body: InteractionIn, db: Session = Depends(get_db), user: User = Depends(staff)):
    _get(db, iid)
    x = Interaction(investor_id=iid, user_id=user.id, **body.model_dump(exclude={"occurred_at"}),
                    occurred_at=body.occurred_at or datetime.now(UTC))
    db.add(x)
    db.commit()
    return {"id": x.id}


class FollowUpIn(BaseModel):
    due_date: date
    note: str = Field(min_length=1, max_length=2000)


@router.post("/investors/{iid}/follow-ups", status_code=201)
def add_follow_up(iid: str, body: FollowUpIn, db: Session = Depends(get_db), user: User = Depends(staff)):
    inv = _get(db, iid)
    f = FollowUp(investor_id=iid, due_date=body.due_date, note=body.note, assigned_to=user.id)
    db.add(f)
    if inv.next_follow_up is None or body.due_date < inv.next_follow_up:
        inv.next_follow_up = body.due_date
    db.commit()
    return {"id": f.id}


@router.get("/crm/follow-ups")
def due_follow_ups(db: Session = Depends(get_db), user: User = Depends(staff), include_done: bool = False):
    stmt = select(FollowUp, Investor).join(Investor, Investor.id == FollowUp.investor_id).order_by(FollowUp.due_date)
    if not include_done:
        stmt = stmt.where(FollowUp.done.is_(False))
    today = date.today()
    return [{"id": f.id, "investor_id": i.id, "investor_name": i.name, "due_date": f.due_date, "note": f.note,
             "done": f.done, "overdue": f.due_date < today and not f.done} for f, i in db.execute(stmt)]


@router.post("/crm/follow-ups/{fid}/done")
def complete_follow_up(fid: str, db: Session = Depends(get_db), user: User = Depends(staff)):
    f = db.get(FollowUp, fid)
    if not f:
        raise HTTPException(404, "not found")
    f.done = True
    inv = _get(db, f.investor_id)
    nxt = db.scalar(select(func.min(FollowUp.due_date)).where(FollowUp.investor_id == inv.id, FollowUp.done.is_(False),
                                                              FollowUp.id != fid))
    inv.next_follow_up = nxt
    db.commit()
    return {"ok": True}


class TransactionIn(BaseModel):
    description: str = Field(min_length=3)
    role: Literal["equity", "lender", "buyer", "partner", "other"] | None = None
    amount: float | None = Field(default=None, ge=0)
    closed_on: date | None = None
    outcome: str | None = None
    property_id: str | None = None


@router.post("/investors/{iid}/transactions", status_code=201)
def add_transaction(iid: str, body: TransactionIn, db: Session = Depends(get_db), user: User = Depends(staff)):
    _get(db, iid)
    t = InvestorTransaction(investor_id=iid, **body.model_dump())
    db.add(t)
    db.commit()
    return {"id": t.id}


class SendIn(BaseModel):
    template_key: str
    channel: Literal["email", "sms"] | None = None
    context: dict = {}


@router.post("/investors/{iid}/send")
def send_message(iid: str, body: SendIn, db: Session = Depends(get_db), user: User = Depends(staff)):
    inv = _get(db, iid)
    try:
        n = notify_investor(db, inv, body.template_key, body.context, channel=body.channel, user_id=user.id)
    except KeyError:
        raise HTTPException(404, "template not found") from None
    audit(db, "crm.send", user.id, "investor", iid, {"template": body.template_key, "status": n.status})
    db.commit()
    return {"status": n.status, "notification_id": n.id, "error": n.error}


@router.get("/notifications")
def list_notifications(db: Session = Depends(get_db), user: User = Depends(staff), limit: int = Query(100, le=500)):
    return [{"id": n.id, "channel": n.channel, "recipient": n.recipient, "template_key": n.template_key,
             "subject": n.subject, "status": n.status, "provider": n.provider, "error": n.error,
             "created_at": n.created_at}
            for n in db.scalars(select(Notification).order_by(Notification.created_at.desc()).limit(limit))]


# ------------------------------------------------------------------ investor self-service
@router.get("/portal/profile")
def my_profile(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not user.investor_id:
        raise HTTPException(404, "no investor profile for this account")
    return {**investor_row(_get(db, user.investor_id), full_phone=True), "account_approved": user.is_approved}


@router.put("/portal/profile")
def update_my_profile(body: Preferences, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not user.investor_id:
        raise HTTPException(404, "no investor profile for this account")
    inv = _get(db, user.investor_id)
    _apply(inv, body.model_dump(), "investor portal")
    audit(db, "investor.self_update", user.id, "investor", inv.id)
    match_investor_all(db, inv)
    db.commit()
    return investor_row(inv, full_phone=True)


@router.post("/unsubscribe/{token}")
def unsubscribe(token: str, db: Session = Depends(get_db)):
    inv = db.scalar(select(Investor).where(Investor.unsubscribe_token == token))
    if not inv:
        raise HTTPException(404, "link not recognised")
    inv.unsubscribed = True
    inv.email_consent = False
    inv.sms_consent = False
    db.add(Interaction(investor_id=inv.id, kind="system", direction="inbound", subject="Unsubscribed via link"))
    db.commit()
    return {"ok": True}
