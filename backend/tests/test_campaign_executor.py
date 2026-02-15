"""Tests for campaign batch executor — voice call dispatch via TTS + Twilio."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.models.template import Template
from app.services.campaigns import (
    _build_contact_variables,
    _build_tts_config,
    execute_campaign_batch,
)
from app.services.telephony import audio_store, call_context_store
from app.services.telephony.exceptions import (
    TelephonyConfigurationError,
    TelephonyProviderError,
)
from app.services.telephony.models import CallResult, CallStatus, SmsResult
from app.tts.exceptions import TTSProviderError
from app.tts.models import TTSProvider

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clean_stores():
    """Clean in-memory stores before/after each test."""
    audio_store._store.clear()
    call_context_store._store.clear()
    yield
    audio_store._store.clear()
    call_context_store._store.clear()


@pytest.fixture
def voice_template(db, org):
    """Voice template with Nepali content."""
    template = Template(
        name="Billing Reminder",
        content="नमस्ते {name}, तपाईंको बिल {amount|५००} रुपैयाँ छ।",
        type="voice",
        org_id=org.id,
        language="ne",
        variables=["name", "amount"],
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@pytest.fixture
def voice_campaign(db, org, voice_template):
    """Active voice campaign with a template attached."""
    campaign = Campaign(
        name="Bill Reminder",
        type="voice",
        org_id=org.id,
        status="active",
        template_id=voice_template.id,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@pytest.fixture
def contact_ram(db, org):
    """Contact 'Ram' with metadata."""
    contact = Contact(
        phone="+9779801234567",
        name="Ram",
        org_id=org.id,
        metadata_={"amount": "१०००"},
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@pytest.fixture
def contact_sita(db, org):
    """Contact 'Sita' without metadata."""
    contact = Contact(
        phone="+9779801234568",
        name="Sita",
        org_id=org.id,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@pytest.fixture
def pending_interaction(db, voice_campaign, contact_ram):
    """Single pending interaction for Ram."""
    interaction = Interaction(
        campaign_id=voice_campaign.id,
        contact_id=contact_ram.id,
        type="outbound_call",
        status="pending",
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return interaction


class _NoCloseSession:
    """Wrapper that delegates to a real session but ignores close().

    execute_campaign_batch calls db.close() in its finally block, which
    would detach all objects from the test session. This wrapper prevents that.
    """

    def __init__(self, session):
        self._session = session

    def close(self):
        pass  # Prevent the executor from closing our test session

    def __getattr__(self, name):
        return getattr(self._session, name)


def _make_db_factory(db):
    """Build a db_factory callable that returns a close-safe test session."""
    return lambda: _NoCloseSession(db)


def _mock_tts_and_twilio():
    """Return (mock_tts_router, mock_twilio_provider) with default success behavior."""
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
        return_value=CallResult(call_id="CA-batch-001", status=CallStatus.INITIATED)
    )

    return mock_tts, mock_provider


# ---------------------------------------------------------------------------
# Unit tests — helper functions
# ---------------------------------------------------------------------------


class TestBuildContactVariables:
    def test_name_only(self, contact_sita):
        result = _build_contact_variables(contact_sita)
        assert result == {"name": "Sita"}

    def test_name_and_metadata(self, contact_ram):
        result = _build_contact_variables(contact_ram)
        assert result == {"name": "Ram", "amount": "१०००"}

    def test_no_name_no_metadata(self, db, org):
        contact = Contact(phone="+9779800000000", org_id=org.id)
        db.add(contact)
        db.commit()
        result = _build_contact_variables(contact)
        assert result == {}


class TestBuildTTSConfig:
    def test_default_config(self, voice_template):
        config = _build_tts_config(voice_template)
        assert config.provider == TTSProvider.EDGE_TTS
        assert config.voice == "ne-NP-HemkalaNeural"
        assert config.fallback_provider is None

    def test_custom_voice_config(self, db, org):
        template = Template(
            name="Custom",
            content="Hello",
            type="voice",
            org_id=org.id,
            voice_config={
                "provider": "azure",
                "voice": "ne-NP-SagarNeural",
                "rate": "+10%",
                "pitch": "+5Hz",
                "fallback_provider": "edge_tts",
            },
        )
        db.add(template)
        db.commit()
        config = _build_tts_config(template)
        assert config.provider == TTSProvider.AZURE
        assert config.voice == "ne-NP-SagarNeural"
        assert config.rate == "+10%"
        assert config.fallback_provider == TTSProvider.EDGE_TTS


# ---------------------------------------------------------------------------
# Integration tests — execute_campaign_batch
# ---------------------------------------------------------------------------


class TestExecuteBatchVoiceSuccess:
    """Test the happy path: voice campaign dispatches calls via TTS + Twilio."""

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    @patch("app.services.campaigns.tts_router")
    def test_single_interaction_dispatched(
        self,
        mock_tts,
        mock_get_provider,
        mock_settings,
        db,
        voice_campaign,
        pending_interaction,
        contact_ram,
        voice_template,
    ):
        mock_tts_router, mock_provider = _mock_tts_and_twilio()
        mock_tts.synthesize = mock_tts_router.synthesize
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        execute_campaign_batch(voice_campaign.id, _make_db_factory(db))

        # TTS was called
        mock_tts.synthesize.assert_called_once()
        rendered_text = mock_tts.synthesize.call_args[0][0]
        assert "Ram" in rendered_text
        assert "१०००" in rendered_text  # From contact metadata

        # Twilio was called
        mock_provider.initiate_call.assert_called_once()
        call_kwargs = mock_provider.initiate_call.call_args
        assert call_kwargs.kwargs["to"] == "+9779801234567"

        # Interaction is now in_progress (webhook completes it)
        db.refresh(pending_interaction)
        assert pending_interaction.status == "in_progress"
        assert pending_interaction.metadata_["twilio_call_sid"] == "CA-batch-001"
        assert pending_interaction.metadata_["template_id"] == str(voice_template.id)

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    @patch("app.services.campaigns.tts_router")
    def test_multiple_interactions(
        self,
        mock_tts,
        mock_get_provider,
        mock_settings,
        db,
        voice_campaign,
        contact_ram,
        contact_sita,
    ):
        """Two contacts should both get calls dispatched."""
        for contact in [contact_ram, contact_sita]:
            db.add(
                Interaction(
                    campaign_id=voice_campaign.id,
                    contact_id=contact.id,
                    type="outbound_call",
                    status="pending",
                )
            )
        db.commit()

        mock_tts_router, mock_provider = _mock_tts_and_twilio()
        # Return unique CallSids
        mock_provider.initiate_call = AsyncMock(
            side_effect=[
                CallResult(call_id="CA-001", status=CallStatus.INITIATED),
                CallResult(call_id="CA-002", status=CallStatus.INITIATED),
            ]
        )
        mock_tts.synthesize = mock_tts_router.synthesize
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        execute_campaign_batch(voice_campaign.id, _make_db_factory(db))

        assert mock_tts.synthesize.call_count == 2
        assert mock_provider.initiate_call.call_count == 2


class TestExecuteBatchCampaignGuards:
    """Test guards: inactive campaign, no template, paused mid-batch."""

    def test_inactive_campaign_skipped(self, db, org, voice_template):
        campaign = Campaign(
            name="Paused",
            type="voice",
            org_id=org.id,
            status="paused",
            template_id=voice_template.id,
        )
        db.add(campaign)
        db.commit()

        # Should return early without error
        execute_campaign_batch(campaign.id, _make_db_factory(db))

    def test_nonexistent_campaign_skipped(self, db):
        execute_campaign_batch(uuid.uuid4(), _make_db_factory(db))

    def test_no_template_skipped(self, db, org):
        campaign = Campaign(
            name="No Template",
            type="voice",
            org_id=org.id,
            status="active",
            template_id=None,
        )
        db.add(campaign)
        db.flush()
        db.add(
            Interaction(
                campaign_id=campaign.id,
                contact_id=org.id,  # dummy
                type="outbound_call",
                status="pending",
            )
        )
        db.commit()

        execute_campaign_batch(campaign.id, _make_db_factory(db))
        # Campaign should still be active (not completed) since we bailed
        db.refresh(campaign)
        assert campaign.status == "active"

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    @patch("app.services.campaigns.tts_router")
    def test_campaign_completion_when_all_done(
        self,
        mock_tts,
        mock_get_provider,
        mock_settings,
        db,
        voice_campaign,
        pending_interaction,
    ):
        """Campaign should transition to 'completed' when no pending/in_progress remain.

        But voice calls stay in_progress until webhook, so campaign won't auto-complete
        while calls are in-flight.
        """
        mock_tts_router, mock_provider = _mock_tts_and_twilio()
        mock_tts.synthesize = mock_tts_router.synthesize
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        execute_campaign_batch(voice_campaign.id, _make_db_factory(db))

        db.refresh(voice_campaign)
        # Interaction is in_progress (waiting for webhook), so campaign stays active
        assert voice_campaign.status == "active"

    def test_campaign_completes_when_no_pending(self, db, org, voice_template):
        """When there are no pending interactions left, campaign completes."""
        campaign = Campaign(
            name="All Done",
            type="voice",
            org_id=org.id,
            status="active",
            template_id=voice_template.id,
        )
        db.add(campaign)
        db.flush()

        contact = Contact(phone="+9779800000000", org_id=org.id)
        db.add(contact)
        db.flush()

        # All interactions already completed
        db.add(
            Interaction(
                campaign_id=campaign.id,
                contact_id=contact.id,
                type="outbound_call",
                status="completed",
            )
        )
        db.commit()

        execute_campaign_batch(campaign.id, _make_db_factory(db))

        db.refresh(campaign)
        assert campaign.status == "completed"


class TestExecuteBatchRetryLogic:
    """Test retry behavior on dispatch failures."""

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    @patch("app.services.campaigns.tts_router")
    def test_tts_failure_triggers_retry(
        self,
        mock_tts,
        mock_get_provider,
        mock_settings,
        db,
        voice_campaign,
        pending_interaction,
    ):
        mock_tts.synthesize = AsyncMock(side_effect=TTSProviderError("edge_tts", "synthesis failed"))
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        execute_campaign_batch(voice_campaign.id, _make_db_factory(db))

        db.refresh(pending_interaction)
        # Should be re-queued for retry (attempt 1 of 3)
        assert pending_interaction.status == "pending"
        assert pending_interaction.metadata_["retry_count"] == 1
        assert "synthesis failed" in pending_interaction.metadata_["last_error"]

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    @patch("app.services.campaigns.tts_router")
    def test_twilio_failure_triggers_retry(
        self,
        mock_tts,
        mock_get_provider,
        mock_settings,
        db,
        voice_campaign,
        pending_interaction,
    ):
        mock_tts_router, mock_provider = _mock_tts_and_twilio()
        mock_tts.synthesize = mock_tts_router.synthesize
        mock_provider.initiate_call = AsyncMock(side_effect=TelephonyProviderError("twilio", "network error"))
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        execute_campaign_batch(voice_campaign.id, _make_db_factory(db))

        db.refresh(pending_interaction)
        assert pending_interaction.status == "pending"
        assert pending_interaction.metadata_["retry_count"] == 1
        # Audio should be cleaned up after Twilio failure
        assert audio_store.size() == 0

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    @patch("app.services.campaigns.tts_router")
    def test_retries_exhausted_marks_failed(
        self,
        mock_tts,
        mock_get_provider,
        mock_settings,
        db,
        voice_campaign,
        pending_interaction,
    ):
        """After max retries, interaction should be permanently failed."""
        # Pre-set retry count to max - 1
        pending_interaction.metadata_ = {"retry_count": 2}
        db.commit()

        mock_tts.synthesize = AsyncMock(side_effect=TTSProviderError("edge_tts", "persistent failure"))
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        execute_campaign_batch(voice_campaign.id, _make_db_factory(db))

        db.refresh(pending_interaction)
        assert pending_interaction.status == "failed"
        assert pending_interaction.metadata_["retry_count"] == 3
        assert "Failed after 3 attempts" in pending_interaction.metadata_["error"]
        assert pending_interaction.ended_at is not None

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    @patch("app.services.campaigns.tts_router")
    def test_twilio_config_error_retries(
        self,
        mock_tts,
        mock_get_provider,
        mock_settings,
        db,
        voice_campaign,
        pending_interaction,
    ):
        mock_tts_router, _ = _mock_tts_and_twilio()
        mock_tts.synthesize = mock_tts_router.synthesize
        mock_get_provider.side_effect = TelephonyConfigurationError("Twilio not configured")
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        execute_campaign_batch(voice_campaign.id, _make_db_factory(db))

        db.refresh(pending_interaction)
        assert pending_interaction.status == "pending"
        assert pending_interaction.metadata_["retry_count"] == 1


class TestExecuteBatchPartialCompletion:
    """Test partial completion: some calls succeed, some fail."""

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    @patch("app.services.campaigns.tts_router")
    def test_mixed_success_and_failure(
        self,
        mock_tts,
        mock_get_provider,
        mock_settings,
        db,
        voice_campaign,
        contact_ram,
        contact_sita,
    ):
        i1 = Interaction(
            campaign_id=voice_campaign.id,
            contact_id=contact_ram.id,
            type="outbound_call",
            status="pending",
        )
        i2 = Interaction(
            campaign_id=voice_campaign.id,
            contact_id=contact_sita.id,
            type="outbound_call",
            status="pending",
        )
        db.add_all([i1, i2])
        db.commit()
        db.refresh(i1)
        db.refresh(i2)

        mock_tts_router, mock_provider = _mock_tts_and_twilio()
        # First call succeeds, second fails
        mock_provider.initiate_call = AsyncMock(
            side_effect=[
                CallResult(call_id="CA-ok", status=CallStatus.INITIATED),
                TelephonyProviderError("twilio", "rate limited"),
            ]
        )
        mock_tts.synthesize = mock_tts_router.synthesize
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        execute_campaign_batch(voice_campaign.id, _make_db_factory(db))

        db.refresh(i1)
        db.refresh(i2)

        # First interaction succeeded
        assert i1.status == "in_progress"
        assert i1.metadata_["twilio_call_sid"] == "CA-ok"

        # Second interaction was re-queued for retry
        assert i2.status == "pending"
        assert i2.metadata_["retry_count"] == 1


class TestExecuteBatchSMSCampaign:
    """Test SMS campaign dispatch via Twilio messages API."""

    @pytest.fixture
    def sms_template(self, db, org):
        """Text template with variable substitution."""
        template = Template(
            name="SMS Reminder",
            content="नमस्ते {name}, तपाईंको बिल {amount|५००} रुपैयाँ बाँकी छ।",
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
    def sms_campaign(self, db, org, sms_template):
        """Active text campaign with a template attached."""
        campaign = Campaign(
            name="Bill SMS",
            type="text",
            org_id=org.id,
            status="active",
            template_id=sms_template.id,
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)
        return campaign

    @pytest.fixture
    def sms_contact(self, db, org):
        """Contact for SMS tests."""
        contact = Contact(
            phone="+9779801234567",
            name="Hari",
            org_id=org.id,
            metadata_={"amount": "१०००"},
        )
        db.add(contact)
        db.commit()
        db.refresh(contact)
        return contact

    @pytest.fixture
    def sms_interaction(self, db, sms_campaign, sms_contact):
        """Pending SMS interaction."""
        interaction = Interaction(
            campaign_id=sms_campaign.id,
            contact_id=sms_contact.id,
            type="sms",
            status="pending",
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)
        return interaction

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    def test_sms_dispatched_successfully(
        self,
        mock_get_provider,
        mock_settings,
        db,
        sms_campaign,
        sms_interaction,
        sms_contact,
        sms_template,
    ):
        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(return_value=SmsResult(message_id="SM-001", status="queued"))
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0

        execute_campaign_batch(sms_campaign.id, _make_db_factory(db))

        # SMS was sent
        mock_provider.send_sms.assert_called_once()
        call_kwargs = mock_provider.send_sms.call_args
        assert call_kwargs.kwargs["to"] == "+9779801234567"
        assert call_kwargs.kwargs["from_number"] == "+15551234567"
        # Template variables should be rendered
        body = call_kwargs.kwargs["body"]
        assert "Hari" in body
        assert "१०००" in body

        # Interaction is completed immediately (no webhook needed for SMS)
        db.refresh(sms_interaction)
        assert sms_interaction.status == "completed"
        assert sms_interaction.metadata_["twilio_message_sid"] == "SM-001"
        assert sms_interaction.metadata_["template_id"] == str(sms_template.id)
        assert sms_interaction.ended_at is not None

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    def test_sms_campaign_completes_when_all_sent(
        self,
        mock_get_provider,
        mock_settings,
        db,
        sms_campaign,
        sms_interaction,
    ):
        """SMS campaign auto-completes because interactions are marked completed immediately."""
        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(return_value=SmsResult(message_id="SM-done", status="queued"))
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0

        execute_campaign_batch(sms_campaign.id, _make_db_factory(db))

        db.refresh(sms_campaign)
        assert sms_campaign.status == "completed"

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    def test_sms_twilio_failure_triggers_retry(
        self,
        mock_get_provider,
        mock_settings,
        db,
        sms_campaign,
        sms_interaction,
    ):
        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(side_effect=TelephonyProviderError("twilio", "rate limited"))
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0

        execute_campaign_batch(sms_campaign.id, _make_db_factory(db))

        db.refresh(sms_interaction)
        assert sms_interaction.status == "pending"
        assert sms_interaction.metadata_["retry_count"] == 1
        assert "rate limited" in sms_interaction.metadata_["last_error"]

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    def test_sms_retries_exhausted_marks_failed(
        self,
        mock_get_provider,
        mock_settings,
        db,
        sms_campaign,
        sms_interaction,
    ):
        """After max retries, SMS interaction should be permanently failed."""
        sms_interaction.metadata_ = {"retry_count": 2}
        db.commit()

        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(side_effect=TelephonyProviderError("twilio", "persistent failure"))
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0

        execute_campaign_batch(sms_campaign.id, _make_db_factory(db))

        db.refresh(sms_interaction)
        assert sms_interaction.status == "failed"
        assert sms_interaction.metadata_["retry_count"] == 3
        assert "Failed after 3 attempts" in sms_interaction.metadata_["error"]
        assert sms_interaction.ended_at is not None

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    def test_sms_template_render_failure_retries(
        self,
        mock_get_provider,
        mock_settings,
        db,
        org,
    ):
        """Template with undefined variable should trigger retry."""
        template = Template(
            name="Bad Template",
            content="Hello {missing_var}",
            type="text",
            org_id=org.id,
        )
        db.add(template)
        db.flush()

        campaign = Campaign(
            name="Bad SMS",
            type="text",
            org_id=org.id,
            status="active",
            template_id=template.id,
        )
        db.add(campaign)
        db.flush()

        contact = Contact(phone="+9779800000000", org_id=org.id)
        db.add(contact)
        db.flush()

        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="sms",
            status="pending",
        )
        db.add(interaction)
        db.commit()

        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0

        execute_campaign_batch(campaign.id, _make_db_factory(db))

        db.refresh(interaction)
        assert interaction.status == "pending"
        assert interaction.metadata_["retry_count"] == 1
        assert "missing_var" in interaction.metadata_["last_error"]

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    def test_sms_config_error_retries(
        self,
        mock_get_provider,
        mock_settings,
        db,
        sms_campaign,
        sms_interaction,
    ):
        """Twilio not configured should trigger retry."""
        mock_get_provider.side_effect = TelephonyConfigurationError("Twilio not configured")
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0

        execute_campaign_batch(sms_campaign.id, _make_db_factory(db))

        db.refresh(sms_interaction)
        assert sms_interaction.status == "pending"
        assert sms_interaction.metadata_["retry_count"] == 1

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    def test_multiple_sms_interactions(
        self,
        mock_get_provider,
        mock_settings,
        db,
        sms_campaign,
        sms_contact,
        org,
    ):
        """Two contacts should both get SMS dispatched."""
        contact2 = Contact(
            phone="+9779801234568",
            name="Sita",
            org_id=org.id,
        )
        db.add(contact2)
        db.flush()

        for contact in [sms_contact, contact2]:
            db.add(
                Interaction(
                    campaign_id=sms_campaign.id,
                    contact_id=contact.id,
                    type="sms",
                    status="pending",
                )
            )
        db.commit()

        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(
            side_effect=[
                SmsResult(message_id="SM-001", status="queued"),
                SmsResult(message_id="SM-002", status="queued"),
            ]
        )
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0

        execute_campaign_batch(sms_campaign.id, _make_db_factory(db))

        assert mock_provider.send_sms.call_count == 2

        # Campaign should be completed since all SMS sent
        db.refresh(sms_campaign)
        assert sms_campaign.status == "completed"


class TestExecuteBatchContactNotFound:
    """Test handling of missing contact records."""

    @patch("app.services.campaigns.settings")
    def test_missing_contact_marks_failed(
        self,
        mock_settings,
        db,
        org,
        voice_template,
    ):
        campaign = Campaign(
            name="Bad Contact",
            type="voice",
            org_id=org.id,
            status="active",
            template_id=voice_template.id,
        )
        db.add(campaign)
        db.flush()

        # Create interaction pointing to nonexistent contact
        fake_contact_id = uuid.uuid4()
        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=fake_contact_id,
            type="outbound_call",
            status="pending",
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0

        execute_campaign_batch(campaign.id, _make_db_factory(db))

        db.refresh(interaction)
        assert interaction.status == "failed"
        assert "Contact not found" in interaction.metadata_["error"]


class TestExecuteBatchAudioAndContextStores:
    """Test that audio and call context are properly stored during dispatch."""

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    @patch("app.services.campaigns.tts_router")
    def test_audio_stored_for_twilio(
        self,
        mock_tts,
        mock_get_provider,
        mock_settings,
        db,
        voice_campaign,
        pending_interaction,
    ):
        mock_tts_router, mock_provider = _mock_tts_and_twilio()
        mock_tts.synthesize = mock_tts_router.synthesize
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        execute_campaign_batch(voice_campaign.id, _make_db_factory(db))

        # Audio should be stored (for Twilio to fetch)
        assert audio_store.size() >= 1

        # Call context should be stored (with the real CallSid)
        ctx = call_context_store.get("CA-batch-001")
        assert ctx is not None
        assert ctx.interaction_id == pending_interaction.id
