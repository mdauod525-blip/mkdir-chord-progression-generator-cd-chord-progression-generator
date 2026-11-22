import io
import json
from types import SimpleNamespace

import httpx
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from sqlalchemy import select

from app.connectors.base import NotConfigured, read_tabular, to_date
from app.connectors.providers import ArcGISFeatureConnector, CensusACSConnector, FemaFloodConnector, FileImportConnector
from app.models import AIUsage, ComparableSale, DataSource, Property, PropertySourceRecord
from app.services import ai
from app.services.addresses import address_key
from app.services.ingest import run_source
from app.services.settings_store import set_setting

FM = {"address_line": "ADDR", "city": "CITY", "zip_code": "ZIP", "parcel_id": "PIN", "assessed_value": "ASSESSED",
      "sqft": "SQFT", "year_built": "YRBLT"}


def mock_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_address_normalization():
    assert address_key("100 North Main Street Apt 4", "X", "VA", "20175-1234") == "100 N MAIN ST|4|20175"
    assert address_key("100 N. Main St, #4", "X", "VA", "20175") == "100 N MAIN ST|4|20175"


def test_dates():
    assert str(to_date("2026-03-04")) == "2026-03-04"
    assert str(to_date("03/04/2026")) == "2026-03-04"
    assert str(to_date(1772582400000)) == "2026-03-04"


def test_read_formats():
    assert read_tabular(b"a,b\n1,2\n", "csv") == [{"a": "1", "b": "2"}]
    gj = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"a": 1},
                                                     "geometry": {"type": "Point", "coordinates": [-77.5, 39.1]}}]}
    assert read_tabular(json.dumps(gj).encode(), "geojson")[0]["_lat"] == 39.1
    buf = io.BytesIO()
    pq.write_table(pa.table({"a": [1, 2]}), buf)
    assert read_tabular(buf.getvalue(), "parquet") == [{"a": 1}, {"a": 2}]


def test_arcgis_paging_and_mapping():
    calls = []

    def handler(req):
        off = int(req.url.params["resultOffset"])
        calls.append(off)
        feats = [{"attributes": {"ADDR": f"{off + i} Oak St", "CITY": "LEESBURG", "ZIP": "20175", "PIN": f"P{off + i}",
                                 "ASSESSED": "350,000", "SQFT": 1500, "YRBLT": 1990}, "geometry": {"x": -77.5, "y": 39.1}}
                 for i in range(2)]
        return httpx.Response(200, json={"features": feats, "exceededTransferLimit": off < 2})

    c = ArcGISFeatureConnector(config={"layer_url": "https://gis.example/arcgis/rest/services/P/FeatureServer/0",
                                       "page_size": 2, "field_map": FM, "defaults": {"state": "VA"}},
                               client=mock_client(handler))
    c.page_delay_seconds = 0
    res = c.fetch(max_records=10)
    assert calls == [0, 2]
    assert len(res.properties) == 4
    p = res.properties[0]
    assert p.assessed_value == 350000 and p.lat == 39.1 and p.city == "Leesburg"
    assert p.listing_status is None  # assessment records never imply availability
    assert p.provenance.data_provider == "arcgis_feature"


def test_connector_refuses_without_mapping():
    with pytest.raises(NotConfigured):
        ArcGISFeatureConnector(config={"layer_url": "https://x.example/0"}).fetch()
    with pytest.raises(NotConfigured):
        FileImportConnector(config={}).fetch()


def test_ingest_dedupes_and_records_provenance(db):
    csv = b"ADDR,CITY,ZIP,PIN,ASSESSED\n12 Elm Street,Leesburg,20175,P1,300000\n12 Elm St,Leesburg,20175,P1,310000\n"
    src = DataSource(key="t_csv", name="Test CSV", connector="file_import", category="property", license="Public record",
                     config={"field_map": FM, "defaults": {"state": "VA"}})
    db.add(src)
    db.flush()
    run = run_source(db, src, content=csv, filename="x.csv")
    assert run.status == "succeeded" and run.records_created == 1
    props = db.scalars(select(Property)).all()
    assert len(props) == 1
    p = props[0]
    assert p.assessed_value == 310000 and p.data_provider == "t_csv" and p.license == "Public record"
    assert p.listing_status == "unknown" and p.retrieved_at is not None
    assert len(db.scalars(select(PropertySourceRecord)).all()) == 1


def test_sale_import_creates_comps(db):
    csv = b"address,city,state,zip,sale_price,sale_date\n9 Comp Rd,Leesburg,VA,20175,\"$455,000\",2026-09-01\n"
    src = DataSource(key="t_sales", name="Sales", connector="file_import", category="sales",
                     config={"record_type": "sale", "field_map": {"address_line": "address", "city": "city", "state": "state",
                                                                  "zip_code": "zip", "sale_price": "sale_price",
                                                                  "sale_date": "sale_date"}})
    db.add(src)
    db.flush()
    run_source(db, src, content=csv, filename="s.csv")
    run_source(db, src, content=csv, filename="s.csv")  # re-import is idempotent
    comps = db.scalars(select(ComparableSale)).all()
    assert len(comps) == 1 and comps[0].sale_price == 455000 and comps[0].source_type == "recorded_deed"


def test_fema_and_census_parsing():
    fema = FemaFloodConnector(client=mock_client(lambda r: httpx.Response(200, json={
        "features": [{"attributes": {"FLD_ZONE": "AE", "ZONE_SUBTY": None, "SFHA_TF": "T"}}]})))
    e = fema.fetch(lat=39.1, lng=-77.5).enrichment["fema"]
    assert e["flood_zone"] == "AE" and e["special_flood_hazard_area"]
    header = list(CensusACSConnector.VARS) + ["zip code tabulation area"]
    census = CensusACSConnector(client=mock_client(lambda r: httpx.Response(200, json=[
        header, ["30000", "150000", "600000", "10000", "500", "9500", "7000", "20175"]])))
    c = census.fetch(zip_code="20175").enrichment["census"]
    assert c["median_household_income"] == 150000 and c["vacancy_rate_pct"] == 5.0


def test_failed_source_is_recorded_not_raised(db):
    src = DataSource(key="t_fail", name="Fail", connector="arcgis_feature", category="property",
                     config={"layer_url": "https://x.example/0", "field_map": FM})
    db.add(src)
    db.flush()
    run = run_source(db, src, client=mock_client(lambda r: httpx.Response(403)))
    assert run.status == "failed" and "access denied" in run.errors[0]


# ------------------------------------------------------------------ AI cost control
class FakeClient:
    def __init__(self, text="Explanation.", in_tok=1000, out_tok=200):
        self.calls = 0
        outer = self

        class Msgs:
            def create(self, **kw):
                outer.calls += 1
                outer.kwargs = kw
                return SimpleNamespace(stop_reason="end_turn", model=kw["model"],
                                       usage=SimpleNamespace(input_tokens=in_tok, output_tokens=out_tok),
                                       content=[SimpleNamespace(type="text", text=text)])

        self.beta = SimpleNamespace(messages=Msgs())


def test_ai_disabled_without_key(db):
    with pytest.raises(ai.AIUnavailable):
        ai.generate(db, "deal_explanation", {"x": 1})


def test_ai_cache_and_usage(db):
    fc = FakeClient()
    t1 = ai.generate(db, "deal_explanation", {"x": 1}, client=fc)
    t2 = ai.generate(db, "deal_explanation", {"x": 1}, client=fc)
    assert t1 == t2 and fc.calls == 1
    assert fc.kwargs["fallbacks"] == "default" and fc.kwargs["output_config"]["effort"] == "low"
    rows = db.scalars(select(AIUsage)).all()
    assert [r.cache_hit for r in rows] == [False, True]
    assert rows[0].cost_usd == pytest.approx(1000 / 1e6 * 4 + 200 / 1e6 * 20)


def test_ai_budget_and_daily_limit(db):
    fc = FakeClient()
    set_setting(db, "ai_monthly_budget_usd", 0.0)
    with pytest.raises(ai.AIUnavailable, match="budget"):
        ai.generate(db, "risk_factors", {"x": 2}, client=fc)
    assert fc.calls == 0
    set_setting(db, "ai_monthly_budget_usd", 100.0)
    set_setting(db, "ai_daily_request_limit", 1)
    ai.generate(db, "risk_factors", {"x": 3}, client=fc)
    with pytest.raises(ai.AIUnavailable, match="daily"):
        ai.generate(db, "risk_factors", {"x": 4}, client=fc)
    assert fc.calls == 1


def test_ai_threshold_alerts(db):
    from app.models import AdminAlert

    set_setting(db, "ai_monthly_budget_usd", 0.05)
    fc = FakeClient(in_tok=5000, out_tok=800)  # $0.036 per call → crosses 50%
    ai.generate(db, "comp_summary", {"x": 5}, client=fc)
    db.flush()
    assert any("50%" in a.title for a in db.scalars(select(AdminAlert)))
