"""Claude API access with strict cost controls.

All numbers come from the deterministic engine. Claude is only used to *explain* them:
deal explanations, unusual risk factors, comparable-sales summaries, investor-facing summaries
and the weekly report narrative. Every call goes through `generate()`, which enforces:

* a global on/off switch and a required API key (otherwise callers use deterministic text),
* response caching keyed on (task, model, prompt) — identical requests are never paid twice,
* a daily request limit and a monthly USD budget (checked before the call using a worst-case
  estimate, and after the call using actual token usage),
* usage logging per call and admin alerts when spend crosses configured thresholds.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime, timedelta

import anthropic
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import AICache, AIUsage
from .audit import alert
from .settings_store import get_setting

log = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are an analyst assistant for a real estate deal-sourcing platform. You explain results "
    "that a deterministic underwriting engine already computed. Rules: use only the facts in the "
    "provided JSON; never change, recompute or invent numbers, comparable sales, listings or "
    "investor details; call out missing or low-confidence data plainly; describe every figure as "
    "an estimate; never promise returns or describe a deal as guaranteed, safe or risk-free; do "
    "not give legal, tax or individualized investment advice; never describe a match as a funding "
    "commitment; do not mention or infer anyone's race, religion, national origin, sex, familial "
    "status or disability. Be concise and specific. Plain text, no markdown headings."
)

TASK_INSTRUCTIONS = {
    "deal_explanation": "In 4-6 sentences, explain why this deal received its score, citing the strongest and weakest factors and any caps.",
    "risk_factors": "List up to 5 unusual or material risk factors an investor should verify, one per line starting with '- '. Only include risks supported by the data.",
    "comp_summary": "In 3-5 sentences, summarize the comparable sales: how many were used, how recent and close they are, how consistent the adjusted prices are, and what was excluded and why.",
    "investor_summary": "Write a neutral, investor-facing summary of this opportunity in 120 words or fewer. Include the key estimates, the main risks, and end with: 'All figures are estimates, not guarantees.'",
    "weekly_report": "Write a short executive summary (under 200 words) of this week's opportunity pipeline for the internal team.",
}


class AIUnavailable(Exception):
    pass


def _month_start() -> datetime:
    now = datetime.now(UTC)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def month_spend(db: Session) -> float:
    return float(
        db.scalar(select(func.coalesce(func.sum(AIUsage.cost_usd), 0.0)).where(AIUsage.created_at >= _month_start()))
        or 0.0
    )


def requests_today(db: Session) -> int:
    since = datetime.now(UTC) - timedelta(days=1)
    return int(
        db.scalar(
            select(func.count(AIUsage.id)).where(
                AIUsage.created_at >= since, AIUsage.cache_hit.is_(False), AIUsage.status == "ok"
            )
        )
        or 0
    )


def usage_summary(db: Session) -> dict:
    s = get_settings()
    budget = float(get_setting(db, "ai_monthly_budget_usd"))
    spent = month_spend(db)
    rows = db.execute(
        select(AIUsage.task, func.count(AIUsage.id), func.sum(AIUsage.input_tokens), func.sum(AIUsage.output_tokens),
               func.sum(AIUsage.cost_usd), func.sum(case((AIUsage.cache_hit.is_(True), 1), else_=0)))
        .where(AIUsage.created_at >= _month_start())
        .group_by(AIUsage.task)
    ).all()
    return {
        "configured": bool(s.anthropic_api_key),
        "enabled": bool(get_setting(db, "ai_enabled")),
        "model": s.ai_model,
        "month_spend_usd": round(spent, 4),
        "monthly_budget_usd": budget,
        "budget_used_pct": round(spent / budget * 100, 1) if budget else None,
        "requests_last_24h": requests_today(db),
        "daily_request_limit": int(get_setting(db, "ai_daily_request_limit")),
        "by_task": [
            {"task": t, "calls": int(n), "input_tokens": int(i or 0), "output_tokens": int(o or 0),
             "cost_usd": round(float(c or 0), 4), "cache_hits": int(h or 0)}
            for t, n, i, o, c, h in rows
        ],
    }


def _cost(input_tokens: int, output_tokens: int) -> float:
    s = get_settings()
    return input_tokens / 1e6 * s.ai_input_price_per_mtok + output_tokens / 1e6 * s.ai_output_price_per_mtok


def _check_thresholds(db: Session, before: float, after: float) -> None:
    budget = float(get_setting(db, "ai_monthly_budget_usd"))
    if budget <= 0:
        return
    for pct in sorted(get_setting(db, "ai_alert_thresholds_pct") or []):
        line = budget * pct / 100
        if before < line <= after:
            alert(db, "ai_budget", f"AI spend reached {pct}% of the monthly budget",
                  f"${after:.2f} of ${budget:.2f} used this month.", level="critical" if pct >= 100 else "warning")


def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=get_settings().anthropic_api_key, max_retries=2, timeout=60.0)


def generate(db: Session, task: str, facts: dict, entity_id: str | None = None, client=None) -> str:
    """Return generated text or raise AIUnavailable (callers then use deterministic text)."""
    s = get_settings()
    if task not in TASK_INSTRUCTIONS:
        raise ValueError(f"unknown AI task {task}")
    if not get_setting(db, "ai_enabled"):
        raise AIUnavailable("AI features are disabled in settings")
    if not s.anthropic_api_key and client is None:
        raise AIUnavailable("DEALBRIDGE_ANTHROPIC_API_KEY is not configured")

    prompt = TASK_INSTRUCTIONS[task] + "\n\nDATA (JSON):\n" + json.dumps(facts, sort_keys=True, default=str)
    key = hashlib.sha256(f"{task}|{s.ai_model}|{SYSTEM_PROMPT}|{prompt}".encode()).hexdigest()

    cached = db.scalar(select(AICache).where(AICache.cache_key == key))
    if cached:
        db.add(AIUsage(task=task, model=cached.model, cache_hit=True, status="ok", entity_id=entity_id))
        db.flush()
        return cached.response

    if requests_today(db) >= int(get_setting(db, "ai_daily_request_limit")):
        db.add(AIUsage(task=task, model=s.ai_model, status="blocked_rate", entity_id=entity_id))
        raise AIUnavailable("daily AI request limit reached")

    budget = float(get_setting(db, "ai_monthly_budget_usd"))
    spent = month_spend(db)
    worst_case = _cost(len(prompt) // 3 + 400, s.ai_max_output_tokens)
    if spent + worst_case > budget:
        db.add(AIUsage(task=task, model=s.ai_model, status="blocked_budget", entity_id=entity_id))
        if spent < budget:
            alert(db, "ai_budget", "AI request blocked by monthly budget",
                  f"${spent:.2f} spent of ${budget:.2f}; request would exceed the cap.", level="warning")
        raise AIUnavailable("monthly AI budget would be exceeded")

    c = client or _client()
    try:
        resp = c.beta.messages.create(
            model=s.ai_model,
            max_tokens=s.ai_max_output_tokens,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
            output_config={"effort": s.ai_effort},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.RateLimitError as exc:
        db.add(AIUsage(task=task, model=s.ai_model, status="error", entity_id=entity_id))
        raise AIUnavailable("Claude API rate limited") from exc
    except anthropic.APIStatusError as exc:
        db.add(AIUsage(task=task, model=s.ai_model, status="error", entity_id=entity_id))
        log.warning("Claude API error %s: %s", exc.status_code, exc.message)
        raise AIUnavailable(f"Claude API error {exc.status_code}") from exc
    except anthropic.APIConnectionError as exc:
        db.add(AIUsage(task=task, model=s.ai_model, status="error", entity_id=entity_id))
        raise AIUnavailable("Claude API unreachable") from exc

    in_tok = int(getattr(resp.usage, "input_tokens", 0) or 0)
    out_tok = int(getattr(resp.usage, "output_tokens", 0) or 0)
    cost = _cost(in_tok, out_tok)
    db.add(AIUsage(task=task, model=getattr(resp, "model", s.ai_model), input_tokens=in_tok,
                   output_tokens=out_tok, cost_usd=cost, status="ok", entity_id=entity_id))
    db.flush()
    _check_thresholds(db, spent, spent + cost)

    if resp.stop_reason == "refusal":
        raise AIUnavailable("model declined the request")
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
    if not text:
        raise AIUnavailable("empty response")
    db.add(AICache(cache_key=key, task=task, model=s.ai_model, response=text))
    db.flush()
    return text


def facts_for_analysis(prop, analysis) -> dict:
    """Compact, non-sensitive fact sheet (no seller contact or access info is ever sent)."""
    r = analysis.results or {}
    fin = r.get("financials") or {}
    arv = r.get("arv") or {}
    return {
        "location": f"{prop.city}, {prop.state} {prop.zip_code}",
        "property": {"type": prop.property_type, "beds": prop.beds, "baths": prop.baths, "sqft": prop.sqft,
                     "year_built": prop.year_built, "condition": prop.condition,
                     "opportunity_types": prop.opportunity_types, "flood_zone": prop.flood_zone,
                     "days_on_market": prop.days_on_market, "is_demo": prop.is_demo},
        "score": analysis.score, "band": analysis.score_band, "flags": analysis.flags,
        "components": [{k: c[k] for k in ("label", "points", "weight", "detail")} for c in analysis.score_components],
        "arv": {"value": arv.get("arv"), "method": arv.get("method"), "confidence": arv.get("confidence"),
                "comps_used": arv.get("comp_count"),
                "evaluations": [{k: e.get(k) for k in ("sale_price", "sale_date", "distance_miles", "included",
                                                       "exclusion_reason", "adjusted_price")}
                                for e in (arv.get("evaluations") or [])[:12]]},
        "financials": {k: fin.get(k) for k in ("purchase_price", "renovation_total", "total_project_cost",
                                               "net_profit", "roi_pct", "annualized_roi_pct", "cash_invested",
                                               "duration_months", "break_even_price", "sensitivity", "warnings")},
        "mao": analysis.mao,
    }
