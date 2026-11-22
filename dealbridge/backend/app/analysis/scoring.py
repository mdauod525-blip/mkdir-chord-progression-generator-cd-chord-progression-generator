"""Deal score (0-100). Deterministic, explainable, and conservative.

The score is a weighted sum of eleven factors, followed by caps that stop a deal from scoring
well when data is missing or the economics do not hold up. A deal is never rated well just
because an estimated ARV exceeds the asking price: profit is measured after every acquisition,
renovation, holding, financing and selling cost, and ARV confidence is scored separately.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

WEIGHTS: dict[str, float] = {
    "discount_to_value": 12,
    "arv_confidence": 14,
    "renovation_risk": 8,
    "net_profit": 14,
    "roi": 12,
    "neighborhood_activity": 8,
    "days_on_market": 5,
    "market_liquidity": 8,
    "comp_quality": 8,
    "property_condition": 5,
    "exit_risk": 6,
}
assert sum(WEIGHTS.values()) == 100

LABELS = {
    "discount_to_value": "Discount to market value",
    "arv_confidence": "ARV confidence",
    "renovation_risk": "Renovation risk",
    "net_profit": "Expected net profit",
    "roi": "Return on cash invested",
    "neighborhood_activity": "Neighborhood sales activity",
    "days_on_market": "Days on market",
    "market_liquidity": "Market liquidity",
    "comp_quality": "Comparable-sales quality",
    "property_condition": "Property condition certainty",
    "exit_risk": "Exit strategy risk",
}


def band_for(score: float) -> str:
    if score >= 90:
        return "Exceptional opportunity"
    if score >= 80:
        return "Strong opportunity"
    if score >= 70:
        return "Potential opportunity"
    if score >= 60:
        return "Requires further investigation"
    return "Not recommended"


def _interp(x: float, points: list[tuple[float, float]]) -> float:
    """Piecewise-linear interpolation over (x, y) points sorted by x."""
    if x <= points[0][0]:
        return points[0][1]
    for (x0, y0), (x1, y1) in zip(points, points[1:], strict=False):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return points[-1][1]


@dataclass
class ScoreInputs:
    purchase_price: float | None
    arv: float | None
    arv_confidence: float
    comp_count: int
    avg_comp_similarity: float | None
    neighborhood_sales_6mo: int
    renovation_total: float | None
    structural_risk: bool
    year_built: int | None
    condition: str
    net_profit: float | None
    roi_pct: float | None
    break_even_price: float | None
    stressed_net_profit: float | None  # combined stress scenario
    days_on_market: int | None
    days_to_contract: float
    min_net_profit: float
    min_comps: int
    is_demo: bool = False
    extra_flags: list[str] = field(default_factory=list)


@dataclass
class Component:
    key: str
    label: str
    weight: float
    value: float  # 0-1
    points: float
    detail: str


@dataclass
class ScoreResult:
    score: float
    band: str
    raw_score: float
    components: list[Component]
    caps_applied: list[str]
    flags: list[str]
    needs_manual_review: bool
    insufficient_data: bool
    explanation: str

    def to_dict(self) -> dict:
        return asdict(self)


def score_deal(s: ScoreInputs) -> ScoreResult:
    comps: list[Component] = []
    flags = set(s.extra_flags)

    def add(key: str, value: float, detail: str) -> None:
        v = max(0.0, min(1.0, value))
        comps.append(Component(key, LABELS[key], WEIGHTS[key], round(v, 3), round(v * WEIGHTS[key], 2), detail))

    have_econ = s.arv is not None and s.purchase_price is not None and s.renovation_total is not None

    if have_econ and s.arv:
        all_in = (s.purchase_price + s.renovation_total) / s.arv  # type: ignore[operator]
        add(
            "discount_to_value",
            _interp(all_in, [(0.60, 1.0), (0.70, 0.85), (0.80, 0.45), (0.90, 0.1), (0.95, 0.0)]),
            f"purchase + renovation = {all_in:.0%} of ARV",
        )
    else:
        add("discount_to_value", 0.0, "cannot compute without price, renovation and ARV")

    add("arv_confidence", s.arv_confidence / 100, f"{s.arv_confidence:.0f}/100 from {s.comp_count} verified comp(s)")

    if s.renovation_total is not None and s.arv:
        ratio = s.renovation_total / s.arv
        v = _interp(ratio, [(0.05, 1.0), (0.12, 0.8), (0.20, 0.55), (0.35, 0.15), (0.45, 0.0)])
        notes = [f"renovation = {ratio:.0%} of ARV"]
        if s.structural_risk:
            v -= 0.3
            notes.append("structural issue")
        if s.condition in ("unknown", None):
            v -= 0.2
            notes.append("condition not inspected")
        if s.year_built and s.year_built < 1950:
            v -= 0.1
            notes.append(f"built {s.year_built}")
        add("renovation_risk", v, ", ".join(notes))
    else:
        add("renovation_risk", 0.0, "no renovation estimate or ARV")

    if s.net_profit is not None:
        target = max(s.min_net_profit, 1.0)
        add(
            "net_profit",
            _interp(s.net_profit, [(0, 0.0), (target, 0.6), (target * 2.4, 1.0)]),
            f"${s.net_profit:,.0f} projected after all costs",
        )
    else:
        add("net_profit", 0.0, "not computed")

    if s.roi_pct is not None:
        add("roi", _interp(s.roi_pct, [(0, 0.0), (15, 0.5), (25, 0.8), (40, 1.0)]), f"{s.roi_pct:.1f}% on cash invested")
    else:
        add("roi", 0.0, "not computed")

    add(
        "neighborhood_activity",
        _interp(s.neighborhood_sales_6mo, [(0, 0.0), (2, 0.35), (5, 0.75), (8, 1.0)]),
        f"{s.neighborhood_sales_6mo} verified arm's-length sale(s) nearby in 6 months",
    )

    if s.days_on_market is None:
        add("days_on_market", 0.5, "unknown / off-market")
    else:
        add(
            "days_on_market",
            _interp(s.days_on_market, [(0, 0.4), (30, 0.65), (60, 0.9), (120, 1.0)]),
            f"{s.days_on_market} days on market (longer = more negotiating room)",
        )

    add(
        "market_liquidity",
        _interp(s.days_to_contract, [(14, 1.0), (30, 0.8), (60, 0.5), (120, 0.15)]),
        f"~{s.days_to_contract:.0f} days to contract after listing (market assumption)",
    )

    if s.avg_comp_similarity is not None and s.comp_count:
        add("comp_quality", s.avg_comp_similarity, f"average similarity {s.avg_comp_similarity:.0%}")
    else:
        add("comp_quality", 0.0, "no usable comps")

    cond_v = {"excellent": 1.0, "good": 1.0, "fair": 0.8, "poor": 0.6, "distressed": 0.45}.get(s.condition, 0.25)
    add("property_condition", cond_v, f"condition: {s.condition}")

    if s.break_even_price and s.arv:
        cushion = (s.arv - s.break_even_price) / s.arv
        v = _interp(cushion, [(0, 0.0), (0.08, 0.5), (0.15, 0.85), (0.20, 1.0)])
        detail = f"break-even {cushion:.0%} below ARV"
        if s.stressed_net_profit is not None:
            if s.stressed_net_profit < 0:
                v -= 0.3
                detail += "; loses money under stress (ARV −5%, rehab +15%, +2 months)"
            else:
                detail += f"; ${s.stressed_net_profit:,.0f} profit under stress"
        add("exit_risk", v, detail)
    else:
        add("exit_risk", 0.0, "not computed")

    raw = round(sum(c.points for c in comps), 1)
    score = raw
    caps: list[str] = []
    insufficient = False

    def cap(limit: float, reason: str) -> None:
        nonlocal score
        if score > limit:
            score = limit
        caps.append(f"capped at {limit:.0f}: {reason}")

    if s.arv is None:
        insufficient = True
        flags |= {"insufficient_data", "no_arv", "manual_review_required"}
        cap(59, "no ARV supported by verified comparable sales")
    if s.purchase_price is None:
        insufficient = True
        flags |= {"insufficient_data", "no_asking_price"}
        cap(59, "no asking/purchase price — use MAO to frame an offer")
    if s.net_profit is not None and s.net_profit <= 0:
        cap(40, "projected net profit is zero or negative")
    elif s.net_profit is not None and s.net_profit < s.min_net_profit:
        cap(69, f"projected profit below the ${s.min_net_profit:,.0f} minimum")
    if s.arv is not None and s.comp_count < s.min_comps:
        flags |= {"insufficient_comps", "manual_review_required"}
        cap(69, f"only {s.comp_count} verified comp(s); {s.min_comps} required")
    if s.arv is not None and s.arv_confidence < 50:
        flags |= {"low_arv_confidence", "manual_review_required"}
        cap(69, "ARV confidence below 50")
    if s.stressed_net_profit is not None and s.stressed_net_profit < 0 and s.net_profit and s.net_profit > 0:
        cap(79, "profit disappears under a modest stress scenario")
    if "arv_manual_override" in flags:
        cap(79, "ARV is an analyst override, not comp-derived")
    if s.condition in ("unknown", None):
        flags.add("condition_unverified")

    score = round(max(0.0, score), 1)
    band = band_for(score)
    if insufficient:
        band = "Insufficient data — manual review"
    needs_review = "manual_review_required" in flags or insufficient or 60 <= score < 70

    ranked = sorted(comps, key=lambda c: c.value)
    strengths = [c for c in sorted(comps, key=lambda c: -c.value) if c.value >= 0.7][:3]
    weaknesses = [c for c in ranked if c.value < 0.5][:3]
    lines = [f"Score {score:.0f}/100 — {band}."]
    if strengths:
        lines.append("Strengths: " + "; ".join(f"{c.label.lower()} ({c.detail})" for c in strengths) + ".")
    if weaknesses:
        lines.append("Weaknesses: " + "; ".join(f"{c.label.lower()} ({c.detail})" for c in weaknesses) + ".")
    for c in caps:
        lines.append(f"Score {c}.")
    if s.is_demo:
        lines.append("DEMO DATA — fictional sample record, not a real opportunity.")
    lines.append(
        "All figures are estimates based on stated assumptions and available data; they are not guarantees."
    )

    return ScoreResult(
        score=score,
        band=band,
        raw_score=raw,
        components=comps,
        caps_applied=caps,
        flags=sorted(flags),
        needs_manual_review=needs_review,
        insufficient_data=insufficient,
        explanation=" ".join(lines),
    )
