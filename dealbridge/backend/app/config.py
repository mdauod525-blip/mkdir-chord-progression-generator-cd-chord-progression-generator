"""Application configuration.

All secrets come from environment variables (or a local `.env` that is never committed).
Nothing in this file contains a real credential.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="DEALBRIDGE_", extra="ignore")

    environment: str = "development"  # development | test | production
    app_name: str = "DealBridge AI"

    # Database: PostgreSQL (+PostGIS) in production (Supabase free tier works).
    # SQLite is supported for local tests only.
    database_url: str = "sqlite:///./dealbridge.db"

    # Auth
    jwt_secret: str = Field(default="dev-only-change-me-please-32-bytes-min", min_length=16)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 8
    # Optional: accept Supabase Auth JWTs (signed with the project's JWT secret).
    supabase_jwt_secret: str | None = None

    # Field-level encryption for phone numbers, seller contact and property access info.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    encryption_key: str | None = None

    cors_origins: str = "http://localhost:3000"

    # Rate limiting (requests per minute per client IP; auth endpoints are stricter)
    rate_limit_per_minute: int = 240
    auth_rate_limit_per_minute: int = 20
    redis_url: str | None = None  # optional; in-memory limiter is used when unset

    # Claude API (optional). Without a key every AI feature falls back to deterministic text.
    anthropic_api_key: str | None = None
    ai_model: str = "claude-opus-5-5"
    ai_effort: str = "low"  # low effort keeps token spend down for short explanations
    ai_max_output_tokens: int = 1200
    # USD per million tokens, used only for spend tracking (update if pricing changes).
    ai_input_price_per_mtok: float = 4.0
    ai_output_price_per_mtok: float = 20.0

    # Notifications (optional; without keys messages are logged as dry-run)
    email_provider: str = "console"  # console | resend | sendgrid
    resend_api_key: str | None = None
    sendgrid_api_key: str | None = None
    email_from: str = "DealBridge AI <deals@example.com>"
    mailing_address: str = "Set DEALBRIDGE_MAILING_ADDRESS (required by CAN-SPAM)"
    public_app_url: str = "http://localhost:3000"
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None

    # Free public-data API keys (all free; some optional)
    census_api_key: str | None = None
    hud_api_token: str | None = None

    # Scheduler
    scheduler_enabled: bool = False
    daily_cron: str = "15 6 * * *"
    weekly_cron: str = "30 7 * * 1"
    timezone: str = "America/New_York"

    http_user_agent: str = "DealBridgeAI/0.1 (public-records research client)"
    http_timeout_seconds: float = 30.0

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
