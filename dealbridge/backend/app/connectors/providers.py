"""Concrete connectors — one per provider type. Endpoint URLs live in the DataSource config
(seeded in app/seed.py) so they can be corrected without code changes."""
from __future__ import annotations

from typing import Any, ClassVar

from .base import (
    Connector,
    ConnectorError,
    FetchResult,
    NotConfigured,
    apply_field_map,
    build_property,
    build_sale,
    polygon_centroid,
    read_tabular,
    to_float,
)


class FileImportConnector(Connector):
    """CSV / JSON / GeoJSON / Parquet from an upload or an official download URL."""

    key = "file_import"
    name = "File import (CSV, JSON, GeoJSON, Parquet)"
    category = "property"
    page_delay_seconds = 0.0

    def fetch(self, content: bytes | None = None, filename: str | None = None, **_: Any) -> FetchResult:
        url = self.config.get("url")
        fmt = self.config.get("format") or (filename.rsplit(".", 1)[-1] if filename and "." in filename else None)
        if content is None:
            if not url:
                raise NotConfigured("provide a file upload or set config.url to an official download")
            content = self.get(url).content
            fmt = fmt or url.split("?")[0].rsplit(".", 1)[-1]
        if not fmt:
            raise ConnectorError("cannot determine file format")
        rows = read_tabular(content, fmt)
        return self._map_rows(rows, url or filename)

    def _map_rows(self, rows: list[dict], src: str | None) -> FetchResult:
        fm = self.config.get("field_map") or {}
        if not fm:
            raise NotConfigured("config.field_map is empty — map the file's columns first")
        defaults = self.config.get("defaults") or {}
        kind = self.config.get("record_type", "property")
        out = FetchResult(pages=1)
        prov = self.provenance(src)
        for i, row in enumerate(rows):
            mapped = apply_field_map(row, fm)
            rec = build_sale(row, mapped, prov, defaults) if kind == "sale" else build_property(row, mapped, prov, defaults)
            if rec is None:
                out.errors.append(f"row {i + 1}: missing required fields")
            elif kind == "sale":
                out.sales.append(rec)  # type: ignore[arg-type]
            else:
                out.properties.append(rec)  # type: ignore[arg-type]
        return out


class ArcGISFeatureConnector(FileImportConnector):
    """ArcGIS REST FeatureServer/MapServer layer query with paging (county & state GIS portals)."""

    key = "arcgis_feature"
    name = "ArcGIS REST layer (county / state GIS)"
    page_delay_seconds = 1.0

    def describe_layer(self) -> dict:
        url = self.config.get("layer_url")
        if not url:
            raise NotConfigured("config.layer_url is not set")
        meta = self.get(url, params={"f": "json"}).json()
        return {
            "name": meta.get("name"),
            "max_record_count": meta.get("maxRecordCount"),
            "fields": [{"name": f.get("name"), "type": f.get("type"), "alias": f.get("alias")} for f in meta.get("fields", [])],
            "copyright": meta.get("copyrightText"),
            "last_edit": (meta.get("editingInfo") or {}).get("lastEditDate"),
        }

    def fetch(self, max_records: int | None = None, **_: Any) -> FetchResult:
        url = self.config.get("layer_url")
        if not url:
            raise NotConfigured("config.layer_url is not set — find the layer in the county's REST directory")
        if not self.config.get("field_map"):
            raise NotConfigured("config.field_map is empty — run 'describe' and map the layer's fields")
        page = int(self.config.get("page_size", 1000))
        limit = int(max_records or self.config.get("max_records", 5000))
        rows: list[dict] = []
        offset = 0
        pages = 0
        while len(rows) < limit:
            params = {
                "where": self.config.get("where", "1=1"),
                "outFields": self.config.get("out_fields", "*"),
                "returnGeometry": "true",
                "outSR": 4326,
                "f": "json",
                "resultOffset": offset,
                "resultRecordCount": min(page, limit - len(rows)),
            }
            data = self.get(url.rstrip("/") + "/query", params=params).json()
            if "error" in data:
                raise ConnectorError(f"ArcGIS error: {data['error']}")
            feats = data.get("features", [])
            pages += 1
            for f in feats:
                attrs = dict(f.get("attributes") or {})
                g = f.get("geometry") or {}
                if "x" in g and "y" in g:
                    attrs["_lng"], attrs["_lat"] = g["x"], g["y"]
                elif "rings" in g:
                    attrs["_lat"], attrs["_lng"] = polygon_centroid({"type": "Polygon", "coordinates": g["rings"]})
                rows.append(attrs)
            if not feats or not data.get("exceededTransferLimit"):
                break
            offset += len(feats)
            self.pause()
        res = self._map_rows(rows, url)
        res.pages = pages
        return res


class SocrataConnector(FileImportConnector):
    """Socrata Open Data API (SODA), e.g. opendata.maryland.gov."""

    key = "socrata"
    name = "Socrata open-data portal"
    page_delay_seconds = 1.0

    def fetch(self, max_records: int | None = None, **_: Any) -> FetchResult:
        domain, ds = self.config.get("domain"), self.config.get("dataset_id")
        if not domain or not ds:
            raise NotConfigured("config.domain and config.dataset_id are required")
        if not self.config.get("field_map"):
            raise NotConfigured("config.field_map is empty — see the dataset's columns.json")
        url = f"https://{domain}/resource/{ds}.json"
        page = int(self.config.get("page_size", 1000))
        limit = int(max_records or self.config.get("max_records", 5000))
        rows: list[dict] = []
        pages = 0
        while len(rows) < limit:
            params = {"$limit": min(page, limit - len(rows)), "$offset": len(rows), "$order": ":id"}
            if self.config.get("where"):
                params["$where"] = self.config["where"]
            batch = self.get(url, params=params).json()
            pages += 1
            rows += batch
            if len(batch) < params["$limit"]:
                break
            self.pause()
        res = self._map_rows(rows, url)
        res.pages = pages
        return res


class HudHomesConnector(FileImportConnector):
    """HUD Home Store listings. HUD publishes no public API: an admin downloads the search
    results export from hudhomestore.gov and uploads it here. These ARE public availability
    listings (government-owned homes), so listing_status is set to active — still verify."""

    key = "hud_homes"
    name = "HUD Home Store (uploaded export)"
    category = "listings"
    default_license = "U.S. government work (public)"
    default_permitted_use = "Public listing information; bids only through a HUD-registered broker."

    def __init__(self, *a: Any, **kw: Any):
        super().__init__(*a, **kw)
        d = self.config.setdefault("defaults", {})
        d.setdefault("listing_status", "active")
        d.setdefault("opportunity_types", ["hud_home", "reo"])


class RealEstateDatasetConnector(FileImportConnector):
    """Bulk nationwide public-records files (CSV/Parquet) from the 'RealEstateDataset' provider
    named in the project brief. Its distribution URL, schema and license could not be confirmed
    while building this, so the URL, field map and license must be set by an admin before use."""

    key = "realestatedataset_bulk"
    name = "RealEstateDataset bulk files (CSV / Parquet)"
    category = "property"

    def fetch(self, content: bytes | None = None, filename: str | None = None, **kw: Any) -> FetchResult:
        if not self.license:
            raise NotConfigured("record the dataset's license/permitted use before importing")
        res = super().fetch(content=content, filename=filename, **kw)
        return res


# ---------------------------------------------------------------- enrichment
class FemaFloodConnector(Connector):
    key = "fema_nfhl"
    name = "FEMA National Flood Hazard Layer"
    category = "enrichment"
    default_license = "U.S. government work (public domain)"
    default_permitted_use = "Informational; not a substitute for an official flood determination."
    docs_url = "https://hazards.fema.gov/femaportal/wps/portal/NFHLWMS"

    def fetch(self, lat: float | None = None, lng: float | None = None, **_: Any) -> FetchResult:
        if lat is None or lng is None:
            raise ConnectorError("lat/lng required")
        url = self.config.get("layer_url", "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28")
        data = self.get(url.rstrip("/") + "/query", params={
            "geometry": f"{lng},{lat}", "geometryType": "esriGeometryPoint", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects", "outFields": "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
            "returnGeometry": "false", "f": "json",
        }).json()
        feats = data.get("features") or []
        a = feats[0]["attributes"] if feats else {}
        return FetchResult(enrichment={"fema": {
            "flood_zone": a.get("FLD_ZONE") or ("not mapped" if not feats else None),
            "zone_subtype": a.get("ZONE_SUBTY"),
            "special_flood_hazard_area": a.get("SFHA_TF") == "T",
            "source_url": url, "license": self.license,
        }})


class CensusACSConnector(Connector):
    key = "census_acs"
    name = "U.S. Census ACS 5-year (ZCTA)"
    category = "enrichment"
    default_license = "U.S. government work (public domain)"
    default_permitted_use = "Neighborhood context only. Never used to score or match on protected characteristics."
    docs_url = "https://www.census.gov/data/developers/data-sets/acs-5year.html"
    VARS: ClassVar[dict[str, str]] = {
        "B01003_001E": "population",
        "B19013_001E": "median_household_income",
        "B25077_001E": "median_home_value",
        "B25002_001E": "housing_units",
        "B25002_003E": "vacant_units",
        "B25003_001E": "occupied_units",
        "B25003_002E": "owner_occupied_units",
    }

    def fetch(self, zip_code: str | None = None, **_: Any) -> FetchResult:
        if not zip_code:
            raise ConnectorError("zip_code required")
        year = self.config.get("year", 2023)
        url = f"https://api.census.gov/data/{year}/acs/acs5"
        params = {"get": ",".join(self.VARS), "for": f"zip code tabulation area:{zip_code[:5]}"}
        key = self.credential()
        if key:
            params["key"] = key
        data = self.get(url, params=params).json()
        if len(data) < 2:
            return FetchResult(errors=[f"no ACS data for ZCTA {zip_code}"])
        row = dict(zip(data[0], data[1], strict=False))
        vals = {name: to_float(row.get(var)) for var, name in self.VARS.items()}
        vals = {k: (v if v is not None and v >= 0 else None) for k, v in vals.items()}  # negative = suppressed
        if vals.get("housing_units") and vals.get("vacant_units") is not None:
            vals["vacancy_rate_pct"] = round(vals["vacant_units"] / vals["housing_units"] * 100, 1)
        if vals.get("occupied_units") and vals.get("owner_occupied_units") is not None:
            vals["owner_occupied_pct"] = round(vals["owner_occupied_units"] / vals["occupied_units"] * 100, 1)
        vals.update({"acs_year": year, "source_url": url, "license": self.license})
        return FetchResult(enrichment={"census": vals})

    credential_env_var = None  # key optional for low volume

    def credential(self) -> str | None:  # optional key
        from ..config import get_settings

        return get_settings().census_api_key


class HudFmrConnector(Connector):
    key = "hud_fmr"
    name = "HUD Fair Market Rents API"
    category = "enrichment"
    cost_tier = "free_key"
    credential_env_var = "DEALBRIDGE_HUD_API_TOKEN"
    default_license = "U.S. government work (public)"
    default_permitted_use = "Rent context for exit-strategy (rental) fallback analysis."
    docs_url = "https://www.huduser.gov/portal/dataset/fmr-api.html"

    def fetch(self, entity_id: str | None = None, **_: Any) -> FetchResult:
        self.check_ready()
        if not entity_id:
            raise ConnectorError("entity_id required (county: state+county FIPS + '99999')")
        url = f"https://www.huduser.gov/hudapi/public/fmr/data/{entity_id}"
        data = self.get(url, headers={"Authorization": f"Bearer {self.credential()}"}).json().get("data", {})
        basic = data.get("basicdata")
        if isinstance(basic, list):
            basic = next((b for b in basic if b.get("zip_code") in (None, "MSA level")), basic[0] if basic else {})
        basic = basic or {}
        fmr = {k: to_float(basic.get(k)) for k in ("Efficiency", "One-Bedroom", "Two-Bedroom", "Three-Bedroom", "Four-Bedroom")}
        return FetchResult(enrichment={"hud_fmr": {"area": data.get("area_name"), "year": data.get("year"),
                                                   "fmr": fmr, "source_url": url, "license": self.license}})


class FhfaHpiConnector(Connector):
    """FHFA House Price Index (official CSV download). Produces annual appreciation per place."""

    key = "fhfa_hpi"
    name = "FHFA House Price Index"
    category = "enrichment"
    default_license = "U.S. government work (public domain)"
    default_permitted_use = "Regional appreciation trends for comp time adjustments."
    docs_url = "https://www.fhfa.gov/data/hpi/datasets"

    def fetch(self, content: bytes | None = None, place_ids: list[str] | None = None, **_: Any) -> FetchResult:
        url = self.config.get("url")
        if content is None:
            if not url:
                raise NotConfigured("set config.url to the FHFA HPI master CSV or upload it")
            content = self.get(url).content
        rows = read_tabular(content, "csv")
        flavor = self.config.get("hpi_flavor", "all-transactions")
        wanted = set(place_ids or self.config.get("place_ids") or [])
        series: dict[str, list[tuple[int, int, float, str, str]]] = {}
        for r in rows:
            if wanted and r.get("place_id") not in wanted:
                continue
            if r.get("hpi_flavor") != flavor:
                continue
            idx = to_float(r.get("index_nsa"))
            if idx is None:
                continue
            series.setdefault(r["place_id"], []).append(
                (int(r["yr"]), int(r["period"]), idx, r.get("place_name", ""), r.get("frequency", ""))
            )
        out = {}
        for pid, pts in series.items():
            pts.sort()
            freq = pts[-1][4]
            back = 12 if freq == "monthly" else 4
            if len(pts) <= back:
                continue
            latest, prior = pts[-1], pts[-1 - back]
            annual = latest[2] / prior[2] - 1
            out[pid] = {
                "place_name": latest[3], "latest_period": f"{latest[0]}-{latest[1]:02d}", "frequency": freq,
                "annual_change_pct": round(annual * 100, 2),
                "monthly_appreciation_pct": round(((1 + annual) ** (1 / 12) - 1) * 100, 4),
            }
        return FetchResult(enrichment={"fhfa": out, "source_url": url, "license": self.license})


class EpaEchoConnector(Connector):
    """EPA ECHO facility search near a point (regulated facilities / violations)."""

    key = "epa_echo"
    name = "EPA ECHO regulated facilities nearby"
    category = "enrichment"
    default_license = "U.S. government work (public domain)"
    default_permitted_use = "Environmental context; not a Phase I environmental assessment."
    docs_url = "https://echo.epa.gov/tools/web-services"

    def fetch(self, lat: float | None = None, lng: float | None = None, **_: Any) -> FetchResult:
        if lat is None or lng is None:
            raise ConnectorError("lat/lng required")
        radius = self.config.get("radius_miles", 1)
        url = "https://echodata.epa.gov/echo/echo_rest_services.get_facilities"
        data = self.get(url, params={"output": "JSON", "p_lat": lat, "p_long": lng, "p_radius": radius}).json()
        res = data.get("Results", {})
        return FetchResult(enrichment={"epa": {
            "radius_miles": radius,
            "facilities": to_float(res.get("QueryRows")),
            "current_violations": to_float(res.get("CVRows")),
            "significant_violators": to_float(res.get("SVRows")),
            "source_url": url, "license": self.license,
        }})


# ---------------------------------------------------------------- optional paid / licensed modules
class PaidPlaceholder(Connector):
    """Disabled-by-default integration point for a commercial or licensed feed.

    These are intentionally NOT implemented against live APIs in the free MVP. To enable one:
    sign the provider's agreement, set its credential env var, implement `fetch` against the
    provider's documented API, and enable the DataSource. See docs/DATA_SOURCES.md for the
    cost/benefit write-up required before purchasing.
    """

    cost_tier = "paid"

    def fetch(self, **_: Any) -> FetchResult:
        self.check_ready()
        raise NotConfigured(f"{self.name} is an optional paid module and is not implemented in the free MVP")


def _paid(key: str, name: str, env: str, docs: str, category: str = "property") -> type[PaidPlaceholder]:
    return type(f"{key.title().replace('_', '')}Connector", (PaidPlaceholder,), {
        "key": key, "name": name, "credential_env_var": env, "docs_url": docs, "category": category,
    })


PAID = [
    _paid("attom", "ATTOM Data (property, AVM, foreclosure)", "DEALBRIDGE_ATTOM_API_KEY", "https://api.developer.attomdata.com/docs"),
    _paid("rentcast", "RentCast (property records, sale comps, rents)", "DEALBRIDGE_RENTCAST_API_KEY", "https://developers.rentcast.io/"),
    _paid("propertyradar", "PropertyRadar (pre-foreclosure, owner data)", "DEALBRIDGE_PROPERTYRADAR_API_KEY", "https://developers.propertyradar.com/"),
    _paid("reso_mls", "MLS via licensed RESO Web API feed", "DEALBRIDGE_RESO_TOKEN", "https://www.reso.org/reso-web-api/", "listings"),
    _paid("zillow_bridge", "Zillow / Bridge Interactive (authorized partners only)", "DEALBRIDGE_BRIDGE_TOKEN", "https://www.bridgeinteractive.com/", "listings"),
    _paid("realtor_com", "Realtor.com (authorized access only)", "DEALBRIDGE_REALTOR_API_KEY", "https://www.realtor.com/", "listings"),
    _paid("auction_com", "Auction.com (authorized access only)", "DEALBRIDGE_AUCTION_COM_KEY", "https://www.auction.com/", "listings"),
]

REGISTRY: dict[str, type[Connector]] = {
    c.key: c
    for c in [FileImportConnector, ArcGISFeatureConnector, SocrataConnector, HudHomesConnector,
              RealEstateDatasetConnector, FemaFloodConnector, CensusACSConnector, HudFmrConnector,
              FhfaHpiConnector, EpaEchoConnector, *PAID]
}
