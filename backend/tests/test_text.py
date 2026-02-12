"""Tests for SMS/text messaging — send endpoint, webhook, batch dispatch."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import Campaign, Contact, Interaction, Template
from app.services.telephony.exceptions import (
    TelephonyConfigurationError,
    TelephonyProviderError,
)
from app.services.telephony.models import SmsResult, SmsStatus


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def text_template(db, org):
    """Create a text template for SMS testing."""
    template = Template(
        name="SMS Bill Reminder",
        content="नमस्ते {name}, तपाईंको बिल {amount} रुपैयाँ बाँकी छ।",
        type="text",
        org_id=org.id,
        language="ne",
        variables=["name", "amount"],
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@pytest.fixture
def voice_template(db, org):
    """Create a voice template (wrong type for SMS)."""
    template = Template(
        name="Voice Template",
        content="Hello {name}",
        type="voice",
        org_id=org.id,
        language="en",
        variables=["name"],
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@pytest.fixture
def sms_campaign(db, org, text_template):
    """Create an SMS campaign with contacts."""
    campaign = Campaign(
        name="SMS Test Campaign",
        type="text",
        org_id=org.id,
        template_id=text_template.id,
        sms_message="Direct SMS: Hello {name}!",
        status="draft",
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@pytest.fixture
def contact(db, org):
    """Create a test contact."""
    c = Contact(
        phone="+9779812345678",
        name="राम",
        org_id=org.id,
        metadata_={"amount": "५००"},
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def sms_interaction(db, sms_campaign, contact):
    """Create an SMS interaction with a twilio_message_sid."""
    interaction = Interaction(
        campaign_id=sms_campaign.id,
        contact_id=contact.id,
        type="sms",
        status="in_progress",
        metadata_={"twilio_message_sid": "SM-test-123", "sms_body": "Hello"},
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return interaction


# ---------------------------------------------------------------------------
# POST /api/v1/text/send tests
# ---------------------------------------------------------------------------


class TestSendSmsEndpoint:
    """Test the SMS send endpoint."""

    @patch("app.api.v1.endpoints.text.get_twilio_provider")
    def test_send_sms_direct_message(self, mock_get_provider, client):
        """Send SMS with direct message body."""
        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(
            return_value=SmsResult(
                message_sid="SM-abc-123",
                status=SmsStatus.QUEUED,
            )
        )
        mock_get_provider.return_value = mock_provider

        with patch("app.api.v1.endpoints.text.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

            response = client.post(
                "/api/v1/text/send",
                json={
                    "to": "+9779812345678",
                    "message": "Hello from Ring AI!",
                },
            )

        assert response.status_code == 201
        data = response.json()
        assert data["message_sid"] == "SM-abc-123"
        assert data["status"] == "queued"
        assert data["interaction_id"] is None  # No campaign/contact provided

        # Verify Twilio was called with correct body
        mock_provider.send_sms.assert_called_once()
        call_kwargs = mock_provider.send_sms.call_args
        assert call_kwargs.kwargs["body"] == "Hello from Ring AI!"
        assert call_kwargs.kwargs["to"] == "+9779812345678"

    @patch("app.api.v1.endpoints.text.get_twilio_provider")
    def test_send_sms_with_template(
        self, mock_get_provider, client, text_template
    ):
        """Send SMS by rendering a template."""
        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(
            return_value=SmsResult(
                message_sid="SM-tpl-456",
                status=SmsStatus.QUEUED,
            )
        )
        mock_get_provider.return_value = mock_provider

        with patch("app.api.v1.endpoints.text.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

            response = client.post(
                "/api/v1/text/send",
                json={
                    "to": "+9779812345678",
                    "message": "ignored when template_id is set",
                    "template_id": str(text_template.id),
                    "variables": {"name": "राम", "amount": "५००"},
                },
            )

        assert response.status_code == 201
        data = response.json()
        assert data["message_sid"] == "SM-tpl-456"

        # Verify rendered template was used as body
        call_kwargs = mock_provider.send_sms.call_args
        body = call_kwargs.kwargs["body"]
        assert "राम" in body
        assert "५००" in body

    @patch("app.api.v1.endpoints.text.get_twilio_provider")
    def test_send_sms_template_not_found(self, mock_get_provider, client):
        response = client.post(
            "/api/v1/text/send",
            json={
                "to": "+9779812345678",
                "message": "test",
                "template_id": str(uuid.uuid4()),
                "variables": {},
            },
        )
        assert response.status_code == 404
        assert "Template not found" in response.json()["detail"]

    @patch("app.api.v1.endpoints.text.get_twilio_provider")
    def test_send_sms_wrong_template_type(
        self, mock_get_provider, client, voice_template
    ):
        response = client.post(
            "/api/v1/text/send",
            json={
                "to": "+9779812345678",
                "message": "test",
                "template_id": str(voice_template.id),
                "variables": {"name": "test"},
            },
        )
        assert response.status_code == 422
        assert "text" in response.json()["detail"]

    @patch("app.api.v1.endpoints.text.get_twilio_provider")
    def test_send_sms_missing_template_variable(
        self, mock_get_provider, client, text_template
    ):
        response = client.post(
            "/api/v1/text/send",
            json={
                "to": "+9779812345678",
                "message": "ignored",
                "template_id": str(text_template.id),
                "variables": {},  # Missing name and amount
            },
        )
        assert response.status_code == 422
        assert "Missing required variable" in response.json()["detail"]

    @patch("app.api.v1.endpoints.text.get_twilio_provider")
    def test_send_sms_twilio_not_configured(
        self, mock_get_provider, client
    ):
        mock_get_provider.side_effect = TelephonyConfigurationError(
            "Twilio not configured"
        )

        response = client.post(
            "/api/v1/text/send",
            json={
                "to": "+9779812345678",
                "message": "Hello",
            },
        )
        assert response.status_code == 503

    @patch("app.api.v1.endpoints.text.get_twilio_provider")
    def test_send_sms_twilio_send_failure(self, mock_get_provider, client):
        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(
            side_effect=TelephonyProviderError("twilio", "network error")
        )
        mock_get_provider.return_value = mock_provider

        with patch("app.api.v1.endpoints.text.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

            response = client.post(
                "/api/v1/text/send",
                json={
                    "to": "+9779812345678",
                    "message": "Hello",
                },
            )

        assert response.status_code == 502

    @patch("app.api.v1.endpoints.text.get_twilio_provider")
    def test_send_sms_creates_interaction(
        self, mock_get_provider, client, db, sms_campaign, contact
    ):
        """When campaign_id and contact_id are provided, an Interaction record is created."""
        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(
            return_value=SmsResult(
                message_sid="SM-int-789",
                status=SmsStatus.QUEUED,
            )
        )
        mock_get_provider.return_value = mock_provider

        with patch("app.api.v1.endpoints.text.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

            response = client.post(
                "/api/v1/text/send",
                json={
                    "to": "+9779812345678",
                    "message": "Hello राम!",
                    "campaign_id": str(sms_campaign.id),
                    "contact_id": str(contact.id),
                },
            )

        assert response.status_code == 201
        data = response.json()
        assert data["interaction_id"] is not None

        # Verify interaction was created
        interaction = db.get(Interaction, uuid.UUID(data["interaction_id"]))
        assert interaction is not None
        assert interaction.type == "sms"
        assert interaction.status == "in_progress"
        assert interaction.metadata_["twilio_message_sid"] == "SM-int-789"

    @patch("app.api.v1.endpoints.text.get_twilio_provider")
    def test_send_sms_no_from_number(self, mock_get_provider, client):
        mock_provider = MagicMock()
        mock_provider.default_from_number = ""
        mock_get_provider.return_value = mock_provider

        response = client.post(
            "/api/v1/text/send",
            json={
                "to": "+9779812345678",
                "message": "Hello",
            },
        )
        assert response.status_code == 422
        assert "from_number" in response.json()["detail"]


# ---------------------------------------------------------------------------
# POST /api/v1/text/webhook tests
# ---------------------------------------------------------------------------


class TestSmsWebhookEndpoint:
    """Test SMS delivery status webhook."""

    def test_webhook_delivered(self, client, db, sms_interaction):
        """Delivered status should mark interaction as completed."""
        response = client.post(
            "/api/v1/text/webhook",
            data={
                "MessageSid": "SM-test-123",
                "MessageStatus": "delivered",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["sms_status"] == "delivered"

        db.refresh(sms_interaction)
        assert sms_interaction.status == "completed"
        assert sms_interaction.metadata_["last_webhook_status"] == "delivered"

    def test_webhook_failed(self, client, db, sms_interaction):
        """Failed status should mark interaction as failed with error info."""
        response = client.post(
            "/api/v1/text/webhook",
            data={
                "MessageSid": "SM-test-123",
                "MessageStatus": "failed",
                "ErrorCode": "30003",
                "ErrorMessage": "Unreachable destination",
            },
        )
        assert response.status_code == 200

        db.refresh(sms_interaction)
        assert sms_interaction.status == "failed"
        assert sms_interaction.metadata_["error_code"] == "30003"
        assert sms_interaction.metadata_["error_message"] == "Unreachable destination"

    def test_webhook_undelivered(self, client, db, sms_interaction):
        """Undelivered should map to failed."""
        response = client.post(
            "/api/v1/text/webhook",
            data={
                "MessageSid": "SM-test-123",
                "MessageStatus": "undelivered",
            },
        )
        assert response.status_code == 200

        db.refresh(sms_interaction)
        assert sms_interaction.status == "failed"

    def test_webhook_sent(self, client, db, sms_interaction):
        """Sent is intermediate — interaction stays in_progress."""
        response = client.post(
            "/api/v1/text/webhook",
            data={
                "MessageSid": "SM-test-123",
                "MessageStatus": "sent",
            },
        )
        assert response.status_code == 200

        db.refresh(sms_interaction)
        assert sms_interaction.status == "in_progress"

    def test_webhook_queued(self, client, db, sms_interaction):
        """Queued is intermediate — interaction stays in_progress."""
        response = client.post(
            "/api/v1/text/webhook",
            data={
                "MessageSid": "SM-test-123",
                "MessageStatus": "queued",
            },
        )
        assert response.status_code == 200

        db.refresh(sms_interaction)
        assert sms_interaction.status == "in_progress"

    def test_webhook_no_message_sid(self, client):
        response = client.post("/api/v1/text/webhook", data={})
        assert response.status_code == 200
        assert response.json()["status"] == "ignored"

    def test_webhook_unknown_status(self, client):
        response = client.post(
            "/api/v1/text/webhook",
            data={"MessageSid": "SM-xyz", "MessageStatus": "weird-status"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ignored"

    def test_webhook_no_matching_interaction(self, client, db):
        """Webhook for unknown message_sid should still return OK."""
        response = client.post(
            "/api/v1/text/webhook",
            data={
                "MessageSid": "SM-nonexistent",
                "MessageStatus": "delivered",
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# GET /api/v1/text/messages/{message_sid} tests
# ---------------------------------------------------------------------------


class TestGetSmsStatus:
    @patch("app.api.v1.endpoints.text.get_twilio_provider")
    def test_get_sms_status(self, mock_get_provider, client):
        from app.services.telephony.models import SmsStatusResponse as ProviderSmsStatus

        mock_provider = MagicMock()
        mock_provider.get_sms_status = AsyncMock(
            return_value=ProviderSmsStatus(
                message_sid="SM-xyz",
                status=SmsStatus.DELIVERED,
                to="+9779812345678",
                from_number="+15551234567",
                body="Hello!",
                price="-0.0075",
            )
        )
        mock_get_provider.return_value = mock_provider

        response = client.get("/api/v1/text/messages/SM-xyz")
        assert response.status_code == 200
        data = response.json()
        assert data["message_sid"] == "SM-xyz"
        assert data["status"] == "delivered"
        assert data["body"] == "Hello!"

    @patch("app.api.v1.endpoints.text.get_twilio_provider")
    def test_get_sms_status_twilio_error(self, mock_get_provider, client):
        mock_provider = MagicMock()
        mock_provider.get_sms_status = AsyncMock(
            side_effect=TelephonyProviderError("twilio", "not found")
        )
        mock_get_provider.return_value = mock_provider

        response = client.get("/api/v1/text/messages/SM-bad")
        assert response.status_code == 502

    @patch("app.api.v1.endpoints.text.get_twilio_provider")
    def test_get_sms_status_not_configured(self, mock_get_provider, client):
        mock_get_provider.side_effect = TelephonyConfigurationError("no creds")

        response = client.get("/api/v1/text/messages/SM-any")
        assert response.status_code == 503


# ---------------------------------------------------------------------------
# SMS batch dispatch tests
# ---------------------------------------------------------------------------


class TestSmsBatchDispatch:
    """Test SMS dispatch through campaign batch executor."""

    @patch("app.services.telephony.get_twilio_provider")
    def test_batch_dispatch_sms(self, mock_get_provider, db, org):
        """Batch executor should dispatch SMS for text campaign interactions."""
        from app.services.campaigns import _build_contact_variables, _dispatch_sms

        # Create text campaign with sms_message
        campaign = Campaign(
            name="Batch SMS Test",
            type="text",
            org_id=org.id,
            sms_message="Hello {name}, your bill is {amount}.",
            status="active",
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)

        # Create contact
        contact = Contact(
            phone="+9779812345678",
            name="Ram",
            org_id=org.id,
            metadata_={"amount": "500"},
        )
        db.add(contact)
        db.commit()
        db.refresh(contact)

        # Create pending SMS interaction
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="sms",
            status="in_progress",
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        # Mock Twilio provider
        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(
            return_value=SmsResult(
                message_sid="SM-batch-001",
                status=SmsStatus.QUEUED,
            )
        )
        mock_get_provider.return_value = mock_provider

        with patch("app.services.campaigns.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"
            _dispatch_sms(db, campaign, interaction)

        # Verify SMS was sent
        mock_provider.send_sms.assert_called_once()
        call_kwargs = mock_provider.send_sms.call_args
        assert "+9779812345678" in str(call_kwargs)

        # Commit changes made by _dispatch_sms (in real usage, batch executor commits)
        db.commit()
        db.refresh(interaction)
        assert interaction.metadata_["twilio_message_sid"] == "SM-batch-001"
        assert "Hello Ram" in interaction.metadata_["sms_body"]
        assert "500" in interaction.metadata_["sms_body"]

    @patch("app.services.telephony.get_twilio_provider")
    def test_batch_dispatch_sms_from_template(self, mock_get_provider, db, org):
        """Batch executor should render template when no sms_message is set."""
        from app.services.campaigns import _dispatch_sms

        template = Template(
            name="Template SMS",
            content="Hi {name}, amount due: {amount}.",
            type="text",
            org_id=org.id,
            language="en",
            variables=["name", "amount"],
        )
        db.add(template)
        db.commit()
        db.refresh(template)

        campaign = Campaign(
            name="Template SMS Campaign",
            type="text",
            org_id=org.id,
            template_id=template.id,
            status="active",
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)

        contact = Contact(
            phone="+9779800000000",
            name="Sita",
            org_id=org.id,
            metadata_={"amount": "1000"},
        )
        db.add(contact)
        db.commit()
        db.refresh(contact)

        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="sms",
            status="in_progress",
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(
            return_value=SmsResult(
                message_sid="SM-tpl-batch",
                status=SmsStatus.QUEUED,
            )
        )
        mock_get_provider.return_value = mock_provider

        with patch("app.services.campaigns.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"
            _dispatch_sms(db, campaign, interaction)

        db.commit()
        db.refresh(interaction)
        assert "Hi Sita" in interaction.metadata_["sms_body"]
        assert "1000" in interaction.metadata_["sms_body"]


# ---------------------------------------------------------------------------
# Dual-service campaign tests
# ---------------------------------------------------------------------------


class TestDualServiceCampaign:
    """Test SMS & PHONE dual-service campaign contact upload."""

    def test_dual_service_creates_both_interactions(self, client, db, org):
        """Uploading contacts to SMS & PHONE campaign creates two interactions per contact."""
        campaign = Campaign(
            name="Dual Service",
            type="text",
            org_id=org.id,
            services="SMS & PHONE",
            sms_message="Hello {name}!",
            status="draft",
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)

        csv_content = "phone,name\n+9779812345678,Ram\n+9779887654321,Sita"
        import io
        response = client.post(
            f"/api/v1/campaigns/{campaign.id}/contacts",
            files={"file": ("contacts.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["created"] == 2

        # Verify 4 interactions total (2 SMS + 2 outbound_call)
        from sqlalchemy import select, func
        total = db.execute(
            select(func.count())
            .select_from(Interaction)
            .where(Interaction.campaign_id == campaign.id)
        ).scalar_one()
        assert total == 4

        sms_count = db.execute(
            select(func.count())
            .select_from(Interaction)
            .where(
                Interaction.campaign_id == campaign.id,
                Interaction.type == "sms",
            )
        ).scalar_one()
        assert sms_count == 2

        call_count = db.execute(
            select(func.count())
            .select_from(Interaction)
            .where(
                Interaction.campaign_id == campaign.id,
                Interaction.type == "outbound_call",
            )
        ).scalar_one()
        assert call_count == 2


# ---------------------------------------------------------------------------
# Campaign schema tests — sms_message and services fields
# ---------------------------------------------------------------------------


class TestCampaignSmsFields:
    def test_create_campaign_with_sms_message(self, client, db, org):
        response = client.post(
            "/api/v1/campaigns/",
            json={
                "name": "SMS Campaign",
                "type": "text",
                "org_id": str(org.id),
                "sms_message": "Hello {name}!",
                "services": "SMS",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["sms_message"] == "Hello {name}!"
        assert data["services"] == "SMS"

    def test_create_campaign_with_dual_services(self, client, db, org):
        response = client.post(
            "/api/v1/campaigns/",
            json={
                "name": "Dual Campaign",
                "type": "text",
                "org_id": str(org.id),
                "sms_message": "SMS part",
                "services": "SMS & PHONE",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["services"] == "SMS & PHONE"

    def test_update_campaign_sms_message(self, client, db, org):
        # Create campaign first
        campaign = Campaign(
            name="Updatable",
            type="text",
            org_id=org.id,
            status="draft",
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)

        response = client.put(
            f"/api/v1/campaigns/{campaign.id}",
            json={
                "sms_message": "Updated SMS: {name}",
                "services": "SMS",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["sms_message"] == "Updated SMS: {name}"
        assert data["services"] == "SMS"


# ---------------------------------------------------------------------------
# SmsStatus enum tests
# ---------------------------------------------------------------------------


class TestSmsStatusEnum:
    def test_all_values(self):
        assert SmsStatus.QUEUED.value == "queued"
        assert SmsStatus.SENT.value == "sent"
        assert SmsStatus.DELIVERED.value == "delivered"
        assert SmsStatus.UNDELIVERED.value == "undelivered"
        assert SmsStatus.FAILED.value == "failed"
