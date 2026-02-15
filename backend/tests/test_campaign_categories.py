"""Tests for campaign categories, premium voice tiers, and carrier detection features."""

import csv
import io
import uuid

from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.models.voice_model import VoiceModel
from app.services.campaigns import detect_carrier

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


# ===========================================================================
# 1. Campaign Categories
# ===========================================================================


class TestCampaignCategories:
    """Test category field on campaigns — CRUD and filtering."""

    def test_create_campaign_with_category(self, client, org_id):
        data = _create_campaign(client, org_id, category="voice")
        assert data["category"] == "voice"

    def test_create_campaign_with_survey_category(self, client, org_id):
        data = _create_campaign(client, org_id, category="survey")
        assert data["category"] == "survey"

    def test_create_campaign_with_combined_category(self, client, org_id):
        data = _create_campaign(client, org_id, category="combined")
        assert data["category"] == "combined"

    def test_create_campaign_with_text_category(self, client, org_id):
        data = _create_campaign(client, org_id, category="text")
        assert data["category"] == "text"

    def test_create_campaign_no_category_defaults_null(self, client, org_id):
        data = _create_campaign(client, org_id)
        assert data["category"] is None

    def test_update_campaign_category(self, client, org_id):
        created = _create_campaign(client, org_id)
        resp = client.put(
            f"/api/v1/campaigns/{created['id']}",
            json={"category": "survey"},
        )
        assert resp.status_code == 200
        assert resp.json()["category"] == "survey"

    def test_filter_campaigns_by_category(self, client, org_id):
        _create_campaign(client, org_id, name="Voice Camp", category="voice")
        _create_campaign(client, org_id, name="Survey Camp", category="survey")
        _create_campaign(client, org_id, name="No Cat")

        resp = client.get("/api/v1/campaigns/?category=voice")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["category"] == "voice"

        resp = client.get("/api/v1/campaigns/?category=survey")
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["category"] == "survey"

    def test_get_campaign_includes_category(self, client, org_id):
        created = _create_campaign(client, org_id, category="combined")
        resp = client.get(f"/api/v1/campaigns/{created['id']}")
        assert resp.status_code == 200
        assert resp.json()["category"] == "combined"

    def test_campaign_response_includes_voice_model_id(self, client, org_id):
        created = _create_campaign(client, org_id)
        assert "voice_model_id" in created
        assert created["voice_model_id"] is None


class TestCampaignsByCategory:
    """Test the dashboard widget endpoint: GET /analytics/campaigns/by-category."""

    def test_empty_database(self, client):
        resp = client.get("/api/v1/analytics/campaigns/by-category")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_grouped_by_category(self, client, org_id):
        _create_campaign(client, org_id, name="V1", category="voice")
        _create_campaign(client, org_id, name="V2", category="voice")
        _create_campaign(client, org_id, name="S1", category="survey")
        _create_campaign(client, org_id, name="NC1")  # no category

        resp = client.get("/api/v1/analytics/campaigns/by-category")
        assert resp.status_code == 200
        data = resp.json()

        by_cat = {item["category"]: item["count"] for item in data}
        assert by_cat["voice"] == 2
        assert by_cat["survey"] == 1
        assert by_cat["uncategorized"] == 1


# ===========================================================================
# 2. Premium Voice Tiers
# ===========================================================================


class TestPremiumVoiceTiers:
    """Test VoiceModel org_id scoping and TingTing voice seeding."""

    def test_list_voice_models_seeds_defaults(self, client):
        resp = client.get("/api/v1/voice-models/")
        assert resp.status_code == 200
        models = resp.json()
        assert len(models) == 5  # Rija, Rija Premium, Prashanna, Shreegya, Binod

    def test_default_voices_have_correct_names(self, client):
        resp = client.get("/api/v1/voice-models/")
        names = {m["voice_display_name"] for m in resp.json()}
        assert names == {"Rija", "Rija Premium", "Prashanna", "Shreegya", "Binod"}

    def test_premium_flag_set_correctly(self, client):
        resp = client.get("/api/v1/voice-models/")
        models = resp.json()
        premium = [m for m in models if m["is_premium"]]
        free = [m for m in models if not m["is_premium"]]
        assert len(premium) == 2  # Rija Premium, Shreegya
        assert len(free) == 3  # Rija, Prashanna, Binod

    def test_all_global_voices_have_null_org_id(self, client):
        resp = client.get("/api/v1/voice-models/")
        for model in resp.json():
            assert model["org_id"] is None

    def test_org_scoped_voice_model(self, client, db, org):
        # Seed defaults first
        client.get("/api/v1/voice-models/")

        # Create an org-specific voice
        custom_voice = VoiceModel(
            voice_display_name="Custom Voice",
            voice_internal_name="ne-NP-CustomNeural",
            provider="edge_tts",
            locale="ne-NP",
            is_premium=True,
            org_id=org.id,
        )
        db.add(custom_voice)
        db.commit()

        # List with org_id — should return global + org-specific
        resp = client.get(f"/api/v1/voice-models/?org_id={org.id}")
        assert resp.status_code == 200
        models = resp.json()
        assert len(models) == 6  # 5 global + 1 custom
        names = {m["voice_display_name"] for m in models}
        assert "Custom Voice" in names

    def test_org_scoped_voice_not_visible_to_other_org(self, client, db, org):
        # Seed defaults first
        client.get("/api/v1/voice-models/")

        # Create an org-specific voice
        custom_voice = VoiceModel(
            voice_display_name="Secret Voice",
            voice_internal_name="ne-NP-SecretNeural",
            provider="azure",
            locale="ne-NP",
            is_premium=True,
            org_id=org.id,
        )
        db.add(custom_voice)
        db.commit()

        # List without org_id — should not include org-specific
        resp = client.get("/api/v1/voice-models/")
        names = {m["voice_display_name"] for m in resp.json()}
        assert "Secret Voice" not in names

        # List with a different org_id — should not include
        other_org_id = uuid.uuid4()
        resp = client.get(f"/api/v1/voice-models/?org_id={other_org_id}")
        names = {m["voice_display_name"] for m in resp.json()}
        assert "Secret Voice" not in names

    def test_create_campaign_with_voice_model_id(self, client, db, org_id):
        # Seed voices
        resp = client.get("/api/v1/voice-models/")
        voice_id = resp.json()[0]["id"]

        data = _create_campaign(client, org_id, voice_model_id=voice_id)
        assert data["voice_model_id"] == voice_id


# ===========================================================================
# 3. Carrier Detection
# ===========================================================================


class TestDetectCarrierUpdated:
    """Test detect_carrier with the updated return values (returns 'Unknown' not None)."""

    def test_ntc_984(self):
        assert detect_carrier("+9779841234567") == "NTC"

    def test_ntc_985(self):
        assert detect_carrier("9851234567") == "NTC"

    def test_ntc_986(self):
        assert detect_carrier("+9779861234567") == "NTC"

    def test_ncell_980(self):
        assert detect_carrier("+9779801234567") == "Ncell"

    def test_ncell_981(self):
        assert detect_carrier("9811234567") == "Ncell"

    def test_ncell_982(self):
        assert detect_carrier("+9779821234567") == "Ncell"

    def test_smartcell_961(self):
        assert detect_carrier("+9779611234567") == "SmartCell"

    def test_smartcell_962(self):
        assert detect_carrier("9621234567") == "SmartCell"

    def test_smartcell_988(self):
        assert detect_carrier("9881234567") == "SmartCell"

    def test_unknown_prefix_returns_unknown(self):
        assert detect_carrier("+9779991234567") == "Unknown"

    def test_non_nepal_returns_unknown(self):
        assert detect_carrier("+14155551234") == "Unknown"

    def test_empty_string_returns_unknown(self):
        assert detect_carrier("") == "Unknown"

    def test_whitespace_handling(self):
        assert detect_carrier("  +9779841234567  ") == "NTC"

    def test_country_code_without_plus(self):
        assert detect_carrier("9779801234567") == "Ncell"

    def test_local_format_10_digits(self):
        assert detect_carrier("9841234567") == "NTC"


class TestCarrierAutoDetectOnCSVImport:
    """Test that carrier is auto-detected when contacts are created via CSV upload."""

    def test_carrier_set_on_csv_upload(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv(
            [
                ["+9779841234567", "Ram"],  # NTC
                ["+9779801234568", "Sita"],  # Ncell
                ["+9779611234569", "Hari"],  # SmartCell
            ]
        )
        resp = _upload_csv(client, created["id"], csv_bytes)
        assert resp.status_code == 201
        assert resp.json()["created"] == 3

        # Verify carriers
        contacts = db.query(Contact).all()
        carrier_map = {c.phone: c.carrier for c in contacts}
        assert carrier_map["+9779841234567"] == "NTC"
        assert carrier_map["+9779801234568"] == "Ncell"
        assert carrier_map["+9779611234569"] == "SmartCell"

    def test_carrier_backfilled_on_existing_contact(self, client, org_id, db):
        """When a contact already exists without carrier, CSV upload backfills it."""
        # Create contact without carrier
        contact = Contact(
            phone="+9779841234567",
            name="Old Contact",
            org_id=org_id,
            carrier=None,
        )
        db.add(contact)
        db.commit()

        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv([["+9779841234567", "Ram"]])
        _upload_csv(client, created["id"], csv_bytes)

        db.refresh(contact)
        assert contact.carrier == "NTC"

    def test_carrier_in_contact_response(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv([["+9779801234567", "Sita"]])
        _upload_csv(client, created["id"], csv_bytes)

        resp = client.get(f"/api/v1/campaigns/{created['id']}/contacts")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["carrier"] == "Ncell"

    def test_carrier_in_csv_report(self, client, org_id, db):
        created = _create_campaign(client, org_id)
        csv_bytes = _make_csv([["+9779841234567", "Ram"]])
        _upload_csv(client, created["id"], csv_bytes)

        resp = client.get(f"/api/v1/campaigns/{created['id']}/report/download")
        assert resp.status_code == 200
        reader = csv.reader(io.StringIO(resp.text))
        header = next(reader)
        data_row = next(reader)
        carrier_idx = header.index("carrier")
        assert data_row[carrier_idx] == "NTC"


class TestCarrierRedetectOnPhoneUpdate:
    """Test that carrier is re-detected when a contact's phone number is updated."""

    def test_carrier_updated_on_phone_change(self, client, db, org):
        contact = Contact(
            phone="+9779841234567",
            name="Test",
            org_id=org.id,
            carrier="NTC",
        )
        db.add(contact)
        db.commit()
        db.refresh(contact)

        resp = client.patch(
            f"/api/v1/contacts/{contact.id}",
            json={"phone": "+9779801234567"},
        )
        assert resp.status_code == 200
        assert resp.json()["carrier"] == "Ncell"


class TestCarrierBreakdownAnalytics:
    """Test GET /analytics/carrier-breakdown endpoint."""

    def test_empty_returns_empty(self, client):
        resp = client.get("/api/v1/analytics/carrier-breakdown")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_carrier_breakdown_with_data(self, client, db, org):
        campaign = Campaign(name="Test", type="voice", org_id=org.id, status="active")
        db.add(campaign)
        db.flush()

        # Create contacts with carriers
        for phone, name, carrier, status in [
            ("+9779841111111", "A", "NTC", "completed"),
            ("+9779842222222", "B", "NTC", "failed"),
            ("+9779801111111", "C", "Ncell", "completed"),
            ("+9779611111111", "D", "SmartCell", "completed"),
        ]:
            contact = Contact(phone=phone, name=name, org_id=org.id, carrier=carrier)
            db.add(contact)
            db.flush()
            interaction = Interaction(
                campaign_id=campaign.id,
                contact_id=contact.id,
                type="outbound_call",
                status=status,
            )
            db.add(interaction)

        db.commit()

        resp = client.get("/api/v1/analytics/carrier-breakdown")
        assert resp.status_code == 200
        data = resp.json()

        by_carrier = {item["carrier"]: item for item in data}
        assert by_carrier["NTC"]["total"] == 2
        assert by_carrier["NTC"]["success"] == 1
        assert by_carrier["NTC"]["fail"] == 1
        assert by_carrier["NTC"]["pickup_pct"] == 50.0
        assert by_carrier["Ncell"]["total"] == 1
        assert by_carrier["Ncell"]["success"] == 1
        assert by_carrier["SmartCell"]["total"] == 1

    def test_carrier_breakdown_filtered_by_campaign(self, client, db, org):
        campaign1 = Campaign(name="C1", type="voice", org_id=org.id, status="active")
        campaign2 = Campaign(name="C2", type="voice", org_id=org.id, status="active")
        db.add_all([campaign1, campaign2])
        db.flush()

        # Contact in campaign 1
        c1 = Contact(phone="+9779841111111", org_id=org.id, carrier="NTC")
        db.add(c1)
        db.flush()
        db.add(
            Interaction(
                campaign_id=campaign1.id,
                contact_id=c1.id,
                type="outbound_call",
                status="completed",
            )
        )

        # Contact in campaign 2
        c2 = Contact(phone="+9779801111111", org_id=org.id, carrier="Ncell")
        db.add(c2)
        db.flush()
        db.add(
            Interaction(
                campaign_id=campaign2.id,
                contact_id=c2.id,
                type="outbound_call",
                status="completed",
            )
        )

        db.commit()

        # Filter by campaign 1
        resp = client.get(f"/api/v1/analytics/carrier-breakdown?campaign_id={campaign1.id}")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["carrier"] == "NTC"
