"""Tests for the TTS provider router, providers, and API endpoints."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.tts.base import BaseTTSProvider
from app.tts.exceptions import (
    TTSConfigurationError,
    TTSProviderError,
    TTSProviderUnavailableError,
)
from app.tts.models import (
    AudioFormat,
    TTSConfig,
    TTSProvider,
    TTSResult,
    VoiceInfo,
)
from app.tts.providers.edge import EdgeTTSProvider, _estimate_duration_from_mp3
from app.tts.router import TTSRouter


@pytest.fixture
def client():
    return TestClient(app)


# ---------------------------------------------------------------------------
# TTSRouter unit tests
# ---------------------------------------------------------------------------


class TestTTSRouter:
    def test_register_and_list_providers(self):
        router = TTSRouter()
        assert router.available_providers == []

        mock_provider = MagicMock(spec=BaseTTSProvider)
        mock_provider.name = "test_provider"
        router.register(mock_provider)

        assert router.available_providers == ["test_provider"]

    def test_get_provider_not_registered(self):
        router = TTSRouter()
        with pytest.raises(TTSProviderUnavailableError, match="edge_tts"):
            router.get_provider(TTSProvider.EDGE_TTS)

    def test_get_provider_registered(self):
        router = TTSRouter()
        edge = EdgeTTSProvider()
        router.register(edge)
        assert router.get_provider(TTSProvider.EDGE_TTS) is edge

    @pytest.mark.asyncio
    async def test_synthesize_delegates_to_provider(self):
        router = TTSRouter()
        mock_provider = AsyncMock(spec=BaseTTSProvider)
        mock_provider.name = "edge_tts"

        expected_result = TTSResult(
            audio_bytes=b"fake-audio",
            duration_ms=1000,
            provider_used=TTSProvider.EDGE_TTS,
            chars_consumed=5,
            output_format=AudioFormat.MP3,
        )
        mock_provider.synthesize.return_value = expected_result
        router.register(mock_provider)

        config = TTSConfig(
            provider=TTSProvider.EDGE_TTS,
            voice="ne-NP-SagarNeural",
        )
        result = await router.synthesize("hello", config)
        assert result is expected_result
        mock_provider.synthesize.assert_awaited_once_with("hello", config)

    @pytest.mark.asyncio
    async def test_synthesize_fallback_on_primary_failure(self):
        router = TTSRouter()

        primary = AsyncMock(spec=BaseTTSProvider)
        primary.name = "edge_tts"
        primary.synthesize.side_effect = TTSProviderError("edge_tts", "network error")

        fallback = AsyncMock(spec=BaseTTSProvider)
        fallback.name = "azure"
        fallback_result = TTSResult(
            audio_bytes=b"fallback-audio",
            duration_ms=500,
            provider_used=TTSProvider.AZURE,
            chars_consumed=5,
            output_format=AudioFormat.MP3,
        )
        fallback.synthesize.return_value = fallback_result

        router.register(primary)
        router.register(fallback)

        config = TTSConfig(
            provider=TTSProvider.EDGE_TTS,
            voice="ne-NP-SagarNeural",
            fallback_provider=TTSProvider.AZURE,
        )
        result = await router.synthesize("hello", config)

        assert result is fallback_result
        primary.synthesize.assert_awaited_once()
        fallback.synthesize.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_synthesize_no_fallback_raises(self):
        router = TTSRouter()

        primary = AsyncMock(spec=BaseTTSProvider)
        primary.name = "edge_tts"
        primary.synthesize.side_effect = TTSProviderError("edge_tts", "network error")
        router.register(primary)

        config = TTSConfig(
            provider=TTSProvider.EDGE_TTS,
            voice="ne-NP-SagarNeural",
        )
        with pytest.raises(TTSProviderError, match="network error"):
            await router.synthesize("hello", config)

    @pytest.mark.asyncio
    async def test_synthesize_fallback_also_fails(self):
        router = TTSRouter()

        primary = AsyncMock(spec=BaseTTSProvider)
        primary.name = "edge_tts"
        primary.synthesize.side_effect = TTSProviderError("edge_tts", "primary down")

        fallback = AsyncMock(spec=BaseTTSProvider)
        fallback.name = "azure"
        fallback.synthesize.side_effect = TTSProviderError("azure", "fallback also down")

        router.register(primary)
        router.register(fallback)

        config = TTSConfig(
            provider=TTSProvider.EDGE_TTS,
            voice="ne-NP-SagarNeural",
            fallback_provider=TTSProvider.AZURE,
        )
        with pytest.raises(TTSProviderError, match="fallback also down"):
            await router.synthesize("hello", config)

    @pytest.mark.asyncio
    async def test_list_voices_delegates(self):
        router = TTSRouter()
        mock_provider = AsyncMock(spec=BaseTTSProvider)
        mock_provider.name = "edge_tts"

        voices = [
            VoiceInfo(
                voice_id="ne-NP-SagarNeural",
                name="Sagar",
                gender="Male",
                locale="ne-NP",
                provider=TTSProvider.EDGE_TTS,
            )
        ]
        mock_provider.list_voices.return_value = voices
        router.register(mock_provider)

        result = await router.list_voices(TTSProvider.EDGE_TTS, locale="ne-NP")
        assert result == voices
        mock_provider.list_voices.assert_awaited_once_with(locale="ne-NP")


# ---------------------------------------------------------------------------
# EdgeTTSProvider unit tests (mocked)
# ---------------------------------------------------------------------------


class TestEdgeTTSProvider:
    def test_name(self):
        provider = EdgeTTSProvider()
        assert provider.name == "edge_tts"

    @pytest.mark.asyncio
    async def test_synthesize_success(self):
        fake_audio = b"\xff\xfb\x90\x00" + b"\x00" * 100  # fake MP3-like bytes

        async def mock_stream():
            yield {"type": "audio", "data": fake_audio}

        with patch("app.tts.providers.edge.edge_tts.Communicate") as MockComm:
            instance = MockComm.return_value
            instance.stream = mock_stream

            provider = EdgeTTSProvider()
            config = TTSConfig(
                provider=TTSProvider.EDGE_TTS,
                voice="ne-NP-SagarNeural",
            )
            result = await provider.synthesize("hello", config)

            assert result.audio_bytes == fake_audio
            assert result.provider_used == TTSProvider.EDGE_TTS
            assert result.chars_consumed == 5
            assert result.output_format == AudioFormat.MP3

            MockComm.assert_called_once_with(
                text="hello",
                voice="ne-NP-SagarNeural",
                rate="+0%",
                volume="+0%",
                pitch="+0Hz",
            )

    @pytest.mark.asyncio
    async def test_synthesize_empty_audio_raises(self):
        async def mock_stream():
            yield {
                "type": "WordBoundary",
                "text": "hello",
                "offset": 0.0,
                "duration": 0.5,
            }

        with patch("app.tts.providers.edge.edge_tts.Communicate") as MockComm:
            instance = MockComm.return_value
            instance.stream = mock_stream

            provider = EdgeTTSProvider()
            config = TTSConfig(
                provider=TTSProvider.EDGE_TTS,
                voice="ne-NP-SagarNeural",
            )
            with pytest.raises(TTSProviderError, match="empty audio"):
                await provider.synthesize("hello", config)

    @pytest.mark.asyncio
    async def test_synthesize_non_mp3_raises(self):
        async def mock_stream():
            yield {"type": "audio", "data": b"\xff\xfb\x90\x00"}

        with patch("app.tts.providers.edge.edge_tts.Communicate") as MockComm:
            instance = MockComm.return_value
            instance.stream = mock_stream

            provider = EdgeTTSProvider()
            config = TTSConfig(
                provider=TTSProvider.EDGE_TTS,
                voice="ne-NP-SagarNeural",
                output_format=AudioFormat.WAV,
            )
            with pytest.raises(TTSProviderError, match="only supports MP3"):
                await provider.synthesize("hello", config)

    @pytest.mark.asyncio
    async def test_synthesize_stream_exception(self):
        async def mock_stream():
            raise ConnectionError("network failed")
            yield  # noqa: F811 — unreachable yield makes this an async generator

        with patch("app.tts.providers.edge.edge_tts.Communicate") as MockComm:
            instance = MockComm.return_value
            instance.stream = mock_stream

            provider = EdgeTTSProvider()
            config = TTSConfig(
                provider=TTSProvider.EDGE_TTS,
                voice="ne-NP-SagarNeural",
            )
            with pytest.raises(TTSProviderError, match="Synthesis failed"):
                await provider.synthesize("hello", config)

    @pytest.mark.asyncio
    async def test_list_voices_success(self):
        fake_voices = [
            {
                "Name": "Microsoft Server Speech Text to Speech Voice (ne-NP, SagarNeural)",
                "ShortName": "ne-NP-SagarNeural",
                "Gender": "Male",
                "Locale": "ne-NP",
                "SuggestedCodec": "audio-24khz-48kbitrate-mono-mp3",
                "FriendlyName": "Microsoft Sagar Online (Natural) - Nepali (Nepal)",
                "Status": "GA",
                "VoiceTag": {"ContentCategories": [], "VoicePersonalities": []},
            },
            {
                "Name": "Microsoft Server Speech Text to Speech Voice (en-US, EmmaNeural)",
                "ShortName": "en-US-EmmaNeural",
                "Gender": "Female",
                "Locale": "en-US",
                "SuggestedCodec": "audio-24khz-48kbitrate-mono-mp3",
                "FriendlyName": "Microsoft Emma Online (Natural) - English (US)",
                "Status": "GA",
                "VoiceTag": {"ContentCategories": [], "VoicePersonalities": []},
            },
        ]

        with patch("app.tts.providers.edge.edge_tts.list_voices", new_callable=AsyncMock) as mock_lv:
            mock_lv.return_value = fake_voices

            provider = EdgeTTSProvider()
            voices = await provider.list_voices(locale="ne-NP")

            assert len(voices) == 1
            assert voices[0].voice_id == "ne-NP-SagarNeural"
            assert voices[0].gender == "Male"
            assert voices[0].locale == "ne-NP"

    @pytest.mark.asyncio
    async def test_list_voices_no_filter(self):
        fake_voices = [
            {
                "Name": "Test",
                "ShortName": "ne-NP-SagarNeural",
                "Gender": "Male",
                "Locale": "ne-NP",
                "SuggestedCodec": "mp3",
                "FriendlyName": "Sagar",
                "Status": "GA",
                "VoiceTag": {"ContentCategories": [], "VoicePersonalities": []},
            },
        ]

        with patch("app.tts.providers.edge.edge_tts.list_voices", new_callable=AsyncMock) as mock_lv:
            mock_lv.return_value = fake_voices

            provider = EdgeTTSProvider()
            voices = await provider.list_voices()
            assert len(voices) == 1


# ---------------------------------------------------------------------------
# AzureTTSProvider unit tests (mocked)
# ---------------------------------------------------------------------------


class TestAzureTTSProvider:
    @pytest.mark.asyncio
    async def test_synthesize_missing_api_key(self):
        from app.tts.providers.azure import AzureTTSProvider

        provider = AzureTTSProvider()
        config = TTSConfig(
            provider=TTSProvider.AZURE,
            voice="ne-NP-SagarNeural",
            region="eastus",
        )
        with pytest.raises(TTSConfigurationError, match="api_key"):
            await provider.synthesize("hello", config)

    @pytest.mark.asyncio
    async def test_synthesize_missing_region(self):
        from app.tts.providers.azure import AzureTTSProvider

        provider = AzureTTSProvider()
        config = TTSConfig(
            provider=TTSProvider.AZURE,
            voice="ne-NP-SagarNeural",
            api_key="test-key",
        )
        with pytest.raises(TTSConfigurationError, match="region"):
            await provider.synthesize("hello", config)

    @pytest.mark.asyncio
    async def test_synthesize_success(self):
        import azure.cognitiveservices.speech as speechsdk

        from app.tts.providers.azure import AzureTTSProvider

        fake_audio = b"\x00" * 200

        mock_result = MagicMock()
        mock_result.audio_data = fake_audio
        mock_result.reason = speechsdk.ResultReason.SynthesizingAudioCompleted

        mock_future = MagicMock()
        mock_future.get.return_value = mock_result

        with (
            patch("app.tts.providers.azure.speechsdk.SpeechConfig"),
            patch("app.tts.providers.azure.speechsdk.SpeechSynthesizer") as MockSynth,
        ):
            MockSynth.return_value.speak_ssml_async.return_value = mock_future

            provider = AzureTTSProvider()
            config = TTSConfig(
                provider=TTSProvider.AZURE,
                voice="ne-NP-SagarNeural",
                api_key="test-key",
                region="eastus",
            )
            result = await provider.synthesize("hello", config)

            assert result.audio_bytes == fake_audio
            assert result.provider_used == TTSProvider.AZURE
            assert result.chars_consumed == 5

    @pytest.mark.asyncio
    async def test_synthesize_canceled(self):
        import azure.cognitiveservices.speech as speechsdk

        from app.tts.providers.azure import AzureTTSProvider

        mock_cancellation = MagicMock()
        mock_cancellation.reason = speechsdk.CancellationReason.Error
        mock_cancellation.error_details = "Invalid key"

        mock_result = MagicMock()
        mock_result.audio_data = b""
        mock_result.reason = speechsdk.ResultReason.Canceled
        mock_result.cancellation_details = mock_cancellation

        mock_future = MagicMock()
        mock_future.get.return_value = mock_result

        with (
            patch("app.tts.providers.azure.speechsdk.SpeechConfig"),
            patch("app.tts.providers.azure.speechsdk.SpeechSynthesizer") as MockSynth,
        ):
            MockSynth.return_value.speak_ssml_async.return_value = mock_future

            provider = AzureTTSProvider()
            config = TTSConfig(
                provider=TTSProvider.AZURE,
                voice="ne-NP-SagarNeural",
                api_key="bad-key",
                region="eastus",
            )
            with pytest.raises(TTSProviderError, match="Canceled"):
                await provider.synthesize("hello", config)


# ---------------------------------------------------------------------------
# Duration estimation utility
# ---------------------------------------------------------------------------


class TestDurationEstimation:
    def test_empty_data(self):
        assert _estimate_duration_from_mp3(b"") == 0
        assert _estimate_duration_from_mp3(b"\x00\x01") == 0

    def test_non_mp3_fallback(self):
        # Random bytes with no valid MP3 sync headers
        data = bytes(range(256)) * 10
        duration = _estimate_duration_from_mp3(data)
        # Should fallback to byte-rate estimate
        assert duration >= 0


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


class TestTTSEndpoints:
    def test_list_providers(self, client):
        resp = client.get("/api/v1/tts/providers")
        assert resp.status_code == 200
        data = resp.json()
        assert "providers" in data
        assert "edge_tts" in data["providers"]
        assert "azure" in data["providers"]

    def test_synthesize_validation_error(self, client):
        # Empty text should fail validation
        resp = client.post(
            "/api/v1/tts/synthesize",
            json={
                "text": "",
                "provider": "edge_tts",
                "voice": "ne-NP-SagarNeural",
            },
        )
        assert resp.status_code == 422

    def test_synthesize_missing_fields(self, client):
        resp = client.post("/api/v1/tts/synthesize", json={})
        assert resp.status_code == 422

    def test_voices_endpoint_validation(self, client):
        resp = client.post(
            "/api/v1/tts/voices",
            json={
                "provider": "invalid_provider",
            },
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Integration test — Edge TTS (real network call, free, no key)
# ---------------------------------------------------------------------------


class TestEdgeTTSIntegration:
    """Integration tests using real Edge TTS service.

    These tests make real network calls. They are free (no API key)
    but may be slow or flaky depending on network conditions.
    Mark with a custom marker if you want to skip in CI.
    """

    @pytest.mark.asyncio
    async def test_real_edge_tts_synthesize(self):
        provider = EdgeTTSProvider()
        config = TTSConfig(
            provider=TTSProvider.EDGE_TTS,
            voice="ne-NP-SagarNeural",
        )
        result = await provider.synthesize("नमस्ते", config)

        assert len(result.audio_bytes) > 100
        assert result.provider_used == TTSProvider.EDGE_TTS
        assert result.chars_consumed == len("नमस्ते")
        assert result.output_format == AudioFormat.MP3
        assert result.duration_ms > 0

    @pytest.mark.asyncio
    async def test_real_edge_tts_list_nepali_voices(self):
        provider = EdgeTTSProvider()
        voices = await provider.list_voices(locale="ne-NP")

        assert len(voices) >= 2  # Hemkala + Sagar at minimum
        voice_ids = {v.voice_id for v in voices}
        assert "ne-NP-HemkalaNeural" in voice_ids
        assert "ne-NP-SagarNeural" in voice_ids
