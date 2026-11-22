from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Investor, User
from ..security import create_access_token, hash_password, verify_password
from ..services.audit import audit
from .deps import COOKIE_NAME, client_ip, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)
    role: Literal["investor", "wholesaler"] = "investor"
    agree_terms: bool
    email_consent: bool = False


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role,
            "is_approved": u.is_approved, "investor_id": u.investor_id}


def _set_cookie(resp: Response, token: str) -> None:
    s = get_settings()
    resp.set_cookie(COOKIE_NAME, token, httponly=True, secure=s.environment == "production",
                    samesite="lax", max_age=s.access_token_minutes * 60, path="/")


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    if not body.agree_terms:
        raise HTTPException(400, "you must accept the terms and disclosures")
    email = body.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(409, "an account with this email already exists")
    user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name,
                role=body.role, is_approved=False)
    db.add(user)
    db.flush()
    if body.role == "investor":
        now = datetime.now(UTC)
        inv = Investor(name=body.full_name, email=email, email_consent=body.email_consent,
                       email_consent_at=now if body.email_consent else None,
                       consent_source="self-registration form" if body.email_consent else None,
                       owner_user_id=None)
        db.add(inv)
        db.flush()
        user.investor_id = inv.id
    audit(db, "user.register", user.id, "user", user.id, {"role": body.role}, client_ip(request))
    db.commit()
    token = create_access_token(user.id, user.role)
    _set_cookie(response, token)
    return {"user": user_out(user), "access_token": token, "token_type": "bearer"}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash) or not user.is_active:
        audit(db, "user.login_failed", None, "user", None, {"email": body.email.lower()}, client_ip(request))
        db.commit()
        raise HTTPException(401, "invalid email or password")
    user.last_login_at = datetime.now(UTC)
    audit(db, "user.login", user.id, "user", user.id, None, client_ip(request))
    db.commit()
    token = create_access_token(user.id, user.role)
    _set_cookie(response, token)
    return {"user": user_out(user), "access_token": token, "token_type": "bearer"}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)
