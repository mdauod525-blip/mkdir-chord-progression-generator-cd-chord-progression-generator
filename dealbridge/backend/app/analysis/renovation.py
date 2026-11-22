"""Rule-based renovation cost estimator.

Produces an itemized budget from property size, condition and known issues. The unit costs
below are planning-level estimates for the launch region (2026 dollars) and must be replaced
by contractor bids before any commitment. Any line can be overridden with an actual quote.
"""
from __future__ import annotations

from dataclasses import dataclass, field

SCOPES = ("cosmetic", "light", "medium", "heavy", "gut")

CONDITION_TO_SCOPE = {
    "excellent": "cosmetic",
    "good": "light",
    "fair": "medium",
    "poor": "heavy",
    "distressed": "gut",
}

# Known issue flags an analyst can set; each forces the related line item in.
ISSUE_FLAGS = (
    "roof",
    "hvac",
    "electrical",
    "plumbing",
    "foundation",
    "water_damage",
    "mold",
    "fire_damage",
    "kitchen",
    "bathrooms",
)

# unit costs by scope (flip-grade finishes, not luxury)
_COSMETIC_PSF = {"cosmetic": 2.5, "light": 3.0, "medium": 4.5, "heavy": 6.0, "gut": 8.0}
_KITCHEN = {"cosmetic": 0.0, "light": 6000.0, "medium": 16000.0, "heavy": 28000.0, "gut": 40000.0}
_BATH_EACH = {"cosmetic": 0.0, "light": 3000.0, "medium": 7500.0, "heavy": 12000.0, "gut": 16000.0}
_FLOOR_PSF = {"cosmetic": 0.0, "light": 3.0, "medium": 6.0, "heavy": 7.0, "gut": 8.0}
_FLOOR_SHARE = {"cosmetic": 0.0, "light": 0.5, "medium": 0.85, "heavy": 1.0, "gut": 1.0}
_ROOF_PSF_FOOTPRINT = 6.0  # architectural shingle replacement, per sq ft of footprint × pitch factor
_HVAC = 9500.0
_ELECTRICAL = {"cosmetic": 0.0, "light": 800.0, "medium": 2500.0, "heavy": 8000.0, "gut_psf": 6.0}
_PLUMBING = {"cosmetic": 0.0, "light": 600.0, "medium": 2000.0, "heavy": 6000.0, "gut_psf": 5.0}
_FOUNDATION = 18000.0
_WATER_MOLD = 7500.0
_FIRE_PSF = 25.0
_LANDSCAPING = {"cosmetic": 500.0, "light": 1000.0, "medium": 2500.0, "heavy": 4000.0, "gut": 5000.0}
_PERMIT_PCT = 2.0
_PERMIT_MIN = {"cosmetic": 0.0, "light": 250.0, "medium": 750.0, "heavy": 1500.0, "gut": 2500.0}

LINE_ITEMS = (
    "cosmetic",
    "kitchen",
    "bathrooms",
    "flooring",
    "roofing",
    "hvac",
    "electrical",
    "plumbing",
    "structural",
    "remediation",
    "landscaping",
    "permits",
    "contingency",
)


@dataclass
class RenovationInput:
    sqft: float | None
    baths: float | None = None
    year_built: int | None = None
    stories: float | None = None
    condition: str = "unknown"
    scope: str | None = None  # explicit scope overrides condition
    issues: list[str] = field(default_factory=list)
    overrides: dict[str, float] = field(default_factory=dict)  # line item -> actual amount
    cost_multiplier: float = 1.0
    contingency_pct: dict[str, float] | float | None = None


@dataclass
class RenovationResult:
    scope: str
    line_items: dict[str, float]
    basis: dict[str, str]
    total: float
    flags: list[str]

    def to_dict(self) -> dict:
        return {
            "scope": self.scope,
            "line_items": self.line_items,
            "basis": self.basis,
            "total": self.total,
            "flags": self.flags,
        }


def resolve_scope(condition: str | None, scope: str | None) -> tuple[str, list[str]]:
    if scope in SCOPES:
        return scope, []
    if condition in CONDITION_TO_SCOPE:
        return CONDITION_TO_SCOPE[condition], []
    return "medium", ["condition_unknown_assumed_medium_scope"]


def estimate_renovation(inp: RenovationInput) -> RenovationResult:
    scope, flags = resolve_scope(inp.condition, inp.scope)
    issues = {i for i in inp.issues if i in ISSUE_FLAGS}
    sqft = inp.sqft
    if not sqft or sqft <= 0:
        sqft = 1500.0
        flags.append("sqft_unknown_assumed_1500")
    baths = inp.baths if inp.baths and inp.baths > 0 else 1.0
    full_baths = max(1, round(baths))
    stories = inp.stories if inp.stories and inp.stories > 0 else (2.0 if sqft > 1800 else 1.0)
    old = inp.year_built is not None and inp.year_built < 1960
    m = inp.cost_multiplier or 1.0

    items: dict[str, float] = {}
    basis: dict[str, str] = {}

    items["cosmetic"] = _COSMETIC_PSF[scope] * sqft
    basis["cosmetic"] = f"paint, fixtures, trim, doors at ${_COSMETIC_PSF[scope]:.2f}/sqft ({scope})"

    k_scope = "medium" if ("kitchen" in issues and scope in ("cosmetic", "light")) else scope
    items["kitchen"] = _KITCHEN[k_scope]
    basis["kitchen"] = f"{k_scope} kitchen allowance"

    b_scope = "medium" if ("bathrooms" in issues and scope in ("cosmetic", "light")) else scope
    items["bathrooms"] = _BATH_EACH[b_scope] * full_baths
    basis["bathrooms"] = f"{full_baths} bath(s) × ${_BATH_EACH[b_scope]:,.0f}"

    items["flooring"] = _FLOOR_PSF[scope] * sqft * _FLOOR_SHARE[scope]
    basis["flooring"] = f"{_FLOOR_SHARE[scope]:.0%} of floor area at ${_FLOOR_PSF[scope]:.2f}/sqft"

    if "roof" in issues or scope in ("heavy", "gut"):
        footprint = sqft / stories
        items["roofing"] = footprint * 1.15 * _ROOF_PSF_FOOTPRINT
        basis["roofing"] = f"replace: {footprint:,.0f} sqft footprint × 1.15 pitch × ${_ROOF_PSF_FOOTPRINT}"
    else:
        items["roofing"] = 0.0
        basis["roofing"] = "not included — inspect roof; add if age > 15 years"

    if "hvac" in issues or scope in ("heavy", "gut"):
        items["hvac"] = _HVAC * (1.5 if sqft > 2800 else 1.0)
        basis["hvac"] = "replace system" + (" (two zones)" if sqft > 2800 else "")
    else:
        items["hvac"] = 0.0
        basis["hvac"] = "not included — service and inspect"

    if scope == "gut":
        items["electrical"] = _ELECTRICAL["gut_psf"] * sqft
        items["plumbing"] = _PLUMBING["gut_psf"] * sqft
    else:
        items["electrical"] = _ELECTRICAL[scope]
        items["plumbing"] = _PLUMBING[scope]
        if "electrical" in issues or (old and scope in ("medium", "heavy")):
            items["electrical"] = max(items["electrical"], _ELECTRICAL["heavy"])
        if "plumbing" in issues:
            items["plumbing"] = max(items["plumbing"], _PLUMBING["heavy"])
    basis["electrical"] = "panel/wiring upgrades" + (" (pre-1960 home)" if old else "")
    basis["plumbing"] = "fixtures, supply and drain repairs"

    items["structural"] = _FOUNDATION if "foundation" in issues else 0.0
    basis["structural"] = (
        "foundation repair allowance — get a structural engineer's report"
        if "foundation" in issues
        else "none identified (unverified)"
    )
    remediation = 0.0
    if "water_damage" in issues or "mold" in issues:
        remediation += _WATER_MOLD
    if "fire_damage" in issues:
        remediation += _FIRE_PSF * sqft
    items["remediation"] = remediation
    basis["remediation"] = "water/mold/fire remediation allowance" if remediation else "none identified"

    items["landscaping"] = _LANDSCAPING[scope]
    basis["landscaping"] = f"{scope} curb-appeal allowance"

    # apply market multiplier to hard costs
    for k in list(items):
        items[k] = items[k] * m

    hard = sum(items.values())
    items["permits"] = max(_PERMIT_MIN[scope] * m, hard * _PERMIT_PCT / 100) if scope != "cosmetic" else 0.0
    basis["permits"] = f"{_PERMIT_PCT}% of hard cost (min ${_PERMIT_MIN[scope]:,.0f})"

    # manual overrides replace computed lines before contingency
    for k, v in (inp.overrides or {}).items():
        if k in LINE_ITEMS and k != "contingency" and v is not None:
            items[k] = float(v)
            basis[k] = "manual override / contractor quote"

    cont = inp.contingency_pct
    if isinstance(cont, dict):
        cont_pct = float(cont.get(scope, 12.0))
    elif cont is not None:
        cont_pct = float(cont)
    else:
        cont_pct = {"cosmetic": 8.0, "light": 10.0, "medium": 12.0, "heavy": 15.0, "gut": 20.0}[scope]
    if "foundation" in issues or "fire_damage" in issues:
        cont_pct += 5.0
    if "contingency" in (inp.overrides or {}):
        items["contingency"] = float(inp.overrides["contingency"])
        basis["contingency"] = "manual override"
    else:
        items["contingency"] = sum(items.values()) * cont_pct / 100
        basis["contingency"] = f"{cont_pct:.0f}% of subtotal"

    items = {k: round(items.get(k, 0.0), 2) for k in LINE_ITEMS}
    total = round(sum(items.values()), 2)
    if "foundation" in issues:
        flags.append("structural_risk")
    if old:
        flags.append("pre_1960_construction")
    return RenovationResult(scope=scope, line_items=items, basis=basis, total=total, flags=flags)
