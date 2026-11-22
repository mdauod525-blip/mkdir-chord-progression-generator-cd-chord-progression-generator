import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ.setdefault("DEALBRIDGE_DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ["DEALBRIDGE_ENVIRONMENT"] = "test"
os.environ.pop("DEALBRIDGE_ANTHROPIC_API_KEY", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import db as dbmod  # noqa: E402
from app.db import Base, SessionLocal  # noqa: E402


@pytest.fixture()
def db():
    from app import models  # noqa: F401

    Base.metadata.drop_all(dbmod.engine)
    dbmod.init_db()
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture()
def client(db):
    from app.main import app

    return TestClient(app)


@pytest.fixture()
def admin_headers(client, db):
    from app.seed import create_user, seed_reference

    seed_reference(db)
    create_user(db, "admin@test.example", "AdminPassword-123", "admin")
    db.commit()
    r = client.post("/api/auth/login", json={"email": "admin@test.example", "password": "AdminPassword-123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
