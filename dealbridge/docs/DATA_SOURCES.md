# Data sources, costs and limitations

**The MVP depends on no paid data provider.** Each source is a separate connector
(`backend/app/connectors/providers.py`) configured by a `data_sources` row (Admin → Data sources).
Connectors use only official downloads or documented APIs, send an identifying User-Agent, pause
between pages, back off on 429/5xx, stop on 401/403, and never bypass authentication, CAPTCHAs, rate
limits or terms of use.

> **Verification status.** The build environment's network policy blocked the government hosts below,
> so the endpoints are taken from the agencies' published documentation and catalog entries and are
> tested against mocked responses. Each one is labelled *"verify before enabling"*. Use **Describe
> layer fields** in the admin UI to confirm the endpoint and map its fields before the first run.

## Free sources (integrated)

| Source | Connector | What it gives us | Access | Limitations |
|---|---|---|---|---|
| Maryland SDAT parcel points (MD iMAP) | `arcgis_feature` | Assessments, ownership, characteristics, last sale | ArcGIS REST `geodata.md.gov/.../MD_PropertyData/MapServer/0` | 2,000 records per request (paged); field map must be set; credit the State of Maryland |
| Maryland Open Data (Socrata `x8a5-h2sy`) | `socrata` | Same SDAT data, refreshed monthly | SODA API; optional app token | Large; filter with `where` |
| DC ITSPE (Integrated Tax System Public Extract) | `arcgis_feature` | Assessments, sales price/date, owner, use code | `maps2.dcgis.dc.gov/.../Property_and_Land/MapServer/53` | Table without geometry (join to parcels for coordinates); catalog also lists a newer `services.arcgis.com` copy |
| DC vacant & blighted | `arcgis_feature` | Vacant/blighted flags | Set layer URL from opendata.dc.gov | — |
| Fairfax County parcels / sales | `arcgis_feature` | Parcels; assessments and sales tables keyed by PARID | `fairfaxcounty.gov/mercator/rest/services/OpenData/OpenData_A9/FeatureServer/0` | 1,000 records per page; sales table URL must be set |
| Loudoun, Prince William, Arlington, Frederick VA, Winchester, Jefferson WV, Berkeley WV | `arcgis_feature` | County parcel/assessment layers | Layer URL set per county | Layer names vary and change; some counties only offer CSV downloads (use file import) |
| WV statewide parcels (WV GIS Technical Center) | `arcgis_feature` | Parcel + assessment fields for Jefferson/Berkeley | `services.wvgis.wvu.edu/.../Planning_Cadastre/WV_Parcels/MapServer/0` | Tax-year lag; service names have moved before; county assessors are authoritative |
| County recorded-sales files | `file_import` | **Closed sales for comps** | Upload CSV/JSON/GeoJSON/Parquet | Usually lack condition — mark it on entry or leave `unknown` |
| HUD Home Store | `hud_homes` | Government-owned homes for sale | **No public API** — download the search export and upload it | Bids only through HUD-registered brokers |
| FEMA NFHL | `fema_nfhl` | Flood zone, SFHA flag | ArcGIS point query, layer 28 | Informational only; not an official determination |
| U.S. Census ACS 5-year | `census_acs` | Population, income, home value, vacancy, owner-occupancy by ZCTA | `api.census.gov` (key optional, free) | **Context only — never used for scoring or matching** (Fair Housing) |
| HUD Fair Market Rents | `hud_fmr` | FMR by bedroom count (rental exit check) | Free token | County entity id = FIPS + `99999` |
| FHFA House Price Index | `fhfa_hpi` | 12-month appreciation per CBSA, feeding the comp time adjustment | Official CSV download (upload) | ZIP5 series is XLSX/developmental; the CBSA series is used |
| EPA ECHO | `epa_echo` | Regulated facilities and violations near a property | ECHO REST `get_facilities` | Not a Phase I environmental assessment |
| RealEstateDataset bulk files | `realestatedataset_bulk` | Nationwide records (CSV/Parquet) | Admin-supplied URL or upload | **The provider's URL, schema and license could not be confirmed during the build.** The connector refuses to import until a license is recorded |
| OpenStreetMap | frontend | Base map tiles | `tile.openstreetmap.org` | The OSM tile policy forbids heavy use; switch to a tile provider or self-host at scale |

### Things the free data cannot do (and how the app handles it)

- **Active listings.** Public assessment data never establishes that a property is for sale, so
  imports leave `listing_status = unknown`. Listings come from manual entry (with a URL or
  supporting source), wholesaler submissions, HUD exports, or a future licensed feed.
- **Condition of sold comps.** Deed data has no condition. Comps entered without condition are
  down-weighted; comps sold in poor condition are excluded from ARV.
- **Pre-foreclosure / probate filings.** These are court and land-records data that are rarely free in bulk. Enter them manually
  from courthouse research, or see the paid options below.
- **Photos.** Only photos with a stated license or permission are accepted (enforced at entry).

## Optional paid modules (disabled — not purchased)

Placeholders exist so a provider can be added without changing the architecture. Each one
requires its env var, an implemented `fetch`, and the cost justification below *before* purchase.
Prices are approximate public list prices as of late 2026 and **must be re-checked with the vendor**.

| Provider | 1. Additional data | 2. Why free sources are insufficient | 3. Approx. monthly cost | 4. Expected business benefit |
|---|---|---|---|---|
| MLS via licensed RESO Web API (through a broker/IDX vendor) | Active listings, DOM, price changes, **sold comps with condition and photos** | No free source has listings or sold-property condition | Varies: broker membership plus IDX/RETS vendor, often $50–$300 | The largest accuracy gain: real ARV comps and real availability. **First recommended purchase** once revenue justifies it, and it requires a licensed broker relationship |
| ATTOM Data | Nationwide property, sales, AVM, foreclosure filings | County coverage outside launch markets is inconsistent; foreclosure filings are not free in bulk | Commonly several hundred $/mo and up (quote-based) | Faster multi-market expansion and foreclosure sourcing |
| PropertyRadar | Pre-foreclosure, owner/equity, lists | Pre-foreclosure notices are scattered across courts and land records | ~$100–$200/mo tiers | Off-market seller leads |
| RentCast (includes former Realty Mole) | Records, sale comps, rent estimates, listings | Saves building per-county connectors | Free dev tier (~50 calls); paid from roughly $70+/mo | Quick comps sanity check in new markets |
| Zillow/Bridge, Realtor.com, Auction.com | Listings/auctions | Only usable with an authorized agreement; scraping is not allowed | Partnership-dependent | Inventory breadth |

## Operating cost estimate (free-data MVP)

| Item | Free tier used | When you outgrow it |
|---|---|---|
| Database: Supabase (Postgres + PostGIS + Auth) | Free: 500 MB DB; project pauses after ~1 week of inactivity | Pro ~$25/mo |
| API hosting: Render / Railway / Fly | Render free web service (sleeps when idle) | ~$7–$25/mo for always-on |
| Frontend: Vercel | Hobby tier is **non-commercial**; fine for development | Pro $20/mo per member once you charge customers |
| Scheduler | GitHub Actions cron (free for public repos; 2,000 min/mo private) | Render cron/worker ~$7/mo |
| Redis | Optional (in-memory limiter by default); Upstash free tier | Paid when multi-instance |
| Email: Resend | Free ~3,000 emails/mo (100/day) | ~$20/mo |
| SMS: Twilio | Pay-as-you-go, about $0.008–$0.01 per US SMS plus 10DLC registration fees | Usage-based |
| Claude API | Capped by settings (default **$10/mo**, 50 requests/day). Opus 5.5 is $4/$20 per M tokens; a typical explanation (≈2k in / 400 out) ≈ $0.016 | Raise the cap in Admin |
| Domain | — | ~$12/yr |

**Realistic MVP total: $0–$15/mo** (Claude cap plus domain) while validating. **First commercial
launch:** about $60–$110/mo (Supabase Pro, always-on API, Vercel Pro, Resend), before any data
subscription.
