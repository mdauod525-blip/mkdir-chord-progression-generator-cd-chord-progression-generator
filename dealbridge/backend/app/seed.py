"""Reference data (markets, data-source catalog, templates, pricing) and optional DEMO data.

Demo records are fictional, flagged `is_demo=True`, attributed to provider "DEMO (fictional)",
and shown with a DEMO badge everywhere. They exist only to demonstrate the workflow and are
never mixed with real records (demo comps are never used for real properties, and demo deals
are only matched with demo investors).
"""
from __future__ import annotations

import random
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .analysis.assumptions import merged_assumptions
from .models import (
    ComparableSale,
    DataSource,
    Investor,
    Market,
    MarketAssumptions,
    PriceHistory,
    PricingTier,
    Property,
    User,
)
from .security import encrypt, hash_password
from .services.addresses import address_key

MARKETS = [
    dict(name="Loudoun County, VA", region="Northern Virginia", state="VA", counties=["Loudoun"],
         cities=["Leesburg", "Ashburn", "Sterling", "Purcellville", "Round Hill", "Lovettsville", "Hamilton", "Aldie", "South Riding"],
         zip_codes=["20105", "20132", "20141", "20147", "20148", "20152", "20158", "20164", "20165", "20166", "20175", "20176", "20180"],
         county_fips=["51107"], center_lat=39.09, center_lng=-77.64, profile="northern_virginia", fhfa="47894"),
    dict(name="Fairfax County, VA", region="Northern Virginia", state="VA", counties=["Fairfax"],
         cities=["Annandale", "Burke", "Fairfax", "Falls Church", "Lorton", "McLean", "Oakton", "Springfield", "Herndon", "Reston", "Vienna", "Centreville", "Chantilly", "Alexandria"],
         zip_codes=["20120", "20121", "20151", "20170", "20171", "20190", "20191", "20194", "22003", "22015", "22030", "22031", "22032", "22033", "22041", "22042", "22044", "22060", "22079", "22101", "22102", "22124", "22150", "22151", "22152", "22153", "22180", "22181", "22182", "22306", "22307", "22308", "22309", "22310", "22312", "22315"],
         county_fips=["51059"], center_lat=38.85, center_lng=-77.30, profile="northern_virginia", fhfa="47894"),
    dict(name="Prince William County, VA", region="Northern Virginia", state="VA", counties=["Prince William"],
         cities=["Manassas", "Bristow", "Gainesville", "Haymarket", "Woodbridge", "Dumfries", "Triangle", "Nokesville"],
         zip_codes=["20109", "20110", "20111", "20112", "20136", "20155", "20169", "20181", "22025", "22026", "22172", "22191", "22192", "22193"],
         county_fips=["51153", "51683", "51685"], center_lat=38.70, center_lng=-77.48, profile="northern_virginia", fhfa="47894"),
    dict(name="Arlington County, VA", region="Northern Virginia", state="VA", counties=["Arlington"], cities=["Arlington"],
         zip_codes=["22201", "22202", "22203", "22204", "22205", "22206", "22207", "22209", "22213"],
         county_fips=["51013"], center_lat=38.88, center_lng=-77.10, profile="northern_virginia", fhfa="47894"),
    dict(name="Alexandria & Falls Church cities, VA", region="Northern Virginia", state="VA",
         counties=["Alexandria City", "Falls Church City"], cities=["Alexandria", "Falls Church"],
         zip_codes=["22301", "22302", "22304", "22305", "22311", "22314", "22046"],
         county_fips=["51510", "51610"], center_lat=38.81, center_lng=-77.08, profile="northern_virginia", fhfa="47894"),
    dict(name="Winchester, VA", region="Shenandoah Valley", state="VA", counties=["Winchester City"], cities=["Winchester"],
         zip_codes=["22601"], county_fips=["51840"], center_lat=39.185, center_lng=-78.163, profile="shenandoah_valley_va", fhfa="49020"),
    dict(name="Frederick County, VA", region="Shenandoah Valley", state="VA", counties=["Frederick"],
         cities=["Stephens City", "Middletown", "Clear Brook", "Stephenson", "Gore", "Cross Junction"],
         zip_codes=["22602", "22603", "22624", "22625", "22637", "22645", "22655", "22656"],
         county_fips=["51069"], center_lat=39.20, center_lng=-78.26, profile="shenandoah_valley_va", fhfa="49020"),
    dict(name="Jefferson County, WV", region="Eastern Panhandle", state="WV", counties=["Jefferson"],
         cities=["Charles Town", "Ranson", "Harpers Ferry", "Shepherdstown", "Kearneysville", "Summit Point", "Shenandoah Junction", "Rippon"],
         zip_codes=["25414", "25425", "25430", "25438", "25441", "25442", "25443", "25446"],
         county_fips=["54037"], center_lat=39.30, center_lng=-77.86, profile="eastern_panhandle_wv", fhfa="47894"),
    dict(name="Berkeley County, WV", region="Eastern Panhandle", state="WV", counties=["Berkeley"],
         cities=["Martinsburg", "Inwood", "Hedgesville", "Falling Waters", "Bunker Hill", "Gerrardstown"],
         zip_codes=["25401", "25403", "25404", "25405", "25413", "25419", "25420", "25427", "25428"],
         county_fips=["54003"], center_lat=39.46, center_lng=-78.03, profile="eastern_panhandle_wv", fhfa="25180"),
]

PUBLIC = "U.S. government work (public domain)"
VERIFY = "Endpoint documented by the agency but not yet test-called from a deployed environment — verify before enabling."
SOURCES = [
    # ---- property records (free, need field mapping before first run)
    dict(key="md_sdat_parcels", name="Maryland SDAT parcel points (MD iMAP)", connector="arcgis_feature", category="property",
         license="State of Maryland open data — acknowledge the State of Maryland",
         permitted_use="Public assessment & ownership data; derived data must credit the State of Maryland.",
         base_url="https://geodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/0",
         config={"layer_url": "https://geodata.md.gov/imap/rest/services/PlanningCadastre/MD_PropertyData/MapServer/0",
                 "page_size": 2000, "field_map": {}, "defaults": {"state": "MD"}},
         notes="Max 2000 records/request. Use 'Describe' to list fields and set field_map. " + VERIFY),
    dict(key="md_open_data_parcels", name="Maryland Open Data — Parcel Points (Socrata x8a5-h2sy)", connector="socrata",
         category="property", license="State of Maryland open data",
         permitted_use="Public records; credit the State of Maryland.", base_url="https://opendata.maryland.gov",
         config={"domain": "opendata.maryland.gov", "dataset_id": "x8a5-h2sy", "field_map": {}, "defaults": {"state": "MD"}},
         notes="Columns: /api/views/x8a5-h2sy/columns.json. Monthly SDAT refresh. " + VERIFY),
    dict(key="dc_itspe", name="DC Integrated Tax System Public Extract", connector="arcgis_feature", category="property",
         license="DC Open Data (Creative Commons Attribution 4.0)", permitted_use="Public tax & sales records.",
         base_url="https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land/MapServer/53",
         config={"layer_url": "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land/MapServer/53",
                 "field_map": {}, "defaults": {"state": "DC", "city": "Washington"}},
         notes="Table layer (no geometry). Includes last sale price/date. Catalog also lists a newer services.arcgis.com copy. " + VERIFY),
    dict(key="dc_vacant_blighted", name="DC vacant & blighted properties (ITSPE subset)", connector="arcgis_feature",
         category="property", license="DC Open Data (CC BY 4.0)", permitted_use="Public records.",
         config={"layer_url": None, "field_map": {}, "defaults": {"state": "DC", "city": "Washington",
                                                                  "opportunity_types": ["vacant", "distressed"]}},
         notes="Set layer_url from the dataset page on opendata.dc.gov."),
    dict(key="fairfax_parcels", name="Fairfax County parcels (Open Data A9)", connector="arcgis_feature", category="property",
         license="Fairfax County open data terms", permitted_use="Public parcel data.",
         base_url="https://www.fairfaxcounty.gov/mercator/rest/services/OpenData/OpenData_A9/FeatureServer/0",
         config={"layer_url": "https://www.fairfaxcounty.gov/mercator/rest/services/OpenData/OpenData_A9/FeatureServer/0",
                 "page_size": 1000, "field_map": {}, "defaults": {"state": "VA", "county": "Fairfax"}},
         notes="Join assessed values / sales tables by PARID (see county DTA assessment-table PDF). " + VERIFY),
    dict(key="fairfax_sales", name="Fairfax County real estate sales (Tax Administration)", connector="arcgis_feature",
         category="sales", license="Fairfax County open data terms", permitted_use="Recorded sales for comparable analysis.",
         config={"layer_url": None, "record_type": "sale", "field_map": {},
                 "defaults": {"state": "VA", "county": "Fairfax", "source_type": "recorded_deed"}},
         notes="Set layer_url to the Tax Administration sales table from the county REST directory."),
    dict(key="wv_statewide_parcels", name="West Virginia statewide parcels (WV GIS Technical Center)", connector="arcgis_feature",
         category="property", license="WV GIS Technical Center — provided as-is",
         permitted_use="Public parcel data; county assessors are authoritative.",
         base_url="https://services.wvgis.wvu.edu/arcgis/rest/services/Planning_Cadastre/WV_Parcels/MapServer/0",
         config={"layer_url": "https://services.wvgis.wvu.edu/arcgis/rest/services/Planning_Cadastre/WV_Parcels/MapServer/0",
                 "where": "1=1", "field_map": {}, "defaults": {"state": "WV"}},
         notes="Filter 'where' to Jefferson/Berkeley. Service names have moved before — check the REST directory. " + VERIFY),
    *[dict(key=f"{slug}_gis", name=f"{label} GIS parcels / assessments", connector="arcgis_feature", category="property",
           license="County open data terms (confirm on portal)", permitted_use="Public parcel/assessment data.",
           config={"layer_url": None, "field_map": {}, "defaults": {"state": st, "county": county}},
           notes="Find the parcel/assessment layer in the county's ArcGIS REST directory and set layer_url + field_map.")
      for slug, label, st, county in [
          ("loudoun", "Loudoun County", "VA", "Loudoun"), ("prince_william", "Prince William County", "VA", "Prince William"),
          ("arlington", "Arlington County", "VA", "Arlington"), ("frederick_va", "Frederick County VA", "VA", "Frederick"),
          ("winchester", "City of Winchester", "VA", "Winchester City"), ("jefferson_wv", "Jefferson County WV", "WV", "Jefferson"),
          ("berkeley_wv", "Berkeley County WV", "WV", "Berkeley")]],
    dict(key="county_sales_csv", name="County recorded-sales CSV import", connector="file_import", category="sales",
         license="Public record", permitted_use="Recorded sales for comparable analysis.",
         config={"record_type": "sale", "field_map": {"address_line": ["address", "situs_address"], "city": "city",
                                                      "state": "state", "zip_code": ["zip", "zip_code"],
                                                      "sale_price": ["sale_price", "price"], "sale_date": ["sale_date", "date"],
                                                      "sqft": ["sqft", "living_area"], "beds": ["beds", "bedrooms"],
                                                      "baths": ["baths", "bathrooms"], "sale_type": "sale_type",
                                                      "parcel_id": ["parcel_id", "pin"], "lat": "lat", "lng": ["lng", "lon"]},
                 "defaults": {"source_type": "recorded_deed"}},
         notes="Upload a CSV/JSON/GeoJSON/Parquet of recorded sales downloaded from a county portal."),
    dict(key="hud_homes", name="HUD Home Store listings (uploaded export)", connector="hud_homes", category="listings",
         license=PUBLIC, permitted_use="Public HUD listings; bids only via HUD-registered brokers.",
         base_url="https://www.hudhomestore.gov",
         config={"field_map": {"address_line": ["Address", "address"], "city": ["City", "city"], "state": ["State", "state"],
                               "zip_code": ["Zip", "zip", "Zip Code"], "list_price": ["List Price", "Price", "list_price"],
                               "beds": ["Beds", "Bedrooms"], "baths": ["Baths", "Bathrooms"], "sqft": ["Sq Ft", "SqFt"],
                               "year_built": ["Year Built"], "external_id": ["Case Number", "case_number"],
                               "listing_url": ["URL", "Link"]}},
         notes="No public API: download search results from hudhomestore.gov and upload here."),
    dict(key="realestatedataset_bulk", name="RealEstateDataset bulk import (CSV / Parquet)", connector="realestatedataset_bulk",
         category="property", license=None, permitted_use=None,
         config={"url": None, "format": "parquet", "field_map": {}},
         notes="Provider URL, schema and license could not be confirmed during the build. Record the license, then set url + field_map."),
    # ---- enrichment (free)
    dict(key="fema_nfhl", name="FEMA flood zones (NFHL)", connector="fema_nfhl", category="enrichment", license=PUBLIC,
         permitted_use="Informational; not an official flood determination.", enabled=True,
         base_url="https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28", config={}, notes=VERIFY),
    dict(key="census_acs", name="U.S. Census ACS 5-year (ZCTA)", connector="census_acs", category="enrichment",
         license=PUBLIC, permitted_use="Neighborhood context only; never used for scoring or matching.", enabled=True,
         base_url="https://api.census.gov/data", config={"year": 2023},
         notes="Optional free key: DEALBRIDGE_CENSUS_API_KEY. " + VERIFY),
    dict(key="epa_echo", name="EPA ECHO facilities nearby", connector="epa_echo", category="enrichment", license=PUBLIC,
         permitted_use="Environmental context; not a Phase I ESA.", enabled=True,
         base_url="https://echodata.epa.gov", config={"radius_miles": 1}, notes=VERIFY),
    dict(key="hud_fmr", name="HUD Fair Market Rents", connector="hud_fmr", category="enrichment", cost_tier="free_key",
         license=PUBLIC, permitted_use="Rent context.", requires_credentials=True,
         credential_env_var="DEALBRIDGE_HUD_API_TOKEN", base_url="https://www.huduser.gov/hudapi/public/fmr",
         config={}, notes="Free token from huduser.gov. County entity id = state+county FIPS + 99999."),
    dict(key="fhfa_hpi", name="FHFA House Price Index (master CSV)", connector="fhfa_hpi", category="enrichment",
         license=PUBLIC, permitted_use="Appreciation trend for comp time adjustments.", schedule="monthly",
         base_url="https://www.fhfa.gov/data/hpi/datasets",
         config={"url": None, "hpi_flavor": "all-transactions", "place_ids": ["47894", "49020", "25180"]},
         notes="Download the HPI master CSV from fhfa.gov and upload it; markets use their fhfa_place_id."),
    # ---- optional paid modules (disabled; see docs/DATA_SOURCES.md)
    *[dict(key=k, name=n, connector=k, category=c, cost_tier="paid", requires_credentials=True, credential_env_var=e,
           license="Commercial license required", permitted_use="Per provider agreement",
           notes="Optional paid module — not used in the free MVP.")
      for k, n, c, e in [
          ("attom", "ATTOM Data", "property", "DEALBRIDGE_ATTOM_API_KEY"),
          ("rentcast", "RentCast (incl. former Realty Mole)", "property", "DEALBRIDGE_RENTCAST_API_KEY"),
          ("propertyradar", "PropertyRadar", "property", "DEALBRIDGE_PROPERTYRADAR_API_KEY"),
          ("reso_mls", "MLS (licensed RESO Web API)", "listings", "DEALBRIDGE_RESO_TOKEN"),
          ("zillow_bridge", "Zillow / Bridge (authorized only)", "listings", "DEALBRIDGE_BRIDGE_TOKEN"),
          ("realtor_com", "Realtor.com (authorized only)", "listings", "DEALBRIDGE_REALTOR_API_KEY"),
          ("auction_com", "Auction.com (authorized only)", "listings", "DEALBRIDGE_AUCTION_COM_KEY")]],
]

PRICING = [
    dict(key="investor_basic", name="Investor — Basic", audience="investor", monthly_price=49, annual_price=490, sort_order=1,
         features=["Marketplace access", "Deal alerts for your markets", "Financial breakdowns"], limits={"saved_deals": 25}),
    dict(key="investor_pro", name="Investor — Pro", audience="investor", monthly_price=149, annual_price=1490, sort_order=2,
         features=["Everything in Basic", "Priority alerts", "Full comp detail", "Weekly report"], limits={"saved_deals": 500}),
    dict(key="wholesaler", name="Wholesaler", audience="wholesaler", monthly_price=99, annual_price=990, sort_order=1,
         features=["Submit opportunities", "Automated underwriting of submissions"], limits={"submissions_per_month": 20}),
    dict(key="saas_team", name="SaaS — Team", audience="saas", monthly_price=399, annual_price=3990, sort_order=1,
         features=["Private workspace", "Deal analyzer", "CRM", "Your own investor network"], limits={"seats": 5}),
]


def seed_reference(db: Session) -> None:
    for m in MARKETS:
        m = dict(m)
        profile, fhfa = m.pop("profile"), m.pop("fhfa")
        existing = db.scalar(select(Market).where(Market.name == m["name"]))
        if existing:
            continue
        mk = Market(**m)
        mk.assumptions = MarketAssumptions(
            values={**merged_assumptions(profile), "fhfa_place_id": fhfa},
            notes=f"Seeded from '{profile}' profile — estimates; review against local quotes.")
        db.add(mk)
    for s in SOURCES:
        s = dict(s)
        if db.scalar(select(DataSource).where(DataSource.key == s["key"])):
            continue
        s.setdefault("enabled", False)
        s.setdefault("schedule", "weekly" if s["category"] in ("property", "sales") else "manual")
        db.add(DataSource(**s))
    for t in PRICING:
        if not db.scalar(select(PricingTier).where(PricingTier.key == t["key"])):
            db.add(PricingTier(**t))
    db.flush()


def create_user(db: Session, email: str, password: str, role: str = "admin", name: str = "Administrator") -> User:
    u = db.scalar(select(User).where(User.email == email.lower()))
    if u:
        return u
    # Investor logins start unapproved: staff verify identity, then grant marketplace access.
    u = User(email=email.lower(), password_hash=hash_password(password), full_name=name, role=role,
             is_approved=role != "investor")
    db.add(u)
    db.flush()
    return u


# ------------------------------------------------------------------ DEMO data
DEMO_PROVIDER = "DEMO (fictional sample data)"
DEMO_NOTE = "DEMO — fictional record for demonstration only. Not a real property, listing or sale."

DEMO_PROPERTIES = [
    # (market, street, city, zip, lat, lng, type, beds, baths, sqft, year, condition, list, dom, opp, signals, subdivision)
    ("Loudoun County, VA", "412 Larkmoor Ct", "Leesburg", "20175", 39.1052, -77.5701, "single_family", 4, 2.5, 2150, 1989,
     "poor", 489000, 74, ["estate_sale", "needs_renovation", "extended_dom"], ["roof", "kitchen"], "Demo Glen"),
    ("Loudoun County, VA", "21880 Fernhollow Sq", "Ashburn", "20147", 39.0437, -77.4875, "townhouse", 3, 2.5, 1720, 1996,
     "fair", 455000, 41, ["price_reduced"], [], "Demo Commons"),
    ("Fairfax County, VA", "7318 Quillbrook Rd", "Springfield", "22150", 38.7807, -77.1870, "single_family", 4, 2, 1890, 1962,
     "distressed", 520000, 12, ["reo", "vacant"], ["electrical", "plumbing", "water_damage"], "Demo Hills"),
    ("Fairfax County, VA", "3105 Ostlin Pl", "Fairfax", "22031", 38.8601, -77.2705, "single_family", 3, 2, 1460, 1958,
     "fair", 610000, 95, ["probate", "extended_dom"], [], "Demo Park"),
    ("Prince William County, VA", "14627 Cardinal Wren Dr", "Woodbridge", "22193", 38.6362, -77.3279, "single_family", 4, 3, 2240, 1984,
     "poor", 415000, 58, ["pre_foreclosure", "needs_renovation"], ["hvac"], "Demo Ridge"),
    ("Prince William County, VA", "9012 Bristlecone Way", "Manassas", "20110", 38.7509, -77.4753, "townhouse", 3, 2.5, 1560, 1991,
     "good", 389000, 22, ["fsbo"], [], "Demo Station"),
    ("Arlington County, VA", "2219 N Vellum St", "Arlington", "22207", 38.9001, -77.1302, "single_family", 3, 1, 1240, 1941,
     "poor", 845000, 33, ["estate_sale"], ["electrical", "roof"], "Demo Heights"),
    ("Winchester, VA", "618 Tannery Mill Ln", "Winchester", "22601", 39.1771, -78.1689, "single_family", 3, 1.5, 1380, 1948,
     "poor", 239000, 67, ["vacant", "needs_renovation"], ["plumbing"], "Demo Old Town"),
    ("Frederick County, VA", "155 Shawnee Hollow Rd", "Stephens City", "22655", 39.0882, -78.2195, "single_family", 3, 2, 1650, 1995,
     "fair", 319000, 48, ["price_reduced"], [], "Demo Crossing"),
    ("Jefferson County, WV", "84 Halltown Orchard Dr", "Charles Town", "25414", 39.2905, -77.8592, "single_family", 4, 2.5, 2050, 2002,
     "fair", 335000, 88, ["auction", "extended_dom"], [], "Demo Orchard"),
    ("Berkeley County, WV", "1207 Tuscarora Bend", "Martinsburg", "25404", 39.4823, -77.9311, "single_family", 3, 2, 1520, 1979,
     "poor", 189000, 105, ["foreclosure", "reo"], ["roof", "foundation"], "Demo Run"),
    ("Berkeley County, WV", "56 Sleepy Creek Ln", "Hedgesville", "25427", 39.5512, -78.0450, "manufactured", 3, 2, 1200, 1998,
     "unknown", 129000, 18, ["fsbo"], [], None),
]

# ARV $/sqft for renovated homes in each demo area (fictional calibration for the demo only)
DEMO_PPSF = {"20175": 285, "20147": 300, "22150": 395, "22031": 520, "22193": 245, "20110": 270, "22207": 900,
             "22601": 235, "22655": 230, "25414": 205, "25404": 195, "25427": 150}


# Demo asking price as a fraction of the demo ARV level: a realistic mix of discounted distressed
# listings and retail-priced ones that the engine should reject.
DEMO_PRICE_RATIO = {"20175": 0.60, "20147": 0.80, "22150": 0.52, "22031": 0.68, "22193": 0.56, "20110": 0.90,
                    "22207": 0.62, "22601": 0.46, "22655": 0.72, "25414": 0.66, "25404": 0.40, "25427": 0.70}


def seed_demo(db: Session, today: date | None = None) -> dict:
    today = today or date.today()
    rng = random.Random(20261122)
    markets = {m.name: m for m in db.scalars(select(Market))}
    now = datetime.now(UTC)
    n_props = n_comps = 0
    for (mname, street, city, z, lat, lng, ptype, beds, baths, sqft, year, cond, price, dom, opp, signals,
         subdiv) in DEMO_PROPERTIES:
        state = "WV" if z.startswith("25") else "VA"
        key = address_key(street, city, state, z)
        if db.scalar(select(Property).where(Property.address_key == key)):
            continue
        m = markets.get(mname)
        price = round(sqft * DEMO_PPSF[z] * DEMO_PRICE_RATIO[z], -3)
        p = Property(
            address_key=key, address_line=street, city=city, state=state, zip_code=z, lat=lat, lng=lng,
            market_id=m.id if m else None, county=(m.counties[0] if m else None), subdivision=subdiv,
            property_type=ptype, beds=beds, baths=baths, sqft=sqft, lot_sqft=rng.choice([2200, 6500, 9800, 14000, 21780]),
            year_built=year, stories=2 if sqft > 1800 else 1, condition=cond, listing_status="active",
            list_price=price, original_list_price=round(price * (1.06 if "price_reduced" in opp else 1.0), -3),
            days_on_market=dom, listing_date=today - timedelta(days=dom),
            listing_url=None, assessed_value=round(price * rng.uniform(0.78, 0.95), -3), assessment_year=2026,
            annual_taxes=round(price * (0.0105 if state == "VA" else 0.0068), 0), hoa_monthly=95 if ptype == "townhouse" else None,
            opportunity_types=opp, distress_signals=signals, notes=DEMO_NOTE,
            seller_contact_enc=encrypt("DEMO seller contact (fictional) — 555-0100"),
            access_info_enc=encrypt("DEMO lockbox code (fictional)"),
            data_provider=DEMO_PROVIDER, source_url=None, retrieved_at=now, license="Fictional demo data",
            permitted_use="Demonstration only", verification_status="unverified", is_demo=True, status="new",
        )
        db.add(p)
        db.flush()
        if p.original_list_price and p.original_list_price != price:
            db.add(PriceHistory(property_id=p.id, event_date=today - timedelta(days=dom), event_type="listed",
                                price=p.original_list_price, data_provider=DEMO_PROVIDER, is_demo=True))
            db.add(PriceHistory(property_id=p.id, event_date=today - timedelta(days=max(dom // 3, 2)),
                                event_type="price_change", price=price, data_provider=DEMO_PROVIDER, is_demo=True))
        else:
            db.add(PriceHistory(property_id=p.id, event_date=today - timedelta(days=dom), event_type="listed",
                                price=price, data_provider=DEMO_PROVIDER, is_demo=True))
        n_props += 1

        # demo comps: renovated sales near the subject (fewer for the rural manufactured home)
        ppsf = DEMO_PPSF[z]
        count = 2 if ptype == "manufactured" else rng.randint(4, 7)
        for i in range(count):
            c_sqft = round(sqft * rng.uniform(0.85, 1.15), -1)
            c_beds = beds + rng.choice([0, 0, 0, 1, -1])
            c_price = round(c_sqft * ppsf * rng.uniform(0.94, 1.06), -3)
            d = today - timedelta(days=rng.randint(20, 200))
            c_lat = lat + rng.uniform(-0.009, 0.009)
            c_lng = lng + rng.uniform(-0.011, 0.011)
            c_street = f"{rng.randint(100, 9999)} Demo Comp {chr(65 + i)} St"
            db.add(ComparableSale(
                address_key=address_key(c_street, city, state, z), address_line=c_street, city=city, state=state,
                zip_code=z, lat=c_lat, lng=c_lng, subdivision=subdiv if rng.random() < 0.5 else None,
                property_type=ptype, beds=c_beds, baths=baths + rng.choice([0, 0, 0.5, -0.5]), sqft=c_sqft,
                year_built=year + rng.randint(-8, 8), sale_price=c_price, sale_date=d,
                condition_at_sale=rng.choice(["renovated", "renovated", "good"]), sale_type="arms_length",
                source_type="recorded_deed", data_provider=DEMO_PROVIDER, license="Fictional demo data",
                verification_status="source_verified", is_demo=True, notes=DEMO_NOTE,
            ))
            n_comps += 1
        # one distressed sale nearby to show exclusions
        db.add(ComparableSale(
            address_key=address_key(f"9 Demo Excluded {z} Ct", city, state, z), address_line=f"9 Demo Excluded {z} Ct",
            city=city, state=state, zip_code=z, lat=lat + 0.002, lng=lng - 0.002, property_type=ptype, beds=beds,
            baths=baths, sqft=sqft, year_built=year, sale_price=round(sqft * ppsf * 0.62, -3),
            sale_date=today - timedelta(days=60), condition_at_sale="poor", sale_type="foreclosure",
            source_type="recorded_deed", data_provider=DEMO_PROVIDER, license="Fictional demo data",
            verification_status="source_verified", is_demo=True, notes=DEMO_NOTE))
        n_comps += 1

    mid = {n: m.id for n, m in markets.items()}
    nova = [mid[n] for n in mid if "VA" in n and n not in ("Winchester, VA", "Frederick County, VA")]
    demo_investors = [
        dict(name="Demo Investor — Avery Capital", email="avery.demo@example.com", entity_name="Avery Capital LLC (demo)",
             investor_type="individual", preferred_markets=nova, available_capital=150000, min_investment=25000,
             max_investment=150000, strategies=["fix_and_flip"], min_roi_pct=15, max_duration_months=9,
             risk_tolerance="medium", experience_level="intermediate", funding_availability="immediate"),
        dict(name="Demo Lender — Blue Ridge Bridge Fund", email="bridge.demo@example.com",
             entity_name="Blue Ridge Bridge Fund (demo)", investor_type="hard_money_lender",
             preferred_markets=list(mid.values()), available_capital=2000000, max_investment=600000,
             strategies=["lending"], risk_tolerance="medium", experience_level="professional",
             funding_availability="immediate", lending_terms={"max_ltv_pct": 75, "rate_pct": 11, "points_pct": 2}),
        dict(name="Demo Group — Panhandle Partners", email="panhandle.demo@example.com",
             entity_name="Panhandle Partners (demo)", investor_type="investment_group",
             preferred_markets=[mid["Jefferson County, WV"], mid["Berkeley County, WV"], mid["Frederick County, VA"], mid["Winchester, VA"]],
             available_capital=120000, max_investment=120000, strategies=["fix_and_flip", "jv_equity"], min_roi_pct=20,
             max_duration_months=8, risk_tolerance="high", experience_level="experienced",
             funding_availability="within_30_days"),
        dict(name="Demo Investor — Cautious Retiree", email="cautious.demo@example.com", investor_type="individual",
             preferred_markets=nova, available_capital=60000, strategies=["fix_and_flip"], min_roi_pct=25,
             max_duration_months=6, risk_tolerance="low", experience_level="beginner",
             funding_availability="within_90_days"),
        dict(name="Demo Contractor — Shenandoah Builders", email="builders.demo@example.com",
             entity_name="Shenandoah Builders (demo)", investor_type="contractor_investor",
             preferred_markets=[mid["Winchester, VA"], mid["Frederick County, VA"]], available_capital=90000,
             property_types=["single_family"], strategies=["fix_and_flip"], min_roi_pct=18, max_duration_months=10,
             risk_tolerance="high", experience_level="professional", funding_availability="immediate"),
        dict(name="Demo JV — Capital Beltway Ventures", email="beltway.demo@example.com",
             entity_name="Capital Beltway Ventures (demo)", investor_type="jv_partner", preferred_markets=nova,
             available_capital=400000, min_investment=75000, max_investment=300000, strategies=["jv_equity", "fix_and_flip"],
             min_roi_pct=12, max_duration_months=12, risk_tolerance="medium", experience_level="experienced",
             funding_availability="within_30_days", pipeline_stage="qualified"),
    ]
    n_inv = 0
    for d in demo_investors:
        if db.scalar(select(Investor).where(Investor.email == d["email"])):
            continue
        db.add(Investor(**d, is_demo=True, email_consent=True, email_consent_at=now,
                        consent_source="DEMO record (fictional)", verification_status="verified",
                        phone_enc=encrypt("555-0142"), preferences_notes=DEMO_NOTE))
        n_inv += 1
    db.flush()
    inv = db.scalar(select(Investor).where(Investor.email == "avery.demo@example.com"))
    if inv and not db.scalar(select(User).where(User.investor_id == inv.id)):
        u = create_user(db, "investor.demo@example.com", "DemoInvestor-2026!", role="investor", name="Demo Investor")
        u.investor_id = inv.id
    return {"properties": n_props, "comps": n_comps, "investors": n_inv}
