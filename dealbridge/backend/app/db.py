from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


def _make_engine(url: str):
    kwargs: dict = {"future": True, "pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    eng = create_engine(url, **kwargs)
    if url.startswith("sqlite"):

        @event.listens_for(eng, "connect")
        def _fk_on(dbapi_conn, _):  # pragma: no cover - trivial
            dbapi_conn.execute("PRAGMA foreign_keys=ON")

    return eng


engine = _make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def reconfigure(url: str) -> None:
    """Point the app at a different database (used by tests and CLI)."""
    global engine
    engine = _make_engine(url)
    SessionLocal.configure(bind=engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


_postgis_cache: dict[str, bool] = {}


def postgis_available(db: Session) -> bool:
    """True when running on PostgreSQL with the PostGIS extension installed."""
    url = str(db.get_bind().url)
    if url in _postgis_cache:
        return _postgis_cache[url]
    ok = False
    if db.get_bind().dialect.name == "postgresql":
        try:
            ok = bool(db.execute(text("SELECT 1 FROM pg_extension WHERE extname='postgis'")).scalar())
        except Exception:
            ok = False
    _postgis_cache[url] = ok
    return ok


def init_db() -> None:
    """Create tables (dev/test). Production uses Alembic migrations."""
    from . import models  # noqa: F401  (register models)

    Base.metadata.create_all(engine)
    if engine.dialect.name == "postgresql":
        from .geo_setup import ensure_postgis

        ensure_postgis(engine)
