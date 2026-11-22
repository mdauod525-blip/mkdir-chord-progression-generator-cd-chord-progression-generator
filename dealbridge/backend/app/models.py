"""SQLAlchemy models. Portable across PostgreSQL (production) and SQLite (tests).

Every record that comes from an outside source carries provenance (ProvenanceMixin):
provider, source URL, retrieval time, source "last updated" time, license, verification status.
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


def _pk() -> Mapped[str]:
    return mapped_column(String(36), primary_key=True, default=_uuid)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ProvenanceMixin:
    """Source attribution required on every externally sourced record."""

    data_provider: Mapped[str] = mapped_column(String(120), default="manual_entry")
    source_url: Mapped[str | None] = mapped_column(Text)
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=utcnow)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    license: Mapped[str | None] = mapped_column(String(255))
    permitted_use: Mapped[str | None] = mapped_column(Text)
    # unverified | source_verified | manually_verified | disputed
    verification_status: Mapped[str] = mapped_column(String(32), default="unverified")
    # Clearly-labelled demonstration data. Never presented as a real opportunity.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


# --------------------------------------------------------------------------- users & auth
class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[str] = _pk()
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(200), default="")
    # admin | analyst | investor | wholesaler
    role: Mapped[str] = mapped_column(String(20), default="investor", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Investor accounts must be approved by an admin before seeing the marketplace.
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    investor_id: Mapped[str | None] = mapped_column(ForeignKey("investors.id", ondelete="SET NULL"))


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = _pk()
    user_id: Mapped[str | None] = mapped_column(String(36), index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str | None] = mapped_column(String(60))
    entity_id: Mapped[str | None] = mapped_column(String(36))
    details: Mapped[dict | None] = mapped_column(JSON)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


# --------------------------------------------------------------------------- markets
class Market(TimestampMixin, Base):
    __tablename__ = "markets"
    id: Mapped[str] = _pk()
    name: Mapped[str] = mapped_column(String(120), unique=True)
    region: Mapped[str] = mapped_column(String(120), default="")
    state: Mapped[str] = mapped_column(String(2))
    counties: Mapped[list] = mapped_column(JSON, default=list)
    cities: Mapped[list] = mapped_column(JSON, default=list)
    zip_codes: Mapped[list] = mapped_column(JSON, default=list)
    county_fips: Mapped[list] = mapped_column(JSON, default=list)
    center_lat: Mapped[float | None] = mapped_column(Float)
    center_lng: Mapped[float | None] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    assumptions: Mapped[MarketAssumptions | None] = relationship(
        back_populates="market", uselist=False, cascade="all, delete-orphan"
    )


class MarketAssumptions(TimestampMixin, Base):
    """Market-specific underwriting assumptions. All are estimates an admin must review."""

    __tablename__ = "market_assumptions"
    id: Mapped[str] = _pk()
    market_id: Mapped[str] = mapped_column(ForeignKey("markets.id", ondelete="CASCADE"), unique=True)
    market: Mapped[Market] = relationship(back_populates="assumptions")
    values: Mapped[dict] = mapped_column(JSON, default=dict)
    reviewed_by: Mapped[str | None] = mapped_column(String(36))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)


# --------------------------------------------------------------------------- data sources
class DataSource(TimestampMixin, Base):
    __tablename__ = "data_sources"
    id: Mapped[str] = _pk()
    key: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    connector: Mapped[str] = mapped_column(String(80))  # registry key of the connector class
    category: Mapped[str] = mapped_column(String(40))  # property | enrichment | comps | listings
    cost_tier: Mapped[str] = mapped_column(String(20), default="free")  # free | free_key | paid
    license: Mapped[str | None] = mapped_column(String(255))
    permitted_use: Mapped[str | None] = mapped_column(Text)
    base_url: Mapped[str | None] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    requires_credentials: Mapped[bool] = mapped_column(Boolean, default=False)
    credential_env_var: Mapped[str | None] = mapped_column(String(80))
    schedule: Mapped[str | None] = mapped_column(String(40))  # daily | weekly | monthly | manual
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    notes: Mapped[str | None] = mapped_column(Text)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[str | None] = mapped_column(String(40))


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"
    id: Mapped[str] = _pk()
    source_key: Mapped[str] = mapped_column(String(80), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="running")
    records_fetched: Mapped[int] = mapped_column(Integer, default=0)
    records_created: Mapped[int] = mapped_column(Integer, default=0)
    records_updated: Mapped[int] = mapped_column(Integer, default=0)
    records_skipped: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list] = mapped_column(JSON, default=list)
    triggered_by: Mapped[str | None] = mapped_column(String(60))


# --------------------------------------------------------------------------- properties
class Property(TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "properties"
    id: Mapped[str] = _pk()
    address_key: Mapped[str] = mapped_column(String(255), unique=True, index=True)  # dedupe key
    address_line: Mapped[str] = mapped_column(String(255))
    unit: Mapped[str | None] = mapped_column(String(40))
    city: Mapped[str] = mapped_column(String(120))
    state: Mapped[str] = mapped_column(String(2), index=True)
    zip_code: Mapped[str] = mapped_column(String(10), index=True)
    county: Mapped[str | None] = mapped_column(String(120), index=True)
    parcel_id: Mapped[str | None] = mapped_column(String(80), index=True)
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    market_id: Mapped[str | None] = mapped_column(ForeignKey("markets.id", ondelete="SET NULL"), index=True)
    subdivision: Mapped[str | None] = mapped_column(String(160))

    # single_family | townhouse | condo | multi_family_2_4 | manufactured | land | other
    property_type: Mapped[str] = mapped_column(String(30), default="single_family")
    beds: Mapped[float | None] = mapped_column(Float)
    baths: Mapped[float | None] = mapped_column(Float)
    sqft: Mapped[float | None] = mapped_column(Float)
    lot_sqft: Mapped[float | None] = mapped_column(Float)
    year_built: Mapped[int | None] = mapped_column(Integer)
    stories: Mapped[float | None] = mapped_column(Float)
    # excellent | good | fair | poor | distressed | unknown
    condition: Mapped[str] = mapped_column(String(20), default="unknown")

    # Listing status is only "active" when it comes from an authorized feed or a manual entry
    # with supporting evidence. Public assessment records never imply availability.
    # unknown | off_market | active | pending | sold | auction | withdrawn
    listing_status: Mapped[str] = mapped_column(String(20), default="unknown")
    list_price: Mapped[float | None] = mapped_column(Float)
    original_list_price: Mapped[float | None] = mapped_column(Float)
    listing_date: Mapped[date | None] = mapped_column(Date)
    days_on_market: Mapped[int | None] = mapped_column(Integer)
    listing_url: Mapped[str | None] = mapped_column(Text)
    # Third-party estimate of current value (labelled with its source). NOT an ARV.
    estimated_market_value: Mapped[float | None] = mapped_column(Float)
    estimated_market_value_source: Mapped[str | None] = mapped_column(String(120))
    # Tax assessment. NEVER used as ARV.
    assessed_value: Mapped[float | None] = mapped_column(Float)
    assessment_year: Mapped[int | None] = mapped_column(Integer)
    annual_taxes: Mapped[float | None] = mapped_column(Float)
    hoa_monthly: Mapped[float | None] = mapped_column(Float)
    last_sale_price: Mapped[float | None] = mapped_column(Float)
    last_sale_date: Mapped[date | None] = mapped_column(Date)

    # foreclosure, pre_foreclosure, reo, auction, probate, estate_sale, vacant, distressed,
    # needs_renovation, price_reduced, extended_dom, fsbo, wholesale, off_market, hud_home, tax_lien
    opportunity_types: Mapped[list] = mapped_column(JSON, default=list)
    distress_signals: Mapped[list] = mapped_column(JSON, default=list)
    photos: Mapped[list] = mapped_column(JSON, default=list)  # [{url, license, credit}]
    flood_zone: Mapped[str | None] = mapped_column(String(20))
    enrichment: Mapped[dict] = mapped_column(JSON, default=dict)  # census, fhfa, epa, hud, fema
    notes: Mapped[str | None] = mapped_column(Text)
    submitted_by_role: Mapped[str | None] = mapped_column(String(20))  # e.g. wholesaler

    # Restricted fields (encrypted at rest; only admins and investors with an access grant)
    seller_contact_enc: Mapped[str | None] = mapped_column(Text)
    access_info_enc: Mapped[str | None] = mapped_column(Text)

    # new | analyzed | needs_review | under_review | approved | rejected | archived
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)
    created_by: Mapped[str | None] = mapped_column(String(36))

    price_history: Mapped[list[PriceHistory]] = relationship(
        back_populates="property", cascade="all, delete-orphan", order_by="PriceHistory.event_date"
    )
    analyses: Mapped[list[DealAnalysis]] = relationship(
        back_populates="property", cascade="all, delete-orphan", order_by="DealAnalysis.created_at.desc()"
    )
    source_records: Mapped[list[PropertySourceRecord]] = relationship(
        back_populates="property", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_properties_latlng", "lat", "lng"),)


class PropertySourceRecord(ProvenanceMixin, Base):
    """Raw record from one provider, linked to the deduplicated Property."""

    __tablename__ = "property_source_records"
    id: Mapped[str] = _pk()
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    property: Mapped[Property] = relationship(back_populates="source_records")
    source_key: Mapped[str] = mapped_column(String(80))
    external_id: Mapped[str] = mapped_column(String(160))
    raw: Mapped[dict] = mapped_column(JSON, default=dict)
    content_hash: Mapped[str | None] = mapped_column(String(64))
    __table_args__ = (UniqueConstraint("source_key", "external_id", name="uq_source_record"),)


class PriceHistory(ProvenanceMixin, Base):
    __tablename__ = "price_history"
    id: Mapped[str] = _pk()
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    property: Mapped[Property] = relationship(back_populates="price_history")
    event_date: Mapped[date] = mapped_column(Date)
    # listed | price_change | sold | delisted | assessment | auction_scheduled
    event_type: Mapped[str] = mapped_column(String(30))
    price: Mapped[float | None] = mapped_column(Float)
    note: Mapped[str | None] = mapped_column(Text)


class ComparableSale(TimestampMixin, ProvenanceMixin, Base):
    """A CLOSED sale. Only recorded deeds/transactions or manually verified sales belong here.

    Active listing prices and assessed values are rejected at the API layer.
    """

    __tablename__ = "comparable_sales"
    id: Mapped[str] = _pk()
    address_line: Mapped[str] = mapped_column(String(255))
    city: Mapped[str] = mapped_column(String(120))
    state: Mapped[str] = mapped_column(String(2))
    zip_code: Mapped[str] = mapped_column(String(10), index=True)
    county: Mapped[str | None] = mapped_column(String(120))
    subdivision: Mapped[str | None] = mapped_column(String(160))
    parcel_id: Mapped[str | None] = mapped_column(String(80))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    property_type: Mapped[str] = mapped_column(String(30), default="single_family")
    beds: Mapped[float | None] = mapped_column(Float)
    baths: Mapped[float | None] = mapped_column(Float)
    sqft: Mapped[float | None] = mapped_column(Float)
    lot_sqft: Mapped[float | None] = mapped_column(Float)
    year_built: Mapped[int | None] = mapped_column(Integer)
    sale_price: Mapped[float] = mapped_column(Float)
    sale_date: Mapped[date] = mapped_column(Date, index=True)
    # renovated | good | average | poor | unknown  (condition at time of sale)
    condition_at_sale: Mapped[str] = mapped_column(String(20), default="unknown")
    # arms_length | foreclosure | reo | short_sale | non_arms_length | unknown
    sale_type: Mapped[str] = mapped_column(String(30), default="unknown")
    # recorded_deed | manual_verified | licensed_mls_sold
    source_type: Mapped[str] = mapped_column(String(30), default="manual_verified")
    deed_book_page: Mapped[str | None] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text)
    entered_by: Mapped[str | None] = mapped_column(String(36))
    address_key: Mapped[str] = mapped_column(String(255), index=True)
    __table_args__ = (
        UniqueConstraint("address_key", "sale_date", "sale_price", name="uq_comp_sale"),
        Index("ix_comps_latlng", "lat", "lng"),
    )


class RenovationEstimate(TimestampMixin, Base):
    __tablename__ = "renovation_estimates"
    id: Mapped[str] = _pk()
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    # rule_based | manual | contractor_bid
    method: Mapped[str] = mapped_column(String(20), default="rule_based")
    scope: Mapped[str] = mapped_column(String(20), default="medium")  # light|medium|heavy|gut
    line_items: Mapped[dict] = mapped_column(JSON, default=dict)
    total: Mapped[float] = mapped_column(Float, default=0)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(36))


class DealAnalysis(Base):
    __tablename__ = "deal_analyses"
    id: Mapped[str] = _pk()
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    property: Mapped[Property] = relationship(back_populates="analyses")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    input_hash: Mapped[str] = mapped_column(String(64), index=True)
    engine_version: Mapped[str] = mapped_column(String(20))
    inputs: Mapped[dict] = mapped_column(JSON, default=dict)
    results: Mapped[dict] = mapped_column(JSON, default=dict)
    comps_used: Mapped[list] = mapped_column(JSON, default=list)

    purchase_price: Mapped[float | None] = mapped_column(Float)
    arv: Mapped[float | None] = mapped_column(Float)
    arv_method: Mapped[str | None] = mapped_column(String(40))  # verified_comps | manual_override | none
    arv_confidence: Mapped[float | None] = mapped_column(Float)  # 0-100
    comp_count: Mapped[int] = mapped_column(Integer, default=0)
    renovation_total: Mapped[float | None] = mapped_column(Float)
    total_project_cost: Mapped[float | None] = mapped_column(Float)
    cash_required: Mapped[float | None] = mapped_column(Float)
    loan_amount: Mapped[float | None] = mapped_column(Float)
    net_profit: Mapped[float | None] = mapped_column(Float)
    roi_pct: Mapped[float | None] = mapped_column(Float)
    annualized_roi_pct: Mapped[float | None] = mapped_column(Float)
    profit_margin_pct: Mapped[float | None] = mapped_column(Float)
    mao: Mapped[float | None] = mapped_column(Float)
    break_even_price: Mapped[float | None] = mapped_column(Float)
    duration_months: Mapped[float | None] = mapped_column(Float)

    score: Mapped[float | None] = mapped_column(Float, index=True)
    score_band: Mapped[str | None] = mapped_column(String(40))
    score_components: Mapped[list] = mapped_column(JSON, default=list)
    flags: Mapped[list] = mapped_column(JSON, default=list)
    needs_manual_review: Mapped[bool] = mapped_column(Boolean, default=False)
    explanation: Mapped[str | None] = mapped_column(Text)  # deterministic
    ai_summary: Mapped[str | None] = mapped_column(Text)  # optional Claude narrative
    created_by: Mapped[str | None] = mapped_column(String(60))


# --------------------------------------------------------------------------- investors
class Investor(TimestampMixin, Base):
    __tablename__ = "investors"
    id: Mapped[str] = _pk()
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(255), index=True)
    phone_enc: Mapped[str | None] = mapped_column(Text)
    entity_name: Mapped[str | None] = mapped_column(String(200))
    # individual | investment_group | private_lender | hard_money_lender | investment_company
    # | jv_partner | wholesaler | contractor_investor
    investor_type: Mapped[str] = mapped_column(String(30), default="individual")
    preferred_markets: Mapped[list] = mapped_column(JSON, default=list)  # market ids
    preferred_zip_codes: Mapped[list] = mapped_column(JSON, default=list)
    available_capital: Mapped[float | None] = mapped_column(Float)
    min_investment: Mapped[float | None] = mapped_column(Float)
    max_investment: Mapped[float | None] = mapped_column(Float)
    property_types: Mapped[list] = mapped_column(JSON, default=list)
    # fix_and_flip | buy_and_hold | brrrr | wholesale | lending | jv_equity
    strategies: Mapped[list] = mapped_column(JSON, default=list)
    min_roi_pct: Mapped[float | None] = mapped_column(Float)
    max_duration_months: Mapped[float | None] = mapped_column(Float)
    risk_tolerance: Mapped[str] = mapped_column(String(10), default="medium")  # low|medium|high
    experience_level: Mapped[str] = mapped_column(String(20), default="none")  # none|beginner|intermediate|experienced|professional
    # immediate | within_30_days | within_90_days | not_currently
    funding_availability: Mapped[str] = mapped_column(String(20), default="within_30_days")
    lending_terms: Mapped[dict] = mapped_column(JSON, default=dict)  # max_ltv_pct, max_ltc_pct, rate_pct
    preferences_notes: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSON, default=list)

    # Verification & qualification (documents reviewed manually; see docs/COMPLIANCE.md)
    verification_status: Mapped[str] = mapped_column(String(20), default="unverified")  # unverified|pending|verified|rejected
    # unknown | self_certified_accredited | self_certified_non_accredited | third_party_verified
    accreditation_status: Mapped[str] = mapped_column(String(40), default="unknown")
    proof_of_funds_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # CRM
    # new | contacted | qualified | opportunity_presented | interested | due_diligence
    # | negotiation | funded_closed | not_interested
    pipeline_stage: Mapped[str] = mapped_column(String(30), default="new", index=True)
    owner_user_id: Mapped[str | None] = mapped_column(String(36))
    next_follow_up: Mapped[date | None] = mapped_column(Date)

    # Consent (CAN-SPAM / TCPA)
    email_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    email_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sms_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    sms_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consent_source: Mapped[str | None] = mapped_column(String(200))
    unsubscribed: Mapped[bool] = mapped_column(Boolean, default=False)
    unsubscribe_token: Mapped[str] = mapped_column(String(36), default=_uuid, unique=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class InvestorVerification(TimestampMixin, Base):
    __tablename__ = "investor_verifications"
    id: Mapped[str] = _pk()
    investor_id: Mapped[str] = mapped_column(ForeignKey("investors.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30))  # identity | accreditation | proof_of_funds | entity
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|approved|rejected
    document_reference: Mapped[str | None] = mapped_column(Text)  # storage path, never the doc itself
    reviewed_by: Mapped[str | None] = mapped_column(String(36))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)


class Match(TimestampMixin, Base):
    """Preliminary fit between an investor and a deal. NOT a funding commitment."""

    __tablename__ = "matches"
    id: Mapped[str] = _pk()
    investor_id: Mapped[str] = mapped_column(ForeignKey("investors.id", ondelete="CASCADE"), index=True)
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    analysis_id: Mapped[str | None] = mapped_column(ForeignKey("deal_analyses.id", ondelete="SET NULL"))
    score: Mapped[float] = mapped_column(Float)
    eligible: Mapped[bool] = mapped_column(Boolean, default=False)
    components: Mapped[list] = mapped_column(JSON, default=list)
    disqualifiers: Mapped[list] = mapped_column(JSON, default=list)
    explanation: Mapped[str | None] = mapped_column(Text)
    # suggested | approved_to_present | presented | dismissed
    status: Mapped[str] = mapped_column(String(30), default="suggested")
    __table_args__ = (UniqueConstraint("investor_id", "property_id", name="uq_match"),)


# --------------------------------------------------------------------------- marketplace
class Opportunity(TimestampMixin, Base):
    __tablename__ = "opportunities"
    id: Mapped[str] = _pk()
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), unique=True)
    analysis_id: Mapped[str | None] = mapped_column(ForeignKey("deal_analyses.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str | None] = mapped_column(Text)
    # draft | pending_approval | published | under_contract | closed | withdrawn
    status: Mapped[str] = mapped_column(String(30), default="draft", index=True)
    visibility: Mapped[str] = mapped_column(String(30), default="approved_investors")  # approved_investors | matched_only
    approved_by: Mapped[str | None] = mapped_column(String(36))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    documents: Mapped[list] = mapped_column(JSON, default=list)  # [{name, url, restricted}]
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class OpportunityAccessGrant(Base):
    __tablename__ = "opportunity_access_grants"
    id: Mapped[str] = _pk()
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), index=True)
    investor_id: Mapped[str] = mapped_column(ForeignKey("investors.id", ondelete="CASCADE"), index=True)
    granted_by: Mapped[str] = mapped_column(String(36))
    reason: Mapped[str | None] = mapped_column(Text)  # e.g. "NDA signed 2026-11-01"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("opportunity_id", "investor_id", name="uq_access_grant"),)


class InvestorInterest(TimestampMixin, Base):
    __tablename__ = "investor_interests"
    id: Mapped[str] = _pk()
    opportunity_id: Mapped[str] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"), index=True)
    investor_id: Mapped[str] = mapped_column(ForeignKey("investors.id", ondelete="CASCADE"), index=True)
    # saved | interested | info_request | schedule_discussion | nonbinding_eoi | withdrawn
    kind: Mapped[str] = mapped_column(String(30))
    message: Mapped[str | None] = mapped_column(Text)
    indicated_amount: Mapped[float | None] = mapped_column(Float)  # nonbinding indication only
    preferred_times: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | responded | closed
    acknowledged_nonbinding: Mapped[bool] = mapped_column(Boolean, default=False)


# --------------------------------------------------------------------------- CRM
class Interaction(Base):
    __tablename__ = "interactions"
    id: Mapped[str] = _pk()
    investor_id: Mapped[str] = mapped_column(ForeignKey("investors.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # email | call | sms | meeting | note | system
    direction: Mapped[str] = mapped_column(String(10), default="outbound")  # inbound|outbound|internal
    subject: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(Text)
    opportunity_id: Mapped[str | None] = mapped_column(String(36))
    user_id: Mapped[str | None] = mapped_column(String(36))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class FollowUp(Base):
    __tablename__ = "follow_ups"
    id: Mapped[str] = _pk()
    investor_id: Mapped[str] = mapped_column(ForeignKey("investors.id", ondelete="CASCADE"), index=True)
    due_date: Mapped[date] = mapped_column(Date, index=True)
    note: Mapped[str] = mapped_column(Text)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    assigned_to: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class InvestorTransaction(Base):
    """Manually recorded history of past deals with an investor (no fees are computed)."""

    __tablename__ = "investor_transactions"
    id: Mapped[str] = _pk()
    investor_id: Mapped[str] = mapped_column(ForeignKey("investors.id", ondelete="CASCADE"), index=True)
    property_id: Mapped[str | None] = mapped_column(String(36))
    description: Mapped[str] = mapped_column(Text)
    role: Mapped[str | None] = mapped_column(String(40))  # equity | lender | buyer | partner
    amount: Mapped[float | None] = mapped_column(Float)
    closed_on: Mapped[date | None] = mapped_column(Date)
    outcome: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MessageTemplate(TimestampMixin, Base):
    __tablename__ = "message_templates"
    id: Mapped[str] = _pk()
    key: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    channel: Mapped[str] = mapped_column(String(10), default="email")  # email | sms
    subject: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = _pk()
    channel: Mapped[str] = mapped_column(String(10))
    recipient: Mapped[str] = mapped_column(String(255))
    investor_id: Mapped[str | None] = mapped_column(String(36), index=True)
    template_key: Mapped[str | None] = mapped_column(String(60))
    subject: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    # sent | dry_run | failed | blocked_no_consent | blocked_unsubscribed
    status: Mapped[str] = mapped_column(String(30))
    provider: Mapped[str | None] = mapped_column(String(30))
    provider_message_id: Mapped[str | None] = mapped_column(String(120))
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class AdminAlert(Base):
    __tablename__ = "admin_alerts"
    id: Mapped[str] = _pk()
    level: Mapped[str] = mapped_column(String(10), default="info")  # info | warning | critical
    category: Mapped[str] = mapped_column(String(30))  # deal | ai_budget | ingestion | system
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[str | None] = mapped_column(String(36))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


# --------------------------------------------------------------------------- automation
class AgentRun(Base):
    __tablename__ = "agent_runs"
    id: Mapped[str] = _pk()
    workflow: Mapped[str] = mapped_column(String(40), index=True)  # daily | weekly | ingest
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="running")  # running|succeeded|failed|partial
    stats: Mapped[dict] = mapped_column(JSON, default=dict)
    triggered_by: Mapped[str] = mapped_column(String(60), default="scheduler")


class AgentEvent(Base):
    __tablename__ = "agent_events"
    id: Mapped[str] = _pk()
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True)
    step: Mapped[str] = mapped_column(String(60))
    level: Mapped[str] = mapped_column(String(10), default="info")
    message: Mapped[str] = mapped_column(Text)
    data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = _pk()
    kind: Mapped[str] = mapped_column(String(30))  # weekly_opportunities | daily_digest
    title: Mapped[str] = mapped_column(String(255))
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    content_md: Mapped[str] = mapped_column(Text)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


# --------------------------------------------------------------------------- AI cost control
class AIUsage(Base):
    __tablename__ = "ai_usage"
    id: Mapped[str] = _pk()
    task: Mapped[str] = mapped_column(String(40), index=True)
    model: Mapped[str] = mapped_column(String(60))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0)
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="ok")  # ok | error | blocked_budget | blocked_rate
    entity_id: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class AICache(Base):
    __tablename__ = "ai_cache"
    id: Mapped[str] = _pk()
    cache_key: Mapped[str] = mapped_column(String(64), unique=True)
    task: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(60))
    response: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AppSetting(Base):
    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict | list | str | float | int | bool | None] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# --------------------------------------------------------------------------- revenue
class PricingTier(TimestampMixin, Base):
    __tablename__ = "pricing_tiers"
    id: Mapped[str] = _pk()
    key: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    audience: Mapped[str] = mapped_column(String(20))  # investor | wholesaler | saas
    monthly_price: Mapped[float] = mapped_column(Float, default=0)
    annual_price: Mapped[float | None] = mapped_column(Float)
    features: Mapped[list] = mapped_column(JSON, default=list)
    limits: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Subscription(TimestampMixin, Base):
    __tablename__ = "subscriptions"
    id: Mapped[str] = _pk()
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    tier_id: Mapped[str] = mapped_column(ForeignKey("pricing_tiers.id"))
    status: Mapped[str] = mapped_column(String(20), default="trialing")  # trialing|active|past_due|canceled
    provider: Mapped[str] = mapped_column(String(20), default="manual")  # manual | stripe (phase 4)
    external_id: Mapped[str | None] = mapped_column(String(120))
    current_period_end: Mapped[date | None] = mapped_column(Date)
