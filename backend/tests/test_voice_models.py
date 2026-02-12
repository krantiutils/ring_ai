"""Tests for voice models API — list voices, test speak, demo call."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import Campaign, Contact, Template, VoiceModel
from app.services.telephony import AudioEntry, CallContext, audio_store, call_context_store
from app.services.telephony.exceptions import (
    TelephonyConfigurationError,
    TelephonyProviderError,
)
from app.services.telephony.models import CallResult, CallStatus


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


@pytest.fixture
def voice_template(db, org):
    """Create a voice template for testing."""
    template = Template(
        name="Demo Voice Template",
        content="नमस्ते {name}, तपाईंको बिल {amount} रुपैयाँ छ।",
        type="voice",
        org_id=org.id,
        language="ne",
        variables=["name", "amount"],
        voice_config={"provider": "edge_tts", "voice": "ne-NP-HemkalaNeural"},
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@pytest.fixture
def voice_campaign(db, org, voice_template):
    """Create a voice campaign linked to a template."""
    campaign = Campaign(
        name="Test Voice Campaign",
        type="voice",
        org_id=org.id,
        template_id=voice_template.id,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@pytest.fixture
def campaign_no_template(db, org):
    """Create a campaign with no linked template."""
    campaign = Campaign(
        name="No Template Campaign",
        type="voice",
        org_id=org.id,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@pytest.fixture
def text_campaign(db, org):
    """Create a text (non-voice) campaign with a text template."""
    template = Template(
        name="Text Template",
        content="Hello {name}",
        type="text",
        org_id=org.id,
        language="en",
        variables=["name"],
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    campaign = Campaign(
        name="Text Campaign",
        type="text",
        org_id=org.id,
        template_id=template.id,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@pytest.fixture
def test_contact(db, org):
    """Create a test contact."""
    contact = Contact(
        phone="+9779812345678",
        name="राम",
        org_id=org.id,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


# ---------------------------------------------------------------------------
# GET /api/v1/voice-models/ — List voice models
# ---------------------------------------------------------------------------


class TestListVoiceModels:
    def test_list_returns_default_voices(self, client, db):
        """Should seed and return default voices when table is empty."""
        response = client.get("/api/v1/voice-models/")
        assert response.status_code == 200

        data = response.json()
        assert len(data) == 5  # Rija, Rija Premium, Prashanna, Shreegya, Binod

        names = [v["voice_display_name"] for v in data]
        assert "Rija" in names
        assert "Prashanna" in names

    def test_list_returns_correct_schema(self, client, db):
        """Each voice model should have id, voice_display_name, voice_internal_name, is_premium."""
        response = client.get("/api/v1/voice-models/")
        data = response.json()

        for voice in data:
            assert "id" in voice
            assert "voice_display_name" in voice
            assert "voice_internal_name" in voice
            assert "is_premium" in voice
            # Validate UUID format
            uuid.UUID(voice["id"])

    def test_list_includes_premium_flag(self, client, db):
        """Should distinguish premium from non-premium voices."""
        response = client.get("/api/v1/voice-models/")
        data = response.json()

        premium = [v for v in data if v["is_premium"]]
        free = [v for v in data if not v["is_premium"]]
        assert len(free) >= 2  # Edge TTS voices
        assert len(premium) >= 2  # Azure premium voices

    def test_list_idempotent(self, client, db):
        """Calling list twice should return same results (no duplicate seeding)."""
        response1 = client.get("/api/v1/voice-models/")
        response2 = client.get("/api/v1/voice-models/")

        assert response1.json() == response2.json()

    def test_list_with_pre_existing_models(self, client, db):
        """Should return existing models without re-seeding."""
        # Pre-seed a custom voice
        vm = VoiceModel(
            voice_display_name="Custom Voice",
            voice_internal_name="custom-voice-1",
            provider="edge_tts",
            locale="ne-NP",
            is_premium=False,
        )
        db.add(vm)
        db.commit()

        response = client.get("/api/v1/voice-models/")
        data = response.json()

        # Should have only the pre-existing model, not defaults
        assert len(data) == 1
        assert data[0]["voice_display_name"] == "Custom Voice"


# ---------------------------------------------------------------------------
# POST /api/v1/voice-models/test-speak/{campaign_id}/ — Test voice synthesis
# ---------------------------------------------------------------------------


class TestTestSpeak:
    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_success(self, mock_tts, client, db, voice_campaign):
        mock_tts.synthesize = AsyncMock(
            return_value=MagicMock(
                audio_bytes=b"fake-audio-bytes",
                duration_ms=3000,
                provider_used="edge_tts",
                chars_consumed=20,
                output_format="mp3",
            )
        )

        response = client.post(
            f"/api/v1/voice-models/test-speak/{voice_campaign.id}/",
            json={"voice_input": 1, "message": "नमस्ते, यो परीक्षण हो।"},
        )

        assert response.status_code == 201
        data = response.json()
        assert "audio_url" in data
        assert data["audio_url"].startswith("/api/v1/voice/audio/")

        # Verify audio was stored
        audio_id = data["audio_url"].split("/")[-1]
        assert audio_store.get(audio_id) is not None

    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_invalid_voice_input_too_high(self, mock_tts, client, db, voice_campaign):
        response = client.post(
            f"/api/v1/voice-models/test-speak/{voice_campaign.id}/",
            json={"voice_input": 99, "message": "test"},
        )
        assert response.status_code == 422
        assert "voice_input" in response.json()["detail"]

    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_invalid_voice_input_zero(self, mock_tts, client, db, voice_campaign):
        response = client.post(
            f"/api/v1/voice-models/test-speak/{voice_campaign.id}/",
            json={"voice_input": 0, "message": "test"},
        )
        assert response.status_code == 422

    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_campaign_not_found(self, mock_tts, client, db):
        response = client.post(
            f"/api/v1/voice-models/test-speak/{uuid.uuid4()}/",
            json={"voice_input": 1, "message": "test"},
        )
        assert response.status_code == 404
        assert "Campaign not found" in response.json()["detail"]

    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_tts_failure(self, mock_tts, client, db, voice_campaign):
        from app.tts.exceptions import TTSProviderError

        mock_tts.synthesize = AsyncMock(
            side_effect=TTSProviderError("edge_tts", "synthesis failed")
        )

        response = client.post(
            f"/api/v1/voice-models/test-speak/{voice_campaign.id}/",
            json={"voice_input": 1, "message": "test"},
        )
        assert response.status_code == 502
        assert "TTS synthesis failed" in response.json()["detail"]

    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_premium_voice_selection(self, mock_tts, client, db, voice_campaign):
        """Selecting a premium voice (index 3+) should attempt Azure TTS."""
        mock_tts.synthesize = AsyncMock(
            return_value=MagicMock(
                audio_bytes=b"premium-audio",
                duration_ms=2000,
                provider_used="azure",
                chars_consumed=10,
                output_format="mp3",
            )
        )

        # voice_input=3 should be "Hemkala Premium" (azure)
        response = client.post(
            f"/api/v1/voice-models/test-speak/{voice_campaign.id}/",
            json={"voice_input": 3, "message": "test premium"},
        )

        assert response.status_code == 201
        # Verify TTS was called (with either azure or fallback to edge)
        mock_tts.synthesize.assert_called_once()


# ---------------------------------------------------------------------------
# POST /api/v1/voice-models/demo-call/{campaign_id}/ — Demo call
# ---------------------------------------------------------------------------


class TestDemoCall:
    @patch("app.api.v1.endpoints.voice_models.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_demo_call_with_number(
        self, mock_tts, mock_get_provider, client, db, voice_campaign
    ):
        mock_tts.synthesize = AsyncMock(
            return_value=MagicMock(
                audio_bytes=b"demo-audio",
                duration_ms=4000,
                provider_used="edge_tts",
                chars_consumed=30,
                output_format="mp3",
            )
        )

        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.initiate_call = AsyncMock(
            return_value=CallResult(
                call_id="CA-demo-123", status=CallStatus.INITIATED
            )
        )
        mock_get_provider.return_value = mock_provider

        with patch("app.api.v1.endpoints.voice_models.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"
            mock_settings.AZURE_TTS_KEY = ""
            mock_settings.AZURE_TTS_REGION = ""

            response = client.post(
                f"/api/v1/voice-models/demo-call/{voice_campaign.id}/",
                json={"number": "+9779812345678"},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["call_id"] == "CA-demo-123"
        assert data["status"] == "initiated"
        assert data["to"] == "+9779812345678"

        # Verify Twilio was called
        mock_provider.initiate_call.assert_called_once()

    @patch("app.api.v1.endpoints.voice_models.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_demo_call_with_contact_id(
        self, mock_tts, mock_get_provider, client, db, voice_campaign, test_contact
    ):
        mock_tts.synthesize = AsyncMock(
            return_value=MagicMock(
                audio_bytes=b"demo-audio",
                duration_ms=4000,
                provider_used="edge_tts",
                chars_consumed=30,
                output_format="mp3",
            )
        )

        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.initiate_call = AsyncMock(
            return_value=CallResult(
                call_id="CA-demo-456", status=CallStatus.INITIATED
            )
        )
        mock_get_provider.return_value = mock_provider

        with patch("app.api.v1.endpoints.voice_models.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"
            mock_settings.AZURE_TTS_KEY = ""
            mock_settings.AZURE_TTS_REGION = ""

            response = client.post(
                f"/api/v1/voice-models/demo-call/{voice_campaign.id}/",
                json={"contact_id": str(test_contact.id)},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["call_id"] == "CA-demo-456"
        assert data["to"] == "+9779812345678"

    def test_demo_call_no_contact_or_number(self, client, db, voice_campaign):
        response = client.post(
            f"/api/v1/voice-models/demo-call/{voice_campaign.id}/",
            json={},
        )
        assert response.status_code == 422
        assert "contact_id or number" in response.json()["detail"]

    def test_demo_call_campaign_not_found(self, client, db):
        response = client.post(
            f"/api/v1/voice-models/demo-call/{uuid.uuid4()}/",
            json={"number": "+9779812345678"},
        )
        assert response.status_code == 404
        assert "Campaign not found" in response.json()["detail"]

    def test_demo_call_no_template(self, client, db, campaign_no_template):
        response = client.post(
            f"/api/v1/voice-models/demo-call/{campaign_no_template.id}/",
            json={"number": "+9779812345678"},
        )
        assert response.status_code == 422
        assert "no linked template" in response.json()["detail"]

    def test_demo_call_text_template(self, client, db, text_campaign):
        response = client.post(
            f"/api/v1/voice-models/demo-call/{text_campaign.id}/",
            json={"number": "+9779812345678"},
        )
        assert response.status_code == 422
        assert "voice" in response.json()["detail"]

    def test_demo_call_contact_not_found(self, client, db, voice_campaign):
        response = client.post(
            f"/api/v1/voice-models/demo-call/{voice_campaign.id}/",
            json={"contact_id": str(uuid.uuid4())},
        )
        assert response.status_code == 404
        assert "Contact not found" in response.json()["detail"]

    @patch("app.api.v1.endpoints.voice_models.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_demo_call_twilio_not_configured(
        self, mock_tts, mock_get_provider, client, db, voice_campaign
    ):
        mock_tts.synthesize = AsyncMock(
            return_value=MagicMock(audio_bytes=b"audio", output_format="mp3")
        )
        mock_get_provider.side_effect = TelephonyConfigurationError(
            "Twilio not configured"
        )

        with patch("app.api.v1.endpoints.voice_models.settings") as mock_settings:
            mock_settings.AZURE_TTS_KEY = ""
            mock_settings.AZURE_TTS_REGION = ""

            response = client.post(
                f"/api/v1/voice-models/demo-call/{voice_campaign.id}/",
                json={"number": "+9779812345678"},
            )

        assert response.status_code == 503

        # Audio should be cleaned up
        assert audio_store.size() == 0

    @patch("app.api.v1.endpoints.voice_models.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_demo_call_twilio_initiation_failure(
        self, mock_tts, mock_get_provider, client, db, voice_campaign
    ):
        mock_tts.synthesize = AsyncMock(
            return_value=MagicMock(audio_bytes=b"audio", output_format="mp3")
        )

        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.initiate_call = AsyncMock(
            side_effect=TelephonyProviderError("twilio", "network error")
        )
        mock_get_provider.return_value = mock_provider

        with patch("app.api.v1.endpoints.voice_models.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"
            mock_settings.AZURE_TTS_KEY = ""
            mock_settings.AZURE_TTS_REGION = ""

            response = client.post(
                f"/api/v1/voice-models/demo-call/{voice_campaign.id}/",
                json={"number": "+9779812345678"},
            )

        assert response.status_code == 502

        # Resources should be cleaned up
        assert audio_store.size() == 0

    @patch("app.api.v1.endpoints.voice_models.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_demo_call_tts_failure(
        self, mock_tts, mock_get_provider, client, db, voice_campaign
    ):
        from app.tts.exceptions import TTSProviderError

        mock_tts.synthesize = AsyncMock(
            side_effect=TTSProviderError("edge_tts", "synthesis failed")
        )

        with patch("app.api.v1.endpoints.voice_models.settings") as mock_settings:
            mock_settings.AZURE_TTS_KEY = ""
            mock_settings.AZURE_TTS_REGION = ""

            response = client.post(
                f"/api/v1/voice-models/demo-call/{voice_campaign.id}/",
                json={"number": "+9779812345678"},
            )

        assert response.status_code == 502
        assert "TTS synthesis failed" in response.json()["detail"]

    @patch("app.api.v1.endpoints.voice_models.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_demo_call_no_base_url(
        self, mock_tts, mock_get_provider, client, db, voice_campaign
    ):
        mock_tts.synthesize = AsyncMock(
            return_value=MagicMock(audio_bytes=b"audio", output_format="mp3")
        )

        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_get_provider.return_value = mock_provider

        with patch("app.api.v1.endpoints.voice_models.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = ""
            mock_settings.AZURE_TTS_KEY = ""
            mock_settings.AZURE_TTS_REGION = ""

            response = client.post(
                f"/api/v1/voice-models/demo-call/{voice_campaign.id}/",
                json={"number": "+9779812345678"},
            )

        assert response.status_code == 503
        assert "TWILIO_BASE_URL" in response.json()["detail"]

    @patch("app.api.v1.endpoints.voice_models.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice_models.tts_router")
    def test_demo_call_no_from_number(
        self, mock_tts, mock_get_provider, client, db, voice_campaign
    ):
        mock_tts.synthesize = AsyncMock(
            return_value=MagicMock(audio_bytes=b"audio", output_format="mp3")
        )

        mock_provider = MagicMock()
        mock_provider.default_from_number = ""
        mock_get_provider.return_value = mock_provider

        with patch("app.api.v1.endpoints.voice_models.settings") as mock_settings:
            mock_settings.AZURE_TTS_KEY = ""
            mock_settings.AZURE_TTS_REGION = ""

            response = client.post(
                f"/api/v1/voice-models/demo-call/{voice_campaign.id}/",
                json={"number": "+9779812345678"},
            )

        assert response.status_code == 422
        assert "phone number" in response.json()["detail"]
