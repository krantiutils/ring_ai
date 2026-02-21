"""ElevenLabs TTS provider — high-quality multilingual voices."""

import asyncio
import logging
from functools import partial

from app.core.config import settings
from app.tts.base import BaseTTSProvider
from app.tts.exceptions import TTSProviderError
from app.tts.models import (
    AudioFormat,
    ProviderInfo,
    ProviderPricing,
    TTSConfig,
    TTSProvider,
    TTSResult,
    VoiceInfo,
)

logger = logging.getLogger(__name__)


class ElevenLabsProvider(BaseTTSProvider):
    """TTS provider using the ElevenLabs API.

    Requires ELEVENLABS_API_KEY in settings. High-quality multilingual voices.
    """

    def __init__(self) -> None:
        if not settings.ELEVENLABS_API_KEY:
            raise ValueError("ELEVENLABS_API_KEY not configured")
        from elevenlabs.client import ElevenLabs

        self._client = ElevenLabs(api_key=settings.ELEVENLABS_API_KEY)

    @property
    def name(self) -> str:
        return TTSProvider.ELEVENLABS.value

    @property
    def info(self) -> ProviderInfo:
        return ProviderInfo(
            provider=TTSProvider.ELEVENLABS,
            display_name="ElevenLabs",
            description="High-quality AI voices with multilingual support.",
            pricing=ProviderPricing(
                cost_per_million_chars=240.0,
                currency="USD",
                notes="Pro plan pricing (~$0.24/1K chars)",
            ),
            requires_api_key=True,
            supported_formats=[AudioFormat.MP3],
        )

    def _synthesize_blocking(self, voice_id: str, text: str) -> bytes:
        audio_iter = self._client.text_to_speech.convert(
            voice_id=voice_id,
            text=text,
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        return b"".join(audio_iter)

    def _list_voices_blocking(self):
        return self._client.voices.get_all()

    async def synthesize(self, text: str, config: TTSConfig) -> TTSResult:
        loop = asyncio.get_running_loop()
        try:
            audio_bytes = await loop.run_in_executor(
                None, partial(self._synthesize_blocking, config.voice, text)
            )
        except Exception as exc:
            raise TTSProviderError("elevenlabs", f"Synthesis failed: {exc}") from exc

        if not audio_bytes:
            raise TTSProviderError("elevenlabs", "Synthesis returned empty audio")

        return TTSResult(
            audio_bytes=audio_bytes,
            duration_ms=int(len(audio_bytes) * 8 / 128),
            provider_used=TTSProvider.ELEVENLABS,
            chars_consumed=len(text),
            output_format=AudioFormat.MP3,
        )

    async def list_voices(self, locale: str | None = None) -> list[VoiceInfo]:
        loop = asyncio.get_running_loop()
        try:
            response = await loop.run_in_executor(None, self._list_voices_blocking)
            voices = response.voices
        except Exception as exc:
            raise TTSProviderError("elevenlabs", f"Failed to list voices: {exc}") from exc

        result: list[VoiceInfo] = []
        for voice in voices:
            if locale:
                labels = voice.labels or {}
                lang = labels.get("language", "").lower()
                if locale.lower().replace("-", "_") not in lang and locale.lower().split("-")[0] not in lang:
                    continue

            result.append(
                VoiceInfo(
                    voice_id=voice.voice_id,
                    name=voice.name or voice.voice_id,
                    gender=(voice.labels or {}).get("gender", "unknown"),
                    locale=locale or "multilingual",
                    provider=TTSProvider.ELEVENLABS,
                )
            )
        return result
