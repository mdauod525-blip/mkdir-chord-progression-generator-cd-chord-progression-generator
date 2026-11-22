"""Dashboard metrics, administration, data sources, automation, reports, revenue configuration."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..agent.workflows import run_daily, run_weekly
from ..analysis.assumptions import DEFAULT_ASSUMPTIONS, merged_assumptions
from ..connectors.base import ConnectorError
from ..connectors.providers import REGISTRY, ArcGISFeatureConnector
from ..db import get_db
from ..models import (
    AdminAlert,
    AgentEvent,
    AgentRun,
    AuditLog,
    DataSource,
    DealAnalysis,
    IngestionRun,
    Investor,
    InvestorInterest,
    InvestorTransaction,
    Market,
    MarketAssumptions,
    Match,
    MessageTemplate,
    Opportunity,
    PricingTier,
    Property,
    Report,
    Subscription,
    User,
)
from ..security import hash_password
from ..services import ai
from ..services.audit import audit
from ..services.ingest import connector_for, run_source
from ..services.notifications import DEFAULT_TEMPLATES, render
from ..services.settings_store import DEFAULTS, all_settings, set_setting
from .deps import admin_only, client_ip, staff

router = APIRouter(prefix="/api", tags=["admin"])


# ------------------------------------------------------------------ dashboard
@router.get("/dashboard/metrics")
def metrics(db: Session = Depends(get_db), user=Depends(staff), demo: bool | None = None):
    def pq(stmt):
        return stmt.where(Property.is_demo.is_(demo)) if demo is not None else stmt

    props = db.scalar(pq(select(func.count(Property.id)))) or 0
    cur = pq(select(DealAnalysis).join(Property, Property.id == DealAnalysis.property_id)
             .where(DealAnalysis.is_current.is_(True)))
    analyses = list(db.scalars(cur))
    qualified = [a for a in analyses if (a.score or 0) >= 70 and not a.needs_manual_review and (a.net_profit or 0) > 0]
    rois = [a.roi_pct for a in qualified if a.roi_pct is not None]
    inv_q = select(func.count(Investor.id)).where(Investor.is_active.is_(True))
    if demo is not None:
        inv_q = inv_q.where(Investor.is_demo.is_(demo))
    opp = Counter(db.scalars(select(Opportunity.status)).all())
    closed = db.scalar(select(func.count(InvestorTransaction.id))) or 0
    return {
        "properties_discovered": props,
        "deals_analyzed": len(analyses),
        "qualified_deals": len(qualified),
        "needs_manual_review": sum(1 for a in analyses if a.needs_manual_review),
        "average_projected_roi_pct": round(sum(rois) / len(rois), 1) if rois else None,
        "total_estimated_profit": round(sum(a.net_profit or 0 for a in qualified), 0),
        "active_investors": db.scalar(inv_q) or 0,
        "investor_matches": db.scalar(select(func.count(Match.id)).where(Match.eligible.is_(True))) or 0,
        "opportunities_under_review": opp.get("draft", 0) + opp.get("pending_approval", 0) + opp.get("approved", 0),
        "opportunities_presented": opp.get("published", 0) + opp.get("under_contract", 0),
        "closed_transactions": closed + opp.get("closed", 0),
        "unread_alerts": db.scalar(select(func.count(AdminAlert.id)).where(AdminAlert.is_read.is_(False))) or 0,
        "note": "Profit and ROI are projections from estimates, counting only qualified deals.",
    }


@router.get("/dashboard/charts")
def charts(db: Session = Depends(get_db), user=Depends(staff)):
    rows = db.execute(select(DealAnalysis, Property).join(Property, Property.id == DealAnalysis.property_id)
                      .where(DealAnalysis.is_current.is_(True))).all()
    bands = Counter()
    by_market: dict[str, dict[str, Any]] = defaultdict(lambda: {"deals": 0, "qualified": 0, "profit": 0.0})
    markets = {m.id: m.name for m in db.scalars(select(Market))}
    scatter = []
    for a, p in rows:
        bands[a.score_band or "Unscored"] += 1
        name = markets.get(p.market_id, "Unassigned")
        by_market[name]["deals"] += 1
        if (a.score or 0) >= 70 and not a.needs_manual_review:
            by_market[name]["qualified"] += 1
            by_market[name]["profit"] += a.net_profit or 0
        if a.roi_pct is not None and a.score is not None:
            scatter.append({"id": p.id, "label": f"{p.address_line}, {p.city}", "score": a.score,
                            "roi": a.roi_pct, "profit": a.net_profit, "demo": p.is_demo})
    pipeline = Counter(db.scalars(select(Investor.pipeline_stage).where(Investor.is_active.is_(True))).all())
    since = datetime.now(UTC) - timedelta(weeks=12)
    weekly = Counter()
    for (created,) in db.execute(select(DealAnalysis.created_at).where(DealAnalysis.created_at >= since)):
        c = created if created.tzinfo else created.replace(tzinfo=UTC)
        weekly[(c.date() - timedelta(days=c.weekday())).isoformat()] += 1
    return {
        "score_bands": [{"band": k, "count": v} for k, v in bands.items()],
        "by_market": [{"market": k, **v} for k, v in sorted(by_market.items())],
        "roi_vs_score": scatter,
        "pipeline": [{"stage": k, "count": v} for k, v in pipeline.items()],
        "analyses_per_week": [{"week": k, "count": v} for k, v in sorted(weekly.items())],
    }


@router.get("/dashboard/map")
def map_points(db: Session = Depends(get_db), user=Depends(staff)):
    rows = db.execute(select(Property, DealAnalysis).outerjoin(
        DealAnalysis, (DealAnalysis.property_id == Property.id) & DealAnalysis.is_current.is_(True))
        .where(Property.lat.is_not(None))).all()
    return [{"id": p.id, "lat": p.lat, "lng": p.lng, "label": f"{p.address_line}, {p.city}",
             "score": a.score if a else None, "band": a.score_band if a else None, "demo": p.is_demo}
            for p, a in rows]


# ------------------------------------------------------------------ markets & assumptions
class MarketIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    region: str = ""
    state: str = Field(min_length=2, max_length=2)
    counties: list[str] = []
    cities: list[str] = []
    zip_codes: list[str] = []
    county_fips: list[str] = []
    center_lat: float | None = None
    center_lng: float | None = None
    is_active: bool = True
    assumption_profile: Literal["northern_virginia", "shenandoah_valley_va", "eastern_panhandle_wv"] | None = None


def market_out(m: Market) -> dict:
    return {"id": m.id, "name": m.name, "region": m.region, "state": m.state, "counties": m.counties,
            "cities": m.cities, "zip_codes": m.zip_codes, "county_fips": m.county_fips, "center_lat": m.center_lat,
            "center_lng": m.center_lng, "is_active": m.is_active,
            "assumptions": m.assumptions.values if m.assumptions else None,
            "assumptions_reviewed_at": m.assumptions.reviewed_at if m.assumptions else None}


@router.get("/markets")
def list_markets(db: Session = Depends(get_db), user=Depends(staff)):
    return [market_out(m) for m in db.scalars(select(Market).order_by(Market.state, Market.name))]


@router.post("/markets", status_code=201)
def create_market(body: MarketIn, db: Session = Depends(get_db), user=Depends(admin_only)):
    data = body.model_dump(exclude={"assumption_profile"})
    data["state"] = data["state"].upper()
    m = Market(**data)
    m.assumptions = MarketAssumptions(values=merged_assumptions(body.assumption_profile))
    db.add(m)
    audit(db, "market.create", user.id, "market", None, {"name": body.name})
    db.commit()
    return market_out(m)


@router.put("/markets/{mid}")
def update_market(mid: str, body: MarketIn, db: Session = Depends(get_db), user=Depends(admin_only)):
    m = db.get(Market, mid)
    if not m:
        raise HTTPException(404, "market not found")
    for k, v in body.model_dump(exclude={"assumption_profile"}).items():
        setattr(m, k, v.upper() if k == "state" else v)
    db.commit()
    return market_out(m)


class AssumptionsIn(BaseModel):
    values: dict[str, Any]
    notes: str | None = None


@router.put("/markets/{mid}/assumptions")
def update_assumptions(mid: str, body: AssumptionsIn, db: Session = Depends(get_db), user=Depends(admin_only)):
    m = db.get(Market, mid)
    if not m:
        raise HTTPException(404, "market not found")
    unknown = set(body.values) - set(DEFAULT_ASSUMPTIONS)
    if unknown:
        raise HTTPException(400, f"unknown assumption keys: {sorted(unknown)}")
    base = m.assumptions.values if m.assumptions else merged_assumptions()
    merged = merged_assumptions(overrides={**base, **body.values})
    if m.assumptions is None:
        m.assumptions = MarketAssumptions(values=merged)
    else:
        m.assumptions.values = merged
    m.assumptions.reviewed_by, m.assumptions.reviewed_at, m.assumptions.notes = user.id, datetime.now(UTC), body.notes
    audit(db, "market.assumptions", user.id, "market", mid, {"changed": sorted(body.values)})
    db.commit()
    return market_out(m)


@router.get("/assumptions/defaults")
def default_assumptions(user=Depends(staff)):
    from ..analysis.assumptions import MARKET_OVERRIDES

    return {"defaults": DEFAULT_ASSUMPTIONS, "profiles": MARKET_OVERRIDES}


# ------------------------------------------------------------------ data sources
def source_out(s: DataSource, db: Session) -> dict:
    last = db.scalar(select(IngestionRun).where(IngestionRun.source_key == s.key).order_by(IngestionRun.started_at.desc()))
    cls = REGISTRY.get(s.connector)
    cred_ok = True
    if cls and cls.credential_env_var:
        try:
            cred_ok = bool(cls(config={}).credential())
        except Exception:
            cred_ok = False
    return {"id": s.id, "key": s.key, "name": s.name, "connector": s.connector, "category": s.category,
            "cost_tier": s.cost_tier, "license": s.license, "permitted_use": s.permitted_use, "base_url": s.base_url,
            "enabled": s.enabled, "requires_credentials": s.requires_credentials,
            "credential_env_var": s.credential_env_var, "credentials_present": cred_ok, "schedule": s.schedule,
            "config": s.config, "notes": s.notes, "last_run_at": s.last_run_at, "last_status": s.last_status,
            "last_run": {"status": last.status, "fetched": last.records_fetched, "created": last.records_created,
                         "updated": last.records_updated, "errors": (last.errors or [])[:5],
                         "finished_at": last.finished_at} if last else None}


@router.get("/data-sources")
def list_sources(db: Session = Depends(get_db), user=Depends(staff)):
    return [source_out(s, db) for s in db.scalars(select(DataSource).order_by(DataSource.cost_tier, DataSource.name))]


class SourcePatch(BaseModel):
    enabled: bool | None = None
    schedule: Literal["daily", "weekly", "monthly", "manual"] | None = None
    config: dict | None = None
    license: str | None = None
    permitted_use: str | None = None
    notes: str | None = None


@router.patch("/data-sources/{key}")
def patch_source(key: str, body: SourcePatch, db: Session = Depends(get_db), user=Depends(admin_only)):
    s = db.scalar(select(DataSource).where(DataSource.key == key))
    if not s:
        raise HTTPException(404, "source not found")
    if body.enabled and s.cost_tier == "paid":
        raise HTTPException(400, "paid modules stay disabled in the free MVP; see docs/DATA_SOURCES.md")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    audit(db, "source.update", user.id, "data_source", s.id, body.model_dump(exclude_unset=True))
    db.commit()
    return source_out(s, db)


@router.post("/data-sources/{key}/run")
def run_source_now(key: str, max_records: int | None = Query(None, ge=1, le=50000), db: Session = Depends(get_db),
                   user=Depends(admin_only)):
    s = db.scalar(select(DataSource).where(DataSource.key == key))
    if not s:
        raise HTTPException(404, "source not found")
    if s.category == "enrichment":
        raise HTTPException(400, "enrichment sources run per property (Properties → Enrich)")
    params = {"max_records": max_records} if max_records else {}
    run = run_source(db, s, triggered_by=f"user:{user.id}", **params)
    db.commit()
    return {"status": run.status, "fetched": run.records_fetched, "created": run.records_created,
            "updated": run.records_updated, "skipped": run.records_skipped, "errors": run.errors[:20]}


@router.post("/data-sources/{key}/upload")
async def upload_to_source(key: str, file: UploadFile = File(...), field_map: str | None = Form(None),
                           db: Session = Depends(get_db), user=Depends(admin_only)):
    """Import an officially downloaded CSV/JSON/GeoJSON/Parquet file through a source's mapping."""
    import json

    s = db.scalar(select(DataSource).where(DataSource.key == key))
    if not s:
        raise HTTPException(404, "source not found")
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(413, "file too large (50 MB max per upload; split bulk files)")
    if field_map:
        try:
            s.config = {**(s.config or {}), "field_map": json.loads(field_map)}
        except json.JSONDecodeError:
            raise HTTPException(400, "field_map must be JSON") from None
    if s.connector in ("fhfa_hpi",):
        conn = connector_for(s)
        res = conn.fetch(content=content)
        _apply_fhfa(db, res.enrichment.get("fhfa", {}))
        db.commit()
        return {"status": "succeeded", "places": res.enrichment.get("fhfa", {})}
    run = run_source(db, s, triggered_by=f"upload:{user.id}", content=content, filename=file.filename)
    db.commit()
    return {"status": run.status, "fetched": run.records_fetched, "created": run.records_created,
            "updated": run.records_updated, "skipped": run.records_skipped, "errors": run.errors[:20]}


def _apply_fhfa(db: Session, places: dict) -> None:
    """Use FHFA appreciation for markets whose config lists an FHFA place_id."""
    for m in db.scalars(select(Market)):
        pid = (m.assumptions.values or {}).get("fhfa_place_id") if m.assumptions else None
        if pid and pid in places and m.assumptions:
            m.assumptions.values = {**m.assumptions.values,
                                    "monthly_appreciation_pct": places[pid]["monthly_appreciation_pct"]}


@router.get("/data-sources/{key}/describe")
def describe_source(key: str, db: Session = Depends(get_db), user=Depends(admin_only)):
    s = db.scalar(select(DataSource).where(DataSource.key == key))
    if not s:
        raise HTTPException(404, "source not found")
    conn = connector_for(s)
    if not isinstance(conn, ArcGISFeatureConnector):
        return conn.describe()
    try:
        return conn.describe_layer()
    except ConnectorError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/ingestion-runs")
def ingestion_runs(db: Session = Depends(get_db), user=Depends(staff), limit: int = Query(50, le=200)):
    return [{"id": r.id, "source_key": r.source_key, "status": r.status, "started_at": r.started_at,
             "finished_at": r.finished_at, "fetched": r.records_fetched, "created": r.records_created,
             "updated": r.records_updated, "skipped": r.records_skipped, "errors": (r.errors or [])[:5],
             "triggered_by": r.triggered_by}
            for r in db.scalars(select(IngestionRun).order_by(IngestionRun.started_at.desc()).limit(limit))]


# ------------------------------------------------------------------ settings & AI usage
@router.get("/settings")
def get_settings_(db: Session = Depends(get_db), user=Depends(staff)):
    return all_settings(db)


@router.put("/settings")
def put_settings(body: dict[str, Any], db: Session = Depends(get_db), user=Depends(admin_only)):
    unknown = set(body) - set(DEFAULTS)
    if unknown:
        raise HTTPException(400, f"unknown settings: {sorted(unknown)}")
    if "ai_monthly_budget_usd" in body and not (0 <= float(body["ai_monthly_budget_usd"]) <= 1000):
        raise HTTPException(400, "ai_monthly_budget_usd must be between 0 and 1000")
    for k, v in body.items():
        set_setting(db, k, v)
    audit(db, "settings.update", user.id, "settings", None, body)
    db.commit()
    return all_settings(db)


@router.get("/ai/usage")
def ai_usage(db: Session = Depends(get_db), user=Depends(staff)):
    return ai.usage_summary(db)


# ------------------------------------------------------------------ automation
@router.post("/agent/run/{workflow}")
def run_agent(workflow: Literal["daily", "weekly"], db: Session = Depends(get_db), user=Depends(admin_only)):
    run = (run_daily if workflow == "daily" else run_weekly)(db, triggered_by=f"user:{user.id}")
    db.commit()
    return {"id": run.id, "status": run.status, "stats": run.stats}


@router.get("/agent/runs")
def agent_runs(db: Session = Depends(get_db), user=Depends(staff), limit: int = Query(30, le=200)):
    return [{"id": r.id, "workflow": r.workflow, "status": r.status, "started_at": r.started_at,
             "finished_at": r.finished_at, "stats": r.stats, "triggered_by": r.triggered_by}
            for r in db.scalars(select(AgentRun).order_by(AgentRun.started_at.desc()).limit(limit))]


@router.get("/agent/runs/{rid}/events")
def agent_events(rid: str, db: Session = Depends(get_db), user=Depends(staff)):
    return [{"step": e.step, "level": e.level, "message": e.message, "data": e.data, "created_at": e.created_at}
            for e in db.scalars(select(AgentEvent).where(AgentEvent.run_id == rid).order_by(AgentEvent.created_at))]


@router.get("/alerts")
def list_alerts(db: Session = Depends(get_db), user=Depends(staff), unread_only: bool = False):
    stmt = select(AdminAlert).order_by(AdminAlert.created_at.desc()).limit(200)
    if unread_only:
        stmt = stmt.where(AdminAlert.is_read.is_(False))
    return [{"id": a.id, "level": a.level, "category": a.category, "title": a.title, "body": a.body,
             "entity_id": a.entity_id, "is_read": a.is_read, "created_at": a.created_at} for a in db.scalars(stmt)]


@router.post("/alerts/{aid}/read")
def read_alert(aid: str, db: Session = Depends(get_db), user=Depends(staff)):
    a = db.get(AdminAlert, aid)
    if a:
        a.is_read = True
        db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ reports
@router.get("/reports")
def list_reports(db: Session = Depends(get_db), user=Depends(staff)):
    return [{"id": r.id, "kind": r.kind, "title": r.title, "period_start": r.period_start,
             "period_end": r.period_end, "created_at": r.created_at, "data": r.data}
            for r in db.scalars(select(Report).order_by(Report.created_at.desc()).limit(100))]


@router.get("/reports/financial")
def financial_report(db: Session = Depends(get_db), user=Depends(staff)):
    """Portfolio-level view of projected deal economics and platform revenue configuration."""
    rows = db.execute(select(DealAnalysis, Property).join(Property, Property.id == DealAnalysis.property_id)
                      .where(DealAnalysis.is_current.is_(True), DealAnalysis.net_profit.is_not(None))).all()
    qualified = [(a, p) for a, p in rows if (a.score or 0) >= 70 and not a.needs_manual_review]

    def agg(items):
        if not items:
            return {"count": 0}
        n = len(items)
        return {
            "count": n,
            "total_project_cost": round(sum(a.total_project_cost or 0 for a, _ in items)),
            "total_projected_profit": round(sum(a.net_profit or 0 for a, _ in items)),
            "total_cash_required": round(sum(a.cash_required or 0 for a, _ in items)),
            "avg_roi_pct": round(sum(a.roi_pct or 0 for a, _ in items) / n, 1),
            "avg_margin_pct": round(sum(a.profit_margin_pct or 0 for a, _ in items) / n, 1),
            "avg_duration_months": round(sum(a.duration_months or 0 for a, _ in items) / n, 1),
        }

    subs = db.execute(select(Subscription, PricingTier).join(PricingTier, PricingTier.id == Subscription.tier_id)
                      .where(Subscription.status == "active")).all()
    mrr = sum(t.monthly_price for _, t in subs)
    return {"all_analyzed": agg(rows), "qualified": agg(qualified),
            "subscriptions": {"active": len(subs), "monthly_recurring_revenue": round(mrr, 2)},
            "note": "Projected deal figures are estimates. Platform revenue is subscription-only; no transaction "
                    "or success fees are implemented."}


@router.get("/reports/{rid}")
def get_report(rid: str, db: Session = Depends(get_db), user=Depends(staff)):
    r = db.get(Report, rid)
    if not r:
        raise HTTPException(404, "not found")
    return {"id": r.id, "kind": r.kind, "title": r.title, "content_md": r.content_md, "data": r.data,
            "created_at": r.created_at}


# ------------------------------------------------------------------ templates
class TemplateIn(BaseModel):
    name: str
    channel: Literal["email", "sms"] = "email"
    subject: str | None = None
    body: str = Field(min_length=1, max_length=20000)


@router.get("/templates")
def list_templates(db: Session = Depends(get_db), user=Depends(staff)):
    stored = {t.key: t for t in db.scalars(select(MessageTemplate))}
    out = []
    for d in DEFAULT_TEMPLATES:
        t = stored.get(d["key"])
        out.append({"key": d["key"], "name": t.name if t else d["name"], "channel": t.channel if t else d["channel"],
                    "subject": t.subject if t else d["subject"], "body": t.body if t else d["body"],
                    "customized": t is not None})
    out += [{"key": t.key, "name": t.name, "channel": t.channel, "subject": t.subject, "body": t.body,
             "customized": True} for k, t in stored.items() if k not in {d["key"] for d in DEFAULT_TEMPLATES}]
    return out


@router.put("/templates/{key}")
def save_template(key: str, body: TemplateIn, db: Session = Depends(get_db), user=Depends(admin_only)):
    try:
        render(body.body, {"investor": {"name": "Test"}, "opportunity": {}, "app_url": ""})
    except Exception as exc:
        raise HTTPException(400, f"template error: {exc}") from exc
    t = db.scalar(select(MessageTemplate).where(MessageTemplate.key == key))
    if t is None:
        t = MessageTemplate(key=key, **body.model_dump())
        db.add(t)
    else:
        for k, v in body.model_dump().items():
            setattr(t, k, v)
    audit(db, "template.save", user.id, "template", None, {"key": key})
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ users & audit
class UserIn(BaseModel):
    email: EmailStr
    full_name: str
    role: Literal["admin", "analyst"]
    password: str = Field(min_length=12)


@router.get("/users")
def list_users(db: Session = Depends(get_db), user=Depends(admin_only)):
    return [{"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active,
             "is_approved": u.is_approved, "last_login_at": u.last_login_at, "investor_id": u.investor_id}
            for u in db.scalars(select(User).order_by(User.created_at.desc()))]


@router.post("/users", status_code=201)
def create_user(body: UserIn, request: Request, db: Session = Depends(get_db), user=Depends(admin_only)):
    if db.scalar(select(User).where(func.lower(User.email) == body.email.lower())):
        raise HTTPException(409, "email exists")
    u = User(email=body.email.lower(), full_name=body.full_name, role=body.role,
             password_hash=hash_password(body.password), is_approved=True)
    db.add(u)
    audit(db, "user.create", user.id, "user", None, {"email": u.email, "role": u.role}, client_ip(request))
    db.commit()
    return {"id": u.id}


class UserPatch(BaseModel):
    is_active: bool | None = None
    is_approved: bool | None = None


@router.patch("/users/{uid}")
def patch_user(uid: str, body: UserPatch, db: Session = Depends(get_db), user=Depends(admin_only)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "not found")
    if uid == user.id and body.is_active is False:
        raise HTTPException(400, "you cannot deactivate yourself")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(u, k, v)
    audit(db, "user.update", user.id, "user", uid, body.model_dump(exclude_unset=True))
    db.commit()
    return {"ok": True}


@router.get("/audit-logs")
def audit_logs(db: Session = Depends(get_db), user=Depends(admin_only), action: str | None = None,
               limit: int = Query(200, le=1000)):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    return [{"id": a.id, "user_id": a.user_id, "action": a.action, "entity_type": a.entity_type,
             "entity_id": a.entity_id, "details": a.details, "ip_address": a.ip_address, "created_at": a.created_at}
            for a in db.scalars(stmt)]


# ------------------------------------------------------------------ pricing (revenue model)
class TierIn(BaseModel):
    name: str
    audience: Literal["investor", "wholesaler", "saas"]
    monthly_price: float = Field(ge=0)
    annual_price: float | None = Field(default=None, ge=0)
    features: list[str] = []
    limits: dict = {}
    is_active: bool = True
    sort_order: int = 0


def tier_out(t: PricingTier) -> dict:
    return {"id": t.id, "key": t.key, "name": t.name, "audience": t.audience, "monthly_price": t.monthly_price,
            "annual_price": t.annual_price, "features": t.features, "limits": t.limits, "is_active": t.is_active,
            "sort_order": t.sort_order}


@router.get("/pricing")
def public_pricing(db: Session = Depends(get_db)):
    return [tier_out(t) for t in db.scalars(select(PricingTier).where(PricingTier.is_active.is_(True))
                                            .order_by(PricingTier.audience, PricingTier.sort_order))]


@router.get("/admin/pricing")
def admin_pricing(db: Session = Depends(get_db), user=Depends(admin_only)):
    return [tier_out(t) for t in db.scalars(select(PricingTier).order_by(PricingTier.audience, PricingTier.sort_order))]


@router.put("/admin/pricing/{key}")
def save_tier(key: str, body: TierIn, db: Session = Depends(get_db), user=Depends(admin_only)):
    t = db.scalar(select(PricingTier).where(PricingTier.key == key))
    if t is None:
        t = PricingTier(key=key, **body.model_dump())
        db.add(t)
    else:
        for k, v in body.model_dump().items():
            setattr(t, k, v)
    audit(db, "pricing.save", user.id, "pricing_tier", None, {"key": key})
    db.commit()
    return tier_out(t)


class SubscriptionIn(BaseModel):
    user_id: str
    tier_key: str
    status: Literal["trialing", "active", "past_due", "canceled"] = "active"
    current_period_end: date | None = None


@router.post("/admin/subscriptions", status_code=201)
def record_subscription(body: SubscriptionIn, db: Session = Depends(get_db), user=Depends(admin_only)):
    """Manual subscription record (invoice paid outside the app). Stripe is a Phase 4 module."""
    t = db.scalar(select(PricingTier).where(PricingTier.key == body.tier_key))
    if not t or not db.get(User, body.user_id):
        raise HTTPException(404, "tier or user not found")
    s = Subscription(user_id=body.user_id, tier_id=t.id, status=body.status, provider="manual",
                     current_period_end=body.current_period_end)
    db.add(s)
    db.commit()
    return {"id": s.id}


@router.get("/admin/interests")
def all_interests(db: Session = Depends(get_db), user=Depends(staff)):
    rows = db.execute(select(InvestorInterest, Investor, Opportunity)
                      .join(Investor, Investor.id == InvestorInterest.investor_id)
                      .join(Opportunity, Opportunity.id == InvestorInterest.opportunity_id)
                      .order_by(InvestorInterest.created_at.desc()).limit(300)).all()
    return [{"id": x.id, "kind": x.kind, "message": x.message, "indicated_amount": x.indicated_amount,
             "status": x.status, "created_at": x.created_at, "investor": {"id": i.id, "name": i.name},
             "opportunity": {"id": o.id, "title": o.title}} for x, i, o in rows]
