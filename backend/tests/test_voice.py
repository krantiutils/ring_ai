"""Tests for outbound voice calling — telephony service + API endpoints."""

import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from xml.etree import ElementTree

import pytest
from fastapi.testclient import TestClient

from app.models import Interaction, Template
from app.services.telephony import (
    AudioEntry,
    CallContext,
    CallStatus,
    audio_store,
    call_context_store,
)
from app.services.telephony.exceptions import (
    TelephonyConfigurationError,
    TelephonyProviderError,
)
from app.services.telephony.models import CallResult, DTMFAction, DTMFRoute
from app.services.telephony.twilio import (
    generate_call_twiml,
    generate_dtmf_response_twiml,
)


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
        name="Test Voice Template",
        content="नमस्ते {name}, तपाईंको बिल {amount} रुपैयाँ छ।",
        type="voice",
        org_id=org.id,
        language="ne",
        variables=["amount", "name"],
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@pytest.fixture
def text_template(db, org):
    """Create a text (non-voice) template."""
    template = Template(
        name="Test Text Template",
        content="Hello {name}",
        type="text",
        org_id=org.id,
        language="en",
        variables=["name"],
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@pytest.fixture
def sample_dtmf_routes():
    return [
        DTMFRoute(digit="1", action=DTMFAction.PAYMENT, label="भुक्तानी"),
        DTMFRoute(digit="2", action=DTMFAction.INFO, label="जानकारी"),
        DTMFRoute(digit="0", action=DTMFAction.AGENT, label="एजेन्ट"),
        DTMFRoute(digit="9", action=DTMFAction.REPEAT, label="फेरि सुन्नुहोस्"),
    ]


# ---------------------------------------------------------------------------
# TwiML generation tests
# ---------------------------------------------------------------------------


class TestGenerateCallTwiml:
    def test_basic_play_audio(self):
        """TwiML with no DTMF and no recording should just Play + Hangup."""
        ctx = CallContext(call_id="test-1", audio_id="audio-1")
        twiml = generate_call_twiml(
            ctx,
            audio_url="https://example.com/audio/audio-1",
            dtmf_action_url="https://example.com/dtmf/test-1",
        )

        root = ElementTree.fromstring(twiml)
        assert root.tag == "Response"

        tags = [child.tag for child in root]
        assert "Play" in tags
        assert "Hangup" in tags
        # No Gather when no DTMF routes
        assert "Gather" not in tags

        play = root.find("Play")
        assert play.text == "https://example.com/audio/audio-1"

    def test_with_dtmf_routes(self, sample_dtmf_routes):
        """TwiML should wrap Play in Gather when DTMF routes are configured."""
        ctx = CallContext(
            call_id="test-2",
            audio_id="audio-2",
            dtmf_routes=sample_dtmf_routes,
        )
        twiml = generate_call_twiml(
            ctx,
            audio_url="https://example.com/audio/audio-2",
            dtmf_action_url="https://example.com/dtmf/test-2",
        )

        root = ElementTree.fromstring(twiml)
        gather = root.find("Gather")
        assert gather is not None
        assert gather.attrib["numDigits"] == "1"
        assert gather.attrib["action"] == "https://example.com/dtmf/test-2"

        # Play should be inside Gather
        play = gather.find("Play")
        assert play is not None
        assert play.text == "https://example.com/audio/audio-2"

        # Say prompt should be inside Gather too
        say = gather.find("Say")
        assert say is not None
        assert "थिच्नुहोस्" in say.text  # "press" in Nepali

    def test_with_recording(self):
        """TwiML should include Record when recording is enabled."""
        ctx = CallContext(
            call_id="test-3",
            audio_id="audio-3",
            record=True,
            record_consent_text="यो कल रेकर्ड हुँदैछ।",
        )
        twiml = generate_call_twiml(
            ctx,
            audio_url="https://example.com/audio/audio-3",
            dtmf_action_url="https://example.com/dtmf/test-3",
        )

        root = ElementTree.fromstring(twiml)
        tags = [child.tag for child in root]
        # Consent Say should come first, then Record
        assert "Say" in tags
        assert "Record" in tags

        say = root.find("Say")
        assert say.text == "यो कल रेकर्ड हुँदैछ।"

    def test_with_recording_and_dtmf(self, sample_dtmf_routes):
        """TwiML should have both Record and Gather when both are enabled."""
        ctx = CallContext(
            call_id="test-4",
            audio_id="audio-4",
            dtmf_routes=sample_dtmf_routes,
            record=True,
            record_consent_text="रेकर्ड हुँदैछ।",
        )
        twiml = generate_call_twiml(
            ctx,
            audio_url="https://example.com/audio/audio-4",
            dtmf_action_url="https://example.com/dtmf/test-4",
        )

        root = ElementTree.fromstring(twiml)
        tags = [child.tag for child in root]
        assert "Say" in tags
        assert "Record" in tags
        assert "Gather" in tags
        assert "Hangup" in tags


class TestGenerateDtmfResponseTwiml:
    def test_known_digit_payment(self, sample_dtmf_routes):
        twiml = generate_dtmf_response_twiml("1", sample_dtmf_routes)
        root = ElementTree.fromstring(twiml)
        say = root.find("Say")
        assert say is not None
        assert "भुक्तानी" in say.text

    def test_known_digit_agent(self, sample_dtmf_routes):
        twiml = generate_dtmf_response_twiml("0", sample_dtmf_routes)
        root = ElementTree.fromstring(twiml)
        say = root.find("Say")
        assert "एजेन्ट" in say.text

    def test_known_digit_info(self, sample_dtmf_routes):
        twiml = generate_dtmf_response_twiml("2", sample_dtmf_routes)
        root = ElementTree.fromstring(twiml)
        say = root.find("Say")
        assert "जानकारी" in say.text

    def test_known_digit_repeat(self, sample_dtmf_routes):
        twiml = generate_dtmf_response_twiml("9", sample_dtmf_routes)
        root = ElementTree.fromstring(twiml)
        # Repeat should redirect
        redirect = root.find("Redirect")
        assert redirect is not None

    def test_unknown_digit(self, sample_dtmf_routes):
        twiml = generate_dtmf_response_twiml("5", sample_dtmf_routes)
        root = ElementTree.fromstring(twiml)
        say = root.find("Say")
        assert "अमान्य" in say.text  # "invalid" in Nepali


# ---------------------------------------------------------------------------
# Audio store tests
# ---------------------------------------------------------------------------


class TestAudioStore:
    def test_put_and_get(self):
        entry = AudioEntry(audio_bytes=b"fake-audio", content_type="audio/mpeg")
        audio_store.put("id-1", entry)
        assert audio_store.get("id-1") is entry
        assert audio_store.size() == 1

    def test_get_missing(self):
        assert audio_store.get("nonexistent") is None

    def test_delete(self):
        entry = AudioEntry(audio_bytes=b"data", content_type="audio/mpeg")
        audio_store.put("id-2", entry)
        audio_store.delete("id-2")
        assert audio_store.get("id-2") is None
        assert audio_store.size() == 0

    def test_delete_missing_no_error(self):
        audio_store.delete("no-such-id")  # Should not raise


class TestCallContextStore:
    def test_put_and_get(self):
        ctx = CallContext(call_id="c-1", audio_id="a-1")
        call_context_store.put("c-1", ctx)
        assert call_context_store.get("c-1") is ctx

    def test_get_missing(self):
        assert call_context_store.get("nonexistent") is None

    def test_delete(self):
        ctx = CallContext(call_id="c-2", audio_id="a-2")
        call_context_store.put("c-2", ctx)
        call_context_store.delete("c-2")
        assert call_context_store.get("c-2") is None


# ---------------------------------------------------------------------------
# API endpoint tests — TwiML, audio serving, DTMF, webhook
# ---------------------------------------------------------------------------


class TestTwimlEndpoint:
    def test_serve_twiml_returns_xml(self, client):
        ctx = CallContext(call_id="call-abc", audio_id="audio-abc")
        call_context_store.put("call-abc", ctx)

        with patch("app.api.v1.endpoints.voice.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"
            response = client.post("/api/v1/voice/twiml/call-abc")

        assert response.status_code == 200
        assert response.headers["content-type"] == "text/xml; charset=utf-8"
        assert "<?xml" in response.text
        assert "<Response>" in response.text

    def test_serve_twiml_unknown_call(self, client):
        response = client.post("/api/v1/voice/twiml/unknown-id")
        assert response.status_code == 404


class TestAudioEndpoint:
    def test_serve_audio(self, client):
        audio_data = b"\xff\xfb\x90\x00" * 100  # fake MP3 bytes
        audio_store.put("test-audio", AudioEntry(audio_bytes=audio_data))

        response = client.get("/api/v1/voice/audio/test-audio")
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/mpeg"
        assert response.content == audio_data

    def test_serve_audio_not_found(self, client):
        response = client.get("/api/v1/voice/audio/nonexistent")
        assert response.status_code == 404


class TestDtmfEndpoint:
    def test_handle_dtmf(self, client):
        routes = [
            DTMFRoute(digit="1", action=DTMFAction.PAYMENT, label="भुक्तानी"),
        ]
        ctx = CallContext(call_id="dtmf-call", audio_id="a-1", dtmf_routes=routes)
        call_context_store.put("dtmf-call", ctx)

        response = client.post(
            "/api/v1/voice/dtmf/dtmf-call",
            data={"Digits": "1"},
        )
        assert response.status_code == 200
        assert "text/xml" in response.headers["content-type"]
        assert "भुक्तानी" in response.text

    def test_handle_dtmf_unknown_call(self, client):
        response = client.post(
            "/api/v1/voice/dtmf/unknown",
            data={"Digits": "1"},
        )
        assert response.status_code == 404


class TestWebhookEndpoint:
    def test_webhook_updates_interaction(self, client, db, org):
        # Create an interaction
        interaction = Interaction(
            campaign_id=org.id,
            contact_id=org.id,
            type="outbound_call",
            status="in_progress",
            metadata_={"twilio_call_sid": "CA123"},
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        # Store call context
        ctx = CallContext(
            call_id="CA123",
            audio_id="a-1",
            interaction_id=interaction.id,
        )
        call_context_store.put("CA123", ctx)
        audio_store.put("a-1", AudioEntry(audio_bytes=b"data"))

        # Send webhook
        response = client.post(
            "/api/v1/voice/webhook",
            data={
                "CallSid": "CA123",
                "CallStatus": "completed",
                "CallDuration": "45",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["call_status"] == "completed"

        # Verify interaction was updated
        db.refresh(interaction)
        assert interaction.status == "completed"
        assert interaction.duration_seconds == 45

        # Verify cleanup happened
        assert audio_store.get("a-1") is None
        assert call_context_store.get("CA123") is None

    def test_webhook_with_recording(self, client, db, org):
        interaction = Interaction(
            campaign_id=org.id,
            contact_id=org.id,
            type="outbound_call",
            status="in_progress",
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        ctx = CallContext(
            call_id="CA456",
            audio_id="a-2",
            interaction_id=interaction.id,
        )
        call_context_store.put("CA456", ctx)
        audio_store.put("a-2", AudioEntry(audio_bytes=b"data"))

        response = client.post(
            "/api/v1/voice/webhook",
            data={
                "CallSid": "CA456",
                "CallStatus": "completed",
                "CallDuration": "120",
                "RecordingUrl": "https://api.twilio.com/recordings/RE123",
            },
        )
        assert response.status_code == 200

        db.refresh(interaction)
        assert interaction.audio_url == "https://api.twilio.com/recordings/RE123"
        assert interaction.metadata_["recording_url"] == "https://api.twilio.com/recordings/RE123"

    def test_webhook_no_callsid(self, client):
        response = client.post("/api/v1/voice/webhook", data={})
        assert response.status_code == 200
        assert response.json()["status"] == "ignored"

    def test_webhook_unknown_status(self, client):
        response = client.post(
            "/api/v1/voice/webhook",
            data={"CallSid": "CA789", "CallStatus": "weird-status"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ignored"

    def test_webhook_failed_status(self, client, db, org):
        interaction = Interaction(
            campaign_id=org.id,
            contact_id=org.id,
            type="outbound_call",
            status="in_progress",
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        ctx = CallContext(
            call_id="CAfail",
            audio_id="a-fail",
            interaction_id=interaction.id,
        )
        call_context_store.put("CAfail", ctx)
        audio_store.put("a-fail", AudioEntry(audio_bytes=b"data"))

        response = client.post(
            "/api/v1/voice/webhook",
            data={"CallSid": "CAfail", "CallStatus": "failed"},
        )
        assert response.status_code == 200

        db.refresh(interaction)
        assert interaction.status == "failed"

    def test_webhook_ringing_does_not_cleanup(self, client):
        ctx = CallContext(call_id="CA-ring", audio_id="a-ring")
        call_context_store.put("CA-ring", ctx)
        audio_store.put("a-ring", AudioEntry(audio_bytes=b"data"))

        response = client.post(
            "/api/v1/voice/webhook",
            data={"CallSid": "CA-ring", "CallStatus": "ringing"},
        )
        assert response.status_code == 200

        # Resources should NOT be cleaned up for non-terminal status
        assert audio_store.get("a-ring") is not None
        assert call_context_store.get("CA-ring") is not None


class TestCampaignCallEndpoint:
    """Test the full campaign-call endpoint with mocked Twilio + TTS."""

    @patch("app.api.v1.endpoints.voice.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice.tts_router")
    def test_campaign_call_success(
        self, mock_tts, mock_get_provider, client, db, voice_template
    ):
        # Mock TTS
        mock_tts.synthesize = AsyncMock(
            return_value=MagicMock(
                audio_bytes=b"fake-audio-bytes",
                duration_ms=5000,
                provider_used="edge_tts",
                chars_consumed=50,
                output_format="mp3",
            )
        )

        # Mock Twilio provider
        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.initiate_call = AsyncMock(
            return_value=CallResult(call_id="CA-test-123", status=CallStatus.INITIATED)
        )
        mock_get_provider.return_value = mock_provider

        with patch("app.api.v1.endpoints.voice.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

            response = client.post(
                "/api/v1/voice/campaign-call",
                json={
                    "to": "+9779812345678",
                    "template_id": str(voice_template.id),
                    "variables": {"name": "राम", "amount": "५००"},
                },
            )

        assert response.status_code == 201
        data = response.json()
        assert data["call_id"] == "CA-test-123"
        assert data["status"] == "initiated"

        # Verify TTS was called with rendered text
        mock_tts.synthesize.assert_called_once()
        call_args = mock_tts.synthesize.call_args
        rendered = call_args[0][0]
        assert "राम" in rendered
        assert "५००" in rendered

        # Verify Twilio was called
        mock_provider.initiate_call.assert_called_once()

        # Verify audio was stored
        assert audio_store.size() >= 1

    @patch("app.api.v1.endpoints.voice.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice.tts_router")
    def test_campaign_call_template_not_found(
        self, mock_tts, mock_get_provider, client
    ):
        response = client.post(
            "/api/v1/voice/campaign-call",
            json={
                "to": "+9779812345678",
                "template_id": str(uuid.uuid4()),
                "variables": {},
            },
        )
        assert response.status_code == 404
        assert "Template not found" in response.json()["detail"]

    @patch("app.api.v1.endpoints.voice.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice.tts_router")
    def test_campaign_call_wrong_template_type(
        self, mock_tts, mock_get_provider, client, text_template
    ):
        response = client.post(
            "/api/v1/voice/campaign-call",
            json={
                "to": "+9779812345678",
                "template_id": str(text_template.id),
                "variables": {"name": "test"},
            },
        )
        assert response.status_code == 422
        assert "voice" in response.json()["detail"]

    @patch("app.api.v1.endpoints.voice.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice.tts_router")
    def test_campaign_call_missing_variable(
        self, mock_tts, mock_get_provider, client, voice_template
    ):
        response = client.post(
            "/api/v1/voice/campaign-call",
            json={
                "to": "+9779812345678",
                "template_id": str(voice_template.id),
                "variables": {},  # Missing "name" and "amount"
            },
        )
        assert response.status_code == 422
        assert "Missing required variable" in response.json()["detail"]

    @patch("app.api.v1.endpoints.voice.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice.tts_router")
    def test_campaign_call_tts_failure(
        self, mock_tts, mock_get_provider, client, voice_template
    ):
        from app.tts.exceptions import TTSProviderError

        mock_tts.synthesize = AsyncMock(
            side_effect=TTSProviderError("edge_tts", "synthesis failed")
        )

        response = client.post(
            "/api/v1/voice/campaign-call",
            json={
                "to": "+9779812345678",
                "template_id": str(voice_template.id),
                "variables": {"name": "राम", "amount": "५००"},
            },
        )
        assert response.status_code == 502
        assert "TTS synthesis failed" in response.json()["detail"]

    @patch("app.api.v1.endpoints.voice.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice.tts_router")
    def test_campaign_call_twilio_not_configured(
        self, mock_tts, mock_get_provider, client, voice_template
    ):
        mock_tts.synthesize = AsyncMock(
            return_value=MagicMock(audio_bytes=b"audio", output_format="mp3")
        )
        mock_get_provider.side_effect = TelephonyConfigurationError(
            "Twilio not configured"
        )

        response = client.post(
            "/api/v1/voice/campaign-call",
            json={
                "to": "+9779812345678",
                "template_id": str(voice_template.id),
                "variables": {"name": "राम", "amount": "५००"},
            },
        )
        assert response.status_code == 503

    @patch("app.api.v1.endpoints.voice.get_twilio_provider")
    @patch("app.api.v1.endpoints.voice.tts_router")
    def test_campaign_call_twilio_initiate_failure(
        self, mock_tts, mock_get_provider, client, voice_template
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

        with patch("app.api.v1.endpoints.voice.settings") as mock_settings:
            mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

            response = client.post(
                "/api/v1/voice/campaign-call",
                json={
                    "to": "+9779812345678",
                    "template_id": str(voice_template.id),
                    "variables": {"name": "राम", "amount": "५००"},
                },
            )

        assert response.status_code == 502

        # Audio should be cleaned up on failure
        assert audio_store.size() == 0


class TestGetCallStatus:
    @patch("app.api.v1.endpoints.voice.get_twilio_provider")
    def test_get_call_status(self, mock_get_provider, client):
        from app.services.telephony.models import CallStatusResponse as ProviderCallStatus

        mock_provider = MagicMock()
        mock_provider.get_call_status = AsyncMock(
            return_value=ProviderCallStatus(
                call_id="CA-xyz",
                status=CallStatus.COMPLETED,
                duration_seconds=120,
                price="-0.0085",
                direction="outbound-api",
                from_number="+15551234567",
                to_number="+9779812345678",
            )
        )
        mock_get_provider.return_value = mock_provider

        response = client.get("/api/v1/voice/calls/CA-xyz")
        assert response.status_code == 200
        data = response.json()
        assert data["call_id"] == "CA-xyz"
        assert data["status"] == "completed"
        assert data["duration_seconds"] == 120

    @patch("app.api.v1.endpoints.voice.get_twilio_provider")
    def test_get_call_status_twilio_error(self, mock_get_provider, client):
        mock_provider = MagicMock()
        mock_provider.get_call_status = AsyncMock(
            side_effect=TelephonyProviderError("twilio", "not found")
        )
        mock_get_provider.return_value = mock_provider

        response = client.get("/api/v1/voice/calls/CA-bad")
        assert response.status_code == 502

    @patch("app.api.v1.endpoints.voice.get_twilio_provider")
    def test_get_call_status_not_configured(self, mock_get_provider, client):
        mock_get_provider.side_effect = TelephonyConfigurationError("no creds")

        response = client.get("/api/v1/voice/calls/CA-any")
        assert response.status_code == 503


# ---------------------------------------------------------------------------
# Telephony exception tests
# ---------------------------------------------------------------------------


class TestTelephonyExceptions:
    def test_provider_error_format(self):
        err = TelephonyProviderError("twilio", "something broke")
        assert "twilio" in str(err)
        assert "something broke" in str(err)
        assert err.provider == "twilio"

    def test_configuration_error(self):
        err = TelephonyConfigurationError("missing key")
        assert "missing key" in str(err)


# ---------------------------------------------------------------------------
# CallStatus enum tests
# ---------------------------------------------------------------------------


class TestCallStatusEnum:
    def test_all_values(self):
        assert CallStatus.INITIATED.value == "initiated"
        assert CallStatus.QUEUED.value == "queued"
        assert CallStatus.RINGING.value == "ringing"
        assert CallStatus.IN_PROGRESS.value == "in-progress"
        assert CallStatus.COMPLETED.value == "completed"
        assert CallStatus.BUSY.value == "busy"
        assert CallStatus.NO_ANSWER.value == "no-answer"
        assert CallStatus.CANCELED.value == "canceled"
        assert CallStatus.FAILED.value == "failed"
