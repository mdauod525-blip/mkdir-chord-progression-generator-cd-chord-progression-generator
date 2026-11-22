"""Deterministic fix-and-flip financial model. No AI is involved in any number here.

Definitions (see docs/METHODOLOGY.md):

  Acquisition costs   = buyer closing costs + inspection + legal + acquisition fee
  Holding costs       = (taxes + insurance + utilities + maintenance + HOA) × holding months
  Financing costs     = points + lender fees + loan interest
                        (loan interest is reported here, not in holding, so it is never counted twice)
  Selling costs       = agent commission + seller closing costs + staging + marketing
  Total project cost  = purchase + acquisition + renovation + holding + selling + financing
  Net profit          = ARV − total project cost
  Cash invested       = total project cost − selling costs − loan principal
                        (selling costs are paid from sale proceeds; the loan is repaid at sale)
  ROI                 = net profit ÷ cash invested × 100
  Cash-on-cash        = same as ROI for a single-exit flip (no interim cash flow); reported for
                        consistency with rental analysis
  Return on cost      = net profit ÷ total project cost × 100 (unlevered view)
  Annualized ROI      = (1 + ROI)^(12 / months) − 1
  Break-even price    = sale price at which net profit = 0
  MAO                 = ARV − renovation − holding − selling − financing − acquisition − target profit
                        solved as the purchase price at which net profit equals target profit
                        (acquisition and financing costs depend on the price, so it is solved
                        numerically with the same model rather than approximated)
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class DealInputs:
    purchase_price: float
    arv: float
    renovation_total: float
    assumptions: dict
    scope: str = "medium"
    annual_taxes: float | None = None
    hoa_monthly: float | None = None
    duration_months_override: float | None = None
    acquisition_fee: float | None = None  # per-deal (e.g. wholesale assignment fee)


@dataclass
class Breakdown:
    acquisition: dict[str, float] = field(default_factory=dict)
    financing: dict[str, float] = field(default_factory=dict)
    holding: dict[str, float] = field(default_factory=dict)
    selling: dict[str, float] = field(default_factory=dict)


@dataclass
class DealResult:
    purchase_price: float
    arv: float
    renovation_total: float
    acquisition_costs: float
    holding_costs: float
    selling_costs: float
    financing_costs: float
    total_project_cost: float
    gross_sale_proceeds: float
    net_profit: float
    loan_amount: float
    cash_invested: float
    roi_pct: float | None
    cash_on_cash_pct: float | None
    return_on_cost_pct: float
    annualized_roi_pct: float | None
    profit_margin_pct: float
    break_even_price: float
    duration_months: float
    rehab_months: float
    target_profit: float
    mao: float | None
    mao_breakdown: dict[str, float] | None
    seventy_percent_rule_reference: float
    sensitivity: dict[str, float]
    breakdown: Breakdown
    loan_capped_by_arv: bool
    warnings: list[str]

    def to_dict(self) -> dict:
        return asdict(self)


def project_duration(a: dict, scope: str, override: float | None = None) -> tuple[float, float]:
    rehab = float(a["rehab_months"].get(scope, 3.0)) if isinstance(a["rehab_months"], dict) else float(a["rehab_months"])
    if override:
        return float(override), rehab
    total = (
        float(a["acquisition_to_rehab_start_months"])
        + rehab
        + float(a["days_to_contract"]) / 30.4375
        + float(a["days_contract_to_close"]) / 30.4375
    )
    return round(total, 2), rehab


def _costs(p: float, inp: DealInputs, arv: float, months: float, rehab_months: float) -> tuple[Breakdown, float, bool]:
    a = inp.assumptions
    b = Breakdown()
    reno = inp.renovation_total

    fee = inp.acquisition_fee if inp.acquisition_fee is not None else float(a["acquisition_fee"])
    b.acquisition = {
        "closing_costs": p * float(a["buyer_closing_cost_pct"]) / 100,
        "inspection": float(a["inspection_cost"]),
        "legal": float(a["legal_cost"]),
        "acquisition_fee": float(fee),
    }

    loan = 0.0
    capped = False
    purchase_loan = rehab_loan = 0.0
    if a["financing_type"] == "hard_money":
        purchase_loan = p * float(a["loan_to_purchase_pct"]) / 100
        rehab_loan = reno * float(a["rehab_financed_pct"]) / 100
        cap = arv * float(a["max_loan_to_arv_pct"]) / 100
        if purchase_loan + rehab_loan > cap:
            capped = True
            overflow = purchase_loan + rehab_loan - cap
            cut = min(rehab_loan, overflow)
            rehab_loan -= cut
            purchase_loan -= overflow - cut
            purchase_loan = max(purchase_loan, 0.0)
        loan = purchase_loan + rehab_loan
    rate = float(a["interest_rate_pct"]) / 100 / 12
    # Purchase portion accrues for the whole hold; rehab draws average half-drawn during rehab.
    interest = purchase_loan * rate * months + rehab_loan * rate * max(months - rehab_months / 2, 0)
    b.financing = {
        "points": loan * float(a["points_pct"]) / 100 if loan else 0.0,
        "lender_fees": float(a["lender_fees"]) if loan else 0.0,
        "interest": interest,
    }

    taxes_m = (inp.annual_taxes / 12) if inp.annual_taxes else p * float(a["property_tax_rate_pct"]) / 100 / 12
    b.holding = {
        "property_taxes": taxes_m * months,
        "insurance": float(a["insurance_monthly"]) * months,
        "utilities": float(a["utilities_monthly"]) * months,
        "maintenance": float(a["maintenance_monthly"]) * months,
        "hoa": (inp.hoa_monthly or 0.0) * months,
    }

    b.selling = {
        "agent_commission": arv * float(a["agent_commission_pct"]) / 100,
        "seller_closing_costs": arv * float(a["seller_closing_cost_pct"]) / 100,
        "staging": float(a["staging_cost"]),
        "marketing": float(a["marketing_cost"]),
    }
    for section in (b.acquisition, b.financing, b.holding, b.selling):
        for k in section:
            section[k] = round(section[k], 2)
    return b, loan, capped


def _net_profit(p: float, inp: DealInputs, arv: float, months: float, rehab_months: float) -> float:
    b, _, _ = _costs(p, inp, arv, months, rehab_months)
    total = p + inp.renovation_total + sum(
        sum(s.values()) for s in (b.acquisition, b.financing, b.holding, b.selling)
    )
    return arv - total


def target_profit_for(arv: float, a: dict) -> float:
    return max(float(a["min_target_profit"]), arv * float(a["target_profit_pct_of_arv"]) / 100)


def solve_mao(inp: DealInputs, months: float, rehab_months: float, target: float) -> float | None:
    """Highest purchase price whose net profit still meets the target (bisection; profit is
    strictly decreasing in price)."""
    arv = inp.arv
    if _net_profit(0.0, inp, arv, months, rehab_months) < target:
        return None
    lo, hi = 0.0, arv
    for _ in range(80):
        mid = (lo + hi) / 2
        if _net_profit(mid, inp, arv, months, rehab_months) >= target:
            lo = mid
        else:
            hi = mid
    return round(lo, 2)


def analyze_deal(inp: DealInputs) -> DealResult:
    if inp.purchase_price < 0 or inp.arv <= 0 or inp.renovation_total < 0:
        raise ValueError("purchase price and renovation must be ≥ 0 and ARV must be > 0")
    a = inp.assumptions
    months, rehab_months = project_duration(a, inp.scope, inp.duration_months_override)
    p, arv, reno = inp.purchase_price, inp.arv, inp.renovation_total

    b, loan, capped = _costs(p, inp, arv, months, rehab_months)
    acq = sum(b.acquisition.values())
    fin = sum(b.financing.values())
    hold = sum(b.holding.values())
    sell = sum(b.selling.values())
    tpc = p + acq + reno + hold + sell + fin
    net = arv - tpc
    cash = tpc - sell - loan

    warnings: list[str] = []
    roi = None
    annualized = None
    if cash > 0:
        roi = net / cash * 100
        if roi > -100:
            annualized = ((1 + roi / 100) ** (12 / months) - 1) * 100 if months > 0 else None
    else:
        warnings.append("cash_invested_not_positive")

    # break-even: S − pct·S − fixed_selling − (TPC − selling) = 0
    pct = (float(a["agent_commission_pct"]) + float(a["seller_closing_cost_pct"])) / 100
    fixed_sell = float(a["staging_cost"]) + float(a["marketing_cost"])
    break_even = (tpc - sell + fixed_sell) / (1 - pct)

    target = target_profit_for(arv, a)
    mao = solve_mao(inp, months, rehab_months, target)
    mao_breakdown = None
    if mao is not None:
        bm, _, _ = _costs(mao, inp, arv, months, rehab_months)
        mao_breakdown = {
            "arv": arv,
            "renovation": -reno,
            "holding": -round(sum(bm.holding.values()), 2),
            "selling": -round(sum(bm.selling.values()), 2),
            "financing": -round(sum(bm.financing.values()), 2),
            "acquisition": -round(sum(bm.acquisition.values()), 2),
            "target_profit": -round(target, 2),
            "mao": mao,
        }
    else:
        warnings.append("target_profit_unreachable_at_any_price")

    if capped:
        warnings.append("loan_capped_by_max_loan_to_arv")
    if net <= 0:
        warnings.append("projected_loss")

    def np_with(arv_mult: float = 1.0, reno_mult: float = 1.0, extra_months: float = 0.0) -> float:
        alt = DealInputs(**{**inp.__dict__, "arv": arv * arv_mult, "renovation_total": reno * reno_mult})
        m2 = months + extra_months
        return round(_net_profit(p, alt, alt.arv, m2, rehab_months), 2)

    sensitivity = {
        "arv_minus_5pct": np_with(arv_mult=0.95),
        "arv_minus_10pct": np_with(arv_mult=0.90),
        "renovation_plus_10pct": np_with(reno_mult=1.10),
        "renovation_plus_25pct": np_with(reno_mult=1.25),
        "plus_2_months": np_with(extra_months=2),
        "combined_stress": np_with(arv_mult=0.95, reno_mult=1.15, extra_months=2),
    }

    r2 = lambda x: round(x, 2)  # noqa: E731
    return DealResult(
        purchase_price=r2(p),
        arv=r2(arv),
        renovation_total=r2(reno),
        acquisition_costs=r2(acq),
        holding_costs=r2(hold),
        selling_costs=r2(sell),
        financing_costs=r2(fin),
        total_project_cost=r2(tpc),
        gross_sale_proceeds=r2(arv),
        net_profit=r2(net),
        loan_amount=r2(loan),
        cash_invested=r2(cash),
        roi_pct=r2(roi) if roi is not None else None,
        cash_on_cash_pct=r2(roi) if roi is not None else None,
        return_on_cost_pct=r2(net / tpc * 100),
        annualized_roi_pct=r2(annualized) if annualized is not None else None,
        profit_margin_pct=r2(net / arv * 100),
        break_even_price=r2(break_even),
        duration_months=months,
        rehab_months=rehab_months,
        target_profit=r2(target),
        mao=mao,
        mao_breakdown=mao_breakdown,
        seventy_percent_rule_reference=r2(arv * 0.70 - reno),
        sensitivity=sensitivity,
        breakdown=b,
        loan_capped_by_arv=capped,
        warnings=warnings,
    )
