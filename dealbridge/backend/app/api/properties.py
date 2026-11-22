"""Property discovery, manual entry, comparable sales, renovation, analysis and the calculator."""
from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..analysis.assumptions import merged_assumptions
from ..analysis.comps import Comp, Subject
from ..analysis.pipeline import analyze_property, assumptions_for, compute, renovation_for
from ..analysis.renovation import ISSUE_FLAGS, LINE_ITEMS, RenovationInput, estimate_renovation
from ..db import get_db
from ..matching.service import match_property
from ..models import ComparableSale, DataSource, DealAnalysis, PriceHistory, Property, RenovationEstimate, User
from ..security import encrypt
from ..services import ai
from ..services.addresses import address_key, zip5
from ..services.audit import audit
from ..services.ingest import enrich_property, market_for
from .deps import client_ip, get_current_user, require_roles, staff
from .serializers import comp_row, property_detail, property_row

router = APIRouter(prefix="/api", tags=["properties"])

PropertyType = Literal["single_family", "townhouse", "condo", "multi_family_2_4", "manufactured", "land", "other"]
Condition = Literal["excellent", "good", "fair", "poor", "distressed", "unknown"]
ListingStatus = Literal["unknown", "off_market", "active", "pending", "sold", "auction", "withdrawn"]
OPPORTUNITY_TYPES = {
    "foreclosure", "pre_foreclosure", "reo", "auction", "probate", "estate_sale", "vacant", "distressed",
    "needs_renovation", "price_reduced", "extended_dom", "fsbo", "wholesale", "off_market", "hud_home",
    "tax_lien", "underpriced",
}


class PropertyIn(BaseModel):
    address_line: str = Field(min_length=3, max_length=255)
    unit: str | None = Field(default=None, max_length=40)
    city: str = Field(min_length=2, max_length=120)
    state: str = Field(min_length=2, max_length=2)
    zip_code: str = Field(pattern=r"^\d{5}(-\d{4})?$")
    county: str | None = None
    parcel_id: str | None = None
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    subdivision: str | None = None
    property_type: PropertyType = "single_family"
    beds: float | None = Field(default=None, ge=0, le=20)
    baths: float | None = Field(default=None, ge=0, le=20)
    sqft: float | None = Field(default=None, gt=100, lt=20000)
    lot_sqft: float | None = Field(default=None, ge=0)
    year_built: int | None = Field(default=None, ge=1700, le=2030)
    stories: float | None = Field(default=None, ge=1, le=5)
    condition: Condition = "unknown"
    listing_status: ListingStatus = "unknown"
    list_price: float | None = Field(default=None, gt=0, lt=50_000_000)
    days_on_market: int | None = Field(default=None, ge=0)
    listing_url: HttpUrl | None = None
    estimated_market_value: float | None = Field(default=None, gt=0)
    estimated_market_value_source: str | None = None
    assessed_value: float | None = Field(default=None, gt=0)
    annual_taxes: float | None = Field(default=None, ge=0)
    hoa_monthly: float | None = Field(default=None, ge=0)
    opportunity_types: list[str] = []
    distress_signals: list[str] = []
    photos: list[dict] = []
    notes: str | None = Field(default=None, max_length=5000)
    seller_contact: str | None = Field(default=None, max_length=1000)
    access_info: str | None = Field(default=None, max_length=1000)
    source_description: str = Field(default="manual entry", max_length=200)
    source_url: HttpUrl | None = None
    verified_by_staff: bool = False

    @field_validator("state")
    @classmethod
    def upper(cls, v: str) -> str:
        return v.upper()

    @field_validator("opportunity_types")
    @classmethod
    def valid_types(cls, v: list[str]) -> list[str]:
        bad = set(v) - OPPORTUNITY_TYPES
        if bad:
            raise ValueError(f"unknown opportunity types: {sorted(bad)}")
        return sorted(set(v))

    @field_validator("photos")
    @classmethod
    def photos_need_license(cls, v: list[dict]) -> list[dict]:
        for p in v:
            if not p.get("url") or not p.get("license"):
                raise ValueError("each photo needs a url and a license/permission note")
        return v


class PropertyPatch(BaseModel):
    model_config = {"extra": "forbid"}
    condition: Condition | None = None
    listing_status: ListingStatus | None = None
    list_price: float | None = Field(default=None, gt=0)
    days_on_market: int | None = Field(default=None, ge=0)
    listing_url: HttpUrl | None = None
    beds: float | None = None
    baths: float | None = None
    sqft: float | None = None
    year_built: int | None = None
    lat: float | None = None
    lng: float | None = None
    annual_taxes: float | None = None
    hoa_monthly: float | None = None
    opportunity_types: list[str] | None = None
    distress_signals: list[str] | None = None
    notes: str | None = None
    seller_contact: str | None = None
    access_info: str | None = None
    verification_status: Literal["unverified", "source_verified", "manually_verified", "disputed"] | None = None


def _load(db: Session, pid: str) -> Property:
    p = db.scalar(
        select(Property).where(Property.id == pid).options(
            selectinload(Property.analyses), selectinload(Property.price_history), selectinload(Property.source_records))
        .execution_options(populate_existing=True)
    )
    if not p:
        raise HTTPException(404, "property not found")
    return p


# ------------------------------------------------------------------ list / map / detail
@router.get("/properties")
def list_properties(
    db: Session = Depends(get_db),
    user: User = Depends(staff),
    q: str | None = None,
    market_id: str | None = None,
    status: str | None = None,
    opportunity_type: str | None = None,
    listing_status: str | None = None,
    min_score: float | None = None,
    needs_review: bool | None = None,
    demo: bool | None = None,
    sort: Literal["score", "-score", "updated", "price", "-price", "profit", "roi"] = "-score",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    stmt = select(Property).outerjoin(
        DealAnalysis, (DealAnalysis.property_id == Property.id) & DealAnalysis.is_current.is_(True))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Property.address_line).like(like), func.lower(Property.city).like(like),
                              Property.zip_code.like(f"{q}%"), func.lower(Property.county).like(like)))
    if market_id:
        stmt = stmt.where(Property.market_id == market_id)
    if status:
        stmt = stmt.where(Property.status == status)
    if listing_status:
        stmt = stmt.where(Property.listing_status == listing_status)
    if demo is not None:
        stmt = stmt.where(Property.is_demo.is_(demo))
    if min_score is not None:
        stmt = stmt.where(DealAnalysis.score >= min_score)
    if needs_review is not None:
        stmt = stmt.where(DealAnalysis.needs_manual_review.is_(needs_review))
    order = {
        "score": DealAnalysis.score.asc().nulls_last(), "-score": DealAnalysis.score.desc().nulls_last(),
        "updated": Property.updated_at.desc(), "price": Property.list_price.asc().nulls_last(),
        "-price": Property.list_price.desc().nulls_last(), "profit": DealAnalysis.net_profit.desc().nulls_last(),
        "roi": DealAnalysis.roi_pct.desc().nulls_last(),
    }[sort]
    rows = list(db.scalars(stmt.options(selectinload(Property.analyses)).order_by(order)))
    if opportunity_type:  # JSON list filter (portable across SQLite/Postgres)
        rows = [p for p in rows if opportunity_type in (p.opportunity_types or [])]
    total = len(rows)
    rows = rows[(page - 1) * page_size: page * page_size]
    return {"total": total, "page": page, "items": [property_row(p) for p in rows]}


@router.get("/properties/{pid}")
def get_property(pid: str, db: Session = Depends(get_db), user: User = Depends(staff)):
    p = _load(db, pid)
    return property_detail(p, include_sensitive=user.role in ("admin", "analyst"))


# ------------------------------------------------------------------ manual entry
@router.post("/properties", status_code=201)
def create_property(body: PropertyIn, request: Request, db: Session = Depends(get_db),
                    user: User = Depends(require_roles("admin", "analyst", "wholesaler"))):
    key = address_key(body.address_line, body.city, body.state, body.zip_code, body.unit)
    existing = db.scalar(select(Property).where(Property.address_key == key))
    if existing:
        raise HTTPException(409, {"message": "property already exists", "id": existing.id})
    if body.listing_status == "active" and not (body.listing_url or body.source_url):
        raise HTTPException(400, "an 'active' listing needs a listing URL or supporting source")
    is_staff = user.role in ("admin", "analyst")
    data = body.model_dump(exclude={"seller_contact", "access_info", "source_description", "source_url",
                                    "verified_by_staff", "listing_url"})
    p = Property(**data, address_key=key)
    p.zip_code = zip5(body.zip_code)
    p.listing_url = str(body.listing_url) if body.listing_url else None
    p.seller_contact_enc = encrypt(body.seller_contact)
    p.access_info_enc = encrypt(body.access_info)
    p.data_provider = f"{'wholesaler' if user.role == 'wholesaler' else 'manual'}: {body.source_description}"
    p.source_url = str(body.source_url) if body.source_url else p.listing_url
    p.verification_status = "manually_verified" if (is_staff and body.verified_by_staff) else "unverified"
    p.license = "Submitted by user; submitter attests they may share it"
    p.submitted_by_role = user.role
    p.created_by = user.id
    p.market_id = market_for(db, p.state, p.zip_code, p.county, p.city)
    if user.role == "wholesaler" and "wholesale" not in p.opportunity_types:
        p.opportunity_types = [*p.opportunity_types, "wholesale"]
    db.add(p)
    db.flush()
    if body.list_price:
        db.add(PriceHistory(property_id=p.id, event_date=date.today(), event_type="listed", price=body.list_price,
                            data_provider=p.data_provider, source_url=p.source_url,
                            verification_status=p.verification_status))
    audit(db, "property.create", user.id, "property", p.id, {"address": body.address_line}, client_ip(request))
    db.commit()
    return property_row(_load(db, p.id))


@router.patch("/properties/{pid}")
def update_property(pid: str, body: PropertyPatch, request: Request, db: Session = Depends(get_db),
                    user: User = Depends(staff)):
    p = _load(db, pid)
    data = body.model_dump(exclude_unset=True)
    if "list_price" in data and data["list_price"] and data["list_price"] != p.list_price:
        evt = "listed" if p.list_price is None else "price_change"
        if p.list_price and data["list_price"] < p.list_price and "price_reduced" not in p.opportunity_types:
            p.opportunity_types = [*p.opportunity_types, "price_reduced"]
        db.add(PriceHistory(property_id=p.id, event_date=date.today(), event_type=evt, price=data["list_price"],
                            data_provider=f"manual:{user.email}", verification_status="manually_verified"))
    for k in ("seller_contact", "access_info"):
        if k in data:
            setattr(p, f"{k}_enc", encrypt(data.pop(k)))
    if "listing_url" in data and data["listing_url"] is not None:
        data["listing_url"] = str(data["listing_url"])
    for k, v in data.items():
        setattr(p, k, v)
    audit(db, "property.update", user.id, "property", p.id, {"fields": sorted(body.model_fields_set)}, client_ip(request))
    db.commit()
    return property_detail(_load(db, pid), include_sensitive=True)


class StatusIn(BaseModel):
    status: Literal["under_review", "approved", "rejected", "archived", "analyzed"]
    reason: str | None = None


@router.post("/properties/{pid}/status")
def set_status(pid: str, body: StatusIn, request: Request, db: Session = Depends(get_db), user: User = Depends(staff)):
    p = _load(db, pid)
    p.status = body.status
    audit(db, f"property.status.{body.status}", user.id, "property", p.id, {"reason": body.reason}, client_ip(request))
    db.commit()
    return {"id": p.id, "status": p.status}


# ------------------------------------------------------------------ analysis
class AnalyzeIn(BaseModel):
    purchase_price: float | None = Field(default=None, gt=0)
    manual_arv: float | None = Field(default=None, gt=0)
    manual_arv_reason: str | None = None
    scope: Literal["cosmetic", "light", "medium", "heavy", "gut"] | None = None
    acquisition_fee: float | None = Field(default=None, ge=0)
    assumption_overrides: dict = {}
    force: bool = False

    @model_validator(mode="after")
    def reason_needed(self):
        if self.manual_arv and not (self.manual_arv_reason or "").strip():
            raise ValueError("a manual ARV needs a reason")
        return self


@router.post("/properties/{pid}/analyze")
def analyze(pid: str, body: AnalyzeIn, db: Session = Depends(get_db), user: User = Depends(staff)):
    p = _load(db, pid)
    a, created = analyze_property(
        db, p, purchase_price=body.purchase_price, manual_arv=body.manual_arv,
        manual_arv_reason=body.manual_arv_reason, scope=body.scope, acquisition_fee=body.acquisition_fee,
        assumption_overrides=body.assumption_overrides, actor=f"user:{user.id}", force=body.force,
    )
    matches = match_property(db, p, a)
    audit(db, "property.analyze", user.id, "property", p.id, {"analysis_id": a.id, "created": created})
    db.commit()
    return {"created": created, "eligible_matches": sum(1 for m in matches if m.eligible),
            "property": property_detail(_load(db, pid), include_sensitive=True)}


@router.post("/properties/{pid}/ai/{task}")
def ai_task(pid: str, task: Literal["deal_explanation", "risk_factors", "comp_summary", "investor_summary"],
            db: Session = Depends(get_db), user: User = Depends(staff)):
    p = _load(db, pid)
    a = next((x for x in p.analyses if x.is_current), None)
    if not a:
        raise HTTPException(400, "analyze the property first")
    try:
        text = ai.generate(db, task, ai.facts_for_analysis(p, a), entity_id=a.id)
        if task == "deal_explanation":
            a.ai_summary = text
        db.commit()
        return {"task": task, "text": text, "source": "claude"}
    except ai.AIUnavailable as exc:
        db.commit()
        return {"task": task, "text": a.explanation, "source": "deterministic", "reason": str(exc)}


@router.post("/properties/{pid}/enrich")
def enrich(pid: str, db: Session = Depends(get_db), user: User = Depends(staff)):
    p = _load(db, pid)
    sources = db.scalars(select(DataSource).where(DataSource.category == "enrichment", DataSource.enabled.is_(True))).all()
    out = enrich_property(db, p, list(sources))
    db.commit()
    return {"enrichment": out, "sources": [s.key for s in sources]}


# ------------------------------------------------------------------ renovation
class RenovationIn(BaseModel):
    method: Literal["manual", "contractor_bid"] = "manual"
    scope: Literal["cosmetic", "light", "medium", "heavy", "gut"] = "medium"
    line_items: dict[str, float]
    notes: str | None = None

    @field_validator("line_items")
    @classmethod
    def known_items(cls, v):
        bad = set(v) - set(LINE_ITEMS)
        if bad:
            raise ValueError(f"unknown line items {sorted(bad)}")
        if any(x < 0 for x in v.values()):
            raise ValueError("amounts must be ≥ 0")
        return v


@router.get("/properties/{pid}/renovation")
def get_renovation(pid: str, scope: str | None = None, issues: str | None = None,
                   db: Session = Depends(get_db), user: User = Depends(staff)):
    p = _load(db, pid)
    a = assumptions_for(db, p)
    current, method = renovation_for(db, p, a, scope)
    preview = estimate_renovation(RenovationInput(
        sqft=p.sqft, baths=p.baths, year_built=p.year_built, stories=p.stories, condition=p.condition, scope=scope,
        issues=[i for i in (issues.split(",") if issues else (p.distress_signals or [])) if i in ISSUE_FLAGS],
        cost_multiplier=float(a["renovation_cost_multiplier"]), contingency_pct=a["contingency_pct"],
    ))
    history = db.scalars(select(RenovationEstimate).where(RenovationEstimate.property_id == pid)
                         .order_by(RenovationEstimate.created_at.desc())).all()
    return {"current": current, "current_method": method, "rule_based_preview": preview.to_dict(),
            "issue_flags": ISSUE_FLAGS, "line_items": LINE_ITEMS,
            "history": [{"id": h.id, "method": h.method, "scope": h.scope, "total": h.total,
                         "created_at": h.created_at, "is_current": h.is_current} for h in history]}


@router.post("/properties/{pid}/renovation", status_code=201)
def save_renovation(pid: str, body: RenovationIn, db: Session = Depends(get_db), user: User = Depends(staff)):
    p = _load(db, pid)
    for old in db.scalars(select(RenovationEstimate).where(RenovationEstimate.property_id == pid)):
        old.is_current = False
    items = {k: float(body.line_items.get(k, 0.0)) for k in LINE_ITEMS}
    est = RenovationEstimate(property_id=p.id, method=body.method, scope=body.scope, line_items=items,
                             total=round(sum(items.values()), 2), notes=body.notes, created_by=user.id)
    db.add(est)
    audit(db, "renovation.save", user.id, "property", p.id, {"total": est.total, "method": body.method})
    db.commit()
    return {"id": est.id, "total": est.total}


# ------------------------------------------------------------------ comparable sales
class CompIn(BaseModel):
    address_line: str = Field(min_length=3)
    city: str
    state: str = Field(min_length=2, max_length=2)
    zip_code: str = Field(pattern=r"^\d{5}(-\d{4})?$")
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    subdivision: str | None = None
    property_type: PropertyType = "single_family"
    beds: float | None = Field(default=None, ge=0)
    baths: float | None = Field(default=None, ge=0)
    sqft: float | None = Field(default=None, gt=100)
    lot_sqft: float | None = None
    year_built: int | None = None
    sale_price: float = Field(gt=1000)
    sale_date: date
    condition_at_sale: Literal["renovated", "good", "average", "poor", "unknown"] = "unknown"
    sale_type: Literal["arms_length", "foreclosure", "reo", "short_sale", "non_arms_length", "auction", "unknown"] = "arms_length"
    # Only closed sales. Active listings and assessments are deliberately not accepted.
    source_type: Literal["recorded_deed", "manual_verified", "licensed_mls_sold"] = "manual_verified"
    source_description: str = Field(min_length=3, max_length=200, description="e.g. 'Loudoun County deed book 1234/567'")
    source_url: HttpUrl | None = None
    deed_book_page: str | None = None
    notes: str | None = None

    @field_validator("sale_date")
    @classmethod
    def not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("sale date cannot be in the future — only closed sales are comps")
        return v


@router.get("/comps")
def list_comps(db: Session = Depends(get_db), user: User = Depends(staff), zip_code: str | None = None,
               demo: bool | None = None, limit: int = Query(200, le=1000)):
    stmt = select(ComparableSale).order_by(ComparableSale.sale_date.desc()).limit(limit)
    if zip_code:
        stmt = stmt.where(ComparableSale.zip_code == zip_code)
    if demo is not None:
        stmt = stmt.where(ComparableSale.is_demo.is_(demo))
    return [comp_row(c) for c in db.scalars(stmt)]


@router.post("/comps", status_code=201)
def create_comp(body: CompIn, request: Request, db: Session = Depends(get_db), user: User = Depends(staff)):
    key = address_key(body.address_line, body.city, body.state, body.zip_code)
    dup = db.scalar(select(ComparableSale).where(ComparableSale.address_key == key,
                                                 ComparableSale.sale_date == body.sale_date,
                                                 ComparableSale.sale_price == body.sale_price))
    if dup:
        raise HTTPException(409, {"message": "this sale is already recorded", "id": dup.id})
    data = body.model_dump(exclude={"source_description", "source_url"})
    c = ComparableSale(**data, address_key=key, entered_by=user.id)
    c.state = body.state.upper()
    c.zip_code = zip5(body.zip_code)
    c.data_provider = f"manual: {body.source_description}"
    c.source_url = str(body.source_url) if body.source_url else None
    c.verification_status = "manually_verified"
    c.license = "Public record / verified by staff"
    db.add(c)
    audit(db, "comp.create", user.id, "comp", None, {"address": body.address_line, "price": body.sale_price},
          client_ip(request))
    db.commit()
    return comp_row(c)


@router.delete("/comps/{cid}")
def delete_comp(cid: str, db: Session = Depends(get_db), user: User = Depends(require_roles("admin"))):
    c = db.get(ComparableSale, cid)
    if not c:
        raise HTTPException(404, "not found")
    audit(db, "comp.delete", user.id, "comp", cid, {"address": c.address_line})
    db.delete(c)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ standalone calculator
class CalcComp(BaseModel):
    sale_price: float = Field(gt=0)
    sale_date: date
    sqft: float | None = None
    beds: float | None = None
    baths: float | None = None
    distance_miles: float | None = Field(default=None, ge=0)
    condition_at_sale: Literal["renovated", "good", "average", "poor", "unknown"] = "renovated"
    address: str = "comparable"


class CalcIn(BaseModel):
    purchase_price: float = Field(gt=0)
    arv: float | None = Field(default=None, gt=0, description="Analyst ARV. Prefer entering comps instead.")
    comps: list[CalcComp] = []
    renovation_total: float | None = Field(default=None, ge=0)
    sqft: float | None = None
    beds: float | None = None
    baths: float | None = None
    year_built: int | None = None
    condition: Condition = "unknown"
    scope: Literal["cosmetic", "light", "medium", "heavy", "gut"] | None = None
    issues: list[str] = []
    property_type: PropertyType = "single_family"
    annual_taxes: float | None = None
    hoa_monthly: float | None = None
    days_on_market: int | None = None
    market_profile: Literal["northern_virginia", "shenandoah_valley_va", "eastern_panhandle_wv"] | None = None
    assumption_overrides: dict = {}


@router.post("/analyzer/calculate")
def calculate(body: CalcIn, user: User = Depends(staff)):
    a = merged_assumptions(body.market_profile, body.assumption_overrides)
    if body.renovation_total is not None:
        reno = {"scope": body.scope or "medium", "line_items": {}, "total": body.renovation_total, "flags": [],
                "basis": {"all": "entered total"}}
    else:
        reno = estimate_renovation(RenovationInput(
            sqft=body.sqft, baths=body.baths, year_built=body.year_built, condition=body.condition, scope=body.scope,
            issues=body.issues, cost_multiplier=float(a["renovation_cost_multiplier"]),
            contingency_pct=a["contingency_pct"])).to_dict()
    # Calculator comps: place them on a synthetic line at their stated distance from the subject.
    subj = Subject(body.property_type, body.sqft, body.beds, body.baths, lat=0.0, lng=0.0, zip_code="00000")
    comps = [
        Comp(id=f"calc{i}", address=c.address, sale_price=c.sale_price, sale_date=c.sale_date,
             property_type=body.property_type, sqft=c.sqft, beds=c.beds, baths=c.baths,
             lat=(c.distance_miles or 0.0) / 69.0 if c.distance_miles is not None else None,
             lng=0.0 if c.distance_miles is not None else None, zip_code="00000",
             condition_at_sale=c.condition_at_sale, sale_type="arms_length", source_type="manual_verified",
             verification_status="unverified", data_provider="calculator input")
        for i, c in enumerate(body.comps)
    ]
    if not comps and not body.arv:
        raise HTTPException(400, "enter comparable sales or an ARV")
    out = compute(
        subject=subj, comps=comps, a=a, renovation=reno, purchase_price=body.purchase_price,
        condition=body.condition, year_built=body.year_built, days_on_market=body.days_on_market,
        annual_taxes=body.annual_taxes, hoa_monthly=body.hoa_monthly,
        manual_arv=body.arv if not comps else None,
        manual_arv_reason="calculator: analyst-entered ARV" if body.arv and not comps else None,
    )
    out["generated_at"] = datetime.now(UTC).isoformat()
    return out
