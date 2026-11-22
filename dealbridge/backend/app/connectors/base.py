"""Connector framework.

Each data provider is a separate Connector subclass. Connectors only use official downloadable
datasets or documented APIs, identify themselves with a User-Agent, respect rate limits (fixed
delay between pages + exponential back-off on 429/5xx) and never bypass authentication,
CAPTCHAs or access restrictions. A connector that needs credentials refuses to run without them.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any, ClassVar

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)


class ConnectorError(Exception):
    pass


class NotConfigured(ConnectorError):
    pass


@dataclass
class Provenance:
    data_provider: str
    source_url: str | None
    license: str | None
    permitted_use: str | None
    retrieved_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    source_updated_at: datetime | None = None
    verification_status: str = "source_verified"  # came straight from the official source


@dataclass
class PropertyRecord:
    external_id: str
    address_line: str
    city: str
    state: str
    zip_code: str
    provenance: Provenance
    county: str | None = None
    parcel_id: str | None = None
    lat: float | None = None
    lng: float | None = None
    property_type: str | None = None
    beds: float | None = None
    baths: float | None = None
    sqft: float | None = None
    lot_sqft: float | None = None
    year_built: int | None = None
    assessed_value: float | None = None
    assessment_year: int | None = None
    annual_taxes: float | None = None
    last_sale_price: float | None = None
    last_sale_date: date | None = None
    # Only set by sources that actually publish availability (e.g. HUD Home Store export,
    # an authorized listing feed, or a wholesaler submission). Never by assessment data.
    listing_status: str | None = None
    list_price: float | None = None
    listing_url: str | None = None
    opportunity_types: list[str] = field(default_factory=list)
    distress_signals: list[str] = field(default_factory=list)
    raw: dict = field(default_factory=dict)


@dataclass
class SaleRecord:
    external_id: str
    address_line: str
    city: str
    state: str
    zip_code: str
    sale_price: float
    sale_date: date
    provenance: Provenance
    source_type: str = "recorded_deed"
    sale_type: str = "unknown"
    county: str | None = None
    parcel_id: str | None = None
    lat: float | None = None
    lng: float | None = None
    property_type: str = "single_family"
    beds: float | None = None
    baths: float | None = None
    sqft: float | None = None
    lot_sqft: float | None = None
    year_built: int | None = None
    deed_book_page: str | None = None
    raw: dict = field(default_factory=dict)


@dataclass
class FetchResult:
    properties: list[PropertyRecord] = field(default_factory=list)
    sales: list[SaleRecord] = field(default_factory=list)
    enrichment: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    pages: int = 0


class Connector:
    key: ClassVar[str] = "base"
    name: ClassVar[str] = "Base connector"
    category: ClassVar[str] = "property"  # property | sales | enrichment | listings
    cost_tier: ClassVar[str] = "free"
    default_license: ClassVar[str | None] = None
    default_permitted_use: ClassVar[str | None] = None
    docs_url: ClassVar[str | None] = None
    credential_env_var: ClassVar[str | None] = None
    page_delay_seconds: ClassVar[float] = 1.0

    def __init__(self, config: dict | None = None, client: httpx.Client | None = None,
                 source_key: str | None = None, license: str | None = None, permitted_use: str | None = None):
        self.config = config or {}
        self.source_key = source_key or self.key
        self.license = license or self.default_license
        self.permitted_use = permitted_use or self.default_permitted_use
        s = get_settings()
        self.client = client or httpx.Client(
            timeout=s.http_timeout_seconds, headers={"User-Agent": s.http_user_agent}, follow_redirects=True
        )

    # ---------------------------------------------------------------- helpers
    def provenance(self, url: str | None, updated: datetime | None = None) -> Provenance:
        return Provenance(self.source_key, url, self.license, self.permitted_use, source_updated_at=updated)

    def credential(self) -> str | None:
        if not self.credential_env_var:
            return None
        return getattr(get_settings(), self.credential_env_var.removeprefix("DEALBRIDGE_").lower(), None)

    def get(self, url: str, params: dict | None = None, headers: dict | None = None, retries: int = 3) -> httpx.Response:
        delay = 2.0
        for attempt in range(retries + 1):
            try:
                r = self.client.get(url, params=params, headers=headers)
            except httpx.HTTPError as exc:
                if attempt == retries:
                    raise ConnectorError(f"request failed: {exc}") from exc
                time.sleep(delay)
                delay *= 2
                continue
            if r.status_code in (429, 500, 502, 503, 504) and attempt < retries:
                wait = float(r.headers.get("Retry-After", delay)) if r.headers.get("Retry-After", "").isdigit() else delay
                time.sleep(min(wait, 60))
                delay *= 2
                continue
            if r.status_code in (401, 403):
                raise ConnectorError(f"access denied ({r.status_code}) — check credentials/terms; not retrying")
            if r.status_code >= 400:
                raise ConnectorError(f"HTTP {r.status_code} from {url}")
            return r
        raise ConnectorError("unreachable")

    def pause(self) -> None:
        if self.page_delay_seconds:
            time.sleep(self.page_delay_seconds)

    def check_ready(self) -> None:
        if self.credential_env_var and not self.credential():
            raise NotConfigured(f"set {self.credential_env_var} to enable {self.name}")

    def fetch(self, **params: Any) -> FetchResult:  # pragma: no cover - interface
        raise NotImplementedError

    def describe(self) -> dict:
        return {"key": self.key, "name": self.name, "category": self.category, "cost_tier": self.cost_tier,
                "docs_url": self.docs_url, "credential_env_var": self.credential_env_var}


# ---------------------------------------------------------------- parsing utilities
_num_re = re.compile(r"[^0-9.\-]")


def to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = _num_re.sub("", str(v))
    try:
        return float(s) if s not in ("", "-", ".") else None
    except ValueError:
        return None


def to_int(v: Any) -> int | None:
    f = to_float(v)
    return int(f) if f is not None else None


def to_date(v: Any) -> date | None:
    if v in (None, ""):
        return None
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, (int, float)):  # ArcGIS epoch milliseconds
        return datetime.fromtimestamp(v / 1000, tz=UTC).date()
    s = str(v).strip()
    for candidate, fmt in ((s, "%Y-%m-%d"), (s, "%m/%d/%Y"), (s, "%Y%m%d"), (s, "%m/%d/%y"),
                           (s[:19], "%Y-%m-%dT%H:%M:%S"), (s[:19], "%Y-%m-%d %H:%M:%S")):
        try:
            return datetime.strptime(candidate, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        return None


PROPERTY_TYPE_HINTS = [
    (("condo", "condominium"), "condo"),
    (("town", "row", "attached", "th"), "townhouse"),
    (("duplex", "triplex", "fourplex", "2-4", "multi"), "multi_family_2_4"),
    (("mobile", "manufactured"), "manufactured"),
    (("vacant land", "land", "lot"), "land"),
    (("single", "detached", "sfr", "residential", "dwelling"), "single_family"),
]


def normalize_property_type(v: Any, default: str = "single_family") -> str:
    if not v:
        return default
    s = str(v).lower()
    for words, t in PROPERTY_TYPE_HINTS:
        if any(w in s for w in words):
            return t
    return "other"


def apply_field_map(row: dict, field_map: dict[str, str | list[str]]) -> dict:
    """field_map: {our_field: their_field | [candidates] | "=constant"}."""
    out: dict[str, Any] = {}
    lower = {k.lower(): v for k, v in row.items()}
    for ours, theirs in field_map.items():
        if isinstance(theirs, str) and theirs.startswith("="):
            out[ours] = theirs[1:]
            continue
        for name in [theirs] if isinstance(theirs, str) else theirs:
            if name in row:
                out[ours] = row[name]
                break
            if name.lower() in lower:
                out[ours] = lower[name.lower()]
                break
    return out


def read_tabular(content: bytes, fmt: str) -> list[dict]:
    fmt = fmt.lower().lstrip(".")
    if fmt == "csv":
        text = content.decode("utf-8-sig", errors="replace")
        return list(csv.DictReader(io.StringIO(text)))
    if fmt == "json":
        data = json.loads(content)
        if isinstance(data, dict):
            for k in ("data", "records", "results", "features", "rows"):
                if isinstance(data.get(k), list):
                    data = data[k]
                    break
        return [r.get("attributes", r) if isinstance(r, dict) else r for r in data]
    if fmt == "geojson":
        data = json.loads(content)
        rows = []
        for f in data.get("features", []):
            props = dict(f.get("properties") or {})
            geom = f.get("geometry") or {}
            if geom.get("type") == "Point":
                props.setdefault("_lng", geom["coordinates"][0])
                props.setdefault("_lat", geom["coordinates"][1])
            elif geom.get("type") in ("Polygon", "MultiPolygon"):
                lat, lng = polygon_centroid(geom)
                props.setdefault("_lat", lat)
                props.setdefault("_lng", lng)
            rows.append(props)
        return rows
    if fmt == "parquet":
        import pyarrow.parquet as pq

        return pq.read_table(io.BytesIO(content)).to_pylist()
    raise ConnectorError(f"unsupported format {fmt}; use csv, json, geojson or parquet")


def polygon_centroid(geom: dict) -> tuple[float | None, float | None]:
    coords = geom.get("coordinates") or []
    ring = coords[0] if geom.get("type") == "Polygon" else (coords[0][0] if coords and coords[0] else [])
    if not ring:
        return None, None
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return sum(ys) / len(ys), sum(xs) / len(xs)


def build_property(row: dict, mapped: dict, prov: Provenance, defaults: dict) -> PropertyRecord | None:
    addr = mapped.get("address_line")
    if not addr:
        return None
    city = mapped.get("city") or defaults.get("city") or ""
    state = (mapped.get("state") or defaults.get("state") or "").upper()[:2]
    z = str(mapped.get("zip_code") or defaults.get("zip_code") or "")[:10]
    ext = str(mapped.get("external_id") or mapped.get("parcel_id") or f"{addr}|{z}")
    return PropertyRecord(
        external_id=ext,
        address_line=str(addr).strip(),
        city=str(city).strip().title(),
        state=state,
        zip_code=z.strip(),
        provenance=prov,
        county=mapped.get("county") or defaults.get("county"),
        parcel_id=str(mapped["parcel_id"]) if mapped.get("parcel_id") else None,
        lat=to_float(mapped.get("lat", row.get("_lat"))),
        lng=to_float(mapped.get("lng", row.get("_lng"))),
        property_type=normalize_property_type(mapped.get("property_type"), defaults.get("property_type", "single_family")),
        beds=to_float(mapped.get("beds")),
        baths=to_float(mapped.get("baths")),
        sqft=to_float(mapped.get("sqft")),
        lot_sqft=to_float(mapped.get("lot_sqft")) or (
            to_float(mapped.get("lot_acres")) * 43560 if to_float(mapped.get("lot_acres")) else None
        ),
        year_built=to_int(mapped.get("year_built")),
        assessed_value=to_float(mapped.get("assessed_value")),
        assessment_year=to_int(mapped.get("assessment_year")),
        annual_taxes=to_float(mapped.get("annual_taxes")),
        last_sale_price=to_float(mapped.get("last_sale_price")),
        last_sale_date=to_date(mapped.get("last_sale_date")),
        listing_status=defaults.get("listing_status"),
        list_price=to_float(mapped.get("list_price")) if defaults.get("listing_status") else None,
        listing_url=mapped.get("listing_url"),
        opportunity_types=list(defaults.get("opportunity_types", [])),
        raw=row,
    )


def build_sale(row: dict, mapped: dict, prov: Provenance, defaults: dict) -> SaleRecord | None:
    addr = mapped.get("address_line")
    price = to_float(mapped.get("sale_price"))
    d = to_date(mapped.get("sale_date"))
    if not addr or not price or not d:
        return None
    z = str(mapped.get("zip_code") or defaults.get("zip_code") or "")[:10]
    return SaleRecord(
        external_id=str(mapped.get("external_id") or f"{addr}|{z}|{d}|{price}"),
        address_line=str(addr).strip(),
        city=str(mapped.get("city") or defaults.get("city") or "").title(),
        state=str(mapped.get("state") or defaults.get("state") or "").upper()[:2],
        zip_code=z,
        sale_price=price,
        sale_date=d,
        provenance=prov,
        source_type=defaults.get("source_type", "recorded_deed"),
        sale_type=str(mapped.get("sale_type") or "unknown").lower(),
        county=mapped.get("county") or defaults.get("county"),
        parcel_id=str(mapped["parcel_id"]) if mapped.get("parcel_id") else None,
        lat=to_float(mapped.get("lat", row.get("_lat"))),
        lng=to_float(mapped.get("lng", row.get("_lng"))),
        property_type=normalize_property_type(mapped.get("property_type"), defaults.get("property_type", "single_family")),
        beds=to_float(mapped.get("beds")),
        baths=to_float(mapped.get("baths")),
        sqft=to_float(mapped.get("sqft")),
        lot_sqft=to_float(mapped.get("lot_sqft")),
        year_built=to_int(mapped.get("year_built")),
        deed_book_page=mapped.get("deed_book_page"),
        raw=row,
    )
