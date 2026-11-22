from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import admin, auth, investors, marketplace, properties
from .api.deps import RateLimitMiddleware
from .config import get_settings
from .services.settings_store import DEFAULTS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app() -> FastAPI:
    s = get_settings()
    if s.environment == "production":
        if s.jwt_secret.startswith("dev-only") or not s.encryption_key:
            raise RuntimeError("Set DEALBRIDGE_JWT_SECRET and DEALBRIDGE_ENCRYPTION_KEY for production")
    app = FastAPI(
        title="DealBridge AI API",
        version="0.1.0",
        description="Deal sourcing, fix-and-flip analysis and investor matching. All financial outputs are "
                    "estimates, not guarantees or investment advice.",
        docs_url="/api/docs" if s.environment != "production" else None,
        openapi_url="/api/openapi.json" if s.environment != "production" else None,
    )
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(
        CORSMiddleware, allow_origins=s.cors_origin_list, allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-DealBridge-CSRF"],
    )

    @app.middleware("http")
    async def security_headers(request, call_next):
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        resp.headers["Cache-Control"] = "no-store"
        return resp

    for r in (auth.router, properties.router, investors.router, marketplace.router, admin.router):
        app.include_router(r)

    @app.get("/api/health")
    def health():
        return {"ok": True, "app": s.app_name, "environment": s.environment}

    @app.get("/api/disclosures")
    def disclosures():
        return {"estimates": DEFAULTS["disclosure_text"],
                "not_a_broker": "DealBridge AI is a data and analysis tool. It does not act as a real estate broker, "
                                "investment adviser, or broker-dealer, and it does not offer or sell securities.",
                "fair_housing": "Deal scores and investor matches never use race, color, religion, sex, disability, "
                                "familial status or national origin, or proxies for them."}

    return app


app = create_app()
