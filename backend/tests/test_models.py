from app.core.database import Base
from app.models import (
    AnalyticsEvent,
    Campaign,
    Contact,
    Interaction,
    Organization,
    Template,
    TTSProviderConfig,
)


EXPECTED_TABLES = {
    "organizations",
    "campaigns",
    "contacts",
    "interactions",
    "templates",
    "tts_provider_configs",
    "analytics_events",
}


def test_all_tables_registered():
    registered = set(Base.metadata.tables.keys())
    assert EXPECTED_TABLES.issubset(registered), (
        f"Missing tables: {EXPECTED_TABLES - registered}"
    )


def test_organization_columns():
    cols = {c.name for c in Organization.__table__.columns}
    assert cols == {
        "id", "name", "api_key_hash", "plan", "created_at", "updated_at"
    }


def test_campaign_columns():
    cols = {c.name for c in Campaign.__table__.columns}
    assert cols == {
        "id", "org_id", "name", "type", "status", "template_id",
        "schedule_config", "created_at", "updated_at",
    }


def test_contact_columns():
    cols = {c.name for c in Contact.__table__.columns}
    assert cols == {"id", "org_id", "phone", "name", "metadata", "created_at"}


def test_interaction_columns():
    cols = {c.name for c in Interaction.__table__.columns}
    assert cols == {
        "id", "campaign_id", "contact_id", "type", "status", "started_at",
        "ended_at", "duration_seconds", "transcript", "audio_url",
        "sentiment_score", "metadata", "created_at",
    }


def test_template_columns():
    cols = {c.name for c in Template.__table__.columns}
    assert cols == {
        "id", "org_id", "name", "type", "language", "content",
        "variables", "voice_config", "created_at",
    }


def test_tts_provider_config_columns():
    cols = {c.name for c in TTSProviderConfig.__table__.columns}
    assert cols == {
        "id", "org_id", "provider", "is_default", "voice", "rate",
        "pitch", "credentials_encrypted", "created_at", "updated_at",
    }


def test_analytics_event_columns():
    cols = {c.name for c in AnalyticsEvent.__table__.columns}
    assert cols == {"id", "interaction_id", "event_type", "event_data", "created_at"}


def test_campaign_foreign_keys():
    fks = {
        f"{fk.column.table.name}.{fk.column.name}"
        for fk in Campaign.__table__.foreign_keys
    }
    assert "organizations.id" in fks
    assert "templates.id" in fks


def test_interaction_foreign_keys():
    fks = {
        f"{fk.column.table.name}.{fk.column.name}"
        for fk in Interaction.__table__.foreign_keys
    }
    assert "campaigns.id" in fks
    assert "contacts.id" in fks


def test_tts_provider_config_unique_constraint():
    constraints = TTSProviderConfig.__table__.constraints
    unique_names = {
        c.name for c in constraints if c.__class__.__name__ == "UniqueConstraint"
    }
    assert "uq_tts_org_provider" in unique_names
