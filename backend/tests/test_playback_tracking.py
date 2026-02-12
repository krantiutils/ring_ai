"""Tests for playback tracking — voice message listen duration analytics."""

import csv
import io
import uuid

import pytest

from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.services.campaigns import calculate_stats, generate_report_csv
from app.services.telephony import AudioEntry, CallContext, audio_store, call_context_store


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clean_stores():
    """Clean in-memory stores before each test."""
    audio_store._store.clear()
    call_context_store._store.clear()
    yield
    audio_store._store.clear()
    call_context_store._store.clear()


def _make_campaign(db, org, status="active"):
    campaign = Campaign(name="Playback Test", type="voice", org_id=org.id, status=status)
    db.add(campaign)
    db.flush()
    return campaign


def _make_contact(db, org, phone="+9779841234567", name="Ram"):
    contact = Contact(phone=phone, name=name, org_id=org.id)
    db.add(contact)
    db.flush()
    return contact


def _make_interaction(db, campaign, contact, **kwargs):
    defaults = {
        "type": "outbound_call",
        "status": "completed",
        "duration_seconds": 30,
        "audio_duration_seconds": 30,
        "playback_duration_seconds": 25,
        "playback_percentage": 83.3,
    }
    defaults.update(kwargs)
    interaction = Interaction(
        campaign_id=campaign.id,
        contact_id=contact.id,
        **defaults,
    )
    db.add(interaction)
    db.flush()
    return interaction


# ---------------------------------------------------------------------------
# Model column tests
# ---------------------------------------------------------------------------


class TestInteractionPlaybackColumns:
    def test_playback_fields_nullable(self, db, org):
        """Playback columns should be nullable (None by default)."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="pending",
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        assert interaction.audio_duration_seconds is None
        assert interaction.playback_duration_seconds is None
        assert interaction.playback_percentage is None

    def test_playback_fields_stored(self, db, org):
        """Playback columns should store and retrieve values correctly."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)
        interaction = _make_interaction(
            db, campaign, contact,
            audio_duration_seconds=45,
            playback_duration_seconds=30,
            playback_percentage=66.7,
        )
        db.commit()
        db.refresh(interaction)

        assert interaction.audio_duration_seconds == 45
        assert interaction.playback_duration_seconds == 30
        assert abs(interaction.playback_percentage - 66.7) < 0.01


# ---------------------------------------------------------------------------
# Webhook playback calculation tests
# ---------------------------------------------------------------------------


class TestWebhookPlaybackCalculation:
    """Test that the webhook correctly calculates playback metrics."""

    def test_webhook_calculates_playback_percentage(self, client, db, org):
        """Completed call with known audio duration should compute playback %."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="in_progress",
            audio_duration_seconds=30,
            metadata_={"twilio_call_sid": "CA-pb-1"},
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        ctx = CallContext(call_id="CA-pb-1", audio_id="a-pb-1", interaction_id=interaction.id)
        call_context_store.put("CA-pb-1", ctx)
        audio_store.put("a-pb-1", AudioEntry(audio_bytes=b"data"))

        response = client.post(
            "/api/v1/voice/webhook",
            data={
                "CallSid": "CA-pb-1",
                "CallStatus": "completed",
                "CallDuration": "20",
            },
        )
        assert response.status_code == 200

        db.refresh(interaction)
        assert interaction.duration_seconds == 20
        assert interaction.playback_duration_seconds == 20
        assert abs(interaction.playback_percentage - 66.7) < 0.1

    def test_webhook_caps_playback_at_100_percent(self, client, db, org):
        """If CallDuration > audio duration, playback is capped at audio duration / 100%."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="in_progress",
            audio_duration_seconds=20,
            metadata_={"twilio_call_sid": "CA-pb-2"},
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        ctx = CallContext(call_id="CA-pb-2", audio_id="a-pb-2", interaction_id=interaction.id)
        call_context_store.put("CA-pb-2", ctx)
        audio_store.put("a-pb-2", AudioEntry(audio_bytes=b"data"))

        response = client.post(
            "/api/v1/voice/webhook",
            data={
                "CallSid": "CA-pb-2",
                "CallStatus": "completed",
                "CallDuration": "35",
            },
        )
        assert response.status_code == 200

        db.refresh(interaction)
        # CallDuration (35) > audio_duration (20), so playback capped at 20
        assert interaction.playback_duration_seconds == 20
        assert interaction.playback_percentage == 100.0

    def test_webhook_full_listen(self, client, db, org):
        """Listener hears entire message — realistic 45s audio, 45s call."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="in_progress",
            audio_duration_seconds=45,
            metadata_={"twilio_call_sid": "CA-pb-3"},
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        ctx = CallContext(call_id="CA-pb-3", audio_id="a-pb-3", interaction_id=interaction.id)
        call_context_store.put("CA-pb-3", ctx)
        audio_store.put("a-pb-3", AudioEntry(audio_bytes=b"data"))

        client.post(
            "/api/v1/voice/webhook",
            data={
                "CallSid": "CA-pb-3",
                "CallStatus": "completed",
                "CallDuration": "45",
            },
        )

        db.refresh(interaction)
        assert interaction.playback_duration_seconds == 45
        assert interaction.playback_percentage == 100.0

    def test_webhook_no_audio_duration_still_stores_playback(self, client, db, org):
        """If audio_duration_seconds is unknown, still store call duration as playback."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="in_progress",
            metadata_={"twilio_call_sid": "CA-pb-4"},
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        ctx = CallContext(call_id="CA-pb-4", audio_id="a-pb-4", interaction_id=interaction.id)
        call_context_store.put("CA-pb-4", ctx)
        audio_store.put("a-pb-4", AudioEntry(audio_bytes=b"data"))

        client.post(
            "/api/v1/voice/webhook",
            data={
                "CallSid": "CA-pb-4",
                "CallStatus": "completed",
                "CallDuration": "15",
            },
        )

        db.refresh(interaction)
        assert interaction.playback_duration_seconds == 15
        assert interaction.playback_percentage is None

    def test_webhook_partial_listen_realistic_durations(self, client, db, org):
        """Realistic scenario: 60s audio message, listener hangs up at 18s."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="in_progress",
            audio_duration_seconds=60,
            metadata_={"twilio_call_sid": "CA-pb-5"},
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        ctx = CallContext(call_id="CA-pb-5", audio_id="a-pb-5", interaction_id=interaction.id)
        call_context_store.put("CA-pb-5", ctx)
        audio_store.put("a-pb-5", AudioEntry(audio_bytes=b"data"))

        client.post(
            "/api/v1/voice/webhook",
            data={
                "CallSid": "CA-pb-5",
                "CallStatus": "completed",
                "CallDuration": "18",
            },
        )

        db.refresh(interaction)
        assert interaction.playback_duration_seconds == 18
        assert abs(interaction.playback_percentage - 30.0) < 0.1


# ---------------------------------------------------------------------------
# Campaign stats with playback tests
# ---------------------------------------------------------------------------


class TestCampaignStatsPlayback:
    def test_stats_include_playback_averages(self, db, org):
        """calculate_stats should return avg playback % and avg playback duration."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)

        # 3 completed interactions with different playback percentages
        for pct, dur in [(100.0, 30), (50.0, 15), (75.0, 22)]:
            _make_interaction(
                db, campaign, contact,
                playback_percentage=pct,
                playback_duration_seconds=dur,
                audio_duration_seconds=30,
            )
        db.commit()

        stats = calculate_stats(db, campaign.id)
        assert stats.avg_playback_percentage is not None
        assert abs(stats.avg_playback_percentage - 75.0) < 0.1
        assert stats.avg_playback_duration_seconds is not None
        expected_avg_dur = (30 + 15 + 22) / 3
        assert abs(stats.avg_playback_duration_seconds - expected_avg_dur) < 0.1

    def test_stats_playback_none_when_no_data(self, db, org):
        """Stats should show None playback when no interactions have playback data."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)

        # Pending interaction — no playback data
        _make_interaction(
            db, campaign, contact,
            status="pending",
            playback_percentage=None,
            playback_duration_seconds=None,
            duration_seconds=None,
        )
        db.commit()

        stats = calculate_stats(db, campaign.id)
        assert stats.avg_playback_percentage is None
        assert stats.avg_playback_duration_seconds is None

    def test_stats_playback_only_completed_interactions(self, db, org):
        """Only completed interactions should contribute to playback averages."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)

        # Completed with 80%
        _make_interaction(
            db, campaign, contact,
            status="completed",
            playback_percentage=80.0,
            playback_duration_seconds=24,
        )
        # Failed with 20% — should NOT count
        _make_interaction(
            db, campaign, contact,
            status="failed",
            playback_percentage=20.0,
            playback_duration_seconds=6,
        )
        db.commit()

        stats = calculate_stats(db, campaign.id)
        assert abs(stats.avg_playback_percentage - 80.0) < 0.1
        assert abs(stats.avg_playback_duration_seconds - 24.0) < 0.1


# ---------------------------------------------------------------------------
# CSV report with playback columns tests
# ---------------------------------------------------------------------------


class TestReportCsvPlayback:
    def test_report_header_includes_playback_columns(self, db, org):
        """CSV report header should include audio_duration, playback_duration, playback_percentage."""
        campaign = _make_campaign(db, org, status="draft")
        db.commit()

        rows = list(generate_report_csv(db, campaign.id))
        reader = csv.reader(io.StringIO(rows[0]))
        header = next(reader)
        assert "audio_duration" in header
        assert "playback_duration" in header
        assert "playback_percentage" in header

    def test_report_data_includes_playback_values(self, db, org):
        """CSV data rows should contain playback values."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)
        _make_interaction(
            db, campaign, contact,
            audio_duration_seconds=45,
            playback_duration_seconds=30,
            playback_percentage=66.7,
            duration_seconds=30,
            credit_consumed=2.0,
            audio_url="https://example.com/rec.mp3",
        )
        db.commit()

        rows = list(generate_report_csv(db, campaign.id))
        assert len(rows) == 2  # header + 1 data row

        reader = csv.reader(io.StringIO(rows[0]))
        header = next(reader)

        reader = csv.reader(io.StringIO(rows[1]))
        data = next(reader)

        audio_dur_idx = header.index("audio_duration")
        playback_dur_idx = header.index("playback_duration")
        playback_pct_idx = header.index("playback_percentage")

        assert data[audio_dur_idx] == "45"
        assert data[playback_dur_idx] == "30"
        assert data[playback_pct_idx] == "66.7"

    def test_report_null_playback_as_empty(self, db, org):
        """Null playback values should appear as empty strings in CSV."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)
        _make_interaction(
            db, campaign, contact,
            status="pending",
            audio_duration_seconds=None,
            playback_duration_seconds=None,
            playback_percentage=None,
            duration_seconds=None,
        )
        db.commit()

        rows = list(generate_report_csv(db, campaign.id))
        reader = csv.reader(io.StringIO(rows[0]))
        header = next(reader)

        reader = csv.reader(io.StringIO(rows[1]))
        data = next(reader)

        audio_dur_idx = header.index("audio_duration")
        playback_dur_idx = header.index("playback_duration")
        playback_pct_idx = header.index("playback_percentage")

        assert data[audio_dur_idx] == ""
        assert data[playback_dur_idx] == ""
        assert data[playback_pct_idx] == ""


# ---------------------------------------------------------------------------
# Analytics endpoint tests
# ---------------------------------------------------------------------------


class TestCampaignPlaybackEndpoint:
    def test_campaign_playback_detail(self, client, db, org):
        """GET /analytics/campaigns/{id}/playback returns per-contact breakdown."""
        campaign = _make_campaign(db, org)
        contact1 = _make_contact(db, org, phone="+9779841111111", name="Ram")
        contact2 = _make_contact(db, org, phone="+9779842222222", name="Sita")

        _make_interaction(
            db, campaign, contact1,
            playback_percentage=80.0,
            playback_duration_seconds=24,
            audio_duration_seconds=30,
            duration_seconds=24,
        )
        _make_interaction(
            db, campaign, contact2,
            playback_percentage=40.0,
            playback_duration_seconds=12,
            audio_duration_seconds=30,
            duration_seconds=12,
        )
        db.commit()

        resp = client.get(f"/api/v1/analytics/campaigns/{campaign.id}/playback")
        assert resp.status_code == 200
        data = resp.json()

        assert data["campaign_id"] == str(campaign.id)
        assert len(data["contacts"]) == 2
        assert data["avg_playback_percentage"] == 60.0
        assert data["avg_playback_duration_seconds"] == 18.0

    def test_campaign_playback_not_found(self, client):
        resp = client.get(f"/api/v1/analytics/campaigns/{uuid.uuid4()}/playback")
        assert resp.status_code == 404

    def test_campaign_playback_no_completed(self, client, db, org):
        """Campaign with only pending interactions — averages should be None."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)
        _make_interaction(
            db, campaign, contact,
            status="pending",
            playback_percentage=None,
            playback_duration_seconds=None,
            duration_seconds=None,
        )
        db.commit()

        resp = client.get(f"/api/v1/analytics/campaigns/{campaign.id}/playback")
        assert resp.status_code == 200
        data = resp.json()
        assert data["avg_playback_percentage"] is None
        assert data["avg_playback_duration_seconds"] is None


class TestPlaybackDistributionEndpoint:
    def test_distribution_buckets(self, client, db, org):
        """Playback distribution should categorize into 4 buckets."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)

        # Create interactions covering all 4 buckets
        for pct in [10.0, 20.0, 35.0, 60.0, 90.0, 100.0]:
            _make_interaction(
                db, campaign, contact,
                playback_percentage=pct,
                playback_duration_seconds=int(pct * 0.3),
            )
        db.commit()

        resp = client.get(
            f"/api/v1/analytics/campaigns/{campaign.id}/playback/distribution"
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["campaign_id"] == str(campaign.id)
        buckets = {b["bucket"]: b["count"] for b in data["buckets"]}
        assert buckets["0-25%"] == 2    # 10%, 20%
        assert buckets["26-50%"] == 1   # 35%
        assert buckets["51-75%"] == 1   # 60%
        assert buckets["76-100%"] == 2  # 90%, 100%

    def test_distribution_empty_campaign(self, client, db, org):
        """Empty campaign should return all buckets with 0 count."""
        campaign = _make_campaign(db, org)
        db.commit()

        resp = client.get(
            f"/api/v1/analytics/campaigns/{campaign.id}/playback/distribution"
        )
        assert resp.status_code == 200
        data = resp.json()
        for b in data["buckets"]:
            assert b["count"] == 0

    def test_distribution_not_found(self, client):
        resp = client.get(
            f"/api/v1/analytics/campaigns/{uuid.uuid4()}/playback/distribution"
        )
        assert resp.status_code == 404


class TestDashboardPlaybackEndpoint:
    def test_dashboard_playback_widget(self, client, db, org):
        """Dashboard widget returns org-wide average and distribution."""
        campaign = _make_campaign(db, org)
        contact = _make_contact(db, org)

        for pct in [25.0, 50.0, 75.0, 100.0]:
            _make_interaction(
                db, campaign, contact,
                playback_percentage=pct,
                playback_duration_seconds=int(pct * 0.3),
            )
        db.commit()

        resp = client.get(
            f"/api/v1/analytics/dashboard/playback?org_id={org.id}"
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["avg_playback_percentage"] == 62.5
        assert data["total_completed_calls"] == 4

        buckets = {b["bucket"]: b["count"] for b in data["distribution"]}
        assert buckets["0-25%"] == 1
        assert buckets["26-50%"] == 1
        assert buckets["51-75%"] == 1
        assert buckets["76-100%"] == 1

    def test_dashboard_no_data(self, client, db, org):
        """Dashboard with no campaigns/interactions — None average, 0 counts."""
        resp = client.get(
            f"/api/v1/analytics/dashboard/playback?org_id={org.id}"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["avg_playback_percentage"] is None
        assert data["total_completed_calls"] == 0
        for b in data["distribution"]:
            assert b["count"] == 0

    def test_dashboard_requires_org_id(self, client):
        """Missing org_id should return 422."""
        resp = client.get("/api/v1/analytics/dashboard/playback")
        assert resp.status_code == 422
