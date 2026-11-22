from datetime import date, timedelta

from sqlalchemy import select

from app.models import DealAnalysis, Investor, Opportunity, Property, User


def login(client, email, pw):
    r = client.post("/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


PROP = dict(address_line="100 Real Test Rd", city="Leesburg", state="va", zip_code="20175", lat=39.11, lng=-77.57,
            beds=3, baths=2, sqft=1800, year_built=1990, condition="fair", list_price=300000)


def test_auth_and_rbac(client, admin_headers):
    r = client.post("/api/auth/register", json={"email": "new@test.example", "password": "short", "full_name": "N",
                                               "agree_terms": True})
    assert r.status_code == 422
    r = client.post("/api/auth/register", json={"email": "new@test.example", "password": "LongEnough-123",
                                               "full_name": "New Investor", "agree_terms": True})
    assert r.status_code == 201
    inv_h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/properties", headers=inv_h).status_code == 403
    assert client.get("/api/marketplace", headers=inv_h).status_code == 403  # pending approval
    assert client.get("/api/portal/profile", headers=inv_h).status_code == 200
    assert client.post("/api/auth/login", json={"email": "new@test.example", "password": "wrong-password"}).status_code == 401
    client.cookies.clear()
    assert client.get("/api/properties").status_code == 401


def test_cookie_auth_requires_csrf_header(client, admin_headers):
    client.post("/api/auth/login", json={"email": "admin@test.example", "password": "AdminPassword-123"})
    assert client.get("/api/auth/me").status_code == 200  # cookie works for reads
    assert client.post("/api/properties", json=PROP).status_code == 403  # no CSRF header
    assert client.post("/api/properties", json=PROP, headers={"X-DealBridge-CSRF": "1"}).status_code == 201


def test_manual_property_entry_dedupe_and_validation(client, admin_headers):
    r = client.post("/api/properties", json=PROP, headers=admin_headers)
    assert r.status_code == 201
    assert r.json()["state"] == "VA"
    dup = dict(PROP, address_line="100 Real Test Road")  # normalizes to the same key
    assert client.post("/api/properties", json=dup, headers=admin_headers).status_code == 409
    active = dict(PROP, address_line="5 Other St", listing_status="active")
    assert client.post("/api/properties", json=active, headers=admin_headers).status_code == 400
    active["listing_url"] = "https://example.com/listing/5"
    assert client.post("/api/properties", json=active, headers=admin_headers).status_code == 201


def test_comps_only_closed_sales(client, admin_headers):
    base = dict(address_line="1 Comp St", city="Leesburg", state="VA", zip_code="20175", sale_price=450000,
                sale_date=str(date.today() - timedelta(days=30)), source_description="Loudoun deed 1/2")
    assert client.post("/api/comps", json=dict(base, source_type="active_listing"), headers=admin_headers).status_code == 422
    assert client.post("/api/comps", json=dict(base, sale_date=str(date.today() + timedelta(days=3))),
                       headers=admin_headers).status_code == 422
    r = client.post("/api/comps", json=base, headers=admin_headers)
    assert r.status_code == 201 and r.json()["verification_status"] == "manually_verified"
    assert client.post("/api/comps", json=base, headers=admin_headers).status_code == 409


def test_analysis_flags_manual_review_without_comps(client, admin_headers):
    pid = client.post("/api/properties", json=PROP, headers=admin_headers).json()["id"]
    r = client.post(f"/api/properties/{pid}/analyze", json={}, headers=admin_headers)
    a = r.json()["property"]["analysis"]
    assert a["arv"] is None and a["needs_manual_review"]
    assert a["score"] <= 59 and a["score_band"].startswith("Insufficient data")
    # MAO is computed only once there is an ARV; assessed value is never used
    assert a["mao"] is None


def test_analysis_with_comps_and_dedupe(client, admin_headers, db):
    pid = client.post("/api/properties", json=PROP, headers=admin_headers).json()["id"]
    for i in range(4):
        client.post("/api/comps", json=dict(address_line=f"{i+2} Comp Ln", city="Leesburg", state="VA", zip_code="20175",
                                           lat=39.11 + 0.001 * i, lng=-77.57, beds=3, baths=2, sqft=1800,
                                           sale_price=460000 + i * 4000, condition_at_sale="renovated",
                                           sale_date=str(date.today() - timedelta(days=40 + i)),
                                           source_type="recorded_deed", source_description="deed"),
                    headers=admin_headers)
    r1 = client.post(f"/api/properties/{pid}/analyze", json={}, headers=admin_headers).json()
    assert r1["created"] and r1["property"]["analysis"]["comp_count"] == 4
    r2 = client.post(f"/api/properties/{pid}/analyze", json={}, headers=admin_headers).json()
    assert not r2["created"]  # identical inputs → no duplicate analysis
    assert len(db.scalars(select(DealAnalysis).where(DealAnalysis.property_id == pid)).all()) == 1
    # manual ARV needs a reason
    assert client.post(f"/api/properties/{pid}/analyze", json={"manual_arv": 500000},
                       headers=admin_headers).status_code == 422


def test_demo_comps_never_used_for_real_properties(client, admin_headers, db):
    from app.seed import seed_demo

    seed_demo(db)
    db.commit()
    # real property right next to a demo property in Leesburg 20175
    pid = client.post("/api/properties", json=dict(PROP, lat=39.1052, lng=-77.5701, sqft=2150, beds=4),
                      headers=admin_headers).json()["id"]
    a = client.post(f"/api/properties/{pid}/analyze", json={}, headers=admin_headers).json()["property"]["analysis"]
    assert a["comp_count"] == 0


def test_calculator(client, admin_headers):
    body = {"purchase_price": 250000, "renovation_total": 55000, "arv": 390000}
    r = client.post("/api/analyzer/calculate", json=body, headers=admin_headers).json()
    assert r["financials"]["net_profit"] < 390000 - 250000 - 55000  # all other costs counted
    assert "arv_manual_override" in r["score"]["flags"]
    comps = [{"sale_price": 400000 + i * 3000, "sale_date": str(date.today() - timedelta(days=30 + i)),
              "sqft": 1600, "beds": 3, "baths": 2, "distance_miles": 0.3} for i in range(4)]
    r = client.post("/api/analyzer/calculate", json={**body, "arv": None, "comps": comps, "sqft": 1600, "beds": 3,
                                                     "baths": 2}, headers=admin_headers).json()
    assert r["arv"]["comp_count"] == 4 and r["arv"]["method"] == "verified_comps"


def test_end_to_end_marketplace_flow(client, admin_headers, db):
    from app.agent.workflows import run_daily
    from app.seed import seed_demo

    seed_demo(db)
    run = run_daily(db, triggered_by="test")
    db.commit()
    assert run.status == "succeeded"
    best = db.scalar(select(DealAnalysis).where(DealAnalysis.is_current.is_(True)).order_by(DealAnalysis.score.desc()))
    r = client.post("/api/opportunities", json={"property_id": best.property_id}, headers=admin_headers)
    assert r.status_code == 201
    oid = r.json()["id"]

    def tr(action, **kw):
        return client.post(f"/api/opportunities/{oid}/transition", json={"action": action, **kw}, headers=admin_headers)

    assert tr("publish").status_code == 409  # must be approved first
    assert tr("submit").status_code == 200
    assert tr("approve").status_code == 200
    assert tr("publish").status_code == 200  # demo: legal confirmation not required

    inv_h = login(client, "investor.demo@example.com", "DemoInvestor-2026!")
    assert client.get("/api/marketplace", headers=inv_h).status_code == 403  # not approved yet
    u = db.scalar(select(User).where(User.email == "investor.demo@example.com"))
    assert client.post(f"/api/investors/{u.investor_id}/portal-access", json={"approved": True},
                       headers=admin_headers).status_code == 200
    items = client.get("/api/marketplace", headers=inv_h).json()
    assert len(items) == 1
    item = items[0]
    assert item["is_demo"] and item["location"]["address_line"] is None and "seller_contact" not in item
    assert "not guarantees" in item["disclosure"] or "estimates" in item["disclosure"]
    # nonbinding EOI needs acknowledgement
    assert client.post(f"/api/marketplace/{oid}/interest", json={"kind": "nonbinding_eoi", "indicated_amount": 50000},
                       headers=inv_h).status_code == 400
    r = client.post(f"/api/marketplace/{oid}/interest", json={"kind": "nonbinding_eoi", "indicated_amount": 50000,
                                                              "acknowledge_nonbinding": True}, headers=inv_h)
    assert r.status_code == 201
    assert db.get(Investor, u.investor_id).pipeline_stage == "interested"
    # sensitive info only after an access grant
    client.post(f"/api/opportunities/{oid}/access-grants", json={"investor_id": u.investor_id, "reason": "NDA signed"},
                headers=admin_headers)
    detail = client.get(f"/api/marketplace/{oid}", headers=inv_h).json()
    assert detail["access_granted"] and detail["location"]["address_line"] and detail["seller_contact"]
    # notify: only published + consenting + approved accounts; no real send without provider keys
    r = client.post(f"/api/opportunities/{oid}/notify", json={}, headers=admin_headers).json()
    assert all(v in ("dry_run", "skipped_no_approved_portal_account", "blocked_no_consent") for v in r["results"].values())


def test_real_opportunity_requires_legal_confirmation(client, admin_headers, db):
    pid = client.post("/api/properties", json=PROP, headers=admin_headers).json()["id"]
    client.post(f"/api/properties/{pid}/analyze", json={}, headers=admin_headers)
    oid = client.post("/api/opportunities", json={"property_id": pid}, headers=admin_headers).json()["id"]
    client.post(f"/api/opportunities/{oid}/transition", json={"action": "submit"}, headers=admin_headers)
    r = client.post(f"/api/opportunities/{oid}/transition", json={"action": "approve"}, headers=admin_headers)
    assert r.status_code == 400  # flagged for manual review
    client.post(f"/api/opportunities/{oid}/transition",
                json={"action": "approve", "override_review_reason": "reviewed comps by hand"}, headers=admin_headers)
    assert client.post(f"/api/opportunities/{oid}/transition", json={"action": "publish"},
                       headers=admin_headers).status_code == 400
    assert client.post(f"/api/opportunities/{oid}/transition", json={"action": "publish", "legal_review_confirmed": True},
                       headers=admin_headers).status_code == 200


def test_investor_consent_and_unsubscribe(client, admin_headers, db):
    r = client.post("/api/investors", json={"name": "No Consent", "email": "nc@test.example"}, headers=admin_headers)
    iid = r.json()["id"]
    r = client.post(f"/api/investors/{iid}/send", json={"template_key": "follow_up"}, headers=admin_headers).json()
    assert r["status"] == "blocked_no_consent"
    assert client.post("/api/investors", json={"name": "C", "email": "c@test.example", "email_consent": True},
                       headers=admin_headers).status_code == 400  # consent source required
    r = client.post("/api/investors", json={"name": "C", "email": "c@test.example", "email_consent": True,
                                            "consent_source": "signed intake form", "phone": "703-555-0199"},
                    headers=admin_headers).json()
    assert r["phone"].endswith("0199") and "703" not in r["phone"]  # masked for analysts/list views
    raw = db.get(Investor, r["id"]).phone_enc
    assert "0199" not in raw  # encrypted at rest
    sent = client.post(f"/api/investors/{r['id']}/send", json={"template_key": "follow_up"}, headers=admin_headers).json()
    assert sent["status"] == "dry_run"
    sms = client.post(f"/api/investors/{r['id']}/send", json={"template_key": "new_deal_sms", "channel": "sms",
                                                              "context": {"opportunity": {}}}, headers=admin_headers).json()
    assert sms["status"] == "blocked_no_consent"  # SMS needs separate TCPA consent
    tok = db.get(Investor, r["id"]).unsubscribe_token
    assert client.post(f"/api/unsubscribe/{tok}").status_code == 200
    again = client.post(f"/api/investors/{r['id']}/send", json={"template_key": "follow_up"}, headers=admin_headers).json()
    assert again["status"] == "blocked_unsubscribed"


def test_crm_pipeline_and_followups(client, admin_headers):
    iid = client.post("/api/investors", json={"name": "Pipe", "email": "p@test.example"}, headers=admin_headers).json()["id"]
    client.post(f"/api/investors/{iid}/stage", json={"stage": "contacted"}, headers=admin_headers)
    client.post(f"/api/investors/{iid}/follow-ups", json={"due_date": str(date.today()), "note": "call"}, headers=admin_headers)
    client.post(f"/api/investors/{iid}/interactions", json={"kind": "call", "subject": "intro"}, headers=admin_headers)
    pipe = client.get("/api/crm/pipeline", headers=admin_headers).json()
    assert any(x["id"] == iid for x in pipe["columns"]["contacted"])
    fu = client.get("/api/crm/follow-ups", headers=admin_headers).json()
    assert fu[0]["investor_id"] == iid
    d = client.get(f"/api/investors/{iid}", headers=admin_headers).json()
    assert len(d["interactions"]) == 2  # stage change + call


def test_dashboard_admin_and_weekly(client, admin_headers, db):
    from app.agent.workflows import run_weekly
    from app.seed import seed_demo

    seed_demo(db)
    db.commit()
    client.post("/api/agent/run/daily", headers=admin_headers)
    m = client.get("/api/dashboard/metrics", headers=admin_headers).json()
    assert m["properties_discovered"] == 12 and m["deals_analyzed"] == 12
    assert client.get("/api/dashboard/charts", headers=admin_headers).status_code == 200
    run = run_weekly(db, triggered_by="test")
    db.commit()
    assert run.status == "succeeded"
    reps = client.get("/api/reports", headers=admin_headers).json()
    assert reps and "Weekly" in reps[0]["title"]
    assert client.get("/api/reports/financial", headers=admin_headers).json()["qualified"]["count"] >= 1
    srcs = client.get("/api/data-sources", headers=admin_headers).json()
    paid = next(s for s in srcs if s["key"] == "attom")
    assert client.patch("/api/data-sources/attom", json={"enabled": True}, headers=admin_headers).status_code == 400
    assert paid["cost_tier"] == "paid"
    assert client.put("/api/settings", json={"bogus": 1}, headers=admin_headers).status_code == 400
    assert client.get("/api/audit-logs", headers=admin_headers).status_code == 200
    assert client.get("/api/pricing").status_code == 200
