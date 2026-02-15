"""Tests for audio file upload — pre-recorded audio for campaigns."""

import io
import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.services.campaigns import execute_campaign_batch
from app.services.telephony import audio_store, call_context_store
from app.services.telephony.models import CallResult, CallStatus

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
def draft_campaign(db, org):
    """Draft voice campaign (no template, no audio)."""
    campaign = Campaign(
        name="Audio Test",
        type="voice",
        org_id=org.id,
        status="draft",
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@pytest.fixture
def active_campaign(db, org):
    """Active voice campaign (for testing rejection of uploads)."""
    campaign = Campaign(
        name="Active Campaign",
        type="voice",
        org_id=org.id,
        status="active",
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@pytest.fixture
def audio_campaign(db, org, tmp_path):
    """Active voice campaign with a pre-recorded audio file."""
    audio_file = tmp_path / "test_audio.mp3"
    audio_file.write_bytes(b"fake-mp3-audio-data-for-testing")

    campaign = Campaign(
        name="Audio Campaign",
        type="voice",
        org_id=org.id,
        status="active",
        audio_file=str(audio_file),
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@pytest.fixture
def contact(db, org):
    """Test contact."""
    c = Contact(
        phone="+9779801234567",
        name="Ram",
        org_id=org.id,
        metadata_={"amount": "500"},
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


class _NoCloseSession:
    """Wrapper that prevents the executor from closing our test session."""

    def __init__(self, session):
        self._session = session

    def close(self):
        pass

    def __getattr__(self, name):
        return getattr(self._session, name)


def _make_db_factory(db):
    return lambda: _NoCloseSession(db)


# ---------------------------------------------------------------------------
# Upload endpoint tests
# ---------------------------------------------------------------------------


class TestUploadAudioEndpoint:
    """Test POST /campaigns/{id}/upload-audio."""

    def test_upload_mp3(self, client, draft_campaign):
        """Valid MP3 upload should succeed and set campaign.audio_file."""
        audio_data = b"\xff\xfb\x90\x00" + b"\x00" * 100  # Fake MP3 header
        response = client.post(
            f"/api/v1/campaigns/{draft_campaign.id}/upload-audio",
            files={"file": ("test.mp3", io.BytesIO(audio_data), "audio/mpeg")},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["content_type"] == "audio/mpeg"
        assert body["size_bytes"] == len(audio_data)
        assert body["audio_file"].endswith(".mp3")

    def test_upload_wav(self, client, draft_campaign):
        """Valid WAV upload should succeed."""
        audio_data = b"RIFF" + b"\x00" * 100  # Fake WAV header
        response = client.post(
            f"/api/v1/campaigns/{draft_campaign.id}/upload-audio",
            files={"file": ("test.wav", io.BytesIO(audio_data), "audio/wav")},
        )
        assert response.status_code == 201
        body = response.json()
        assert body["content_type"] == "audio/wav"
        assert body["audio_file"].endswith(".wav")

    def test_upload_invalid_format_rejected(self, client, draft_campaign):
        """Non-audio file should be rejected with 422."""
        response = client.post(
            f"/api/v1/campaigns/{draft_campaign.id}/upload-audio",
            files={"file": ("test.pdf", io.BytesIO(b"pdf-data"), "application/pdf")},
        )
        assert response.status_code == 422
        assert "Unsupported audio format" in response.json()["detail"]

    def test_upload_empty_file_rejected(self, client, draft_campaign):
        """Empty audio file should be rejected."""
        response = client.post(
            f"/api/v1/campaigns/{draft_campaign.id}/upload-audio",
            files={"file": ("test.mp3", io.BytesIO(b""), "audio/mpeg")},
        )
        assert response.status_code == 422
        assert "empty" in response.json()["detail"]

    def test_upload_to_non_draft_campaign_rejected(self, client, active_campaign):
        """Upload to non-draft campaign should return 409."""
        response = client.post(
            f"/api/v1/campaigns/{active_campaign.id}/upload-audio",
            files={"file": ("test.mp3", io.BytesIO(b"audio"), "audio/mpeg")},
        )
        assert response.status_code == 409
        assert "draft" in response.json()["detail"]

    def test_upload_to_nonexistent_campaign_returns_404(self, client):
        """Upload to nonexistent campaign should return 404."""
        response = client.post(
            f"/api/v1/campaigns/{uuid.uuid4()}/upload-audio",
            files={"file": ("test.mp3", io.BytesIO(b"audio"), "audio/mpeg")},
        )
        assert response.status_code == 404

    def test_upload_updates_campaign_audio_file(self, client, db, draft_campaign):
        """After upload, campaign.audio_file should be set."""
        audio_data = b"fake-mp3-data"
        client.post(
            f"/api/v1/campaigns/{draft_campaign.id}/upload-audio",
            files={"file": ("test.mp3", io.BytesIO(audio_data), "audio/mpeg")},
        )
        db.refresh(draft_campaign)
        assert draft_campaign.audio_file is not None
        assert os.path.isfile(draft_campaign.audio_file)

    def test_upload_file_persisted_on_disk(self, client, db, draft_campaign):
        """The audio bytes should be written to disk correctly."""
        audio_data = b"this-is-audio-content-1234"
        client.post(
            f"/api/v1/campaigns/{draft_campaign.id}/upload-audio",
            files={"file": ("test.mp3", io.BytesIO(audio_data), "audio/mpeg")},
        )
        db.refresh(draft_campaign)
        with open(draft_campaign.audio_file, "rb") as f:
            assert f.read() == audio_data


class TestServeAudioEndpoint:
    """Test GET /campaigns/{id}/audio."""

    def test_serve_audio_returns_file(self, client, db, draft_campaign, tmp_path):
        """Should serve the uploaded audio file."""
        audio_data = b"mp3-audio-bytes"
        audio_file = tmp_path / "test.mp3"
        audio_file.write_bytes(audio_data)
        draft_campaign.audio_file = str(audio_file)
        db.commit()

        response = client.get(f"/api/v1/campaigns/{draft_campaign.id}/audio")
        assert response.status_code == 200
        assert response.content == audio_data
        assert response.headers["content-type"] == "audio/mpeg"

    def test_serve_audio_no_file_returns_404(self, client, draft_campaign):
        """Campaign with no audio file should return 404."""
        response = client.get(f"/api/v1/campaigns/{draft_campaign.id}/audio")
        assert response.status_code == 404

    def test_serve_audio_missing_file_on_disk_returns_404(self, client, db, draft_campaign):
        """If the file was deleted from disk, return 404."""
        draft_campaign.audio_file = "/nonexistent/path/audio.mp3"
        db.commit()

        response = client.get(f"/api/v1/campaigns/{draft_campaign.id}/audio")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Campaign create/update with audio_file
# ---------------------------------------------------------------------------


class TestCampaignCreateWithAudioFile:
    """Test that audio_file can be set during campaign creation."""

    def test_create_with_audio_file(self, client, org):
        response = client.post(
            "/api/v1/campaigns/",
            json={
                "name": "Audio Campaign",
                "type": "voice",
                "org_id": str(org.id),
                "audio_file": "/path/to/audio.mp3",
            },
        )
        assert response.status_code == 201
        assert response.json()["audio_file"] == "/path/to/audio.mp3"

    def test_create_without_audio_file(self, client, org):
        response = client.post(
            "/api/v1/campaigns/",
            json={
                "name": "Normal Campaign",
                "type": "voice",
                "org_id": str(org.id),
            },
        )
        assert response.status_code == 201
        assert response.json()["audio_file"] is None


class TestCampaignUpdateWithAudioFile:
    """Test that audio_file can be set during campaign update."""

    def test_update_audio_file(self, client, db, draft_campaign):
        response = client.put(
            f"/api/v1/campaigns/{draft_campaign.id}",
            json={"audio_file": "/new/audio.mp3"},
        )
        assert response.status_code == 200
        assert response.json()["audio_file"] == "/new/audio.mp3"


# ---------------------------------------------------------------------------
# Campaign response includes audio_file and bulk_file
# ---------------------------------------------------------------------------


class TestCampaignResponseFields:
    """Test that campaign responses include audio_file and bulk_file."""

    def test_get_campaign_includes_audio_and_bulk(self, client, db, draft_campaign):
        draft_campaign.audio_file = "/some/audio.mp3"
        draft_campaign.bulk_file = "contacts.csv"
        db.commit()

        response = client.get(f"/api/v1/campaigns/{draft_campaign.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["audio_file"] == "/some/audio.mp3"
        assert data["bulk_file"] == "contacts.csv"

    def test_list_campaigns_includes_audio_file(self, client, db, draft_campaign):
        draft_campaign.audio_file = "/audio.mp3"
        db.commit()

        response = client.get("/api/v1/campaigns/")
        assert response.status_code == 200
        items = response.json()["items"]
        assert any(c["audio_file"] == "/audio.mp3" for c in items)


# ---------------------------------------------------------------------------
# Bulk file on contact upload
# ---------------------------------------------------------------------------


class TestBulkFileOnContactUpload:
    """Test that bulk_file is set when contacts are uploaded."""

    def test_contact_upload_sets_bulk_file(self, client, db, draft_campaign):
        csv_data = b"phone,name\n+9779801111111,Test\n"
        response = client.post(
            f"/api/v1/campaigns/{draft_campaign.id}/contacts",
            files={"file": ("contacts.csv", io.BytesIO(csv_data), "text/csv")},
        )
        assert response.status_code == 201

        db.refresh(draft_campaign)
        assert draft_campaign.bulk_file == "contacts.csv"


# ---------------------------------------------------------------------------
# Batch executor with pre-recorded audio
# ---------------------------------------------------------------------------


class TestBatchExecutorWithAudioFile:
    """Test that the batch executor uses pre-recorded audio and skips TTS."""

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    def test_dispatch_with_audio_skips_tts(
        self,
        mock_get_provider,
        mock_settings,
        db,
        audio_campaign,
        contact,
    ):
        """When campaign has audio_file, TTS should not be called."""
        interaction = Interaction(
            campaign_id=audio_campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="pending",
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.initiate_call = AsyncMock(
            return_value=CallResult(call_id="CA-audio-001", status=CallStatus.INITIATED)
        )
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        # Patch tts_router to verify it's NOT called
        with patch("app.services.campaigns.tts_router") as mock_tts:
            execute_campaign_batch(audio_campaign.id, _make_db_factory(db))
            mock_tts.synthesize.assert_not_called()

        # Twilio call should still have been made
        mock_provider.initiate_call.assert_called_once()
        call_kwargs = mock_provider.initiate_call.call_args
        assert call_kwargs.kwargs["to"] == "+9779801234567"

        # Interaction should be in_progress with call SID
        db.refresh(interaction)
        assert interaction.status == "in_progress"
        assert interaction.metadata_["twilio_call_sid"] == "CA-audio-001"

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    def test_audio_stored_in_audio_store(
        self,
        mock_get_provider,
        mock_settings,
        db,
        audio_campaign,
        contact,
    ):
        """Pre-recorded audio should be stored in audio_store for Twilio to fetch."""
        interaction = Interaction(
            campaign_id=audio_campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="pending",
        )
        db.add(interaction)
        db.commit()

        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.initiate_call = AsyncMock(
            return_value=CallResult(call_id="CA-audio-002", status=CallStatus.INITIATED)
        )
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        with patch("app.services.campaigns.tts_router"):
            execute_campaign_batch(audio_campaign.id, _make_db_factory(db))

        # Audio should be in the store
        assert audio_store.size() >= 1

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    def test_no_template_required_with_audio(
        self,
        mock_get_provider,
        mock_settings,
        db,
        audio_campaign,
        contact,
    ):
        """Campaign with audio_file but no template should still execute."""
        assert audio_campaign.template_id is None

        interaction = Interaction(
            campaign_id=audio_campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="pending",
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.initiate_call = AsyncMock(
            return_value=CallResult(call_id="CA-audio-003", status=CallStatus.INITIATED)
        )
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        with patch("app.services.campaigns.tts_router"):
            execute_campaign_batch(audio_campaign.id, _make_db_factory(db))

        db.refresh(interaction)
        assert interaction.status == "in_progress"

    def test_missing_audio_file_on_disk_stops_batch(
        self,
        db,
        org,
    ):
        """If audio file doesn't exist on disk, batch should abort gracefully."""
        campaign = Campaign(
            name="Missing Audio",
            type="voice",
            org_id=org.id,
            status="active",
            audio_file="/nonexistent/audio.mp3",
        )
        db.add(campaign)
        db.flush()

        contact = Contact(phone="+9779800000000", org_id=org.id)
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
        db.refresh(interaction)

        execute_campaign_batch(campaign.id, _make_db_factory(db))

        # Interaction should still be pending — batch aborted before processing
        db.refresh(interaction)
        assert interaction.status == "pending"

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    def test_multiple_interactions_share_audio(
        self,
        mock_get_provider,
        mock_settings,
        db,
        audio_campaign,
        org,
    ):
        """Multiple interactions should each get their own audio store entry."""
        contacts = []
        for i in range(3):
            c = Contact(
                phone=f"+977980000000{i}",
                name=f"Contact{i}",
                org_id=org.id,
            )
            db.add(c)
            contacts.append(c)
        db.flush()

        for c in contacts:
            db.add(
                Interaction(
                    campaign_id=audio_campaign.id,
                    contact_id=c.id,
                    type="outbound_call",
                    status="pending",
                )
            )
        db.commit()

        call_counter = [0]

        def make_call_result(**kwargs):
            call_counter[0] += 1
            return CallResult(
                call_id=f"CA-multi-{call_counter[0]:03d}",
                status=CallStatus.INITIATED,
            )

        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.initiate_call = AsyncMock(side_effect=make_call_result)
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        with patch("app.services.campaigns.tts_router"):
            execute_campaign_batch(audio_campaign.id, _make_db_factory(db))

        # All 3 calls should have been made
        assert mock_provider.initiate_call.call_count == 3
        # Each call gets its own audio entry
        assert audio_store.size() >= 3


class TestBatchExecutorWithWavAudio:
    """Test that WAV audio files set correct content type."""

    @patch("app.services.campaigns.settings")
    @patch("app.services.campaigns.get_twilio_provider")
    def test_wav_audio_content_type(
        self,
        mock_get_provider,
        mock_settings,
        db,
        org,
        contact,
        tmp_path,
    ):
        """WAV files should be stored with audio/wav content type."""
        wav_file = tmp_path / "test.wav"
        wav_file.write_bytes(b"RIFF-wav-audio-data")

        campaign = Campaign(
            name="WAV Campaign",
            type="voice",
            org_id=org.id,
            status="active",
            audio_file=str(wav_file),
        )
        db.add(campaign)
        db.flush()

        interaction = Interaction(
            campaign_id=campaign.id,
            contact_id=contact.id,
            type="outbound_call",
            status="pending",
        )
        db.add(interaction)
        db.commit()

        mock_provider = MagicMock()
        mock_provider.default_from_number = "+15551234567"
        mock_provider.initiate_call = AsyncMock(
            return_value=CallResult(call_id="CA-wav-001", status=CallStatus.INITIATED)
        )
        mock_get_provider.return_value = mock_provider
        mock_settings.CAMPAIGN_BATCH_SIZE = 50
        mock_settings.CAMPAIGN_MAX_RETRIES = 3
        mock_settings.CAMPAIGN_RATE_LIMIT_PER_SECOND = 0
        mock_settings.TWILIO_BASE_URL = "https://test.ngrok.io"

        with patch("app.services.campaigns.tts_router"):
            execute_campaign_batch(campaign.id, _make_db_factory(db))

        # Find the stored audio entry and check content type
        for entry in audio_store._store.values():
            assert entry.content_type == "audio/wav"
