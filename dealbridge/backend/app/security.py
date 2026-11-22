"""Password hashing, JWTs and field-level encryption."""
from __future__ import annotations

import base64
import hashlib
import logging
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from cryptography.fernet import Fernet, InvalidToken

from .config import get_settings

log = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_access_token(user_id: str, role: str) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {"sub": user_id, "role": role, "iat": now, "exp": now + timedelta(minutes=s.access_token_minutes)}
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    s = get_settings()
    try:
        return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.PyJWTError:
        pass
    if s.supabase_jwt_secret:
        try:
            return jwt.decode(token, s.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
        except jwt.PyJWTError:
            return None
    return None


def _fernet() -> Fernet:
    s = get_settings()
    key = s.encryption_key
    if not key:
        if s.environment == "production":
            raise RuntimeError("DEALBRIDGE_ENCRYPTION_KEY must be set in production")
        # Development fallback derived from the JWT secret so local data stays readable.
        key = base64.urlsafe_b64encode(hashlib.sha256(("enc:" + s.jwt_secret).encode()).digest()).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        log.error("Could not decrypt a field (wrong DEALBRIDGE_ENCRYPTION_KEY?)")
        return None


def mask_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = [c for c in phone if c.isdigit()]
    return "•••-•••-" + "".join(digits[-4:]) if len(digits) >= 4 else "•••"
