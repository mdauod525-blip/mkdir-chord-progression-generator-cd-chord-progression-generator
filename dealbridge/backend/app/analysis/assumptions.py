"""Underwriting assumptions.

These defaults are starting estimates for the launch markets. They are NOT authoritative:
an administrator must review them (Admin → Markets → Assumptions) against current local
quotes from title companies, lenders, insurers, contractors and agents. Every analysis stores
the exact assumptions it used so results are reproducible.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any

DEFAULT_ASSUMPTIONS: dict[str, Any] = {
    # --- acquisition
    "buyer_closing_cost_pct": 2.0,  # % of purchase: title, settlement, recordation/transfer taxes
    "inspection_cost": 650.0,
    "legal_cost": 1200.0,
    "acquisition_fee": 0.0,  # e.g. a wholesaler assignment fee (set per deal)
    # --- financing
    "financing_type": "hard_money",  # hard_money | cash
    "loan_to_purchase_pct": 85.0,
    "rehab_financed_pct": 100.0,
    "max_loan_to_arv_pct": 70.0,
    "interest_rate_pct": 11.0,  # annual, interest-only
    "points_pct": 2.0,
    "lender_fees": 1500.0,
    # --- holding (monthly)
    "property_tax_rate_pct": 1.0,  # annual % of purchase price, used only when taxes are unknown
    "insurance_monthly": 175.0,  # vacant/builder's-risk policy
    "utilities_monthly": 250.0,
    "maintenance_monthly": 100.0,  # lawn, winterization, security
    # --- disposition
    "agent_commission_pct": 5.0,
    "seller_closing_cost_pct": 1.5,  # grantor/transfer tax + settlement
    "staging_cost": 3000.0,
    "marketing_cost": 500.0,
    # --- timeline
    "acquisition_to_rehab_start_months": 0.5,
    "rehab_months": {"cosmetic": 1.0, "light": 1.5, "medium": 3.0, "heavy": 4.5, "gut": 6.0},
    "days_to_contract": 30,  # listing → ratified contract after renovation
    "days_contract_to_close": 35,
    # --- renovation
    "renovation_cost_multiplier": 1.0,
    "contingency_pct": {"cosmetic": 8.0, "light": 10.0, "medium": 12.0, "heavy": 15.0, "gut": 20.0},
    # --- targets
    "target_profit_pct_of_arv": 12.0,
    "min_target_profit": 30000.0,
    "min_net_profit_for_qualified": 25000.0,
    # --- comparable sales
    "comp_max_radius_miles": 1.0,
    "comp_extended_radius_miles": 2.0,
    "comp_preferred_age_months": 6,
    "comp_max_age_months": 12,
    "comp_sqft_tolerance_pct": 25.0,
    "comp_max_bed_diff": 1,
    "min_comps": 3,
    "adj_per_bedroom": 7500.0,
    "adj_per_bathroom": 10000.0,
    "adj_sqft_fraction_of_ppsf": 0.5,  # marginal value of a square foot vs average $/sqft
    "monthly_appreciation_pct": 0.25,  # time adjustment; replace with FHFA HPI trend when loaded
}

# Market-level overrides (still estimates — review before relying on them).
MARKET_OVERRIDES: dict[str, dict[str, Any]] = {
    "northern_virginia": {
        "renovation_cost_multiplier": 1.15,
        "property_tax_rate_pct": 1.05,
        "seller_closing_cost_pct": 1.4,
        "days_to_contract": 21,
    },
    "shenandoah_valley_va": {  # Winchester / Frederick County VA
        "renovation_cost_multiplier": 1.0,
        "property_tax_rate_pct": 0.85,
        "days_to_contract": 30,
        "comp_max_radius_miles": 1.5,
        "comp_extended_radius_miles": 3.0,
    },
    "eastern_panhandle_wv": {  # Jefferson / Berkeley County WV
        "renovation_cost_multiplier": 0.95,
        "property_tax_rate_pct": 0.75,
        "seller_closing_cost_pct": 1.8,  # WV state + county transfer tax is higher than VA's
        "days_to_contract": 35,
        "comp_max_radius_miles": 2.0,
        "comp_extended_radius_miles": 4.0,
    },
}


def merged_assumptions(profile: str | None = None, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    out = deepcopy(DEFAULT_ASSUMPTIONS)
    if profile and profile in MARKET_OVERRIDES:
        out.update(deepcopy(MARKET_OVERRIDES[profile]))
    for k, v in (overrides or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = {**out[k], **v}
        elif v is not None:
            out[k] = v
    return out
