from datetime import date

import pytest

from app.analysis.assumptions import merged_assumptions
from app.analysis.comps import Comp, Subject, apply_manual_arv, evaluate_comps, haversine_miles
from app.analysis.renovation import RenovationInput, estimate_renovation

AS_OF = date(2026, 11, 1)
A = merged_assumptions(overrides={"monthly_appreciation_pct": 0.0})
SUBJ = Subject("single_family", sqft=1800, beds=3, baths=2, lat=39.0, lng=-77.5, zip_code="20147")


def comp(i, **kw):
    base = dict(
        id=f"c{i}",
        address=f"{i} Test St",
        sale_price=450_000,
        sale_date=date(2026, 8, 1),
        property_type="single_family",
        sqft=1800,
        beds=3,
        baths=2,
        lat=39.0 + 0.002 * i,
        lng=-77.5,
        zip_code="20147",
        condition_at_sale="renovated",
        sale_type="arms_length",
        source_type="recorded_deed",
        verification_status="source_verified",
    )
    base.update(kw)
    return Comp(**base)


def test_haversine_known_distance():
    # 0.01° latitude ≈ 0.69 miles
    assert haversine_miles(39.0, -77.5, 39.01, -77.5) == pytest.approx(0.691, abs=0.005)


def test_identical_comps_give_their_price():
    r = evaluate_comps(SUBJ, [comp(1), comp(2), comp(3)], AS_OF, A)
    assert r.arv == pytest.approx(450_000)
    assert r.comp_count == 3
    assert r.method == "verified_comps"
    assert "insufficient_comps" not in r.flags


def test_active_listing_and_assessment_never_used():
    r = evaluate_comps(
        SUBJ,
        [comp(1, source_type="active_listing", sale_price=600_000), comp(2, source_type="assessment")],
        AS_OF,
        A,
    )
    assert r.arv is None
    assert r.comp_count == 0
    assert "manual_review_required" in r.flags
    reasons = [e.exclusion_reason for e in r.evaluations]
    assert all("not a verified closed sale" in x for x in reasons)


def test_distressed_and_poor_condition_sales_excluded():
    r = evaluate_comps(
        SUBJ,
        [comp(1, sale_type="foreclosure", sale_price=250_000), comp(2, condition_at_sale="poor", sale_price=280_000), comp(3)],
        AS_OF,
        A,
    )
    assert r.comp_count == 1
    assert r.arv == pytest.approx(450_000)
    assert "insufficient_comps" in r.flags and "manual_review_required" in r.flags


def test_filters_type_age_distance_size_beds():
    r = evaluate_comps(
        SUBJ,
        [
            comp(1, property_type="condo"),
            comp(2, sale_date=date(2025, 6, 1)),
            comp(3, lat=39.2),  # ~14 miles
            comp(4, sqft=3000),
            comp(5, beds=6),
            comp(6, sale_date=date(2027, 1, 1)),
        ],
        AS_OF,
        A,
    )
    assert r.comp_count == 0
    reasons = " | ".join(e.exclusion_reason for e in r.evaluations)
    for s in ("property type", "months ago", "mi away", "sqft outside", "beds vs", "future"):
        assert s in reasons


def test_size_and_bed_bath_adjustments():
    # comp is 200 sqft smaller ($250/sqft) with one fewer bath → adjusted upward
    c = comp(1, sqft=1600, baths=1, sale_price=400_000)
    r = evaluate_comps(SUBJ, [c], AS_OF, A)
    ev = r.evaluations[0]
    assert ev.adjustments["size"] == pytest.approx(200 * 250 * 0.5)
    assert ev.adjustments["bathrooms"] == pytest.approx(10_000)
    assert ev.adjusted_price == pytest.approx(400_000 + 25_000 + 10_000)


def test_time_adjustment():
    a = merged_assumptions(overrides={"monthly_appreciation_pct": 0.5})
    r = evaluate_comps(SUBJ, [comp(1)], AS_OF, a)
    months = (AS_OF - date(2026, 8, 1)).days / 30.4375
    assert r.evaluations[0].adjustments["time"] == pytest.approx(450_000 * (1.005**months - 1), abs=0.05)


def test_confidence_increases_with_more_consistent_comps():
    few = evaluate_comps(SUBJ, [comp(1), comp(2, sale_price=520_000)], AS_OF, A)
    many = evaluate_comps(SUBJ, [comp(i, sale_price=450_000 + i * 2000) for i in range(1, 7)], AS_OF, A)
    assert many.confidence > few.confidence
    assert 0 <= few.confidence <= 100 and 0 <= many.confidence <= 100


def test_neighborhood_activity_counts_verified_nearby_sales():
    r = evaluate_comps(SUBJ, [comp(1), comp(2, sqft=4000), comp(3, source_type="active_listing")], AS_OF, A)
    assert r.neighborhood_sales_6mo == 2  # big house counts as activity, listing does not


def test_manual_arv_override_is_labelled_and_capped():
    r = evaluate_comps(SUBJ, [comp(1), comp(2), comp(3)], AS_OF, A)
    r = apply_manual_arv(r, 520_000, "agent opinion")
    assert r.method == "manual_override"
    assert r.confidence == 35.0
    assert "manual_arv_differs_from_comps" in r.flags
    assert r.comp_supported_arv == pytest.approx(450_000)


def test_renovation_scope_from_condition_and_totals():
    light = estimate_renovation(RenovationInput(sqft=1800, baths=2, condition="good"))
    heavy = estimate_renovation(RenovationInput(sqft=1800, baths=2, condition="poor"))
    gut = estimate_renovation(RenovationInput(sqft=1800, baths=2, condition="distressed"))
    assert (light.scope, heavy.scope, gut.scope) == ("light", "heavy", "gut")
    assert light.total < heavy.total < gut.total
    assert light.total == pytest.approx(sum(light.line_items.values()), abs=0.05)


def test_renovation_unknown_condition_flagged():
    r = estimate_renovation(RenovationInput(sqft=None, condition="unknown"))
    assert r.scope == "medium"
    assert "condition_unknown_assumed_medium_scope" in r.flags
    assert "sqft_unknown_assumed_1500" in r.flags


def test_renovation_contingency_and_multiplier():
    base = estimate_renovation(RenovationInput(sqft=1500, baths=1, condition="fair"))
    items = base.line_items
    subtotal = sum(v for k, v in items.items() if k != "contingency")
    assert items["contingency"] == pytest.approx(subtotal * 0.12, abs=0.05)
    pricier = estimate_renovation(RenovationInput(sqft=1500, baths=1, condition="fair", cost_multiplier=1.2))
    assert pricier.total == pytest.approx(base.total * 1.2, rel=0.01)


def test_renovation_overrides_and_issues():
    r = estimate_renovation(
        RenovationInput(sqft=1500, baths=1, condition="good", issues=["roof", "foundation"], overrides={"kitchen": 30_000})
    )
    assert r.line_items["kitchen"] == 30_000
    assert r.line_items["roofing"] > 0
    assert r.line_items["structural"] > 0
    assert "structural_risk" in r.flags
