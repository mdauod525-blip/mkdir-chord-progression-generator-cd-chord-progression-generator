"""Investor ↔ deal matching. Deterministic and explainable.

A match is a PRELIMINARY indication that a deal fits an investor's stated preferences. It is not
an offer, a solicitation, a recommendation, or a funding commitment by anyone.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

LENDER_TYPES = {"private_lender", "hard_money_lender"}
DISCLAIMER = (
    "Preliminary match based on stated preferences only — not a funding commitment, offer, "
    "or investment recommendation."
)
RISK_ORDER = {"low": 0, "medium": 1, "high": 2}


@dataclass
class DealFacts:
    property_id: str
    market_id: str | None
    zip_code: str | None
    property_type: str
    strategy: str  # fix_and_flip
    purchase_price: float | None
    total_project_cost: float | None
    cash_required: float | None
    loan_amount: float | None
    arv: float | None
    roi_pct: float | None
    net_profit: float | None
    duration_months: float | None
    deal_score: float | None
    arv_confidence: float | None
    renovation_to_arv: float | None
    needs_manual_review: bool = False


@dataclass
class InvestorProfile:
    investor_id: str
    investor_type: str
    preferred_markets: list[str] = field(default_factory=list)
    preferred_zip_codes: list[str] = field(default_factory=list)
    available_capital: float | None = None
    min_investment: float | None = None
    max_investment: float | None = None
    property_types: list[str] = field(default_factory=list)
    strategies: list[str] = field(default_factory=list)
    min_roi_pct: float | None = None
    max_duration_months: float | None = None
    risk_tolerance: str = "medium"
    funding_availability: str = "within_30_days"
    lending_terms: dict = field(default_factory=dict)
    is_active: bool = True


@dataclass
class MatchComponent:
    key: str
    label: str
    weight: float
    points: float
    detail: str


@dataclass
class MatchResult:
    investor_id: str
    property_id: str
    score: float
    eligible: bool
    components: list[MatchComponent]
    disqualifiers: list[str]
    required_amount: float | None
    role: str  # equity | lender
    explanation: str

    def to_dict(self) -> dict:
        return asdict(self)


def deal_risk_level(d: DealFacts) -> str:
    """low / medium / high from deal score, ARV confidence and renovation intensity."""
    points = 0
    if d.deal_score is None or d.deal_score < 70:
        points += 2
    elif d.deal_score < 80:
        points += 1
    if d.arv_confidence is None or d.arv_confidence < 60:
        points += 2
    elif d.arv_confidence < 75:
        points += 1
    if d.renovation_to_arv is not None and d.renovation_to_arv > 0.25:
        points += 2
    elif d.renovation_to_arv is not None and d.renovation_to_arv > 0.15:
        points += 1
    if d.needs_manual_review:
        points += 1
    return "low" if points <= 1 else ("medium" if points <= 3 else "high")


def match_investor(inv: InvestorProfile, d: DealFacts) -> MatchResult:
    role = "lender" if inv.investor_type in LENDER_TYPES else "equity"
    disq: list[str] = []
    comps: list[MatchComponent] = []

    def add(key: str, label: str, weight: float, frac: float, detail: str) -> None:
        comps.append(MatchComponent(key, label, weight, round(weight * max(0.0, min(1.0, frac)), 2), detail))

    if not inv.is_active:
        disq.append("investor profile is inactive")
    if inv.funding_availability == "not_currently":
        disq.append("investor reports no funding currently available")

    # --- strategy (5)
    wanted = set(inv.strategies)
    strategy_ok = (
        not wanted
        or d.strategy in wanted
        or (role == "lender" and "lending" in wanted)
        or ("jv_equity" in wanted and d.strategy == "fix_and_flip")
    )
    if not strategy_ok:
        disq.append(f"strategy {d.strategy.replace('_', ' ')} not in investor's strategies")
    add("strategy", "Investment strategy", 5, 1.0 if strategy_ok else 0.0,
        "matches stated strategy" if strategy_ok else "strategy mismatch")

    # --- geography (20)
    if not inv.preferred_markets and not inv.preferred_zip_codes:
        add("geography", "Geographic preference", 20, 0.6, "no geographic preference stated")
    else:
        in_market = d.market_id is not None and d.market_id in inv.preferred_markets
        in_zip = d.zip_code is not None and d.zip_code in inv.preferred_zip_codes
        if in_zip:
            add("geography", "Geographic preference", 20, 1.0, f"ZIP {d.zip_code} is a preferred ZIP")
        elif in_market:
            add("geography", "Geographic preference", 20, 0.85, "in a preferred market")
        else:
            disq.append("outside the investor's preferred markets")
            add("geography", "Geographic preference", 20, 0.0, "outside preferred markets")

    # --- property type (5)
    if not inv.property_types or d.property_type in inv.property_types:
        add("property_type", "Property type", 5, 1.0, d.property_type.replace("_", " "))
    else:
        disq.append(f"property type {d.property_type.replace('_', ' ')} not preferred")
        add("property_type", "Property type", 5, 0.0, "not a preferred type")

    # --- capital (20)
    if role == "lender":
        required = d.loan_amount if d.loan_amount else d.total_project_cost
    else:
        required = d.cash_required
    if required is None:
        disq.append("required investment amount unknown (deal not fully analyzed)")
        add("capital", "Capital fit", 20, 0.0, "unknown requirement")
    else:
        detail = f"requires ~${required:,.0f} ({'loan' if role == 'lender' else 'cash'})"
        if inv.available_capital is not None and inv.available_capital < required:
            disq.append(f"available capital ${inv.available_capital:,.0f} < required ${required:,.0f}")
            add("capital", "Capital fit", 20, 0.0, detail)
        elif inv.max_investment is not None and required > inv.max_investment:
            disq.append(f"required ${required:,.0f} exceeds max investment ${inv.max_investment:,.0f}")
            add("capital", "Capital fit", 20, 0.0, detail)
        else:
            frac = 1.0
            if inv.min_investment is not None and required < inv.min_investment:
                frac = 0.5
                detail += f"; below preferred minimum ${inv.min_investment:,.0f}"
            elif inv.available_capital:
                usage = required / inv.available_capital
                frac = 1.0 if usage <= 0.8 else 0.8  # leaves less reserve
                detail += f"; uses {usage:.0%} of available capital"
            add("capital", "Capital fit", 20, frac, detail)

    # --- return (20)
    if role == "lender":
        max_ltv = inv.lending_terms.get("max_ltv_pct") or inv.lending_terms.get("max_loan_to_arv_pct")
        if d.loan_amount and d.arv:
            ltarv = d.loan_amount / d.arv * 100
            if max_ltv is not None and ltarv > float(max_ltv):
                disq.append(f"loan-to-ARV {ltarv:.0f}% exceeds lender maximum {float(max_ltv):.0f}%")
                add("return", "Collateral coverage", 20, 0.0, f"loan-to-ARV {ltarv:.0f}%")
            else:
                add("return", "Collateral coverage", 20, 1.0 if ltarv <= 65 else 0.75, f"loan-to-ARV {ltarv:.0f}%")
        else:
            add("return", "Collateral coverage", 20, 0.3, "no financing in this analysis; lender terms to be set")
    else:
        if d.roi_pct is None:
            disq.append("ROI not computed")
            add("return", "Expected ROI", 20, 0.0, "unknown")
        elif inv.min_roi_pct is not None and d.roi_pct < inv.min_roi_pct:
            disq.append(f"projected ROI {d.roi_pct:.1f}% below minimum {inv.min_roi_pct:.1f}%")
            add("return", "Expected ROI", 20, 0.0, f"{d.roi_pct:.1f}% vs {inv.min_roi_pct:.0f}% minimum")
        else:
            floor = inv.min_roi_pct or 0.0
            excess = d.roi_pct - floor
            frac = 0.6 + 0.4 * min(excess / 10, 1.0)
            add("return", "Expected ROI", 20, frac, f"{d.roi_pct:.1f}% vs {floor:.0f}% minimum")

    # --- risk (15)
    risk = deal_risk_level(d)
    tol = RISK_ORDER.get(inv.risk_tolerance, 1)
    gap = RISK_ORDER[risk] - tol
    if gap >= 2:
        disq.append(f"{risk}-risk deal exceeds {inv.risk_tolerance} risk tolerance")
        add("risk", "Risk tolerance", 15, 0.0, f"deal risk {risk}")
    else:
        add("risk", "Risk tolerance", 15, 1.0 if gap <= 0 else 0.4, f"deal risk {risk}, tolerance {inv.risk_tolerance}")

    # --- timeline (10)
    if d.duration_months is None or inv.max_duration_months is None:
        add("timeline", "Project timeline", 10, 0.7, "no timeline preference" if inv.max_duration_months is None else "unknown")
    elif d.duration_months <= inv.max_duration_months:
        add("timeline", "Project timeline", 10, 1.0, f"{d.duration_months:.1f} mo ≤ {inv.max_duration_months:.0f} mo")
    elif d.duration_months <= inv.max_duration_months + 2:
        add("timeline", "Project timeline", 10, 0.4, f"{d.duration_months:.1f} mo slightly over {inv.max_duration_months:.0f} mo")
    else:
        disq.append(f"timeline {d.duration_months:.1f} months exceeds {inv.max_duration_months:.0f}-month limit")
        add("timeline", "Project timeline", 10, 0.0, "too long")

    # --- deal quality (5)
    add("deal_quality", "Deal score", 5, (d.deal_score or 0) / 100, f"deal score {d.deal_score or 0:.0f}")

    score = round(sum(c.points for c in comps), 1)
    if disq:
        score = min(score, 49.0)
    eligible = not disq and score >= 60

    parts = [f"Match {score:.0f}/100 ({'eligible' if eligible else 'not eligible'}) as {role}."]
    good = [c.detail for c in comps if c.points >= c.weight * 0.8]
    if good:
        parts.append("Fits: " + "; ".join(good) + ".")
    if disq:
        parts.append("Blocked by: " + "; ".join(disq) + ".")
    if inv.funding_availability != "immediate" and not disq:
        parts.append(f"Funding availability: {inv.funding_availability.replace('_', ' ')}.")
    parts.append(DISCLAIMER)

    return MatchResult(
        investor_id=inv.investor_id,
        property_id=d.property_id,
        score=score,
        eligible=eligible,
        components=comps,
        disqualifiers=disq,
        required_amount=round(required, 2) if required is not None else None,
        role=role,
        explanation=" ".join(parts),
    )
