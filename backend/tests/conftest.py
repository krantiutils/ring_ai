import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool, create_engine
from sqlalchemy.dialects.sqlite import base as sqlite_base
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 — register models with Base.metadata
from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app as fastapi_app
from app.models import Organization

# Enable debug mode for tests (allows non-HTTPS cookies in TestClient)
settings.DEBUG = True

# ---------------------------------------------------------------------------
# SQLite compatibility for PostgreSQL-specific types (JSONB, UUID, Vector)
# ---------------------------------------------------------------------------
sqlite_base.SQLiteTypeCompiler.visit_JSONB = lambda self, type_, **kw: self.visit_JSON(type_, **kw)

# pgvector Vector type → TEXT in SQLite (stores nothing, but allows table creation)
from pgvector.sqlalchemy import Vector  # noqa: E402

_original_vector_ddl = getattr(Vector, "compile", None)
sqlite_base.SQLiteTypeCompiler.visit_VECTOR = lambda self, type_, **kw: "TEXT"

# In-memory SQLite for tests — no PostgreSQL dependency needed
TEST_DATABASE_URL = "sqlite://"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    """Create all tables before each test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    """Provide a test database session."""
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def org(db):
    """Create a test organization (required FK for templates)."""
    organization = Organization(name="Test Org")
    db.add(organization)
    db.commit()
    db.refresh(organization)
    return organization


@pytest.fixture
def org_id(org) -> uuid.UUID:
    """Convenience fixture returning the test org's UUID."""
    return org.id


@pytest.fixture
def client(db):
    """TestClient with overridden DB dependency."""

    def _override_get_db():
        try:
            yield db
        finally:
            pass

    fastapi_app.dependency_overrides[get_db] = _override_get_db
    yield TestClient(fastapi_app)
    fastapi_app.dependency_overrides.clear()
