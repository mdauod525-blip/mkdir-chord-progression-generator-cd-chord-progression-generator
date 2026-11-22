"""Autonomous deal-sourcing agent: daily and weekly workflows.

The agent ONLY reads approved data sources, analyzes, scores, matches, drafts summaries and
notifies staff. It has no capability to purchase property, move money, sign agreements, contact
sellers, make offers, or publish opportunities to investors — publishing requires a human admin
approval step (see api/opportunities.py), and investor notifications only go out for published
opportunities.
"""
from __future__ import annotations

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..analysis.pipeline import analyze_property
from ..matching.service import match_property
from ..models import (
    AgentEvent,
    AgentRun,
    DataSource,
    DealAnalysis,
    Match,
    Opportunity,
    PriceHistory,
    Property,
    Report,
    User,
)
from ..services import ai
from ..services.audit import alert
from ..services.ingest import enrich_property, run_source
from ..services.notifications import notify_staff
from ..services.settings_store import get_setting

log = logging.getLogger(__name__)
FORBIDDEN_ACTIONS = ("purchase", "transfer_funds", "sign_agreement", "make_offer", "publish_to_investors")


class AgentContext:
    def __init__(self, db: Session, workflow: str, triggered_by: str):
        self.db = db
        self.run = AgentRun(workflow=workflow, triggered_by=triggered_by, stats={})
        db.add(self.run)
        db.flush()

    def event(self, step: str, message: str, level: str = "info", data: dict | None = None) -> None:
        self.db.add(AgentEvent(run_id=self.run.id, step=step, level=level, message=message, data=data))

    def stat(self, key: str, inc: int = 1) -> None:
        s = dict(self.run.stats or {})
        s[key] = s.get(key, 0) + inc
        self.run.stats = s


def _ai_summary(db: Session, prop: Property, a: DealAnalysis, ctx: AgentContext) -> None:
    if a.ai_summary or (a.score or 0) < float(get_setting(db, "ai_summary_min_score")):
        return
    try:
        a.ai_summary = ai.generate(db, "deal_explanation", ai.facts_for_analysis(prop, a), entity_id=a.id)
        ctx.stat("ai_summaries")
    except ai.AIUnavailable as exc:
        ctx.stat("ai_skipped")
        ctx.event("summaries", f"AI summary skipped for {prop.address_line}: {exc}", "debug")


def _active_properties(db: Session) -> list[Property]:
    q = select(Property).where(Property.status.notin_(["rejected", "archived"]))
    if not get_setting(db, "include_demo_data"):
        q = q.where(Property.is_demo.is_(False))
    return list(db.scalars(q))


def run_daily(db: Session, triggered_by: str = "scheduler", client=None) -> AgentRun:
    ctx = AgentContext(db, "daily", triggered_by)
    try:
        # 1-3. search approved sources, identify new records, update existing ones
        sources = db.scalars(select(DataSource).where(
            DataSource.enabled.is_(True), DataSource.schedule == "daily",
            DataSource.category.in_(["property", "listings", "sales"]))).all()
        for src in sources:
            run = run_source(db, src, triggered_by="agent:daily", client=client)
            ctx.stat("records_created", run.records_created)
            ctx.stat("records_updated", run.records_updated)
            ctx.event("ingest", f"{src.name}: {run.status} — {run.records_created} new, {run.records_updated} updated",
                      "warning" if run.status == "failed" else "info", {"run_id": run.id})
        # 4. duplicates are prevented at write time by address/parcel keys (see services/ingest.py)
        # enrichment for properties missing it
        enrich_sources = db.scalars(select(DataSource).where(
            DataSource.enabled.is_(True), DataSource.category == "enrichment")).all()
        props = _active_properties(db)
        if enrich_sources:
            for p in props:
                if not p.enrichment and not p.is_demo:
                    enrich_property(db, p, list(enrich_sources), client=client)
                    ctx.stat("enriched")
        # 5-9. comps → ARV → renovation → returns → score (identical inputs are skipped)
        alert_min = float(get_setting(db, "alert_min_score"))
        high_quality = []
        for p in props:
            a, created = analyze_property(db, p, actor="agent:daily")
            if created:
                ctx.stat("analyzed")
            else:
                ctx.stat("unchanged")
            if a.needs_manual_review:
                ctx.stat("needs_review")
            # 10. investor matches (preliminary)
            matches = [m for m in match_property(db, p, a) if m.eligible]
            ctx.stat("matches", len(matches))
            # 11. summaries (AI only for strong deals, cached, budget-capped)
            _ai_summary(db, p, a, ctx)
            if created and (a.score or 0) >= alert_min and not a.needs_manual_review:
                high_quality.append((p, a, len(matches)))
        # 12. notify administrators (never investors)
        for p, a, n in high_quality:
            alert(db, "deal", f"High-scoring deal: {p.address_line}, {p.city} ({a.score:.0f})",
                  f"{a.score_band}. Projected net profit ${a.net_profit or 0:,.0f}, ROI {a.roi_pct or 0:.1f}%, "
                  f"{n} eligible investor match(es). Review before publishing.", entity_id=p.id)
        if high_quality:
            staff = [u.email for u in db.scalars(select(User).where(User.role == "admin", User.is_active.is_(True)))]
            body = "\n".join(f"- {p.address_line}, {p.city} {p.state}: score {a.score:.0f}, "
                             f"profit ${a.net_profit or 0:,.0f}" for p, a, _ in high_quality)
            notify_staff(db, staff, f"{len(high_quality)} new high-scoring deal(s) to review", body)
        ctx.event("notify", f"{len(high_quality)} high-quality deal(s) flagged for admin review")
        ctx.run.status = "succeeded"
    except Exception as exc:  # keep a record of failures
        log.exception("daily workflow failed")
        ctx.event("error", f"workflow failed: {exc}", "error")
        ctx.run.status = "failed"
    ctx.run.finished_at = datetime.now(UTC)
    db.flush()
    return ctx.run


def run_weekly(db: Session, triggered_by: str = "scheduler", client=None, today: date | None = None) -> AgentRun:
    ctx = AgentContext(db, "weekly", triggered_by)
    today = today or date.today()
    week_ago = today - timedelta(days=7)
    try:
        # weekly sources (e.g. bulk files, FHFA)
        for src in db.scalars(select(DataSource).where(DataSource.enabled.is_(True), DataSource.schedule == "weekly")):
            run = run_source(db, src, triggered_by="agent:weekly", client=client)
            ctx.event("ingest", f"{src.name}: {run.status}")
        improved, reductions, rows = [], [], []
        for p in _active_properties(db):
            prev = db.scalar(select(DealAnalysis).where(DealAnalysis.property_id == p.id, DealAnalysis.is_current.is_(True)))
            prev_score = prev.score if prev else None
            # 1-2. review & recalculate with the latest data (forced)
            a, _ = analyze_property(db, p, actor="agent:weekly", force=True)
            ctx.stat("recalculated")
            # 3. price reductions this week
            cuts = db.scalars(select(PriceHistory).where(
                PriceHistory.property_id == p.id, PriceHistory.event_type == "price_change",
                PriceHistory.event_date >= week_ago)).all()
            if cuts:
                reductions.append(p)
            # 4. more attractive than last week
            if prev_score is not None and a.score is not None and a.score - prev_score >= 5:
                improved.append((p, prev_score, a.score))
            # 5. refresh matching
            match_property(db, p, a)
            rows.append((p, a))
        ctx.stat("price_reductions", len(reductions))
        ctx.stat("improved", len(improved))
        # 6. weekly report
        report = build_weekly_report(db, rows, improved, reductions, week_ago, today)
        ctx.event("report", f"Weekly report generated: {report.title}", data={"report_id": report.id})
        ctx.run.status = "succeeded"
    except Exception as exc:
        log.exception("weekly workflow failed")
        ctx.event("error", f"workflow failed: {exc}", "error")
        ctx.run.status = "failed"
    ctx.run.finished_at = datetime.now(UTC)
    db.flush()
    return ctx.run


def build_weekly_report(db, rows, improved, reductions, start: date, end: date) -> Report:
    scored = sorted([r for r in rows if r[1].score is not None], key=lambda r: -(r[1].score or 0))
    qualified = [r for r in scored if (r[1].score or 0) >= 70 and not r[1].needs_manual_review]
    published = db.scalar(select(func.count(Opportunity.id)).where(Opportunity.status == "published")) or 0
    eligible = db.scalar(select(func.count(Match.id)).where(Match.eligible.is_(True))) or 0
    lines = [
        f"# Weekly opportunity report ({start.isoformat()} – {end.isoformat()})",
        "",
        f"- Active properties reviewed: {len(rows)}",
        f"- Qualified deals (score ≥ 70, no open review flags): {len(qualified)}",
        f"- Needs manual review: {sum(1 for r in rows if r[1].needs_manual_review)}",
        f"- Price reductions this week: {len(reductions)}",
        f"- Deals whose score rose ≥ 5 points: {len(improved)}",
        f"- Published opportunities: {published}; eligible investor matches: {eligible}",
        "",
        "## Top deals",
        "",
        "| Property | Score | Band | Est. ARV | Net profit | ROI | Comps | Demo |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for p, a in scored[:15]:
        lines.append(
            f"| {p.address_line}, {p.city} {p.state} | {a.score:.0f} | {a.score_band} | "
            f"{'$' + format(a.arv, ',.0f') if a.arv else '—'} | "
            f"{'$' + format(a.net_profit, ',.0f') if a.net_profit is not None else '—'} | "
            f"{format(a.roi_pct, '.1f') + '%' if a.roi_pct is not None else '—'} | {a.comp_count} | "
            f"{'yes' if p.is_demo else ''} |"
        )
    if improved:
        lines += ["", "## More attractive this week", ""]
        lines += [f"- {p.address_line}, {p.city}: {old:.0f} → {new:.0f}" for p, old, new in improved]
    if reductions:
        lines += ["", "## Price reductions", ""]
        lines += [f"- {p.address_line}, {p.city}: now ${p.list_price or 0:,.0f}" for p in reductions]
    lines += ["", "_All figures are estimates based on stated assumptions; not guarantees or investment advice._"]
    data = {"qualified": len(qualified), "reviewed": len(rows), "price_reductions": len(reductions),
            "improved": len(improved), "top": [{"property_id": p.id, "score": a.score} for p, a in scored[:15]]}
    content = "\n".join(lines)
    try:
        narrative = ai.generate(db, "weekly_report", data)
        content = content.replace("## Top deals", f"## Summary\n\n{narrative}\n\n## Top deals", 1)
    except ai.AIUnavailable:
        pass
    rep = Report(kind="weekly_opportunities", title=f"Weekly opportunities {end.isoformat()}",
                 period_start=start, period_end=end, content_md=content, data=data)
    db.add(rep)
    db.flush()
    return rep
