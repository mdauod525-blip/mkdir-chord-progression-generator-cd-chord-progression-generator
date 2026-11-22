# DealBridge AI — System architecture

## Goals that shaped the design

1. **Free data first.** The MVP runs on public records, free government APIs and manual entry.
   Commercial feeds are optional modules behind the same connector interface.
2. **Deterministic numbers.** Every dollar figure, score and match is computed by plain Python
   with unit tests. Claude only *explains* results, under hard spend caps.
3. **Humans decide.** Automation discovers, analyzes, scores and drafts. A person approves before
   anything reaches an investor. Nothing in the system can buy property, sign agreements, make
   offers, or move money.
4. **Provenance on everything.** Every externally sourced record carries provider, source URL,
   retrieval time, source update time, license, permitted use and verification status.
5. **Nationwide-ready.** Markets, assumptions and data sources are database rows, not code.

## Component diagram

```
                ┌──────────────────────── Browser ────────────────────────┐
                │ Staff dashboard · Deal analyzer · CRM · Admin           │
                │ Investor portal (marketplace) · Wholesaler submissions  │
                └──────────────┬──────────────────────────────────────────┘
                               │ same-origin /api/* (httpOnly session cookie + CSRF header)
                ┌──────────────▼──────────────┐
                │ Next.js 16 (Vercel)         │  rewrites /api → FastAPI
                └──────────────┬──────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────────────────┐
│ FastAPI (Render / Railway / Fly)                                             │
│  api/      auth · properties · comps · analyzer · investors · CRM ·          │
│            opportunities · marketplace · admin · reports                     │
│  analysis/ renovation · comps/ARV · financials · scoring · pipeline         │  ← pure Python, tested
│  matching/ engine (pure) · service (DB)                                      │
│  services/ ingest (dedupe+provenance) · geo · ai (Claude, capped) ·          │
│            notifications (Resend/SendGrid/Twilio, consent-gated) · audit     │
│  connectors/ file import · ArcGIS · Socrata · FEMA · Census · HUD · FHFA ·   │
│              EPA · RealEstateDataset · paid placeholders                     │
│  middleware: rate limiting (memory or Redis) · CORS · security headers       │
└───────┬───────────────────────────────┬──────────────────────────────┬──────┘
        │                               │                              │
┌───────▼────────┐          ┌───────────▼───────────┐       ┌──────────▼─────────┐
│ PostgreSQL 16  │          │ Agent workflows       │       │ External (optional)│
│ + PostGIS      │          │ APScheduler worker OR │       │ Claude API         │
│ (Supabase free)│          │ GitHub Actions cron   │       │ Resend / Twilio    │
└────────────────┘          └───────────────────────┘       │ public data APIs   │
                                                            └────────────────────┘
```

## Request flow: analyzing a property

1. `POST /api/properties/{id}/analyze` → `analysis.pipeline.analyze_property`
2. Market assumptions are loaded (DB row per market, editable) and merged with per-deal overrides.
3. Renovation: the current contractor/manual estimate if one exists, otherwise the rule-based one.
4. Comps: closed sales within the extended radius and the maximum age, found with PostGIS
   `ST_DWithin` (or a bounding box plus haversine on SQLite). **Demo comps are never used for real
   properties.**
5. `comps.evaluate_comps` filters and adjusts the comps, then computes a weighted ARV and a 0–100 confidence.
6. `financials.analyze_deal` runs the full cost model, ROI metrics, break-even, a solved MAO and sensitivity.
7. `scoring.score_deal` computes 11 weighted factors, applies caps, sets flags and writes the explanation.
8. The inputs are hashed. Identical inputs reuse the current analysis, so no duplicate rows or AI calls are made.
9. `matching.service.match_property` scores every active investor and upserts the matches.

## Data model (PostgreSQL)

| Area | Tables |
|---|---|
| Identity & security | `users`, `audit_logs` |
| Markets | `markets`, `market_assumptions` |
| Ingestion | `data_sources`, `ingestion_runs`, `property_source_records` |
| Properties | `properties` (+ PostGIS `geom`), `price_history`, `renovation_estimates` |
| Comps | `comparable_sales` (+ PostGIS `geom`) — closed sales only |
| Analysis | `deal_analyses` (inputs, full results, assumptions snapshot, score, flags) |
| Investors | `investors`, `investor_verifications`, `matches` |
| Marketplace | `opportunities`, `opportunity_access_grants`, `investor_interests` |
| CRM | `interactions`, `follow_ups`, `investor_transactions`, `message_templates`, `notifications` |
| Automation | `agent_runs`, `agent_events`, `reports`, `admin_alerts` |
| AI cost control | `ai_usage`, `ai_cache`, `app_settings` |
| Revenue | `pricing_tiers`, `subscriptions` |

`ProvenanceMixin` adds the following to properties, comps, price history and source records:
`data_provider, source_url, retrieved_at, source_updated_at, license, permitted_use, verification_status, is_demo`.
Freshness is computed at read time (fresh ≤ 7 days, recent ≤ 30, aging ≤ 90, stale).

Migrations live in `backend/migrations` (Alembic). PostGIS columns are added by a dedicated
migration, so the same ORM models also run on SQLite for fast tests.

## Security

| Control | Implementation |
|---|---|
| Authentication | bcrypt (cost 12) passwords; HS256 JWT in an httpOnly, SameSite=Lax cookie or a Bearer header; optional Supabase Auth JWT verification |
| CSRF | Cookie-authenticated writes require the `X-DealBridge-CSRF` header |
| RBAC | `admin`, `analyst` (staff); `investor` (portal, after approval); `wholesaler` (submissions). Approve/publish/notify/grant are admin-only |
| Encryption at rest | Fernet field encryption for investor phone numbers, seller contact and property access info; disk encryption from the managed DB |
| Redaction | Investors see city/ZIP and rounded coordinates; exact address, seller and access details only with an explicit access grant |
| Audit log | Logins (including failures), creates/updates, status changes, approvals, publishes, notifications, setting changes |
| Rate limiting | Per-IP sliding window (240/min API, 20/min auth); Redis-backed when `DEALBRIDGE_REDIS_URL` is set |
| Input validation | Pydantic models with ranges, enums, URL validation, regex ZIPs; JSON-schema-like checks on assumptions/settings keys |
| Secrets | Environment variables only; `.env` is git-ignored; production refuses to start without a JWT secret and an encryption key |
| Headers | `nosniff`, `X-Frame-Options: DENY`, strict referrer policy, `no-store` on the API |

## Scaling path

- **More markets:** add a `markets` row (ZIPs/counties/cities) and its assumptions; no code changes.
- **More data:** add a connector class plus a `data_sources` row; ingestion, dedupe and provenance are shared.
- **More load:** the API is stateless, so run multiple instances with Redis rate limiting. Move the
  agent to a dedicated worker and partition ingestion by source.
- **SaaS:** add an `organization_id` to tenant-owned tables (planned for Phase 4) and scope queries by it.
