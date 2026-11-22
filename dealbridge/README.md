# DealBridge AI

Fix-and-flip deal sourcing, underwriting and investor matching for **Northern Virginia, the
Shenandoah Valley (Winchester / Frederick County) and the Eastern Panhandle of West Virginia
(Jefferson & Berkeley)**, built so new markets are configuration, not code.

**Free data first:** the MVP runs on public records, free government APIs and manual entry. No paid
data subscription is required, and commercial feeds are optional modules (see
[docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)).

| | |
|---|---|
| Backend | Python 3.13 · FastAPI · SQLAlchemy 2 · PostgreSQL 16 + PostGIS · Alembic · APScheduler |
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind 4 · shadcn-style components · Recharts · Leaflet/OpenStreetMap |
| AI | Claude API for explanations only (cached, budget-capped). All numbers are deterministic Python |
| Hosting (free tiers) | Supabase (DB/PostGIS) · Render or Railway (API) · Vercel (web) · GitHub Actions (cron) |

**Docs:** [Architecture](docs/ARCHITECTURE.md) · [Data sources & costs](docs/DATA_SOURCES.md) ·
[Methodology](docs/METHODOLOGY.md) · [Compliance](docs/COMPLIANCE.md) · [Roadmap](docs/ROADMAP.md) ·
[Deployment](docs/DEPLOYMENT.md)

## Quick start (local)

```bash
cd dealbridge/backend
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
python -m app.cli init-db          # SQLite for a quick look; use Postgres + `alembic upgrade head` for real use
python -m app.cli seed-demo        # markets, data-source catalog, pricing + clearly-labelled DEMO data
uvicorn app.main:app --reload      # http://localhost:8000/api/docs

cd ../frontend && npm install && npm run dev   # http://localhost:3000
```

Demo logins (created only by `seed-demo`; remove before real use):
`admin@example.com / DemoAdmin-2026!` and `investor.demo@example.com / DemoInvestor-2026!`
(approve the investor's portal access from Investors → Avery Capital first).

**Demo data:** 12 properties, 76 comps and 6 investors, all **fictional**, flagged `is_demo`,
attributed to "DEMO (fictional sample data)" and badged in the UI. Demo comps are never used for
real properties, and demo deals only match demo investors.

## Tests

```bash
cd backend && python -m pytest -q                                  # 81 tests, SQLite
DEALBRIDGE_DATABASE_URL=postgresql+psycopg://... python -m pytest -q   # same suite on PostGIS
cd ../frontend && npm run typecheck && npm test && npm run build
```

The tests cover every financial formula with hand-worked expected values (TPC, net profit, cash
invested, ROI, annualized ROI, break-even, MAO identity, loan caps, interest, sensitivity), comp
filtering and adjustments, confidence, scoring caps and bands, matching (including the spec's
$250k/$55k/$390k example), connectors (paging, formats, dedupe, provenance), AI cost controls
(cache, budget, daily limit, alerts), RBAC, CSRF, consent rules, redaction and the full
marketplace approval flow.

---

## Phase 1 report

### What was built
- **Architecture & planning docs:** architecture, API/cost inventory, provider limitations, schema, roadmap, compliance dependencies.
- **Database:** 30 tables with provenance on every external record, PostGIS geography plus GiST indexes, and Alembic migrations (`alembic check` clean).
- **Deal analysis engine:** rule-based renovation estimator; comps selection, adjustment and weighted ARV with confidence; full cost model; ROI, CoC, return on cost, annualized ROI, break-even, margin, duration; **MAO solved exactly** with the configurable target; 70% rule shown only for reference; sensitivity scenarios.
- **Scoring:** 11 weighted factors, data-quality caps, flags, bands and deterministic explanations.
- **Investors:** profiles for all 8 investor types, preferences, encrypted phone numbers, consent capture, and a verification workflow (identity, accreditation, proof of funds, entity) that gates portal access.
- **Matching:** equity vs. lender logic, hard disqualifiers, a 100-point score with explanation, and automatic re-matching on every analysis and profile change.
- **Ingestion:** connector framework plus free connectors for ArcGIS county/state layers (MD SDAT, DC ITSPE, Fairfax, WV statewide, and slots for the 7 other launch jurisdictions), Socrata (MD Open Data), CSV/JSON/GeoJSON/Parquet import, HUD Home Store exports, FEMA NFHL, Census ACS, HUD FMR, FHFA HPI, EPA ECHO and RealEstateDataset bulk files. Paid placeholders (ATTOM, RentCast, PropertyRadar, RESO MLS, Zillow/Bridge, Realtor.com, Auction.com) stay disabled.
- **Automation agent:** daily and weekly workflows with a run and event log, admin alerts, staff emails, a weekly report, and a manual approval gate. Runs on APScheduler or a free GitHub Actions cron.
- **AI cost control:** caching, duplicate-analysis prevention via input hashing, daily request limit, monthly USD budget (pre-checked with a worst-case estimate), per-call token and cost logging, threshold alerts, and a deterministic fallback.
- **CRM & communications:** pipeline board (drag and drop), contact history, follow-ups, transactions, editable templates (new deal alert, introduction, follow-up, weekly report, SMS), Resend/SendGrid email and Twilio SMS with CAN-SPAM/TCPA enforcement.
- **Marketplace:** draft → pending → approved → published workflow (admin-only approve/publish; legal-review confirmation for real deals); investor portal with saves, interest, info requests, discussion requests and acknowledged nonbinding EOIs; redaction of restricted info until an access grant.
- **Dashboard:** the 10 requested metrics, charts, OSM map, alerts; sortable and filterable discovery table; property pages (analysis, comps, renovation editor, provenance, history, AI explanations); standalone analyzer; investor database; matching; CRM; agent activity; financial reporting; administration (markets and assumptions, data sources, AI and automation, templates, pricing tiers, users, audit log).
- **Revenue:** configurable subscription tiers (investor, wholesaler, SaaS) and manual subscription records. Success fees and commissions are intentionally absent.

### What works (verified)
- 81 backend tests pass on SQLite **and** PostgreSQL 16 + PostGIS 3.4; Alembic migrations apply and match the models.
- The frontend type-checks, unit tests pass, and `next build` succeeds. The UI was exercised in a real browser against the API: admin dashboard, property analysis, the approval workflow, and investor-portal redaction. An investor account gets 403 on staff APIs.
- The end-to-end demo works: seed → daily agent (12 analyzed, 17 eligible matches, 1 high-score alert) → create, approve and publish an opportunity → investor views and submits a nonbinding EOI → admin sees the interest and the pipeline stage updates.

### What remains incomplete
- **Live public-data endpoints were not reachable from the build environment.** Connectors are tested against mocked responses; each county layer URL and field map must be confirmed and set in Admin before the first real import.
- County coverage: only MD/DC/Fairfax/WV statewide have documented endpoints pre-filled. Loudoun, Prince William, Arlington, Frederick, Winchester, Jefferson and Berkeley need their layer URLs configured.
- No live active-listing feed (by design under free-data rules): listings come from manual entry, wholesalers or HUD exports.
- Document file uploads (links only), calendar scheduling, Stripe billing and multi-tenant SaaS are Phase 3–4.
- The underwriting assumptions are reasoned estimates and must be calibrated with local quotes; ARV has not yet been back-tested against real resales.
- The Claude integration is implemented and unit-tested with a fake client; no live API call was made during the build (no key configured).

### How to test it
1. Run the quick start, sign in as the demo admin, and open **Deal discovery**.
2. Open the Arlington demo property: review the comps (one foreclosure is excluded, with its reason), the cost breakdown and the MAO formula.
3. Add a property manually at a real address with no comps: it is flagged *Insufficient data — manual review* and gets no ARV.
4. Add 3–4 verified closed sales nearby, re-run the analysis, and watch the ARV, confidence and score appear.
5. Create an opportunity, then submit → approve → publish. Approve Avery Capital's portal access, sign in as the demo investor, and express interest.
6. Use **Deal analyzer** for quick what-ifs, then **Agent activity → Run weekly now** to generate a report.

### Estimated operating costs
**$0–15/month** on free tiers while validating (Claude capped at $10/mo by default, plus a domain).
About **$60–110/month** for a first commercial launch (Supabase Pro, always-on API, Vercel Pro,
Resend), before any data subscription. Details are in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

### Next development steps
See [docs/ROADMAP.md](docs/ROADMAP.md#recommended-next-steps). Counsel review comes first, then
configuring 2–3 county connectors with 12 months of recorded sales, calibrating assumptions, and
back-testing ARV.

> All ARV, renovation, cost, ROI and profit figures produced by this software are estimates, not
> appraisals, guarantees or investment advice. Matches are preliminary and are not funding
> commitments.
