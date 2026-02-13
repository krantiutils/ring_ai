"""Tests for the interactive agent service — Gemini 2.5 Flash Native Audio integration."""

import json
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.interactive_agent.exceptions import (
    GeminiClientError,
    GeminiConfigurationError,
    SessionError,
    SessionPoolExhaustedError,
    SessionTimeoutError,
)
from app.services.interactive_agent.hybrid import HybridSession
from app.services.interactive_agent.models import (
    CHANNELS,
    INPUT_MIME_TYPE,
    INPUT_SAMPLE_RATE,
    OUTPUT_SAMPLE_RATE,
    SAMPLE_WIDTH_BYTES,
    AgentResponse,
    AudioChunk,
    AudioEncoding,
    OutputMode,
    SessionConfig,
    SessionInfo,
    SessionState,
)
from app.services.interactive_agent.voices import (
    GEMINI_VOICES,
    NEPALI_CANDIDATE_VOICES,
    get_best_nepali_voice,
    get_voice,
    list_voices,
    load_quality_results,
)

# ---------------------------------------------------------------------------
# Models unit tests
# ---------------------------------------------------------------------------


class TestModels:
    def test_session_config_defaults(self):
        config = SessionConfig()
        assert config.model_id == "gemini-2.5-flash-native-audio-preview-12-2025"
        assert config.voice_name == "Kore"
        assert config.timeout_minutes == 10
        assert config.temperature == 0.7
        assert config.enable_input_transcription is True
        assert config.enable_output_transcription is True
        assert config.session_id  # auto-generated UUID hex

    def test_session_config_custom(self):
        config = SessionConfig(
            session_id="custom-id",
            voice_name="Puck",
            system_instruction="Test instruction",
            timeout_minutes=5,
            temperature=0.3,
        )
        assert config.session_id == "custom-id"
        assert config.voice_name == "Puck"
        assert config.system_instruction == "Test instruction"
        assert config.timeout_minutes == 5
        assert config.temperature == 0.3

    def test_audio_chunk_defaults(self):
        chunk = AudioChunk(data=b"\x00" * 1024)
        assert chunk.mime_type == INPUT_MIME_TYPE
        assert chunk.sample_rate == INPUT_SAMPLE_RATE
        assert chunk.timestamp_ms is None

    def test_agent_response_defaults(self):
        response = AgentResponse()
        assert response.audio_data is None
        assert response.text is None
        assert response.input_transcript is None
        assert response.output_transcript is None
        assert response.is_turn_complete is False
        assert response.is_interrupted is False

    def test_session_info_state(self):
        info = SessionInfo(
            session_id="test-123",
            state=SessionState.ACTIVE,
            voice_name="Kore",
        )
        assert info.state == SessionState.ACTIVE
        assert info.audio_chunks_sent == 0
        assert info.total_output_bytes == 0

    def test_audio_constants(self):
        assert INPUT_SAMPLE_RATE == 16000
        assert OUTPUT_SAMPLE_RATE == 24000
        assert SAMPLE_WIDTH_BYTES == 2
        assert CHANNELS == 1
        assert INPUT_MIME_TYPE == "audio/pcm"

    def test_audio_encoding_values(self):
        assert AudioEncoding.PCM_16KHZ == "pcm_16khz"
        assert AudioEncoding.PCM_24KHZ == "pcm_24khz"

    def test_session_state_values(self):
        assert SessionState.CONNECTING == "connecting"
        assert SessionState.ACTIVE == "active"
        assert SessionState.EXTENDING == "extending"
        assert SessionState.CLOSING == "closing"
        assert SessionState.CLOSED == "closed"
        assert SessionState.ERROR == "error"


# ---------------------------------------------------------------------------
# Voices unit tests
# ---------------------------------------------------------------------------


class TestVoices:
    def test_voice_catalog_has_30_voices(self):
        assert len(GEMINI_VOICES) == 30

    def test_all_voices_have_characteristics(self):
        for name, voice in GEMINI_VOICES.items():
            assert voice.name == name
            assert voice.characteristic, f"Voice {name} missing characteristic"

    def test_get_voice_valid(self):
        voice = get_voice("Kore")
        assert voice.name == "Kore"
        assert voice.characteristic == "Firm"

    def test_get_voice_invalid(self):
        with pytest.raises(ValueError, match="Unknown Gemini voice"):
            get_voice("NonexistentVoice")

    def test_list_voices_sorted(self):
        voices = list_voices()
        assert len(voices) == 30
        names = [v.name for v in voices]
        assert names == sorted(names)

    def test_nepali_candidates_exist_in_catalog(self):
        for name in NEPALI_CANDIDATE_VOICES:
            assert name in GEMINI_VOICES, f"Nepali candidate '{name}' not in voice catalog"

    def test_nepali_candidates_not_empty(self):
        assert len(NEPALI_CANDIDATE_VOICES) >= 5

    def test_default_voice_in_catalog(self):
        assert "Kore" in GEMINI_VOICES

    def test_voice_nepali_quality_default(self):
        voice = get_voice("Kore")
        assert voice.nepali_quality == "untested"


# ---------------------------------------------------------------------------
# Exceptions unit tests
# ---------------------------------------------------------------------------


class TestExceptions:
    def test_gemini_client_error_message(self):
        err = GeminiClientError("connection refused")
        assert "[gemini]" in str(err)
        assert "connection refused" in str(err)

    def test_gemini_configuration_error(self):
        err = GeminiConfigurationError("missing API key")
        assert "missing API key" in str(err)

    def test_session_error_includes_id(self):
        err = SessionError("sess-123", "something broke")
        assert err.session_id == "sess-123"
        assert "sess-123" in str(err)
        assert "something broke" in str(err)

    def test_session_timeout_error_inherits(self):
        err = SessionTimeoutError("sess-456", "timed out")
        assert isinstance(err, SessionError)
        assert err.session_id == "sess-456"

    def test_session_pool_exhausted_error(self):
        err = SessionPoolExhaustedError(1000)
        assert err.max_sessions == 1000
        assert "1000" in str(err)
        assert "exhausted" in str(err)


# ---------------------------------------------------------------------------
# Client unit tests
# ---------------------------------------------------------------------------


class TestGeminiLiveClient:
    def test_requires_api_key(self):
        from app.services.interactive_agent.client import GeminiLiveClient

        with pytest.raises(GeminiConfigurationError, match="GEMINI_API_KEY"):
            GeminiLiveClient(api_key="", config=SessionConfig())

    def test_invalid_voice_raises(self):
        from app.services.interactive_agent.client import _build_live_config

        config = SessionConfig(voice_name="FakeVoice")
        with pytest.raises(GeminiConfigurationError, match="Unknown Gemini voice"):
            _build_live_config(config)

    def test_build_live_config_valid(self):
        from app.services.interactive_agent.client import _build_live_config

        config = SessionConfig(
            voice_name="Kore",
            system_instruction="Test instruction",
            temperature=0.5,
        )
        live_config = _build_live_config(config)
        assert live_config.response_modalities == ["AUDIO"]
        assert live_config.temperature == 0.5
        assert live_config.speech_config is not None
        assert live_config.system_instruction is not None
        assert live_config.input_audio_transcription is not None
        assert live_config.output_audio_transcription is not None

    def test_build_live_config_no_system_instruction(self):
        from app.services.interactive_agent.client import _build_live_config

        config = SessionConfig(system_instruction="")
        live_config = _build_live_config(config)
        assert live_config.system_instruction is None

    def test_build_live_config_no_transcription(self):
        from app.services.interactive_agent.client import _build_live_config

        config = SessionConfig(
            enable_input_transcription=False,
            enable_output_transcription=False,
        )
        live_config = _build_live_config(config)
        assert live_config.input_audio_transcription is None
        assert live_config.output_audio_transcription is None

    @patch("app.services.interactive_agent.client.genai.Client")
    def test_client_initializes(self, mock_genai_client_cls):
        from app.services.interactive_agent.client import GeminiLiveClient

        client = GeminiLiveClient(api_key="test-key", config=SessionConfig())
        assert client.session_id
        assert client.connected is False
        assert client.resumption_handle is None
        mock_genai_client_cls.assert_called_once_with(
            api_key="test-key",
            http_options={"api_version": "v1alpha"},
        )

    @pytest.mark.asyncio
    @patch("app.services.interactive_agent.client.genai.Client")
    async def test_send_audio_before_connect_raises(self, mock_genai_client_cls):
        from app.services.interactive_agent.client import GeminiLiveClient

        client = GeminiLiveClient(api_key="test-key", config=SessionConfig())
        with pytest.raises(GeminiClientError, match="not connected"):
            await client.send_audio(AudioChunk(data=b"\x00" * 100))

    @pytest.mark.asyncio
    @patch("app.services.interactive_agent.client.genai.Client")
    async def test_send_text_before_connect_raises(self, mock_genai_client_cls):
        from app.services.interactive_agent.client import GeminiLiveClient

        client = GeminiLiveClient(api_key="test-key", config=SessionConfig())
        with pytest.raises(GeminiClientError, match="not connected"):
            await client.send_text("hello")


# ---------------------------------------------------------------------------
# Session lifecycle unit tests
# ---------------------------------------------------------------------------


class TestAgentSession:
    @pytest.mark.asyncio
    async def test_start_connects_and_sets_active(self):
        from app.services.interactive_agent.session import AgentSession

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            session = AgentSession(api_key="test-key", config=SessionConfig())
            await session.start()

            assert session.state == SessionState.ACTIVE
            mock_instance.connect.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_start_already_active_raises(self):
        from app.services.interactive_agent.session import AgentSession

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            session = AgentSession(api_key="test-key", config=SessionConfig())
            await session.start()

            with pytest.raises(SessionError, match="already active"):
                await session.start()

    @pytest.mark.asyncio
    async def test_start_failure_sets_error_state(self):
        from app.services.interactive_agent.session import AgentSession

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock(side_effect=Exception("connection refused"))
            MockClient.return_value = mock_instance

            session = AgentSession(api_key="test-key", config=SessionConfig())
            with pytest.raises(SessionError, match="Failed to start"):
                await session.start()

            assert session.state == SessionState.ERROR

    @pytest.mark.asyncio
    async def test_teardown_closes_session(self):
        from app.services.interactive_agent.session import AgentSession

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.close = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            session = AgentSession(api_key="test-key", config=SessionConfig())
            await session.start()
            await session.teardown()

            assert session.state == SessionState.CLOSED
            mock_instance.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_teardown_idempotent(self):
        from app.services.interactive_agent.session import AgentSession

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.close = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            session = AgentSession(api_key="test-key", config=SessionConfig())
            await session.start()
            await session.teardown()
            await session.teardown()  # second call should be no-op

            assert session.state == SessionState.CLOSED
            # close called only once
            mock_instance.close.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_send_audio_updates_metrics(self):
        from app.services.interactive_agent.session import AgentSession

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.send_audio = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            session = AgentSession(api_key="test-key", config=SessionConfig())
            await session.start()

            chunk = AudioChunk(data=b"\x00" * 512)
            await session.send_audio(chunk)

            info = session.info
            assert info.audio_chunks_sent == 1
            assert info.total_input_bytes == 512

    @pytest.mark.asyncio
    async def test_send_when_closed_raises(self):
        from app.services.interactive_agent.session import AgentSession

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            session = AgentSession(api_key="test-key", config=SessionConfig())
            with pytest.raises(SessionError, match="not active"):
                await session.send_audio(AudioChunk(data=b"\x00"))

    @pytest.mark.asyncio
    async def test_extend_without_handle_raises(self):
        from app.services.interactive_agent.session import AgentSession

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.resumption_handle = None  # No handle available
            MockClient.return_value = mock_instance

            session = AgentSession(api_key="test-key", config=SessionConfig())
            await session.start()

            with pytest.raises(SessionError, match="no session resumption handle"):
                await session.extend()

    @pytest.mark.asyncio
    async def test_session_info_snapshot(self):
        from app.services.interactive_agent.session import AgentSession

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.resumption_handle = "test-handle"
            MockClient.return_value = mock_instance

            config = SessionConfig(session_id="test-snap", voice_name="Puck")
            session = AgentSession(api_key="test-key", config=config)
            await session.start()

            info = session.info
            assert info.session_id == "test-snap"
            assert info.state == SessionState.ACTIVE
            assert info.voice_name == "Puck"
            assert info.resumption_handle == "test-handle"
            assert info.created_at is not None
            assert info.last_activity_at is not None


# ---------------------------------------------------------------------------
# Session pool unit tests
# ---------------------------------------------------------------------------


class TestSessionPool:
    @pytest.mark.asyncio
    async def test_pool_acquire_and_release(self):
        from app.services.interactive_agent.pool import SessionPool

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.close = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            pool = SessionPool(api_key="test-key", max_sessions=5)
            assert pool.active_count == 0
            assert pool.available_slots == 5

            session = await pool.acquire(SessionConfig(session_id="pool-1"))
            assert pool.active_count == 1
            assert pool.available_slots == 4

            await pool.release(session.session_id)
            assert pool.active_count == 0
            assert pool.available_slots == 5

    @pytest.mark.asyncio
    async def test_pool_release_nonexistent_is_safe(self):
        from app.services.interactive_agent.pool import SessionPool

        pool = SessionPool(api_key="test-key", max_sessions=5)
        await pool.release("nonexistent-id")  # should not raise

    @pytest.mark.asyncio
    async def test_pool_list_sessions(self):
        from app.services.interactive_agent.pool import SessionPool

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.close = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            pool = SessionPool(api_key="test-key", max_sessions=5)
            await pool.acquire(SessionConfig(session_id="list-1"))
            await pool.acquire(SessionConfig(session_id="list-2"))

            sessions = pool.list_sessions()
            assert len(sessions) == 2
            ids = {s.session_id for s in sessions}
            assert "list-1" in ids
            assert "list-2" in ids

    @pytest.mark.asyncio
    async def test_pool_get_session(self):
        from app.services.interactive_agent.pool import SessionPool

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.close = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            pool = SessionPool(api_key="test-key", max_sessions=5)
            await pool.acquire(SessionConfig(session_id="get-1"))

            session = await pool.get_session("get-1")
            assert session is not None
            assert session.session_id == "get-1"

            assert await pool.get_session("nonexistent") is None

    @pytest.mark.asyncio
    async def test_pool_teardown_all(self):
        from app.services.interactive_agent.pool import SessionPool

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.close = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            pool = SessionPool(api_key="test-key", max_sessions=5)
            await pool.acquire(SessionConfig(session_id="td-1"))
            await pool.acquire(SessionConfig(session_id="td-2"))
            assert pool.active_count == 2

            await pool.teardown_all()
            assert pool.active_count == 0

    @pytest.mark.asyncio
    async def test_pool_exhaustion_raises(self):
        from app.services.interactive_agent.pool import SessionPool

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.close = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            pool = SessionPool(api_key="test-key", max_sessions=1)
            await pool.acquire(SessionConfig(session_id="exhaust-1"))

            with pytest.raises(SessionPoolExhaustedError, match="exhausted"):
                await pool.acquire(
                    SessionConfig(session_id="exhaust-2"),
                    timeout=0.1,
                )

    @pytest.mark.asyncio
    async def test_pool_applies_default_system_instruction(self):
        from app.services.interactive_agent.pool import SessionPool

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.close = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            pool = SessionPool(
                api_key="test-key",
                max_sessions=5,
                default_system_instruction="Speak Nepali",
            )

            # Acquire with no config — should get pool default
            session = await pool.acquire()
            # The session config should have the default system instruction
            assert session._config.system_instruction == "Speak Nepali"

    @pytest.mark.asyncio
    async def test_pool_releases_semaphore_on_start_failure(self):
        from app.services.interactive_agent.pool import SessionPool

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock(side_effect=Exception("boom"))
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            pool = SessionPool(api_key="test-key", max_sessions=1)

            with pytest.raises(SessionError):
                await pool.acquire(SessionConfig(session_id="fail-1"))

            # Semaphore should be released — another acquire should work
            # (but will also fail since mock still throws)
            assert pool.active_count == 0
            assert pool.available_slots == 1


# ---------------------------------------------------------------------------
# OutputMode unit tests
# ---------------------------------------------------------------------------


class TestOutputMode:
    def test_output_mode_values(self):
        assert OutputMode.NATIVE_AUDIO == "native_audio"
        assert OutputMode.HYBRID == "hybrid"

    def test_session_config_default_output_mode(self):
        config = SessionConfig()
        assert config.output_mode == OutputMode.NATIVE_AUDIO

    def test_session_config_hybrid_mode(self):
        config = SessionConfig(output_mode=OutputMode.HYBRID)
        assert config.output_mode == OutputMode.HYBRID
        assert config.hybrid_tts_provider == "edge_tts"
        assert config.hybrid_tts_voice == "ne-NP-HemkalaNeural"

    def test_session_config_hybrid_custom_tts(self):
        config = SessionConfig(
            output_mode=OutputMode.HYBRID,
            hybrid_tts_provider="azure",
            hybrid_tts_voice="ne-NP-SagarNeural",
        )
        assert config.hybrid_tts_provider == "azure"
        assert config.hybrid_tts_voice == "ne-NP-SagarNeural"


# ---------------------------------------------------------------------------
# Client hybrid mode unit tests
# ---------------------------------------------------------------------------


class TestClientHybridMode:
    def test_build_live_config_native_audio(self):
        from app.services.interactive_agent.client import _build_live_config

        config = SessionConfig(voice_name="Kore", output_mode=OutputMode.NATIVE_AUDIO)
        live_config = _build_live_config(config)
        assert live_config.response_modalities == ["AUDIO"]
        assert live_config.speech_config is not None

    def test_build_live_config_hybrid_text(self):
        from app.services.interactive_agent.client import _build_live_config

        config = SessionConfig(output_mode=OutputMode.HYBRID)
        live_config = _build_live_config(config)
        assert live_config.response_modalities == ["TEXT"]
        # Hybrid mode should not set speech_config (no native audio)
        assert live_config.speech_config is None

    def test_build_live_config_hybrid_with_system_instruction(self):
        from app.services.interactive_agent.client import _build_live_config

        config = SessionConfig(
            output_mode=OutputMode.HYBRID,
            system_instruction="Speak Nepali",
        )
        live_config = _build_live_config(config)
        assert live_config.response_modalities == ["TEXT"]
        assert live_config.system_instruction is not None


# ---------------------------------------------------------------------------
# HybridSession unit tests
# ---------------------------------------------------------------------------


class TestHybridSession:
    def test_requires_hybrid_mode(self):
        tts_router = MagicMock()
        config = SessionConfig(output_mode=OutputMode.NATIVE_AUDIO)
        with pytest.raises(ValueError, match="HYBRID"):
            HybridSession(api_key="test-key", config=config, tts_router=tts_router)

    @pytest.mark.asyncio
    async def test_start_delegates_to_inner(self):
        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            tts_router = MagicMock()
            config = SessionConfig(output_mode=OutputMode.HYBRID)
            hybrid = HybridSession(api_key="test-key", config=config, tts_router=tts_router)
            await hybrid.start()

            assert hybrid.state == SessionState.ACTIVE
            mock_instance.connect.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_teardown_delegates_to_inner(self):
        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.close = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            tts_router = MagicMock()
            config = SessionConfig(output_mode=OutputMode.HYBRID)
            hybrid = HybridSession(api_key="test-key", config=config, tts_router=tts_router)
            await hybrid.start()
            await hybrid.teardown()

            assert hybrid.state == SessionState.CLOSED

    @pytest.mark.asyncio
    async def test_send_audio_delegates_to_inner(self):
        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.send_audio = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            tts_router = MagicMock()
            config = SessionConfig(output_mode=OutputMode.HYBRID)
            hybrid = HybridSession(api_key="test-key", config=config, tts_router=tts_router)
            await hybrid.start()

            chunk = AudioChunk(data=b"\x00" * 512)
            await hybrid.send_audio(chunk)
            mock_instance.send_audio.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_receive_synthesizes_text_to_audio(self):
        """When Gemini returns text, HybridSession should TTS-synthesize it."""
        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.resumption_handle = None

            # Mock receive to yield a text response
            async def _fake_receive():
                yield AgentResponse(text="नमस्ते", is_turn_complete=True)

            mock_instance.receive = _fake_receive
            MockClient.return_value = mock_instance

            # Mock TTS router
            from app.tts.models import AudioFormat, TTSProvider, TTSResult

            tts_router = AsyncMock()
            tts_router.synthesize = AsyncMock(
                return_value=TTSResult(
                    audio_bytes=b"\xff\xfb\x90" * 100,
                    duration_ms=500,
                    provider_used=TTSProvider.EDGE_TTS,
                    chars_consumed=6,
                    output_format=AudioFormat.MP3,
                )
            )

            config = SessionConfig(output_mode=OutputMode.HYBRID)
            hybrid = HybridSession(api_key="test-key", config=config, tts_router=tts_router)
            await hybrid.start()

            responses = []
            async for resp in hybrid.receive():
                responses.append(resp)

            assert len(responses) == 1
            assert responses[0].audio_data is not None
            assert responses[0].text == "नमस्ते"
            assert responses[0].is_turn_complete is True
            tts_router.synthesize.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_receive_passes_through_non_text(self):
        """Transcript-only responses should pass through without TTS."""
        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.resumption_handle = None

            async def _fake_receive():
                yield AgentResponse(input_transcript="user said hello")

            mock_instance.receive = _fake_receive
            MockClient.return_value = mock_instance

            tts_router = AsyncMock()
            config = SessionConfig(output_mode=OutputMode.HYBRID)
            hybrid = HybridSession(api_key="test-key", config=config, tts_router=tts_router)
            await hybrid.start()

            responses = []
            async for resp in hybrid.receive():
                responses.append(resp)

            assert len(responses) == 1
            assert responses[0].input_transcript == "user said hello"
            assert responses[0].audio_data is None
            tts_router.synthesize.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_receive_handles_tts_failure(self):
        """If TTS fails, the text response should still be yielded without audio."""
        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.resumption_handle = None

            async def _fake_receive():
                yield AgentResponse(text="नमस्ते", is_turn_complete=True)

            mock_instance.receive = _fake_receive
            MockClient.return_value = mock_instance

            tts_router = AsyncMock()
            tts_router.synthesize = AsyncMock(side_effect=Exception("TTS down"))

            config = SessionConfig(output_mode=OutputMode.HYBRID)
            hybrid = HybridSession(api_key="test-key", config=config, tts_router=tts_router)
            await hybrid.start()

            responses = []
            async for resp in hybrid.receive():
                responses.append(resp)

            assert len(responses) == 1
            assert responses[0].text == "नमस्ते"
            assert responses[0].audio_data is None  # TTS failed, no audio
            assert responses[0].is_turn_complete is True

    def test_session_id_from_inner(self):
        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            tts_router = MagicMock()
            config = SessionConfig(session_id="hybrid-test", output_mode=OutputMode.HYBRID)
            hybrid = HybridSession(api_key="test-key", config=config, tts_router=tts_router)
            assert hybrid.session_id == "hybrid-test"


# ---------------------------------------------------------------------------
# Voice quality helpers unit tests
# ---------------------------------------------------------------------------


class TestVoiceQualityHelpers:
    def test_get_best_nepali_voice_untested_returns_kore(self):
        """When no voices are tested, should return Kore as default."""
        voice = get_best_nepali_voice()
        assert voice.name == "Kore"

    def test_nepali_score_field(self):
        voice = get_voice("Kore")
        assert voice.nepali_score is None

    def test_load_quality_results(self):
        """load_quality_results should update the voice catalog from JSON."""
        results_data = {
            "results": [
                {"voice_name": "Kore", "quality": "good", "avg_score": 0.75},
                {"voice_name": "Charon", "quality": "excellent", "avg_score": 0.90},
                {"voice_name": "Fenrir", "quality": "poor", "avg_score": 0.30},
            ]
        }

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(results_data, f)
            tmp_path = Path(f.name)

        try:
            updated = load_quality_results(tmp_path)
            assert updated == 3

            kore = get_voice("Kore")
            assert kore.nepali_quality == "good"
            assert kore.nepali_score == 0.75

            charon = get_voice("Charon")
            assert charon.nepali_quality == "excellent"
            assert charon.nepali_score == 0.90

            # get_best_nepali_voice should now return Charon (highest good+ score)
            best = get_best_nepali_voice()
            assert best.name == "Charon"
        finally:
            tmp_path.unlink()
            # Reset voices to untested state
            for name in ("Kore", "Charon", "Fenrir"):
                v = GEMINI_VOICES[name]
                GEMINI_VOICES[name] = v.model_copy(
                    update={"nepali_quality": "untested", "nepali_score": None}
                )

    def test_load_quality_results_ignores_unknown_voices(self):
        results_data = {
            "results": [
                {"voice_name": "NonexistentVoice", "quality": "good", "avg_score": 0.80},
            ]
        }

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(results_data, f)
            tmp_path = Path(f.name)

        try:
            updated = load_quality_results(tmp_path)
            assert updated == 0
        finally:
            tmp_path.unlink()

    def test_load_quality_results_skips_invalid_quality(self):
        results_data = {
            "results": [
                {"voice_name": "Kore", "quality": "invalid_quality", "avg_score": 0.50},
            ]
        }

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(results_data, f)
            tmp_path = Path(f.name)

        try:
            updated = load_quality_results(tmp_path)
            assert updated == 0
            # Kore should remain untested
            assert get_voice("Kore").nepali_quality == "untested"
        finally:
            tmp_path.unlink()


# ---------------------------------------------------------------------------
# Voice quality test script helpers
# ---------------------------------------------------------------------------


class TestVoiceQualityScoring:
    """Tests for the scoring functions in the voice quality test script."""

    def test_score_transcription_exact_match(self):
        from scripts.nepali_voice_quality_test import _score_transcription

        score = _score_transcription("नमस्ते", "नमस्ते")
        assert score == 1.0

    def test_score_transcription_none_actual(self):
        from scripts.nepali_voice_quality_test import _score_transcription

        score = _score_transcription("नमस्ते", None)
        assert score == 0.0

    def test_score_transcription_partial_match(self):
        from scripts.nepali_voice_quality_test import _score_transcription

        score = _score_transcription("नमस्ते तपाईं", "नमस्ते")
        assert 0.0 < score < 1.0

    def test_score_transcription_ignores_punctuation(self):
        from scripts.nepali_voice_quality_test import _score_transcription

        score = _score_transcription("नमस्ते, तपाईं!", "नमस्ते तपाईं")
        assert score == 1.0

    def test_quality_from_score_excellent(self):
        from scripts.nepali_voice_quality_test import _quality_from_score

        assert _quality_from_score(0.90) == "excellent"
        assert _quality_from_score(0.85) == "excellent"

    def test_quality_from_score_good(self):
        from scripts.nepali_voice_quality_test import _quality_from_score

        assert _quality_from_score(0.75) == "good"
        assert _quality_from_score(0.70) == "good"

    def test_quality_from_score_fair(self):
        from scripts.nepali_voice_quality_test import _quality_from_score

        assert _quality_from_score(0.60) == "fair"
        assert _quality_from_score(0.50) == "fair"

    def test_quality_from_score_poor(self):
        from scripts.nepali_voice_quality_test import _quality_from_score

        assert _quality_from_score(0.40) == "poor"
        assert _quality_from_score(0.0) == "poor"

    def test_nepali_test_phrases_exist(self):
        from scripts.nepali_voice_quality_test import NEPALI_TEST_PHRASES

        assert len(NEPALI_TEST_PHRASES) >= 10
        for phrase in NEPALI_TEST_PHRASES:
            assert "id" in phrase
            assert "text" in phrase
            assert "category" in phrase
            assert len(phrase["text"]) > 0
