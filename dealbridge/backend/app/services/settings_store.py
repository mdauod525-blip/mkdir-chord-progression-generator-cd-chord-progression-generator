"""Runtime settings stored in the database and editable by admins."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..models import AppSetting

DEFAULTS: dict[str, Any] = {
    "ai_enabled": True,  # still requires DEALBRIDGE_ANTHROPIC_API_KEY
    "ai_monthly_budget_usd": 10.0,
    "ai_daily_request_limit": 50,
    "ai_alert_thresholds_pct": [50, 80, 100],
    "ai_summary_min_score": 70,  # only spend AI tokens on deals scoring at least this
    "alert_min_score": 80,  # notify admins of deals at/above this
    "match_min_score": 60,
    "include_demo_data": True,
    "agent_daily_enabled": True,
    "agent_weekly_enabled": True,
    "auto_notify_investors": False,  # investor emails always require manual approval of the deal
    "disclosure_text": (
        "All ARV, renovation, cost, ROI and profit figures are estimates based on stated assumptions "
        "and available data. They are not appraisals, guarantees or investment advice. Verify "
        "independently and consult licensed professionals. Matches are preliminary and are not "
        "funding commitments. This is not an offer to sell or a solicitation of an offer to buy "
        "any security."
    ),
}


def get_setting(db: Session, key: str) -> Any:
    row = db.get(AppSetting, key)
    if row is None:
        return DEFAULTS.get(key)
    return row.value


def set_setting(db: Session, key: str, value: Any) -> None:
    row = db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value
    db.flush()


def all_settings(db: Session) -> dict[str, Any]:
    out = dict(DEFAULTS)
    for row in db.query(AppSetting).all():
        out[row.key] = row.value
    return out
