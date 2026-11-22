# Roadmap

Status key: ✅ built and tested · 🟡 partial · ⬜ not started

## Phase 1 — MVP (this delivery)
- ✅ Authentication (bcrypt + JWT cookie, RBAC: admin/analyst/investor/wholesaler), audit log, rate limiting
- ✅ Property database with provenance, de-duplication (address normalization + parcel id), price history
- ✅ Manual property entry (staff) and wholesaler submissions
- ✅ Comparable-sales entry (closed sales only) and connector import
- ✅ Deal analysis engine: renovation, comps/ARV/confidence, full cost model, ROI suite, solved MAO, sensitivity
- ✅ Deal scoring 0–100 with caps, flags and explanations
- ✅ Investor profiles, verification workflow, consent capture
- ✅ Matching engine (equity and lender logic) with explanations
- ✅ Admin dashboard (metrics, charts, map), standalone analyzer, admin settings

## Phase 2 — Automation (largely built)
- ✅ Connector framework + free connectors (ArcGIS, Socrata, file import, FEMA, Census, HUD FMR, FHFA, EPA, HUD homes)
- 🟡 County connectors: endpoints and field maps still need to be configured per county (see DATA_SOURCES.md)
- ✅ Daily/weekly agent workflows; APScheduler worker or GitHub Actions cron
- ✅ AI explanations with cost controls (caching, budget, daily limit, alerts)
- ✅ Automated matching on every analysis and every profile update
- ✅ Email (Resend/SendGrid) and SMS (Twilio) with consent enforcement; dry-run without keys
- ✅ CRM: pipeline board, contact history, follow-ups, transactions, templates

## Phase 3 — Marketplace (core built)
- ✅ Investor portal with approval gate, marketplace, saves, interest/info/schedule/nonbinding EOI, activity
- ✅ Approval workflow (draft → pending → approved → published) with legal-review confirmation
- ✅ Restricted information via access grants
- 🟡 Deal documentation: links are supported; file upload to Supabase Storage is not yet implemented
- ✅ Weekly report and financial reporting
- ⬜ Calendar integration for scheduling discussions (currently a preferred-times request)

## Phase 4 — Scaling
- ⬜ Stripe subscriptions (tiers and manual subscription records exist)
- ⬜ Multi-tenant SaaS (organization_id scoping)
- ⬜ Paid data modules (after the cost/benefit review in DATA_SOURCES.md)
- ⬜ Multi-market analytics, ARV back-testing against actual resale prices
- ⬜ Background job queue (Celery/RQ + Redis) when ingestion volume needs it

## Recommended next steps
1. Engage counsel on the items in COMPLIANCE.md (securities structure first).
2. Configure and verify 2–3 county connectors (Loudoun, Fairfax, Jefferson WV) and load 12 months of recorded sales.
3. Calibrate assumptions with real quotes (title, hard-money lender, insurer, two contractors).
4. Back-test ARV on 20–30 recent local flips; tune comp weights and confidence thresholds.
5. Onboard the first 5–10 real investors, then decide on an MLS feed through a broker partner.
