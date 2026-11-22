# Deployment on free tiers

## 1. Database — Supabase (free)
1. Create a project. Under Database → Extensions, enable **postgis**.
2. Copy the connection string (use the *session pooler* or direct connection) and set
   `DEALBRIDGE_DATABASE_URL=postgresql+psycopg://...`.
3. From `backend/`: `alembic upgrade head`, then `python -m app.cli seed`, then
   `python -m app.cli create-admin you@company.com '<strong password>'`.

## 2. API — Render (free web service) or Railway
- Root directory `dealbridge/backend`, Docker runtime (Dockerfile included). Migrations run on start.
- Env vars: see `backend/.env.example`. Required in production: `DEALBRIDGE_ENVIRONMENT=production`,
  `DEALBRIDGE_DATABASE_URL`, `DEALBRIDGE_JWT_SECRET`, `DEALBRIDGE_ENCRYPTION_KEY`,
  `DEALBRIDGE_CORS_ORIGINS`, `DEALBRIDGE_PUBLIC_APP_URL`, `DEALBRIDGE_MAILING_ADDRESS`.
- Keep `DEALBRIDGE_ENCRYPTION_KEY` safe. Losing it makes encrypted fields unreadable.

## 3. Frontend — Vercel
- Root directory `dealbridge/frontend`; set `DEALBRIDGE_API_URL` to the API's URL.
- The browser only talks to the Vercel origin; `/api/*` is proxied, so the session cookie stays first-party.
- The Vercel Hobby tier is for non-commercial use. Move to Pro before charging customers.

## 4. Scheduled agent
- **Free:** set the repository variable `DEALBRIDGE_AGENT_ENABLED=true` and the secrets used in
  `.github/workflows/dealbridge-agent.yml`. The workflow runs `python -m app.cli daily|weekly`.
- **Always-on:** run `python -m app.worker` with `DEALBRIDGE_SCHEDULER_ENABLED=true` (Render background worker).

## 5. Optional services
- Resend: verify your domain, then set `DEALBRIDGE_EMAIL_PROVIDER=resend` and `DEALBRIDGE_RESEND_API_KEY`.
- Twilio: complete 10DLC registration first, then set the three `DEALBRIDGE_TWILIO_*` vars.
- Claude: set `DEALBRIDGE_ANTHROPIC_API_KEY`, then review the budget in Admin → AI & automation (default $10/mo).

## Local development
```
docker compose up --build            # PostGIS, Redis, API, worker, web
# or without Docker:
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
alembic upgrade head    # or: python -m app.cli init-db (SQLite)
python -m app.cli seed-demo && uvicorn app.main:app --reload
cd ../frontend && npm install && npm run dev
```
