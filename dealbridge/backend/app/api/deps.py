from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from ..config import get_settings
from ..db import get_db
from ..models import User
from ..security import decode_token

COOKIE_NAME = "dealbridge_session"
CSRF_HEADER = "x-dealbridge-csrf"
STAFF_ROLES = ("admin", "analyst")


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = None
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:]
    elif COOKIE_NAME in request.cookies:
        token = request.cookies[COOKIE_NAME]
        # Cookie auth: require a custom header on state-changing requests (CSRF defence;
        # browsers cannot send custom headers cross-site without a CORS preflight).
        if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get(CSRF_HEADER) != "1":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "missing CSRF header")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")
    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found or disabled")
    return user


def require_roles(*roles: str) -> Callable[..., User]:
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient role")
        return user

    return dep


staff = require_roles(*STAFF_ROLES)
admin_only = require_roles("admin")


def approved_investor(user: User = Depends(get_current_user)) -> User:
    if user.role in STAFF_ROLES:
        return user
    if user.role != "investor" or not user.is_approved or not user.investor_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "investor account pending approval")
    return user


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window limiter per client IP. Uses Redis when configured (shared across
    instances), otherwise in-process memory (fine for a single free-tier instance)."""

    def __init__(self, app):
        super().__init__(app)
        self.hits: dict[str, deque] = defaultdict(deque)
        self.redis = None
        url = get_settings().redis_url
        if url:
            try:
                import redis

                self.redis = redis.Redis.from_url(url)
                self.redis.ping()
            except Exception:
                self.redis = None

    def _allow(self, key: str, limit: int) -> bool:
        now = time.time()
        if self.redis is not None:
            try:
                bucket = f"rl:{key}:{int(now // 60)}"
                n = self.redis.incr(bucket)
                if n == 1:
                    self.redis.expire(bucket, 70)
                return n <= limit
            except Exception:
                pass
        q = self.hits[key]
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True

    async def dispatch(self, request: Request, call_next):
        s = get_settings()
        path = request.url.path
        is_auth = path.startswith("/api/auth/login") or path.startswith("/api/auth/register")
        limit = s.auth_rate_limit_per_minute if is_auth else s.rate_limit_per_minute
        key = f"{'auth' if is_auth else 'api'}:{client_ip(request)}"
        if s.environment != "test" and not self._allow(key, limit):
            return JSONResponse({"detail": "rate limit exceeded"}, status_code=429, headers={"Retry-After": "60"})
        return await call_next(request)
