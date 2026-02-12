"""Tests for campaign management API — CRUD, lifecycle, contacts, and stats."""

import csv
import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.services.campaigns import (
    CampaignError,
    InvalidStateTransition,
    calculate_stats,
    cancel_schedule,
    detect_carrier,
    generate_report_csv,
    parse_contacts_csv,
    schedule_campaign,
    start_campaign,
)
from app.services.scheduler import activate_due_campaigns

NONEXISTENT_UUID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


def _make_csv(rows: list[list[str]], header: list[str] | None = None) -> bytes:
    """Build a CSV file as bytes."""
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


# ---------------------------------------------------------------------------
# CSV parser unit tests
# ---------------------------------------------------------------------------


class TestParseContactsCsv:
    def test_basic_csv(self):
        csv_bytes = _make_csv(
            [
                ["+9779801234567", "Ram"],
                ["+9779801234568", "Sita"],
            ]
        )
        rows, errors = parse_contacts_csv(csv_bytes, uuid.uuid4())
        assert len(rows) == 2
        assert errors == []
        assert rows[0]["phone"] == "+9779801234567"
        assert rows[0]["name"] == "Ram"

    def test_metadata_columns(self):
        csv_bytes = _make_csv(
            [["+9779801234567", "Ram", "Kathmandu", "VIP"]],
            header=["phone", "name", "city", "tier"],
        )
        rows, errors = parse_contacts_csv(csv_bytes, uuid.uuid4())
        assert len(rows) == 1
        assert rows[0]["metadata_"] == {"city": "Kathmandu", "tier": "VIP"}

    def test_missing_phone_column(self):
        csv_bytes = b"name,city\nRam,KTM\n"
        rows, errors = parse_contacts_csv(csv_bytes, uuid.uuid4())
        assert len(rows) == 0
        assert any("phone" in e.lower() for e in errors)

    def test_empty_phone_skipped(self):
        csv_bytes = _make_csv(
            [
                ["+9779801234567", "Ram"],
                ["", "NoPhone"],
            ]
        )
        rows, errors = parse_contacts_csv(csv_bytes, uuid.uuid4())
        assert len(rows) == 1
        assert len(errors) == 1

    def test_empty_csv(self):
        rows, errors = parse_contacts_csv(b"", uuid.uuid4())
        assert len(rows) == 0
        assert len(errors) > 0

    def test_bom_handling(self):
        csv_bytes = b"\xef\xbb\xbfphone,name\n+9779801234567,Ram\n"
        rows, errors = parse_contacts_csv(csv_bytes, uuid.uuid4())
        assert len(rows) == 1
        assert errors == []


# ---------------------------------------------------------------------------
# Campaign CRUD tests
# ---------------------------------------------------------------------------


class TestCreateCampaign:
    def test_create_voice_campaign(self, client, org_id):
        data = _create_campaign(client, org_id, type="voice")
        assert data["type"] == "voice"
        assert data["status"] == "draft"
        assert data["name"] == "Test Campaign"

    def test_create_text_campaign(self, client, org_id):
        data = _create_campaign(client, org_id, type="text")
        assert data["type"] == "text"

    def test_create_form_campaign(self, client, org_id):
        data = _create_campaign(client, org_id, type="form")
        assert data["type"] == "form"

    def test_create_with_schedule(self, client, org_id):
        schedule = {"mode": "immediate"}
        data = _create_campaign(client, org_id, schedule_config=schedule)
        assert data["schedule_config"] == schedule

    def test_create_empty_name_rejected(self, client, org_id):
        resp = client.post(
            "/api/v1/campaigns/",
            json={"name": "", "type": "voice", "org_id": str(org_id)},
        )
        assert resp.status_code == 422


class TestListCampaigns:
    def test_list_empty(self, client):
        resp = client.get("/api/v1/campaigns/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_list_with_data(self, client, org_id):
        for i in range(3):
            _create_campaign(client, org_id, name=f"Campaign {i}")

        resp = client.get("/api/v1/campaigns/")
        data = resp.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3

    def test_list_pagination(self, client, org_id):
        for i in range(5):
            _create_campaign(client, org_id, name=f"Campaign {i}")

        resp = client.get("/api/v1/campaigns/?page=1&page_size=2")
        data = resp.json()
        assert len(data["items"]) == 2
        assert data["total"] == 5

        resp = client.get("/api/v1/campaigns/?page=3&page_size=2")
        data = resp.json()
        assert len(data["items"]) == 1

    def test_list_filter_by_status(self, client, org_id):
        _create_campaign(client, org_id, name="Draft Campaign")
        resp = client.get("/api/v1/campaigns/?status=draft")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["status"] == "draft"

        resp = client.get("/api/v1/campaigns/?status=active")
        data = resp.json()
        assert data["total"] == 0

    def test_list_filter_by_type(self, client, org_id):
        _create_campaign(client, org_id, type="voice", name="Voice")
        _create_campaign(client, org_id, type="text", name="Text")

        resp = client.get("/api/v1/campaigns/?type=text")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["type"] == "text"


class TestGetCampaign:
    def test_get_existing(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.get(f"/api/v1/campaigns/{created['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == created["id"]
        assert "stats" in data
        assert data["stats"]["total_contacts"] == 0

    def test_get_not_found(self, client):
        resp = client.get(f"/api/v1/campaigns/{NONEXISTENT_UUID}")
        assert resp.status_code == 404


class TestUpdateCampaign:
    def test_update_name(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.put(
            f"/api/v1/campaigns/{created['id']}",
            json={"name": "Updated Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    def test_update_schedule(self, client, org_id):
        created = _create_campaign(client, org_id)
        schedule = {"mode": "scheduled", "scheduled_at": "2026-03-01T10:00:00"}
        resp = client.put(
            f"/api/v1/campaigns/{created['id']}",
            json={"schedule_config": schedule},
        )
        assert resp.status_code == 200
        assert resp.json()["schedule_config"]["mode"] == "scheduled"

    def test_update_not_found(self, client):
        resp = client.put(
            f"/api/v1/campaigns/{NONEXISTENT_UUID}",
            json={"name": "X"},
        )
        assert resp.status_code == 404

    def test_update_non_draft_rejected(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        # Manually set status to active
        campaign = db.get(Campaign, uuid.UUID(created["id"]))
        campaign.status = "active"
        db.commit()

        resp = client.put(
            f"/api/v1/campaigns/{created['id']}",
            json={"name": "No"},
        )
        assert resp.status_code == 409


class TestDeleteCampaign:
    def test_delete_draft(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.delete(f"/api/v1/campaigns/{created['id']}")
        assert resp.status_code == 204

        resp = client.get(f"/api/v1/campaigns/{created['id']}")
        assert resp.status_code == 404

    def test_delete_not_found(self, client):
        resp = client.delete(f"/api/v1/campaigns/{NONEXISTENT_UUID}")
        assert resp.status_code == 404

    def test_delete_non_draft_rejected(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        campaign = db.get(Campaign, uuid.UUID(created["id"]))
        campaign.status = "active"
        db.commit()

        resp = client.delete(f"/api/v1/campaigns/{created['id']}")
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Contact upload tests
# ---------------------------------------------------------------------------


class TestContactUpload:
    def test_upload_csv(self, client, org_id):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv(
            [
                ["+9779801234567", "Ram"],
                ["+9779801234568", "Sita"],
            ]
        )
        resp = _upload_csv(client, created["id"], csv_bytes)
        assert resp.status_code == 201
        data = resp.json()
        assert data["created"] == 2
        assert data["skipped"] == 0

    def test_upload_duplicate_phones_skipped(self, client, org_id):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv(
            [
                ["+9779801234567", "Ram"],
            ]
        )
        _upload_csv(client, created["id"], csv_bytes)

        # Upload again — same phone should be skipped
        resp = _upload_csv(client, created["id"], csv_bytes)
        assert resp.status_code == 201
        assert resp.json()["skipped"] == 1
        assert resp.json()["created"] == 0

    def test_upload_with_metadata(self, client, org_id):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv(
            [["+9779801234567", "Ram", "Kathmandu"]],
            header=["phone", "name", "city"],
        )
        resp = _upload_csv(client, created["id"], csv_bytes)
        assert resp.status_code == 201
        assert resp.json()["created"] == 1

    def test_upload_to_non_draft_rejected(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        campaign = db.get(Campaign, uuid.UUID(created["id"]))
        campaign.status = "active"
        db.commit()

        csv_bytes = _make_csv([["+9779801234567", "Ram"]])
        resp = _upload_csv(client, created["id"], csv_bytes)
        assert resp.status_code == 409

    def test_upload_empty_file(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.post(
            f"/api/v1/campaigns/{created['id']}/contacts",
            files={"file": ("contacts.csv", b"", "text/csv")},
        )
        assert resp.status_code == 422


class TestListCampaignContacts:
    def test_list_contacts(self, client, org_id):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv(
            [
                ["+9779801234567", "Ram"],
                ["+9779801234568", "Sita"],
            ]
        )
        _upload_csv(client, created["id"], csv_bytes)

        resp = client.get(f"/api/v1/campaigns/{created['id']}/contacts")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

    def test_list_contacts_empty_campaign(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.get(f"/api/v1/campaigns/{created['id']}/contacts")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    def test_list_contacts_not_found(self, client):
        resp = client.get(f"/api/v1/campaigns/{NONEXISTENT_UUID}/contacts")
        assert resp.status_code == 404


class TestRemoveContact:
    def test_remove_contact(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv([["+9779801234567", "Ram"]])
        _upload_csv(client, created["id"], csv_bytes)

        # Get the contact ID
        contacts_resp = client.get(f"/api/v1/campaigns/{created['id']}/contacts")
        contact_id = contacts_resp.json()["items"][0]["id"]

        resp = client.delete(f"/api/v1/campaigns/{created['id']}/contacts/{contact_id}")
        assert resp.status_code == 204

        # Verify removed
        contacts_resp = client.get(f"/api/v1/campaigns/{created['id']}/contacts")
        assert contacts_resp.json()["total"] == 0

    def test_remove_nonexistent_contact(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.delete(f"/api/v1/campaigns/{created['id']}/contacts/{NONEXISTENT_UUID}")
        assert resp.status_code == 404

    def test_remove_from_non_draft_rejected(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv([["+9779801234567", "Ram"]])
        _upload_csv(client, created["id"], csv_bytes)

        contacts_resp = client.get(f"/api/v1/campaigns/{created['id']}/contacts")
        contact_id = contacts_resp.json()["items"][0]["id"]

        # Set campaign to active
        campaign = db.get(Campaign, uuid.UUID(created["id"]))
        campaign.status = "active"
        db.commit()

        resp = client.delete(f"/api/v1/campaigns/{created['id']}/contacts/{contact_id}")
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Campaign lifecycle tests
# ---------------------------------------------------------------------------


class TestCampaignLifecycle:
    def _campaign_with_contacts(self, client, org_id, db=None):
        """Helper: create a draft campaign with 2 contacts and sufficient credits."""
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv(
            [
                ["+9779801234567", "Ram"],
                ["+9779801234568", "Sita"],
            ]
        )
        _upload_csv(client, created["id"], csv_bytes)
        if db is not None:
            from app.services.credits import purchase_credits
            purchase_credits(db, org_id, 1000.0)
        return created

    def test_start_campaign(self, client, org_id, db):
        created = self._campaign_with_contacts(client, org_id, db)
        resp = client.post(f"/api/v1/campaigns/{created['id']}/start")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_start_without_contacts_rejected(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.post(f"/api/v1/campaigns/{created['id']}/start")
        assert resp.status_code == 422

    def test_start_already_active_rejected(self, client, org_id, db):
        created = self._campaign_with_contacts(client, org_id, db)
        client.post(f"/api/v1/campaigns/{created['id']}/start")
        resp = client.post(f"/api/v1/campaigns/{created['id']}/start")
        assert resp.status_code == 409

    def test_pause_active_campaign(self, client, org_id, db):
        created = self._campaign_with_contacts(client, org_id, db)
        client.post(f"/api/v1/campaigns/{created['id']}/start")

        resp = client.post(f"/api/v1/campaigns/{created['id']}/pause")
        assert resp.status_code == 200
        assert resp.json()["status"] == "paused"

    def test_pause_draft_rejected(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.post(f"/api/v1/campaigns/{created['id']}/pause")
        assert resp.status_code == 409

    def test_resume_paused_campaign(self, client, org_id, db):
        created = self._campaign_with_contacts(client, org_id, db)
        client.post(f"/api/v1/campaigns/{created['id']}/start")
        client.post(f"/api/v1/campaigns/{created['id']}/pause")

        resp = client.post(f"/api/v1/campaigns/{created['id']}/resume")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_resume_draft_rejected(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.post(f"/api/v1/campaigns/{created['id']}/resume")
        assert resp.status_code == 409

    def test_full_lifecycle(self, client, org_id, db):
        """draft → start → pause → resume → verify active."""
        created = self._campaign_with_contacts(client, org_id, db)

        # Start
        resp = client.post(f"/api/v1/campaigns/{created['id']}/start")
        assert resp.json()["status"] == "active"

        # Pause
        resp = client.post(f"/api/v1/campaigns/{created['id']}/pause")
        assert resp.json()["status"] == "paused"

        # Resume
        resp = client.post(f"/api/v1/campaigns/{created['id']}/resume")
        assert resp.json()["status"] == "active"


# ---------------------------------------------------------------------------
# Stats tests
# ---------------------------------------------------------------------------


class TestCampaignStats:
    def test_empty_stats(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.get(f"/api/v1/campaigns/{created['id']}")
        stats = resp.json()["stats"]
        assert stats["total_contacts"] == 0
        assert stats["completed"] == 0

    def test_stats_with_contacts(self, client, org_id):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv(
            [
                ["+9779801234567", "Ram"],
                ["+9779801234568", "Sita"],
            ]
        )
        _upload_csv(client, created["id"], csv_bytes)

        resp = client.get(f"/api/v1/campaigns/{created['id']}")
        stats = resp.json()["stats"]
        assert stats["total_contacts"] == 2
        assert stats["pending"] == 2

    def test_stats_after_completion(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv(
            [
                ["+9779801234567", "Ram"],
                ["+9779801234568", "Sita"],
            ]
        )
        _upload_csv(client, created["id"], csv_bytes)

        # Manually mark one interaction as completed
        interaction = db.execute(
            Interaction.__table__.select().where(Interaction.campaign_id == uuid.UUID(created["id"]))
        ).first()
        db.execute(
            Interaction.__table__.update()
            .where(Interaction.id == interaction.id)
            .values(status="completed", duration_seconds=30)
        )
        db.commit()

        resp = client.get(f"/api/v1/campaigns/{created['id']}")
        stats = resp.json()["stats"]
        assert stats["completed"] == 1
        assert stats["pending"] == 1
        assert stats["delivery_rate"] == 0.5

    def test_stats_calculation_service(self, db, org):
        """Direct service-level test for calculate_stats."""
        campaign = Campaign(
            name="Stats Test",
            type="voice",
            org_id=org.id,
            status="active",
        )
        db.add(campaign)
        db.flush()

        contact = Contact(phone="+9779801234567", org_id=org.id)
        db.add(contact)
        db.flush()

        # Add interactions
        for status in ["completed", "completed", "failed", "pending"]:
            interaction = Interaction(
                campaign_id=campaign.id,
                contact_id=contact.id,
                type="outbound_call",
                status=status,
                duration_seconds=45 if status == "completed" else None,
            )
            db.add(interaction)
        db.commit()

        stats = calculate_stats(db, campaign.id)
        assert stats.total_contacts == 4
        assert stats.completed == 2
        assert stats.failed == 1
        assert stats.pending == 1
        assert stats.avg_duration_seconds == 45.0
        assert stats.delivery_rate == 0.5
        assert stats.cost_estimate == 4.0  # 2 completed * 2.0 NPR per voice call


# ---------------------------------------------------------------------------
# State machine unit tests
# ---------------------------------------------------------------------------


class TestStateTransitions:
    def test_draft_to_active(self, db, org):
        from app.services.credits import purchase_credits

        campaign = Campaign(name="T", type="voice", org_id=org.id, status="draft")
        db.add(campaign)
        db.flush()

        contact = Contact(phone="+9779801234567", org_id=org.id)
        db.add(contact)
        db.flush()

        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="pending",
        )
        db.add(interaction)
        db.commit()

        purchase_credits(db, org.id, 100.0)
        result = start_campaign(db, campaign)
        assert result.status == "active"

    def test_draft_to_active_no_contacts_raises(self, db, org):
        campaign = Campaign(name="T", type="voice", org_id=org.id, status="draft")
        db.add(campaign)
        db.commit()

        with pytest.raises(CampaignError, match="no contacts"):
            start_campaign(db, campaign)

    def test_completed_to_active_raises(self, db, org):
        campaign = Campaign(name="T", type="voice", org_id=org.id, status="completed")
        db.add(campaign)
        db.commit()

        with pytest.raises(InvalidStateTransition):
            start_campaign(db, campaign)


# ---------------------------------------------------------------------------
# Campaign scheduling tests
# ---------------------------------------------------------------------------


def _draft_campaign_with_contact(db, org):
    """Create a draft campaign with one contact and pending interaction."""
    campaign = Campaign(name="Scheduled", type="voice", org_id=org.id, status="draft")
    db.add(campaign)
    db.flush()

    contact = Contact(phone="+9779801234567", org_id=org.id)
    db.add(contact)
    db.flush()

    interaction = Interaction(
        campaign_id=campaign.id,
        contact_id=contact.id,
        type="outbound_call",
        status="pending",
    )
    db.add(interaction)
    db.commit()
    return campaign


class TestScheduleCampaign:
    """Service-level tests for schedule_campaign / cancel_schedule."""

    def test_schedule_campaign(self, db, org):
        campaign = _draft_campaign_with_contact(db, org)
        future = datetime.now(timezone.utc) + timedelta(hours=1)

        result = schedule_campaign(db, campaign, future)
        assert result.status == "scheduled"
        assert result.scheduled_at is not None

    def test_schedule_past_rejected(self, db, org):
        campaign = _draft_campaign_with_contact(db, org)
        past = datetime.now(timezone.utc) - timedelta(hours=1)

        with pytest.raises(CampaignError, match="future"):
            schedule_campaign(db, campaign, past)

    def test_schedule_no_contacts_rejected(self, db, org):
        campaign = Campaign(name="Empty", type="voice", org_id=org.id, status="draft")
        db.add(campaign)
        db.commit()

        future = datetime.now(timezone.utc) + timedelta(hours=1)
        with pytest.raises(CampaignError, match="no contacts"):
            schedule_campaign(db, campaign, future)

    def test_schedule_active_rejected(self, db, org):
        campaign = _draft_campaign_with_contact(db, org)
        campaign.status = "active"
        db.commit()

        future = datetime.now(timezone.utc) + timedelta(hours=1)
        with pytest.raises(InvalidStateTransition):
            schedule_campaign(db, campaign, future)

    def test_cancel_schedule(self, db, org):
        campaign = _draft_campaign_with_contact(db, org)
        future = datetime.now(timezone.utc) + timedelta(hours=1)
        schedule_campaign(db, campaign, future)
        assert campaign.status == "scheduled"

        result = cancel_schedule(db, campaign)
        assert result.status == "draft"
        assert result.scheduled_at is None

    def test_cancel_non_scheduled_rejected(self, db, org):
        campaign = _draft_campaign_with_contact(db, org)
        with pytest.raises(InvalidStateTransition):
            cancel_schedule(db, campaign)


class TestScheduleCampaignAPI:
    """HTTP-level tests for scheduling via the start endpoint."""

    def _campaign_with_contacts(self, client, org_id, db=None):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv(
            [
                ["+9779801234567", "Ram"],
                ["+9779801234568", "Sita"],
            ]
        )
        _upload_csv(client, created["id"], csv_bytes)
        if db is not None:
            from app.services.credits import purchase_credits
            purchase_credits(db, org_id, 1000.0)
        return created

    def test_start_with_schedule(self, client, org_id):
        created = self._campaign_with_contacts(client, org_id)
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

        resp = client.post(
            f"/api/v1/campaigns/{created['id']}/start",
            json={"schedule": future},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "scheduled"
        assert data["scheduled_at"] is not None

    def test_start_without_schedule_immediate(self, client, org_id, db):
        created = self._campaign_with_contacts(client, org_id, db)

        resp = client.post(f"/api/v1/campaigns/{created['id']}/start")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_start_with_past_schedule_rejected(self, client, org_id):
        created = self._campaign_with_contacts(client, org_id)
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

        resp = client.post(
            f"/api/v1/campaigns/{created['id']}/start",
            json={"schedule": past},
        )
        assert resp.status_code == 422

    def test_cancel_schedule_endpoint(self, client, org_id):
        created = self._campaign_with_contacts(client, org_id)
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

        # Schedule it
        resp = client.post(
            f"/api/v1/campaigns/{created['id']}/start",
            json={"schedule": future},
        )
        assert resp.json()["status"] == "scheduled"

        # Cancel it
        resp = client.post(
            f"/api/v1/campaigns/{created['id']}/cancel-schedule",
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "draft"
        assert resp.json()["scheduled_at"] is None

    def test_cancel_non_scheduled_rejected(self, client, org_id):
        created = self._campaign_with_contacts(client, org_id)
        resp = client.post(
            f"/api/v1/campaigns/{created['id']}/cancel-schedule",
        )
        assert resp.status_code == 409

    def test_scheduled_campaign_response_fields(self, client, org_id):
        """Verify scheduled_at is present in all campaign responses."""
        created = _create_campaign(client, org_id)
        assert created["scheduled_at"] is None

        resp = client.get(f"/api/v1/campaigns/{created['id']}")
        assert "scheduled_at" in resp.json()

    def test_list_filter_by_scheduled(self, client, org_id):
        """Filter campaigns by status='scheduled'."""
        created = self._campaign_with_contacts(client, org_id)
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        client.post(
            f"/api/v1/campaigns/{created['id']}/start",
            json={"schedule": future},
        )

        resp = client.get("/api/v1/campaigns/?status=scheduled")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["status"] == "scheduled"

    def test_full_schedule_lifecycle(self, client, org_id):
        """draft → schedule → cancel → schedule → (verify still scheduled)."""
        created = self._campaign_with_contacts(client, org_id)
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

        # Schedule
        resp = client.post(
            f"/api/v1/campaigns/{created['id']}/start",
            json={"schedule": future},
        )
        assert resp.json()["status"] == "scheduled"

        # Cancel
        resp = client.post(
            f"/api/v1/campaigns/{created['id']}/cancel-schedule",
        )
        assert resp.json()["status"] == "draft"

        # Re-schedule
        future2 = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        resp = client.post(
            f"/api/v1/campaigns/{created['id']}/start",
            json={"schedule": future2},
        )
        assert resp.json()["status"] == "scheduled"


class TestSchedulerService:
    """Tests for the background scheduler that activates due campaigns."""

    def test_activates_due_campaign(self, db, org):
        campaign = _draft_campaign_with_contact(db, org)
        # Set to scheduled with a past time (already due)
        campaign.status = "scheduled"
        campaign.scheduled_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()

        activated = activate_due_campaigns(db)
        assert activated == 1

        db.refresh(campaign)
        assert campaign.status == "active"
        assert campaign.scheduled_at is None

    def test_skips_future_campaign(self, db, org):
        campaign = _draft_campaign_with_contact(db, org)
        campaign.status = "scheduled"
        campaign.scheduled_at = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()

        activated = activate_due_campaigns(db)
        assert activated == 0

        db.refresh(campaign)
        assert campaign.status == "scheduled"

    def test_skips_non_scheduled_campaigns(self, db, org):
        campaign = _draft_campaign_with_contact(db, org)
        # draft campaign with scheduled_at set (should not be picked up)
        campaign.scheduled_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()

        activated = activate_due_campaigns(db)
        assert activated == 0

    def test_activates_multiple_due_campaigns(self, db, org):
        campaigns = []
        for i in range(3):
            c = Campaign(name=f"Batch {i}", type="voice", org_id=org.id, status="draft")
            db.add(c)
            db.flush()

            contact = Contact(phone=f"+977980123456{i}", org_id=org.id)
            db.add(contact)
            db.flush()

            interaction = Interaction(
                campaign_id=c.id,
                contact_id=contact.id,
                type="outbound_call",
                status="pending",
            )
            db.add(interaction)

            c.status = "scheduled"
            c.scheduled_at = datetime.now(timezone.utc) - timedelta(minutes=1)
            campaigns.append(c)

        db.commit()

        activated = activate_due_campaigns(db)
        assert activated == 3

        for c in campaigns:
            db.refresh(c)
            assert c.status == "active"


# ---------------------------------------------------------------------------
# Carrier detection unit tests
# ---------------------------------------------------------------------------


class TestDetectCarrier:
    def test_ntc_with_country_code(self):
        assert detect_carrier("+9779841234567") == "NTC"

    def test_ntc_without_plus(self):
        assert detect_carrier("9779851234567") == "NTC"

    def test_ntc_local_format(self):
        assert detect_carrier("9861234567") == "NTC"

    def test_ncell(self):
        assert detect_carrier("+9779801234567") == "Ncell"

    def test_ncell_981(self):
        assert detect_carrier("9811234567") == "Ncell"

    def test_ncell_982(self):
        assert detect_carrier("+9779821234567") == "Ncell"

    def test_smart_cell(self):
        assert detect_carrier("+9779611234567") == "SmartCell"

    def test_smart_cell_988(self):
        assert detect_carrier("9881234567") == "SmartCell"

    def test_unknown_prefix(self):
        assert detect_carrier("+9779991234567") == "Unknown"

    def test_non_nepal_number(self):
        assert detect_carrier("+14155551234") == "Unknown"

    def test_empty_string(self):
        assert detect_carrier("") == "Unknown"

    def test_whitespace_handling(self):
        assert detect_carrier("  +9779841234567  ") == "NTC"


# ---------------------------------------------------------------------------
# CSV report generation tests
# ---------------------------------------------------------------------------


class TestGenerateReportCsv:
    def test_empty_campaign_has_header_only(self, db, org):
        campaign = Campaign(name="Empty", type="voice", org_id=org.id, status="draft")
        db.add(campaign)
        db.commit()

        rows = list(generate_report_csv(db, campaign.id))
        assert len(rows) == 1  # Header only
        reader = csv.reader(io.StringIO(rows[0]))
        header = next(reader)
        assert header == [
            "contact_number",
            "contact_name",
            "status",
            "call_duration",
            "credit_consumed",
            "carrier",
            "playback_url",
            "updated_at",
        ]

    def test_report_with_interactions(self, db, org):
        campaign = Campaign(name="Report", type="voice", org_id=org.id, status="active")
        db.add(campaign)
        db.flush()

        contact = Contact(phone="+9779841234567", name="Ram", org_id=org.id)
        db.add(contact)
        db.flush()

        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="completed",
            duration_seconds=45,
            credit_consumed=2.0,
            audio_url="https://example.com/recording.mp3",
        )
        db.add(interaction)
        db.commit()

        rows = list(generate_report_csv(db, campaign.id))
        assert len(rows) == 2  # Header + 1 data row

        # Parse the data row
        reader = csv.reader(io.StringIO(rows[1]))
        data = next(reader)
        assert data[0] == "+9779841234567"  # contact_number
        assert data[1] == "Ram"  # contact_name
        assert data[2] == "completed"  # status
        assert data[3] == "45"  # call_duration
        assert data[4] == "2.0"  # credit_consumed
        assert data[5] == "NTC"  # carrier (984 prefix)
        assert data[6] == "https://example.com/recording.mp3"  # playback_url
        assert data[7] != ""  # updated_at should be set

    def test_report_multiple_interactions(self, db, org):
        campaign = Campaign(name="Multi", type="voice", org_id=org.id, status="active")
        db.add(campaign)
        db.flush()

        for i, (phone, name) in enumerate(
            [
                ("+9779801234567", "Sita"),
                ("+9779841234568", "Ram"),
            ]
        ):
            contact = Contact(phone=phone, name=name, org_id=org.id)
            db.add(contact)
            db.flush()
            interaction = Interaction(
                campaign_id=campaign.id,
                contact_id=contact.id,
                type="outbound_call",
                status="pending" if i == 0 else "completed",
            )
            db.add(interaction)

        db.commit()

        rows = list(generate_report_csv(db, campaign.id))
        assert len(rows) == 3  # Header + 2 data rows

    def test_report_null_fields_as_empty(self, db, org):
        campaign = Campaign(name="Nulls", type="voice", org_id=org.id, status="draft")
        db.add(campaign)
        db.flush()

        contact = Contact(phone="+9779801234567", org_id=org.id)
        db.add(contact)
        db.flush()

        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="pending",
        )
        db.add(interaction)
        db.commit()

        rows = list(generate_report_csv(db, campaign.id))
        reader = csv.reader(io.StringIO(rows[1]))
        data = next(reader)
        assert data[1] == ""  # name is None
        assert data[3] == ""  # duration is None
        assert data[4] == ""  # credit_consumed is None
        assert data[6] == ""  # audio_url is None


# ---------------------------------------------------------------------------
# CSV report download endpoint tests
# ---------------------------------------------------------------------------


class TestDownloadReport:
    def test_download_empty_campaign(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.get(f"/api/v1/campaigns/{created['id']}/report/download")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "text/csv; charset=utf-8"
        assert "attachment" in resp.headers["content-disposition"]
        assert ".csv" in resp.headers["content-disposition"]

        # Parse CSV content
        reader = csv.reader(io.StringIO(resp.text))
        header = next(reader)
        assert header == [
            "contact_number",
            "contact_name",
            "status",
            "call_duration",
            "credit_consumed",
            "carrier",
            "playback_url",
            "updated_at",
        ]
        data_rows = list(reader)
        assert len(data_rows) == 0

    def test_download_with_contacts(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv(
            [
                ["+9779841234567", "Ram"],
                ["+9779801234568", "Sita"],
            ]
        )
        _upload_csv(client, created["id"], csv_bytes)

        # Set one interaction to completed with credit
        interaction = db.execute(
            Interaction.__table__.select().where(Interaction.campaign_id == uuid.UUID(created["id"]))
        ).first()
        db.execute(
            Interaction.__table__.update()
            .where(Interaction.id == interaction.id)
            .values(
                status="completed",
                duration_seconds=30,
                credit_consumed=2.0,
                audio_url="https://example.com/play.mp3",
            )
        )
        db.commit()

        resp = client.get(f"/api/v1/campaigns/{created['id']}/report/download")
        assert resp.status_code == 200

        reader = csv.reader(io.StringIO(resp.text))
        next(reader)  # skip header
        data_rows = list(reader)
        assert len(data_rows) == 2

        # Find the completed row
        completed_row = [r for r in data_rows if r[2] == "completed"][0]
        assert completed_row[3] == "30"  # duration
        assert completed_row[4] == "2.0"  # credit_consumed
        assert completed_row[6] == "https://example.com/play.mp3"  # playback_url

    def test_download_not_found(self, client):
        resp = client.get(f"/api/v1/campaigns/{NONEXISTENT_UUID}/report/download")
        assert resp.status_code == 404

    def test_download_filename_in_header(self, client, org_id):
        created = _create_campaign(client, org_id, name="My Test Campaign")
        resp = client.get(f"/api/v1/campaigns/{created['id']}/report/download")
        assert resp.status_code == 200
        disposition = resp.headers["content-disposition"]
        assert "My_Test_Campaign" in disposition
        assert ".csv" in disposition
