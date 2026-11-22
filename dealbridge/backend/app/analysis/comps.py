"""Comparable-sales selection, adjustment and ARV estimation.

Rules enforced here:
* Only CLOSED sales from recorded deeds / transactions, licensed MLS sold data, or sales an
  analyst manually verified are eligible. Active listing prices and assessed values are never
  comps and never an ARV.
* Distressed or non-arm's-length sales (foreclosure, REO, short sale, family transfers) are
  excluded because they do not represent after-repair market value.
* Comps sold in poor condition are excluded for ARV (they describe as-is value, not ARV).
* When fewer than `min_comps` usable comps exist, or confidence is low, the deal is flagged
  for manual review. The engine never invents an ARV.
"""
from __future__ import annotations

import math
import statistics
from dataclasses import asdict, dataclass, field
from datetime import date

VERIFIED_SOURCE_TYPES = {"recorded_deed", "manual_verified", "licensed_mls_sold"}
EXCLUDED_SALE_TYPES = {"foreclosure", "reo", "short_sale", "non_arms_length", "auction"}
PROPERTY_TYPE_GROUPS = {
    "single_family": "detached",
    "manufactured": "manufactured",
    "townhouse": "attached",
    "condo": "condo",
    "multi_family_2_4": "multi",
}


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 3958.7613
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def months_between(earlier: date, later: date) -> float:
    return (later - earlier).days / 30.4375


@dataclass
class Subject:
    property_type: str
    sqft: float | None
    beds: float | None
    baths: float | None
    lot_sqft: float | None = None
    lat: float | None = None
    lng: float | None = None
    zip_code: str | None = None
    subdivision: str | None = None
    year_built: int | None = None


@dataclass
class Comp:
    id: str
    address: str
    sale_price: float
    sale_date: date
    property_type: str
    sqft: float | None
    beds: float | None
    baths: float | None
    lot_sqft: float | None = None
    lat: float | None = None
    lng: float | None = None
    zip_code: str | None = None
    subdivision: str | None = None
    year_built: int | None = None
    condition_at_sale: str = "unknown"
    sale_type: str = "unknown"
    source_type: str = "manual_verified"
    verification_status: str = "unverified"
    data_provider: str = ""
    is_demo: bool = False


@dataclass
class CompEvaluation:
    comp_id: str
    address: str
    sale_price: float
    sale_date: str
    distance_miles: float | None
    months_ago: float
    included: bool
    exclusion_reason: str | None = None
    adjustments: dict[str, float] = field(default_factory=dict)
    adjusted_price: float | None = None
    weight: float = 0.0
    similarity: float = 0.0
    verification_status: str = "unverified"
    data_provider: str = ""
    is_demo: bool = False


@dataclass
class ARVResult:
    arv: float | None
    arv_low: float | None
    arv_high: float | None
    method: str  # verified_comps | manual_override | none
    confidence: float  # 0-100
    confidence_breakdown: dict[str, float]
    comp_count: int
    evaluations: list[CompEvaluation]
    flags: list[str]
    neighborhood_sales_6mo: int
    median_ppsf: float | None
    comp_supported_arv: float | None = None
    override_reason: str | None = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["evaluations"] = [asdict(e) for e in self.evaluations]
        return d


def _lin(x: float, x0: float, x1: float) -> float:
    """1 at x<=x0, 0 at x>=x1, linear between."""
    if x <= x0:
        return 1.0
    if x >= x1:
        return 0.0
    return 1 - (x - x0) / (x1 - x0)


def evaluate_comps(subject: Subject, comps: list[Comp], as_of: date, a: dict) -> ARVResult:
    radius = float(a["comp_max_radius_miles"])
    ext_radius = float(a.get("comp_extended_radius_miles", radius))
    pref_age = float(a["comp_preferred_age_months"])
    max_age = float(a["comp_max_age_months"])
    tol = float(a["comp_sqft_tolerance_pct"]) / 100
    max_bed_diff = float(a["comp_max_bed_diff"])
    min_comps = int(a["min_comps"])
    appreciation = float(a["monthly_appreciation_pct"]) / 100
    subject_group = PROPERTY_TYPE_GROUPS.get(subject.property_type, subject.property_type)

    evals: list[CompEvaluation] = []
    neighborhood_sales = 0
    for c in comps:
        dist = None
        if None not in (subject.lat, subject.lng, c.lat, c.lng):
            dist = haversine_miles(subject.lat, subject.lng, c.lat, c.lng)  # type: ignore[arg-type]
        age = months_between(c.sale_date, as_of)
        ev = CompEvaluation(
            comp_id=c.id,
            address=c.address,
            sale_price=c.sale_price,
            sale_date=c.sale_date.isoformat(),
            distance_miles=round(dist, 3) if dist is not None else None,
            months_ago=round(age, 1),
            included=False,
            verification_status=c.verification_status,
            data_provider=c.data_provider,
            is_demo=c.is_demo,
        )
        evals.append(ev)

        def exclude(reason: str) -> None:
            ev.exclusion_reason = reason

        near = (dist is not None and dist <= ext_radius) or (
            dist is None and subject.zip_code and c.zip_code == subject.zip_code
        )
        if (
            near
            and 0 <= age <= 6
            and c.source_type in VERIFIED_SOURCE_TYPES
            and c.sale_type not in EXCLUDED_SALE_TYPES
        ):
            neighborhood_sales += 1

        if c.source_type not in VERIFIED_SOURCE_TYPES:
            exclude(f"source type '{c.source_type}' is not a verified closed sale")
            continue
        if c.sale_price is None or c.sale_price <= 0:
            exclude("missing sale price")
            continue
        if c.sale_type in EXCLUDED_SALE_TYPES:
            exclude(f"{c.sale_type.replace('_', ' ')} sale does not reflect after-repair value")
            continue
        if age < 0:
            exclude("sale date is in the future")
            continue
        if age > max_age:
            exclude(f"sold {age:.0f} months ago (limit {max_age:.0f})")
            continue
        if PROPERTY_TYPE_GROUPS.get(c.property_type, c.property_type) != subject_group:
            exclude(f"different property type ({c.property_type})")
            continue
        if dist is None:
            if not (subject.zip_code and c.zip_code == subject.zip_code):
                exclude("no coordinates and different ZIP code")
                continue
        elif dist > ext_radius:
            exclude(f"{dist:.2f} mi away (limit {ext_radius:.1f})")
            continue
        if subject.sqft and c.sqft:
            if abs(c.sqft - subject.sqft) / subject.sqft > tol:
                exclude(f"size {c.sqft:,.0f} sqft outside ±{tol:.0%} of subject")
                continue
        if subject.beds is not None and c.beds is not None and abs(c.beds - subject.beds) > max_bed_diff:
            exclude(f"{c.beds:.0f} beds vs subject {subject.beds:.0f}")
            continue
        if c.condition_at_sale == "poor":
            exclude("sold in poor condition — reflects as-is value, not ARV")
            continue

        # ---- adjustments (toward the subject)
        adj: dict[str, float] = {}
        ppsf = c.sale_price / c.sqft if c.sqft else None
        if ppsf and subject.sqft and c.sqft:
            adj["size"] = (subject.sqft - c.sqft) * ppsf * float(a["adj_sqft_fraction_of_ppsf"])
        if subject.beds is not None and c.beds is not None:
            adj["bedrooms"] = (subject.beds - c.beds) * float(a["adj_per_bedroom"])
        if subject.baths is not None and c.baths is not None:
            adj["bathrooms"] = (subject.baths - c.baths) * float(a["adj_per_bathroom"])
        adj["time"] = c.sale_price * ((1 + appreciation) ** age - 1)
        adj = {k: round(v, 2) for k, v in adj.items() if abs(v) >= 0.01}
        adjusted = c.sale_price + sum(adj.values())
        gross_adj_pct = sum(abs(v) for k, v in adj.items() if k != "time") / c.sale_price

        # ---- similarity weight
        w_recency = 1.0 if age <= pref_age else 0.6
        if dist is None:
            w_dist = 0.5
        elif dist <= radius:
            w_dist = 1.0 - 0.4 * (dist / radius)
        else:
            w_dist = 0.45
        w_size = 1.0 - (abs(c.sqft - subject.sqft) / subject.sqft if subject.sqft and c.sqft else 0.3)
        w_subdiv = 1.15 if subject.subdivision and c.subdivision == subject.subdivision else 1.0
        w_cond = {"renovated": 1.0, "good": 0.9, "average": 0.75, "unknown": 0.7}.get(c.condition_at_sale, 0.7)
        w_adj = 1.0 if gross_adj_pct <= 0.15 else (0.7 if gross_adj_pct <= 0.25 else 0.4)
        w_verified = 1.0 if c.verification_status in ("source_verified", "manually_verified") else 0.85
        weight = w_recency * w_dist * max(w_size, 0.1) * w_subdiv * w_cond * w_adj * w_verified

        ev.included = True
        ev.adjustments = adj
        ev.adjusted_price = round(adjusted, 2)
        ev.weight = round(weight, 4)
        ev.similarity = round(min(1.0, weight / 1.15), 4)

    used = [e for e in evals if e.included]
    flags: list[str] = []
    ppsf_values = [
        c.sale_price / c.sqft for c in comps if c.sqft and any(e.comp_id == c.id and e.included for e in used)
    ]
    median_ppsf = round(statistics.median(ppsf_values), 2) if ppsf_values else None

    if not used:
        flags.append("no_verified_comps")
        return ARVResult(
            arv=None,
            arv_low=None,
            arv_high=None,
            method="none",
            confidence=0.0,
            confidence_breakdown={},
            comp_count=0,
            evaluations=evals,
            flags=flags + ["manual_review_required"],
            neighborhood_sales_6mo=neighborhood_sales,
            median_ppsf=None,
        )

    total_w = sum(e.weight for e in used)
    prices = [e.adjusted_price for e in used if e.adjusted_price is not None]
    arv = sum(e.adjusted_price * e.weight for e in used if e.adjusted_price) / total_w
    mean = sum(prices) / len(prices)
    sd = statistics.pstdev(prices) if len(prices) > 1 else mean * 0.10  # single comp: assume ±10%
    cv = sd / mean if mean else 1.0

    # ---- confidence (0-100)
    n = len(used)
    c_count = min(n, 6) / 6 * 35
    avg_age = sum(e.months_ago for e in used) / n
    c_recency = 20 * _lin(avg_age, 3, 12)
    dists = [e.distance_miles for e in used if e.distance_miles is not None]
    avg_dist = sum(dists) / len(dists) if dists else None
    c_distance = 15 * _lin(avg_dist, 0.25, ext_radius * 1.5) if avg_dist is not None else 5.0
    c_dispersion = 20 * _lin(cv, 0.04, 0.20)
    verified_share = sum(1 for e in used if e.verification_status in ("source_verified", "manually_verified")) / n
    c_verified = 10 * verified_share
    breakdown = {
        "comp_count": round(c_count, 1),
        "recency": round(c_recency, 1),
        "distance": round(c_distance, 1),
        "consistency": round(c_dispersion, 1),
        "verification": round(c_verified, 1),
    }
    confidence = round(sum(breakdown.values()), 1)

    if n < min_comps:
        flags += ["insufficient_comps", "manual_review_required"]
    if confidence < 50:
        flags += ["low_arv_confidence", "manual_review_required"]
    if cv > 0.15:
        flags.append("high_comp_dispersion")
    if avg_age > pref_age:
        flags.append("stale_comps")
    if any(e.is_demo for e in used):
        flags.append("demo_comps_used")

    return ARVResult(
        arv=round(arv, -2),
        arv_low=round(arv - sd, -2),
        arv_high=round(arv + sd, -2),
        method="verified_comps",
        confidence=confidence,
        confidence_breakdown=breakdown,
        comp_count=n,
        evaluations=evals,
        flags=sorted(set(flags)),
        neighborhood_sales_6mo=neighborhood_sales,
        median_ppsf=median_ppsf,
    )


def apply_manual_arv(result: ARVResult, manual_arv: float, reason: str | None) -> ARVResult:
    """Analyst-supplied ARV. Kept clearly labelled; confidence is capped unless comps agree."""
    flags = set(result.flags) | {"arv_manual_override"}
    conf = 35.0
    comp_arv = result.arv
    if comp_arv:
        gap = abs(manual_arv - comp_arv) / comp_arv
        if gap <= 0.05:
            conf = result.confidence
        elif gap > 0.10:
            flags |= {"manual_arv_differs_from_comps", "manual_review_required"}
    else:
        flags.add("manual_review_required")
    result.comp_supported_arv = comp_arv
    result.override_reason = reason
    result.arv = round(manual_arv, 2)
    result.arv_low = round(manual_arv * 0.95, 2)
    result.arv_high = round(manual_arv * 1.05, 2)
    result.method = "manual_override"
    result.confidence = conf
    result.flags = sorted(flags)
    return result
