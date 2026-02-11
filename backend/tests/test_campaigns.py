"""Tests for campaign management API — CRUD, lifecycle, contacts, and stats."""

import io
import uuid

import pytest

from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.services.campaigns import (
    CampaignError,
    InvalidStateTransition,
    calculate_stats,
    parse_contacts_csv,
    start_campaign,
)

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
        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
            ["+9779801234568", "Sita"],
        ])
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
        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
            ["", "NoPhone"],
        ])
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
        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
            ["+9779801234568", "Sita"],
        ])
        resp = _upload_csv(client, created["id"], csv_bytes)
        assert resp.status_code == 201
        data = resp.json()
        assert data["created"] == 2
        assert data["skipped"] == 0

    def test_upload_duplicate_phones_skipped(self, client, org_id):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
        ])
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
        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
            ["+9779801234568", "Sita"],
        ])
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
        contacts_resp = client.get(
            f"/api/v1/campaigns/{created['id']}/contacts"
        )
        contact_id = contacts_resp.json()["items"][0]["id"]

        resp = client.delete(
            f"/api/v1/campaigns/{created['id']}/contacts/{contact_id}"
        )
        assert resp.status_code == 204

        # Verify removed
        contacts_resp = client.get(
            f"/api/v1/campaigns/{created['id']}/contacts"
        )
        assert contacts_resp.json()["total"] == 0

    def test_remove_nonexistent_contact(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.delete(
            f"/api/v1/campaigns/{created['id']}/contacts/{NONEXISTENT_UUID}"
        )
        assert resp.status_code == 404

    def test_remove_from_non_draft_rejected(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv([["+9779801234567", "Ram"]])
        _upload_csv(client, created["id"], csv_bytes)

        contacts_resp = client.get(
            f"/api/v1/campaigns/{created['id']}/contacts"
        )
        contact_id = contacts_resp.json()["items"][0]["id"]

        # Set campaign to active
        campaign = db.get(Campaign, uuid.UUID(created["id"]))
        campaign.status = "active"
        db.commit()

        resp = client.delete(
            f"/api/v1/campaigns/{created['id']}/contacts/{contact_id}"
        )
        assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Campaign lifecycle tests
# ---------------------------------------------------------------------------


class TestCampaignLifecycle:
    def _campaign_with_contacts(self, client, org_id):
        """Helper: create a draft campaign with 2 contacts."""
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
            ["+9779801234568", "Sita"],
        ])
        _upload_csv(client, created["id"], csv_bytes)
        return created

    def test_start_campaign(self, client, org_id):
        created = self._campaign_with_contacts(client, org_id)
        resp = client.post(f"/api/v1/campaigns/{created['id']}/start")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_start_without_contacts_rejected(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.post(f"/api/v1/campaigns/{created['id']}/start")
        assert resp.status_code == 422

    def test_start_already_active_rejected(self, client, org_id):
        created = self._campaign_with_contacts(client, org_id)
        client.post(f"/api/v1/campaigns/{created['id']}/start")
        resp = client.post(f"/api/v1/campaigns/{created['id']}/start")
        assert resp.status_code == 409

    def test_pause_active_campaign(self, client, org_id):
        created = self._campaign_with_contacts(client, org_id)
        client.post(f"/api/v1/campaigns/{created['id']}/start")

        resp = client.post(f"/api/v1/campaigns/{created['id']}/pause")
        assert resp.status_code == 200
        assert resp.json()["status"] == "paused"

    def test_pause_draft_rejected(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.post(f"/api/v1/campaigns/{created['id']}/pause")
        assert resp.status_code == 409

    def test_resume_paused_campaign(self, client, org_id):
        created = self._campaign_with_contacts(client, org_id)
        client.post(f"/api/v1/campaigns/{created['id']}/start")
        client.post(f"/api/v1/campaigns/{created['id']}/pause")

        resp = client.post(f"/api/v1/campaigns/{created['id']}/resume")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_resume_draft_rejected(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.post(f"/api/v1/campaigns/{created['id']}/resume")
        assert resp.status_code == 409

    def test_full_lifecycle(self, client, org_id):
        """draft → start → pause → resume → verify active."""
        created = self._campaign_with_contacts(client, org_id)

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
        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
            ["+9779801234568", "Sita"],
        ])
        _upload_csv(client, created["id"], csv_bytes)

        resp = client.get(f"/api/v1/campaigns/{created['id']}")
        stats = resp.json()["stats"]
        assert stats["total_contacts"] == 2
        assert stats["pending"] == 2

    def test_stats_after_completion(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv([
            ["+9779801234567", "Ram"],
            ["+9779801234568", "Sita"],
        ])
        _upload_csv(client, created["id"], csv_bytes)

        # Manually mark one interaction as completed
        interaction = db.execute(
            Interaction.__table__.select().where(
                Interaction.campaign_id == uuid.UUID(created["id"])
            )
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
