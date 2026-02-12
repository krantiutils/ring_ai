"""Tests for campaign re-targeting — retry failed contacts and relaunch campaigns."""

import io
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.models.template import Template
from app.services.campaigns import (
    CampaignError,
    InvalidStateTransition,
    MaxRetriesExceeded,
    NoFailedInteractions,
    _get_max_retries,
    _get_retry_backoff_minutes,
    execute_campaign_batch,
    relaunch_campaign,
    retry_campaign,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_csv(rows: list[list[str]], header: list[str] | None = None) -> bytes:
    buf = io.StringIO()
    if header is None:
        header = ["phone", "name"]
    buf.write(",".join(header) + "\n")
    for row in rows:
        buf.write(",".join(row) + "\n")
    return buf.getvalue().encode("utf-8")


def _upload_csv(client, campaign_id, csv_bytes):
    return client.post(
        f"/api/v1/campaigns/{campaign_id}/contacts",
        files={"file": ("contacts.csv", csv_bytes, "text/csv")},
    )


def _completed_campaign_with_failures(db, org, *, num_completed=1, num_failed=2):
    """Create a completed campaign with a mix of completed and failed interactions."""
    template = Template(
        name="Retry Test Template",
        content="Hello {name}",
        type="voice",
        org_id=org.id,
    )
    db.add(template)
    db.flush()

    campaign = Campaign(
        name="Retry Test",
        type="voice",
        org_id=org.id,
        status="completed",
        template_id=template.id,
    )
    db.add(campaign)
    db.flush()

    contacts = []
    for i in range(num_completed + num_failed):
        contact = Contact(
            phone=f"+977980000000{i}",
            name=f"Contact{i}",
            org_id=org.id,
        )
        db.add(contact)
        db.flush()
        contacts.append(contact)

    interactions = []
    for i, contact in enumerate(contacts):
        status = "completed" if i < num_completed else "failed"
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status=status,
            ended_at=datetime.now(timezone.utc),
            metadata_={
                "last_webhook_status": "completed" if status == "completed" else "no-answer",
            },
        )
        db.add(interaction)
        interactions.append(interaction)

    db.commit()
    return campaign, contacts, interactions


# ---------------------------------------------------------------------------
# Service-level tests: retry_campaign
# ---------------------------------------------------------------------------


class TestRetryCampaignService:
    def test_retry_creates_new_interactions(self, db, org):
        campaign, contacts, interactions = _completed_campaign_with_failures(
            db, org, num_completed=1, num_failed=2
        )

        retried, scheduled_at = retry_campaign(db, campaign)

        assert retried == 2
        assert scheduled_at is None  # First retry is immediate
        assert campaign.status == "active"
        assert campaign.retry_count == 1

        # Verify new pending interactions were created
        pending = db.execute(
            Interaction.__table__.select().where(
                Interaction.campaign_id == campaign.id,
                Interaction.status == "pending",
            )
        ).fetchall()
        assert len(pending) == 2

        # Verify retry_round metadata
        for row in pending:
            metadata = row.metadata
            assert metadata["retry_round"] == 1

    def test_retry_deduplicates_contacts(self, db, org):
        """If a contact has multiple failed interactions, only one retry is created."""
        template = Template(
            name="Dedup Test", content="Hi", type="voice", org_id=org.id
        )
        db.add(template)
        db.flush()

        campaign = Campaign(
            name="Dedup", type="voice", org_id=org.id,
            status="completed", template_id=template.id,
        )
        db.add(campaign)
        db.flush()

        contact = Contact(phone="+9779800000000", name="Dup", org_id=org.id)
        db.add(contact)
        db.flush()

        # Two failed interactions for the same contact
        for _ in range(2):
            db.add(Interaction(
                campaign_id=campaign.id,
                contact_id=contact.id,
                type="outbound_call",
                status="failed",
            ))
        db.commit()

        retried, _ = retry_campaign(db, campaign)
        assert retried == 1  # Only one retry per contact

    def test_retry_non_completed_campaign_raises(self, db, org):
        campaign, _, _ = _completed_campaign_with_failures(db, org)
        campaign.status = "draft"
        db.commit()

        with pytest.raises(InvalidStateTransition):
            retry_campaign(db, campaign)

    def test_retry_active_campaign_raises(self, db, org):
        campaign, _, _ = _completed_campaign_with_failures(db, org)
        campaign.status = "active"
        db.commit()

        with pytest.raises(InvalidStateTransition):
            retry_campaign(db, campaign)

    def test_retry_max_retries_exceeded(self, db, org):
        campaign, _, _ = _completed_campaign_with_failures(db, org)
        campaign.retry_count = 3  # Already at max
        db.commit()

        with pytest.raises(MaxRetriesExceeded, match="3 time"):
            retry_campaign(db, campaign)

    def test_retry_no_failed_interactions_raises(self, db, org):
        template = Template(
            name="All Good", content="Hi", type="voice", org_id=org.id
        )
        db.add(template)
        db.flush()

        campaign = Campaign(
            name="All Good", type="voice", org_id=org.id,
            status="completed", template_id=template.id,
        )
        db.add(campaign)
        db.flush()

        contact = Contact(phone="+9779800000000", org_id=org.id)
        db.add(contact)
        db.flush()

        db.add(Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="completed",
        ))
        db.commit()

        with pytest.raises(NoFailedInteractions):
            retry_campaign(db, campaign)

    def test_retry_increments_retry_count(self, db, org):
        campaign, _, _ = _completed_campaign_with_failures(db, org)
        assert campaign.retry_count == 0

        retry_campaign(db, campaign)
        assert campaign.retry_count == 1

        # Mark new interactions as failed and set campaign back to completed
        # to test second retry
        for interaction in db.execute(
            Interaction.__table__.select().where(
                Interaction.campaign_id == campaign.id,
                Interaction.status == "pending",
            )
        ).fetchall():
            db.execute(
                Interaction.__table__.update()
                .where(Interaction.id == interaction.id)
                .values(status="failed")
            )
        campaign.status = "completed"
        db.commit()

        retry_campaign(db, campaign)
        assert campaign.retry_count == 2


# ---------------------------------------------------------------------------
# Service-level tests: backoff scheduling
# ---------------------------------------------------------------------------


class TestRetryBackoff:
    def test_first_retry_immediate(self, db, org):
        """First retry (retry_count=0 → 1) should be immediate (delay=0)."""
        campaign, _, _ = _completed_campaign_with_failures(db, org)

        retried, scheduled_at = retry_campaign(db, campaign)

        assert scheduled_at is None
        assert campaign.status == "active"

    @patch("app.services.campaigns.settings")
    def test_second_retry_delayed(self, mock_settings, db, org):
        """Second retry should be scheduled with 30-min delay."""
        mock_settings.CAMPAIGN_RETRY_BACKOFF_MINUTES = [0, 30, 120]
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_BATCH_SIZE = 50

        campaign, _, _ = _completed_campaign_with_failures(db, org)
        campaign.retry_count = 1  # Already retried once
        db.commit()

        retried, scheduled_at = retry_campaign(db, campaign)

        assert scheduled_at is not None
        assert campaign.status == "scheduled"
        assert campaign.retry_count == 2
        # Should be roughly 30 minutes from now
        expected = datetime.now(timezone.utc) + timedelta(minutes=30)
        assert abs((scheduled_at - expected).total_seconds()) < 5

    @patch("app.services.campaigns.settings")
    def test_third_retry_2_hour_delay(self, mock_settings, db, org):
        """Third retry should be scheduled with 2-hour delay."""
        mock_settings.CAMPAIGN_RETRY_BACKOFF_MINUTES = [0, 30, 120]
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_BATCH_SIZE = 50

        campaign, _, _ = _completed_campaign_with_failures(db, org)
        campaign.retry_count = 2
        db.commit()

        retried, scheduled_at = retry_campaign(db, campaign)

        assert scheduled_at is not None
        assert campaign.status == "scheduled"
        assert campaign.retry_count == 3
        expected = datetime.now(timezone.utc) + timedelta(minutes=120)
        assert abs((scheduled_at - expected).total_seconds()) < 5

    def test_custom_retry_config_overrides_defaults(self, db, org):
        """Per-campaign retry_config should override global settings."""
        campaign, _, _ = _completed_campaign_with_failures(db, org)
        campaign.retry_config = {
            "max_retries": 5,
            "backoff_minutes": [0, 10, 20, 40, 80],
        }
        db.commit()

        assert _get_max_retries(campaign) == 5
        assert _get_retry_backoff_minutes(campaign) == [0, 10, 20, 40, 80]

    def test_custom_max_retries(self, db, org):
        """Per-campaign max_retries should be respected."""
        campaign, _, _ = _completed_campaign_with_failures(db, org)
        campaign.retry_config = {"max_retries": 1}
        campaign.retry_count = 1
        db.commit()

        with pytest.raises(MaxRetriesExceeded):
            retry_campaign(db, campaign)


# ---------------------------------------------------------------------------
# Service-level tests: relaunch_campaign
# ---------------------------------------------------------------------------


class TestRelaunchCampaignService:
    def test_relaunch_creates_new_draft_campaign(self, db, org):
        campaign, contacts, _ = _completed_campaign_with_failures(
            db, org, num_completed=1, num_failed=2
        )

        new_campaign, imported = relaunch_campaign(db, campaign)

        assert imported == 2
        assert new_campaign.status == "draft"
        assert new_campaign.name == "Retry Test (relaunch)"
        assert new_campaign.type == campaign.type
        assert new_campaign.org_id == campaign.org_id
        assert new_campaign.template_id == campaign.template_id
        assert new_campaign.source_campaign_id == campaign.id

    def test_relaunch_only_imports_failed_contacts(self, db, org):
        campaign, contacts, _ = _completed_campaign_with_failures(
            db, org, num_completed=3, num_failed=1
        )

        new_campaign, imported = relaunch_campaign(db, campaign)
        assert imported == 1

        # Verify the new campaign has exactly 1 pending interaction
        pending = db.execute(
            Interaction.__table__.select().where(
                Interaction.campaign_id == new_campaign.id,
            )
        ).fetchall()
        assert len(pending) == 1
        assert pending[0].status == "pending"

    def test_relaunch_preserves_retry_config(self, db, org):
        campaign, _, _ = _completed_campaign_with_failures(db, org)
        campaign.retry_config = {"max_retries": 5, "backoff_minutes": [0, 5]}
        campaign.schedule_config = {"mode": "immediate"}
        db.commit()

        new_campaign, _ = relaunch_campaign(db, campaign)

        assert new_campaign.retry_config == campaign.retry_config
        assert new_campaign.schedule_config == campaign.schedule_config

    def test_relaunch_draft_campaign_raises(self, db, org):
        campaign, _, _ = _completed_campaign_with_failures(db, org)
        campaign.status = "draft"
        db.commit()

        with pytest.raises(CampaignError, match="draft"):
            relaunch_campaign(db, campaign)

    def test_relaunch_no_failed_interactions_raises(self, db, org):
        template = Template(
            name="Perfect", content="Hi", type="voice", org_id=org.id
        )
        db.add(template)
        db.flush()

        campaign = Campaign(
            name="Perfect", type="voice", org_id=org.id,
            status="completed", template_id=template.id,
        )
        db.add(campaign)
        db.flush()

        contact = Contact(phone="+9779800000000", org_id=org.id)
        db.add(contact)
        db.flush()

        db.add(Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="completed",
        ))
        db.commit()

        with pytest.raises(NoFailedInteractions):
            relaunch_campaign(db, campaign)

    def test_relaunch_records_source_in_metadata(self, db, org):
        campaign, _, _ = _completed_campaign_with_failures(db, org)

        new_campaign, _ = relaunch_campaign(db, campaign)

        # Check interaction metadata
        interactions = db.execute(
            Interaction.__table__.select().where(
                Interaction.campaign_id == new_campaign.id,
            )
        ).fetchall()
        for interaction in interactions:
            assert interaction.metadata["source_campaign_id"] == str(campaign.id)


# ---------------------------------------------------------------------------
# API-level tests: POST /retry
# ---------------------------------------------------------------------------


NONEXISTENT_UUID = str(uuid.uuid4())


def _create_campaign(client, org_id, **overrides):
    payload = {
        "name": "Test Campaign",
        "type": "voice",
        "org_id": str(org_id),
        **overrides,
    }
    resp = client.post("/api/v1/campaigns/", json=payload)
    assert resp.status_code == 201
    return resp.json()


class TestRetryCampaignAPI:
    def _completed_campaign(self, client, org_id, db):
        """Create a completed campaign via API with some failed interactions."""
        created = _create_campaign(client, org_id)
        campaign_id = uuid.UUID(created["id"])

        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
            ["+9779801234568", "Sita"],
            ["+9779801234569", "Hari"],
        ])
        _upload_csv(client, created["id"], csv_bytes)

        # Manually set campaign to completed with mixed results
        campaign = db.get(Campaign, campaign_id)
        campaign.status = "completed"

        interactions = db.execute(
            Interaction.__table__.select().where(
                Interaction.campaign_id == campaign_id,
            )
        ).fetchall()

        # First interaction: completed, others: failed
        for i, row in enumerate(interactions):
            status = "completed" if i == 0 else "failed"
            db.execute(
                Interaction.__table__.update()
                .where(Interaction.id == row.id)
                .values(status=status)
            )
        db.commit()

        return created

    def test_retry_returns_correct_response(self, client, org_id, db):
        created = self._completed_campaign(client, org_id, db)

        resp = client.post(f"/api/v1/campaigns/{created['id']}/retry")

        assert resp.status_code == 200
        data = resp.json()
        assert data["retried_count"] == 2
        assert data["retry_round"] == 1
        assert data["status"] == "active"
        assert data["scheduled_at"] is None

    def test_retry_not_found(self, client):
        resp = client.post(f"/api/v1/campaigns/{NONEXISTENT_UUID}/retry")
        assert resp.status_code == 404

    def test_retry_draft_campaign_rejected(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.post(f"/api/v1/campaigns/{created['id']}/retry")
        assert resp.status_code == 409

    def test_retry_max_retries_rejected(self, client, org_id, db):
        created = self._completed_campaign(client, org_id, db)
        campaign = db.get(Campaign, uuid.UUID(created["id"]))
        campaign.retry_count = 3
        db.commit()

        resp = client.post(f"/api/v1/campaigns/{created['id']}/retry")
        assert resp.status_code == 409
        assert "retried" in resp.json()["detail"].lower()

    def test_retry_with_custom_config(self, client, org_id, db):
        created = self._completed_campaign(client, org_id, db)

        resp = client.post(
            f"/api/v1/campaigns/{created['id']}/retry",
            json={"retry_config": {"max_retries": 5, "backoff_minutes": [0]}},
        )
        assert resp.status_code == 200

        # Verify config was persisted
        campaign = db.get(Campaign, uuid.UUID(created["id"]))
        assert campaign.retry_config["max_retries"] == 5

    def test_retry_response_fields(self, client, org_id, db):
        created = self._completed_campaign(client, org_id, db)

        resp = client.post(f"/api/v1/campaigns/{created['id']}/retry")
        data = resp.json()

        assert "campaign_id" in data
        assert "retry_round" in data
        assert "retried_count" in data
        assert "scheduled_at" in data
        assert "status" in data

    def test_campaign_response_includes_retry_fields(self, client, org_id, db):
        """Verify GET campaign returns retry_count and retry_config."""
        created = self._completed_campaign(client, org_id, db)

        resp = client.get(f"/api/v1/campaigns/{created['id']}")
        data = resp.json()
        assert "retry_count" in data
        assert data["retry_count"] == 0
        assert "retry_config" in data
        assert "source_campaign_id" in data


# ---------------------------------------------------------------------------
# API-level tests: POST /relaunch
# ---------------------------------------------------------------------------


class TestRelaunchCampaignAPI:
    def _completed_campaign(self, client, org_id, db):
        """Create a completed campaign via API with some failed interactions."""
        created = _create_campaign(client, org_id)
        campaign_id = uuid.UUID(created["id"])

        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
            ["+9779801234568", "Sita"],
        ])
        _upload_csv(client, created["id"], csv_bytes)

        campaign = db.get(Campaign, campaign_id)
        campaign.status = "completed"

        interactions = db.execute(
            Interaction.__table__.select().where(
                Interaction.campaign_id == campaign_id,
            )
        ).fetchall()

        # First: completed, second: failed
        for i, row in enumerate(interactions):
            status = "completed" if i == 0 else "failed"
            db.execute(
                Interaction.__table__.update()
                .where(Interaction.id == row.id)
                .values(status=status)
            )
        db.commit()

        return created

    def test_relaunch_returns_correct_response(self, client, org_id, db):
        created = self._completed_campaign(client, org_id, db)

        resp = client.post(f"/api/v1/campaigns/{created['id']}/relaunch")

        assert resp.status_code == 201
        data = resp.json()
        assert data["source_campaign_id"] == created["id"]
        assert data["contacts_imported"] == 1
        assert data["status"] == "draft"
        assert "new_campaign_id" in data

    def test_relaunch_new_campaign_is_accessible(self, client, org_id, db):
        created = self._completed_campaign(client, org_id, db)

        resp = client.post(f"/api/v1/campaigns/{created['id']}/relaunch")
        new_id = resp.json()["new_campaign_id"]

        # The new campaign should be retrievable
        resp = client.get(f"/api/v1/campaigns/{new_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "draft"
        assert data["source_campaign_id"] == created["id"]
        assert "(relaunch)" in data["name"]

    def test_relaunch_new_campaign_has_contacts(self, client, org_id, db):
        created = self._completed_campaign(client, org_id, db)

        resp = client.post(f"/api/v1/campaigns/{created['id']}/relaunch")
        new_id = resp.json()["new_campaign_id"]

        resp = client.get(f"/api/v1/campaigns/{new_id}/contacts")
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_relaunch_not_found(self, client):
        resp = client.post(f"/api/v1/campaigns/{NONEXISTENT_UUID}/relaunch")
        assert resp.status_code == 404

    def test_relaunch_draft_campaign_rejected(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.post(f"/api/v1/campaigns/{created['id']}/relaunch")
        assert resp.status_code == 409

    def test_relaunch_no_failed_contacts_rejected(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        campaign_id = uuid.UUID(created["id"])

        csv_bytes = _make_csv([["+9779801234567", "Ram"]])
        _upload_csv(client, created["id"], csv_bytes)

        campaign = db.get(Campaign, campaign_id)
        campaign.status = "completed"
        db.execute(
            Interaction.__table__.update()
            .where(Interaction.campaign_id == campaign_id)
            .values(status="completed")
        )
        db.commit()

        resp = client.post(f"/api/v1/campaigns/{created['id']}/relaunch")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Integration: retry + batch executor
# ---------------------------------------------------------------------------


class _NoCloseSession:
    """Wrapper that delegates to a real session but ignores close()."""

    def __init__(self, session):
        self._session = session

    def close(self):
        pass

    def __getattr__(self, name):
        return getattr(self._session, name)


def _make_db_factory(db):
    return lambda: _NoCloseSession(db)


def _mock_tts_and_twilio():
    mock_tts = MagicMock()
    mock_tts.synthesize = AsyncMock(
        return_value=MagicMock(
            audio_bytes=b"fake-audio-data",
            duration_ms=5000,
            provider_used="edge_tts",
            chars_consumed=50,
            output_format="mp3",
        )
    )

    mock_provider = MagicMock()
    mock_provider.default_from_number = "+15551234567"
    mock_provider.initiate_call = AsyncMock(
        return_value=MagicMock(call_id="CA-retry-001", status="initiated")
    )

    return mock_tts, mock_provider


class TestRetryWithBatchExecutor:
    """Integration test: retry creates interactions, then batch executor dispatches them."""

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    @patch("app.services.campaigns.tts_router")
    def test_retry_interactions_dispatched(
        self,
        mock_tts,
        mock_get_provider,
        mock_settings,
        db,
        org,
    ):
        # Configure mock settings before any service calls
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.CAMPAIGN_RETRY_BACKOFF_MINUTES = [0, 30, 120]
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        campaign, contacts, interactions = _completed_campaign_with_failures(
            db, org, num_completed=1, num_failed=2
        )

        # Retry the campaign
        retried, scheduled_at = retry_campaign(db, campaign)
        assert retried == 2
        assert campaign.status == "active"

        # Now run the batch executor
        mock_tts_router, mock_provider = _mock_tts_and_twilio()
        call_count = [0]

        async def _call_side_effect(**kwargs):
            call_count[0] += 1
            return MagicMock(call_id=f"CA-retry-{call_count[0]:03d}", status="initiated")

        mock_tts.synthesize = mock_tts_router.synthesize
        mock_provider.initiate_call = AsyncMock(side_effect=_call_side_effect)
        mock_get_provider.return_value = mock_provider

        execute_campaign_batch(campaign.id, _make_db_factory(db))

        # Both retry interactions should have been dispatched
        assert mock_tts.synthesize.call_count == 2
        assert mock_provider.initiate_call.call_count == 2
