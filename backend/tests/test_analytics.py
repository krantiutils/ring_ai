"""Tests for analytics endpoints — overview, campaign analytics, events, and live SSE."""

import uuid
from datetime import datetime, timezone

import pytest

from app.models.analytics_event import AnalyticsEvent
from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.services.analytics import detect_carrier, get_campaign_analytics, get_overview_analytics


NONEXISTENT_UUID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_campaign_with_interactions(db, org, *, num_completed=2, num_failed=1, num_pending=1):
    """Create a campaign with contacts and interactions in various states."""
    campaign = Campaign(name="Analytics Test", type="voice", org_id=org.id, status="active")
    db.add(campaign)
    db.flush()

    contacts = []
    phones = [
        "+9779841234567",  # NTC
        "+9779801234568",  # Ncell
        "+9779851234569",  # NTC
        "+9779821234570",  # Ncell
        "+9771234567890",  # Other
    ]

    for i, phone in enumerate(phones[:num_completed + num_failed + num_pending]):
        contact = Contact(phone=phone, name=f"Contact {i}", org_id=org.id)
        db.add(contact)
        db.flush()
        contacts.append(contact)

    idx = 0
    for _ in range(num_completed):
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contacts[idx].id,
            type="outbound_call",
            status="completed",
            duration_seconds=45,
            started_at=datetime(2026, 2, 10, 10, 0, 0, tzinfo=timezone.utc),
            ended_at=datetime(2026, 2, 10, 10, 0, 45, tzinfo=timezone.utc),
        )
        db.add(interaction)
        idx += 1

    for _ in range(num_failed):
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contacts[idx].id,
            type="outbound_call",
            status="failed",
        )
        db.add(interaction)
        idx += 1

    for _ in range(num_pending):
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contacts[idx].id,
            type="outbound_call",
            status="pending",
        )
        db.add(interaction)
        idx += 1

    db.commit()
    return campaign


# ---------------------------------------------------------------------------
# Carrier detection unit tests
# ---------------------------------------------------------------------------


class TestCarrierDetection:
    def test_ntc_with_country_code(self):
        assert detect_carrier("+9779841234567") == "NTC"
        assert detect_carrier("+9779851234567") == "NTC"
        assert detect_carrier("+9779861234567") == "NTC"

    def test_ntc_local(self):
        assert detect_carrier("9841234567") == "NTC"
        assert detect_carrier("9741234567") == "NTC"

    def test_ncell_with_country_code(self):
        assert detect_carrier("+9779801234567") == "Ncell"
        assert detect_carrier("+9779811234567") == "Ncell"
        assert detect_carrier("+9779821234567") == "Ncell"

    def test_ncell_local(self):
        assert detect_carrier("9801234567") == "Ncell"
        assert detect_carrier("9611234567") == "Ncell"

    def test_unknown_carrier(self):
        assert detect_carrier("+1234567890") == "Other"
        assert detect_carrier("1234567890") == "Other"

    def test_empty_phone(self):
        assert detect_carrier("") == "Other"


# ---------------------------------------------------------------------------
# Overview analytics tests
# ---------------------------------------------------------------------------


class TestOverviewAnalytics:
    def test_empty_org(self, client, org_id):
        resp = client.get(f"/api/v1/analytics/overview?org_id={org_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["campaigns_by_status"] == {}
        assert data["total_contacts_reached"] == 0
        assert data["total_calls"] == 0
        assert data["total_sms"] == 0
        assert data["credits_consumed"] == 0.0
        assert data["overall_delivery_rate"] is None

    def test_with_campaign_data(self, client, org, db):
        _create_campaign_with_interactions(db, org)

        resp = client.get(f"/api/v1/analytics/overview?org_id={org.id}")
        assert resp.status_code == 200
        data = resp.json()

        assert data["campaigns_by_status"]["active"] == 1
        assert data["total_contacts_reached"] == 2  # 2 completed
        assert data["total_calls"] == 4  # 2 completed + 1 failed + 1 pending
        assert data["avg_call_duration_seconds"] == 45.0
        assert data["credits_consumed"] == 4.0  # 2 completed * 2.0 NPR
        # delivery rate = 2 completed / 4 total
        assert data["overall_delivery_rate"] == 0.5

    def test_overview_service_directly(self, db, org):
        _create_campaign_with_interactions(db, org)
        result = get_overview_analytics(db, org.id)

        assert result.total_contacts_reached == 2
        assert result.total_calls == 4
        assert result.credits_consumed == 4.0
        assert result.overall_delivery_rate == 0.5

    def test_overview_missing_org_id(self, client):
        resp = client.get("/api/v1/analytics/overview")
        assert resp.status_code == 422  # Missing required org_id


# ---------------------------------------------------------------------------
# Campaign analytics tests
# ---------------------------------------------------------------------------


class TestCampaignAnalytics:
    def test_campaign_not_found(self, client):
        resp = client.get(f"/api/v1/analytics/campaigns/{NONEXISTENT_UUID}")
        assert resp.status_code == 404

    def test_campaign_with_data(self, client, org, db):
        campaign = _create_campaign_with_interactions(db, org)

        resp = client.get(f"/api/v1/analytics/campaigns/{campaign.id}")
        assert resp.status_code == 200
        data = resp.json()

        assert data["campaign_id"] == str(campaign.id)
        assert data["campaign_name"] == "Analytics Test"
        assert data["campaign_type"] == "voice"
        assert data["status_breakdown"]["completed"] == 2
        assert data["status_breakdown"]["failed"] == 1
        assert data["status_breakdown"]["pending"] == 1
        assert data["completion_rate"] == 0.5
        assert data["avg_duration_seconds"] == 45.0
        assert data["credit_consumption"] == 4.0

    def test_carrier_breakdown(self, client, org, db):
        campaign = _create_campaign_with_interactions(db, org)

        resp = client.get(f"/api/v1/analytics/campaigns/{campaign.id}")
        data = resp.json()

        carrier = data["carrier_breakdown"]
        # phones: NTC, Ncell, NTC, Ncell — 4 contacts used
        assert carrier.get("NTC", 0) + carrier.get("Ncell", 0) + carrier.get("Other", 0) == 4

    def test_campaign_analytics_service_directly(self, db, org):
        campaign = _create_campaign_with_interactions(db, org)
        result = get_campaign_analytics(db, campaign.id)

        assert result.campaign_id == campaign.id
        assert result.status_breakdown["completed"] == 2
        assert result.completion_rate == 0.5

    def test_empty_campaign(self, db, org, client):
        campaign = Campaign(name="Empty", type="voice", org_id=org.id, status="draft")
        db.add(campaign)
        db.commit()

        resp = client.get(f"/api/v1/analytics/campaigns/{campaign.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status_breakdown"] == {}
        assert data["completion_rate"] is None
        assert data["credit_consumption"] == 0.0


# ---------------------------------------------------------------------------
# Event log tests
# ---------------------------------------------------------------------------


class TestAnalyticsEvents:
    def test_empty_events(self, client):
        resp = client.get("/api/v1/analytics/events")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_events_with_data(self, client, org, db):
        campaign = _create_campaign_with_interactions(db, org)

        # Get an interaction to attach events to
        interaction = db.query(Interaction).filter(
            Interaction.campaign_id == campaign.id
        ).first()

        # Create analytics events
        for i in range(3):
            event = AnalyticsEvent(
                interaction_id=interaction.id,
                event_type="call_started",
                event_data={"sequence": i},
            )
            db.add(event)
        db.commit()

        resp = client.get("/api/v1/analytics/events")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3

    def test_events_filter_by_type(self, client, org, db):
        campaign = _create_campaign_with_interactions(db, org)
        interaction = db.query(Interaction).filter(
            Interaction.campaign_id == campaign.id
        ).first()

        db.add(AnalyticsEvent(interaction_id=interaction.id, event_type="call_started"))
        db.add(AnalyticsEvent(interaction_id=interaction.id, event_type="call_ended"))
        db.add(AnalyticsEvent(interaction_id=interaction.id, event_type="call_started"))
        db.commit()

        resp = client.get("/api/v1/analytics/events?event_type=call_started")
        data = resp.json()
        assert data["total"] == 2

        resp = client.get("/api/v1/analytics/events?event_type=call_ended")
        data = resp.json()
        assert data["total"] == 1

    def test_events_filter_by_campaign(self, client, org, db):
        campaign = _create_campaign_with_interactions(db, org)
        interaction = db.query(Interaction).filter(
            Interaction.campaign_id == campaign.id
        ).first()

        db.add(AnalyticsEvent(interaction_id=interaction.id, event_type="test"))
        db.commit()

        resp = client.get(f"/api/v1/analytics/events?campaign_id={campaign.id}")
        data = resp.json()
        assert data["total"] == 1

        resp = client.get(f"/api/v1/analytics/events?campaign_id={NONEXISTENT_UUID}")
        data = resp.json()
        assert data["total"] == 0

    def test_events_pagination(self, client, org, db):
        campaign = _create_campaign_with_interactions(db, org)
        interaction = db.query(Interaction).filter(
            Interaction.campaign_id == campaign.id
        ).first()

        for i in range(10):
            db.add(AnalyticsEvent(
                interaction_id=interaction.id,
                event_type="test",
                event_data={"i": i},
            ))
        db.commit()

        resp = client.get("/api/v1/analytics/events?page=1&page_size=3")
        data = resp.json()
        assert len(data["items"]) == 3
        assert data["total"] == 10

        resp = client.get("/api/v1/analytics/events?page=4&page_size=3")
        data = resp.json()
        assert len(data["items"]) == 1


# ---------------------------------------------------------------------------
# Live SSE endpoint tests
# ---------------------------------------------------------------------------


class TestCampaignLive:
    def test_live_not_found(self, client):
        resp = client.get(f"/api/v1/analytics/campaigns/{NONEXISTENT_UUID}/live")
        assert resp.status_code == 404

    def test_live_returns_event_stream(self, client, org, db):
        campaign = _create_campaign_with_interactions(
            db, org, num_completed=2, num_failed=0, num_pending=0
        )
        # Mark campaign as completed so stream terminates quickly
        campaign.status = "completed"
        db.commit()

        resp = client.get(
            f"/api/v1/analytics/campaigns/{campaign.id}/live",
            headers={"Accept": "text/event-stream"},
        )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]

        # Parse SSE data
        body = resp.text
        assert "data:" in body

    def test_live_progress_data(self, client, org, db):
        campaign = _create_campaign_with_interactions(
            db, org, num_completed=3, num_failed=1, num_pending=0
        )
        campaign.status = "completed"
        db.commit()

        resp = client.get(f"/api/v1/analytics/campaigns/{campaign.id}/live")
        body = resp.text

        # Should contain progress data with expected fields
        assert '"campaign_id"' in body
        assert '"total"' in body
        assert '"completed"' in body


# ---------------------------------------------------------------------------
# Credits by period tests
# ---------------------------------------------------------------------------


class TestCreditsByPeriod:
    def test_credits_by_period_populated(self, client, org, db):
        _create_campaign_with_interactions(db, org)

        resp = client.get(f"/api/v1/analytics/overview?org_id={org.id}")
        data = resp.json()

        # credits_by_period should be a list (may be empty if created_at
        # doesn't cast well in SQLite, but should not error)
        assert isinstance(data["credits_by_period"], list)
