import pytest

from app.analysis.assumptions import merged_assumptions
from app.analysis.financials import DealInputs, analyze_deal
from app.analysis.scoring import WEIGHTS, ScoreInputs, band_for, score_deal
from app.matching.engine import DISCLAIMER, DealFacts, InvestorProfile, deal_risk_level, match_investor


def good_inputs(**kw):
    base = dict(
        purchase_price=250_000,
        arv=420_000,
        arv_confidence=85,
        comp_count=5,
        avg_comp_similarity=0.85,
        neighborhood_sales_6mo=8,
        renovation_total=45_000,
        structural_risk=False,
        year_built=1985,
        condition="fair",
        net_profit=70_000,
        roi_pct=45,
        break_even_price=340_000,
        stressed_net_profit=35_000,
        days_on_market=75,
        days_to_contract=21,
        min_net_profit=25_000,
        min_comps=3,
    )
    base.update(kw)
    return ScoreInputs(**base)


def test_weights_sum_to_100():
    assert sum(WEIGHTS.values()) == 100


@pytest.mark.parametrize(
    "score,band",
    [(95, "Exceptional opportunity"), (90, "Exceptional opportunity"), (85, "Strong opportunity"),
     (72, "Potential opportunity"), (61, "Requires further investigation"), (59.9, "Not recommended")],
)
def test_bands(score, band):
    assert band_for(score) == band


def test_strong_deal_scores_high_and_explains():
    r = score_deal(good_inputs())
    assert r.score >= 80
    assert len(r.components) == 11
    assert r.score == pytest.approx(sum(c.points for c in r.components), abs=0.2)
    assert "Strengths" in r.explanation and "not guarantees" in r.explanation


def test_no_arv_is_insufficient_data():
    r = score_deal(good_inputs(arv=None, arv_confidence=0, comp_count=0, net_profit=None, roi_pct=None,
                               break_even_price=None, stressed_net_profit=None, avg_comp_similarity=None))
    assert r.score <= 59
    assert r.insufficient_data
    assert r.band.startswith("Insufficient data")
    assert "manual_review_required" in r.flags


def test_arv_above_price_is_not_enough():
    # ARV well above asking, but after all costs the deal loses money
    r = score_deal(good_inputs(net_profit=-5_000, roi_pct=-3, stressed_net_profit=-40_000))
    assert r.score <= 40
    assert r.band == "Not recommended"


def test_thin_profit_capped():
    r = score_deal(good_inputs(net_profit=15_000, roi_pct=12))
    assert r.score <= 69


def test_few_comps_capped_and_flagged():
    r = score_deal(good_inputs(comp_count=2))
    assert r.score <= 69
    assert r.needs_manual_review
    assert "insufficient_comps" in r.flags


def test_low_confidence_capped():
    r = score_deal(good_inputs(arv_confidence=40))
    assert r.score <= 69


def test_stress_loss_capped():
    r = score_deal(good_inputs(stressed_net_profit=-1_000))
    assert r.score <= 79


def test_structural_risk_lowers_score():
    assert score_deal(good_inputs(structural_risk=True)).raw_score < score_deal(good_inputs()).raw_score


# ------------------------------------------------------------------ matching
def spec_example_deal():
    """Spec example: purchase $250k, renovation $55k, ARV $390k, 6-month project."""
    a = merged_assumptions(overrides={"min_target_profit": 30_000})
    r = analyze_deal(DealInputs(250_000, 390_000, 55_000, a, duration_months_override=6))
    return r, DealFacts(
        property_id="p1",
        market_id="nova",
        zip_code="20147",
        property_type="single_family",
        strategy="fix_and_flip",
        purchase_price=250_000,
        total_project_cost=r.total_project_cost,
        cash_required=r.cash_invested,
        loan_amount=r.loan_amount,
        arv=390_000,
        roi_pct=r.roi_pct,
        net_profit=r.net_profit,
        duration_months=6,
        deal_score=78,
        arv_confidence=78,
        renovation_to_arv=55_000 / 390_000,
    )


def spec_investor(**kw):
    base = dict(
        investor_id="i1",
        investor_type="individual",
        preferred_markets=["nova"],
        available_capital=150_000,
        strategies=["fix_and_flip"],
        min_roi_pct=15,
        max_duration_months=9,
        risk_tolerance="medium",
        funding_availability="immediate",
    )
    base.update(kw)
    return InvestorProfile(**base)


def test_spec_example_investor_is_suitable_with_financing():
    r, deal = spec_example_deal()
    assert r.cash_invested < 150_000  # hard-money financing leaves cash need within capital
    m = match_investor(spec_investor(), deal)
    assert m.eligible, m.explanation
    assert m.score >= 60
    assert m.role == "equity"
    assert DISCLAIMER in m.explanation


def test_spec_example_all_cash_exceeds_capital():
    a = merged_assumptions(overrides={"financing_type": "cash"})
    r = analyze_deal(DealInputs(250_000, 390_000, 55_000, a, duration_months_override=6))
    _, deal = spec_example_deal()
    deal.cash_required = r.cash_invested
    deal.loan_amount = 0
    deal.roi_pct = r.roi_pct
    m = match_investor(spec_investor(), deal)
    assert not m.eligible
    assert any("available capital" in d for d in m.disqualifiers)
    assert m.score <= 49


def test_roi_below_minimum_disqualifies():
    _, deal = spec_example_deal()
    m = match_investor(spec_investor(min_roi_pct=(deal.roi_pct or 0) + 5), deal)
    assert not m.eligible and any("below minimum" in d for d in m.disqualifiers)


def test_market_and_strategy_and_type_mismatch():
    _, deal = spec_example_deal()
    assert not match_investor(spec_investor(preferred_markets=["wv"]), deal).eligible
    assert not match_investor(spec_investor(strategies=["buy_and_hold"]), deal).eligible
    assert not match_investor(spec_investor(property_types=["condo"]), deal).eligible


def test_timeline_and_funding():
    _, deal = spec_example_deal()
    assert not match_investor(spec_investor(max_duration_months=3), deal).eligible
    assert not match_investor(spec_investor(funding_availability="not_currently"), deal).eligible


def test_lender_match_uses_loan_amount_and_ltv():
    _, deal = spec_example_deal()
    lender = spec_investor(investor_type="hard_money_lender", strategies=["lending"], available_capital=400_000,
                           min_roi_pct=None, lending_terms={"max_ltv_pct": 75})
    m = match_investor(lender, deal)
    assert m.role == "lender"
    assert m.required_amount == pytest.approx(deal.loan_amount)
    assert m.eligible, m.explanation
    strict = spec_investor(investor_type="private_lender", strategies=["lending"], available_capital=400_000,
                           lending_terms={"max_ltv_pct": 50})
    assert not match_investor(strict, deal).eligible


def test_risk_levels_and_tolerance():
    _, deal = spec_example_deal()
    deal.deal_score, deal.arv_confidence, deal.renovation_to_arv, deal.needs_manual_review = 62, 45, 0.3, True
    assert deal_risk_level(deal) == "high"
    assert not match_investor(spec_investor(risk_tolerance="low"), deal).eligible
