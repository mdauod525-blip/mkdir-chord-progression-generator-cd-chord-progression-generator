"""Financial model tests. Expected values are worked out by hand in the comments."""
import pytest

from app.analysis.assumptions import DEFAULT_ASSUMPTIONS, merged_assumptions
from app.analysis.financials import DealInputs, analyze_deal, project_duration, solve_mao

SIMPLE = merged_assumptions(
    overrides={
        "financing_type": "cash",
        "buyer_closing_cost_pct": 2.0,
        "inspection_cost": 500,
        "legal_cost": 1000,
        "acquisition_fee": 0,
        "insurance_monthly": 100,
        "utilities_monthly": 200,
        "maintenance_monthly": 0,
        "agent_commission_pct": 5.0,
        "seller_closing_cost_pct": 1.0,
        "staging_cost": 2000,
        "marketing_cost": 500,
        "target_profit_pct_of_arv": 12.0,
        "min_target_profit": 30000,
    }
)


def simple_deal(**kw):
    base = dict(
        purchase_price=200_000,
        arv=350_000,
        renovation_total=50_000,
        assumptions=SIMPLE,
        annual_taxes=3_600,
        duration_months_override=6,
    )
    base.update(kw)
    return analyze_deal(DealInputs(**base))


def test_cash_deal_components():
    r = simple_deal()
    # acquisition = 2% × 200k + 500 + 1000
    assert r.acquisition_costs == pytest.approx(5_500)
    # holding = (300 taxes + 100 ins + 200 util) × 6
    assert r.holding_costs == pytest.approx(3_600)
    # selling = 5% + 1% of 350k + 2,000 + 500
    assert r.selling_costs == pytest.approx(23_500)
    assert r.financing_costs == 0
    assert r.loan_amount == 0


def test_total_project_cost_formula():
    r = simple_deal()
    # TPC = purchase + closing/acquisition + renovation + holding + selling + financing
    assert r.total_project_cost == pytest.approx(200_000 + 5_500 + 50_000 + 3_600 + 23_500 + 0)
    assert r.total_project_cost == pytest.approx(282_600)


def test_net_profit_roi_and_margin():
    r = simple_deal()
    assert r.gross_sale_proceeds == 350_000
    assert r.net_profit == pytest.approx(67_400)
    # cash invested excludes selling costs (paid from proceeds) → 259,100
    assert r.cash_invested == pytest.approx(259_100)
    assert r.roi_pct == pytest.approx(67_400 / 259_100 * 100, abs=0.01)
    assert r.cash_on_cash_pct == r.roi_pct
    assert r.return_on_cost_pct == pytest.approx(67_400 / 282_600 * 100, abs=0.01)
    assert r.profit_margin_pct == pytest.approx(67_400 / 350_000 * 100, abs=0.01)


def test_annualized_roi():
    r = simple_deal()
    roi = 67_400 / 259_100
    assert r.annualized_roi_pct == pytest.approx(((1 + roi) ** 2 - 1) * 100, abs=0.01)


def test_break_even_price_yields_zero_profit():
    r = simple_deal()
    # S = (TPC − selling + fixed selling) / (1 − 6%) = 261,600 / 0.94
    assert r.break_even_price == pytest.approx(278_297.87, abs=0.01)
    at_be = simple_deal(arv=r.break_even_price)
    assert at_be.net_profit == pytest.approx(0, abs=0.05)


def test_mao_matches_formula():
    r = simple_deal()
    # target = max(30k, 12% × 350k) = 42k ;  net(P) = 271,400 − 1.02P  ⇒  P = 229,400 / 1.02
    assert r.target_profit == pytest.approx(42_000)
    assert r.mao == pytest.approx(224_901.96, abs=0.05)
    b = r.mao_breakdown
    # MAO = ARV − renovation − holding − selling − financing − acquisition − target profit
    recomposed = b["arv"] + b["renovation"] + b["holding"] + b["selling"] + b["financing"] + b["acquisition"] + b["target_profit"]
    assert recomposed == pytest.approx(b["mao"], abs=0.05)
    # buying at MAO earns exactly the target profit
    assert simple_deal(purchase_price=r.mao).net_profit == pytest.approx(42_000, abs=0.1)


def test_mao_is_not_the_70_percent_rule():
    r = simple_deal()
    assert r.seventy_percent_rule_reference == pytest.approx(350_000 * 0.7 - 50_000)
    assert r.mao != r.seventy_percent_rule_reference


def test_mao_unreachable():
    r = simple_deal(arv=120_000, renovation_total=100_000, purchase_price=10_000)
    assert r.mao is None
    assert "target_profit_unreachable_at_any_price" in r.warnings


def test_projected_loss_flag():
    r = simple_deal(purchase_price=330_000)
    assert r.net_profit < 0
    assert "projected_loss" in r.warnings


def test_unknown_taxes_use_rate():
    a = merged_assumptions(overrides={**SIMPLE, "property_tax_rate_pct": 1.2})
    r = analyze_deal(DealInputs(200_000, 350_000, 50_000, a, duration_months_override=6))
    assert r.breakdown.holding["property_taxes"] == pytest.approx(200_000 * 0.012 / 12 * 6)


def test_hoa_included_in_holding():
    r = simple_deal(hoa_monthly=150)
    assert r.breakdown.holding["hoa"] == pytest.approx(900)
    assert r.holding_costs == pytest.approx(4_500)


def test_duration_from_scope():
    months, rehab = project_duration(DEFAULT_ASSUMPTIONS, "medium")
    assert rehab == 3.0
    assert months == pytest.approx(round(0.5 + 3.0 + 30 / 30.4375 + 35 / 30.4375, 2))
    assert project_duration(DEFAULT_ASSUMPTIONS, "gut")[0] > months


def test_hard_money_loan_and_interest():
    a = merged_assumptions()
    r = analyze_deal(DealInputs(250_000, 390_000, 55_000, a, scope="medium"))
    purchase_loan = 250_000 * 0.85
    assert r.loan_amount == pytest.approx(purchase_loan + 55_000)
    assert not r.loan_capped_by_arv
    m = r.duration_months
    rate = 0.11 / 12
    expected_interest = purchase_loan * rate * m + 55_000 * rate * (m - 3.0 / 2)
    assert r.breakdown.financing["interest"] == pytest.approx(expected_interest, abs=0.01)
    assert r.breakdown.financing["points"] == pytest.approx(r.loan_amount * 0.02, abs=0.01)
    assert r.financing_costs == pytest.approx(expected_interest + r.loan_amount * 0.02 + 1500, abs=0.05)
    # identities
    assert r.total_project_cost == pytest.approx(
        250_000 + r.acquisition_costs + 55_000 + r.holding_costs + r.selling_costs + r.financing_costs, abs=0.05
    )
    assert r.net_profit == pytest.approx(390_000 - r.total_project_cost, abs=0.01)
    assert r.cash_invested == pytest.approx(r.total_project_cost - r.selling_costs - r.loan_amount, abs=0.01)
    assert r.roi_pct == pytest.approx(r.net_profit / r.cash_invested * 100, abs=0.01)


def test_loan_capped_by_max_loan_to_arv():
    a = merged_assumptions()
    r = analyze_deal(DealInputs(300_000, 380_000, 60_000, a))
    assert r.loan_capped_by_arv
    assert r.loan_amount == pytest.approx(380_000 * 0.70)
    assert "loan_capped_by_max_loan_to_arv" in r.warnings


def test_leverage_raises_roi_but_not_profit():
    cash = merged_assumptions(overrides={"financing_type": "cash"})
    lev = merged_assumptions()
    rc = analyze_deal(DealInputs(250_000, 390_000, 55_000, cash))
    rl = analyze_deal(DealInputs(250_000, 390_000, 55_000, lev))
    assert rl.net_profit < rc.net_profit  # financing costs reduce profit
    assert rl.roi_pct > rc.roi_pct  # but far less cash is invested


def test_sensitivity_is_monotonic():
    r = simple_deal()
    s = r.sensitivity
    assert s["arv_minus_10pct"] < s["arv_minus_5pct"] < r.net_profit
    assert s["renovation_plus_25pct"] < s["renovation_plus_10pct"] < r.net_profit
    assert s["combined_stress"] < r.net_profit


def test_acquisition_fee_per_deal():
    r = simple_deal(acquisition_fee=10_000)
    assert r.acquisition_costs == pytest.approx(15_500)


def test_invalid_inputs():
    with pytest.raises(ValueError):
        simple_deal(arv=0)
    with pytest.raises(ValueError):
        simple_deal(purchase_price=-1)


def test_solve_mao_monotonic_bisection():
    inp = DealInputs(200_000, 350_000, 50_000, SIMPLE, annual_taxes=3600, duration_months_override=6)
    assert solve_mao(inp, 6, 3, 0) > solve_mao(inp, 6, 3, 42_000)
