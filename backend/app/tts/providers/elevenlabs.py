import logging

from elevenlabs.client import ElevenLabs

from app.tts.base import BaseTTSProvider
from app.tts.exceptions import TTSConfigurationError, TTSProviderError
from app.tts.models import AudioFormat, TTSConfig, TTSProvider, TTSResult, VoiceInfo

logger = logging.getLogger(__name__)

# ElevenLabs output format string mapped from our AudioFormat enum.
# The bead specifies mp3_44100_128 as the target format.
_ELEVENLABS_FORMAT_MAP: dict[AudioFormat, str] = {
    AudioFormat.MP3: "mp3_44100_128",
    AudioFormat.WAV: "wav_44100",
    AudioFormat.PCM: "pcm_44100",
}


def _collect_audio_bytes(audio_iterator) -> bytes:
    """Consume the ElevenLabs audio iterator into a single bytes object."""
    chunks: list[bytes] = []
    for chunk in audio_iterator:
        if isinstance(chunk, bytes):
            chunks.append(chunk)
    return b"".join(chunks)


class ElevenLabsTTSProvider(BaseTTSProvider):
    """TTS provider using ElevenLabs API.

    Uses the ElevenLabs Python SDK for synthesis. Supports voice_id
    selection, configurable model (default: eleven_multilingual_v2),
    and language code enforcement (default: 'nep' for Nepali).

    Pricing: ~1 credit/character.
    """

    @property
    def name(self) -> str:
        return TTSProvider.ELEVENLABS.value

    async def synthesize(self, text: str, config: TTSConfig) -> TTSResult:
        api_key = config.elevenlabs_api_key
        if not api_key:
            raise TTSConfigurationError(
                "ElevenLabs TTS requires 'elevenlabs_api_key' in TTSConfig"
            )

        output_format_str = _ELEVENLABS_FORMAT_MAP.get(config.output_format)
        if output_format_str is None:
            raise TTSProviderError(
                "elevenlabs",
                f"Unsupported output format: {config.output_format.value}",
            )

        client = ElevenLabs(api_key=api_key)

        convert_kwargs: dict = {
            "voice_id": config.voice,
            "text": text,
            "model_id": config.elevenlabs_model_id,
            "output_format": output_format_str,
        }
        if config.elevenlabs_language_code:
            convert_kwargs["language_code"] = config.elevenlabs_language_code

        try:
            # The SDK's convert() returns an iterator of bytes chunks.
            # It's a synchronous call; we run it directly since the HTTP
            # request is handled internally by the SDK.
            audio_iterator = client.text_to_speech.convert(**convert_kwargs)
            audio_bytes = _collect_audio_bytes(audio_iterator)
        except Exception as exc:
            raise TTSProviderError(
                "elevenlabs", f"Synthesis failed: {exc}"
            ) from exc

        if not audio_bytes:
            raise TTSProviderError("elevenlabs", "Synthesis returned empty audio")

        # Estimate duration from byte size. mp3_44100_128 = 128kbps = 16 bytes/ms.
        bytes_per_ms = 16.0 if config.output_format == AudioFormat.MP3 else 48.0
        duration_ms = int(len(audio_bytes) / bytes_per_ms) if bytes_per_ms > 0 else 0

        return TTSResult(
            audio_bytes=audio_bytes,
            duration_ms=duration_ms,
            provider_used=TTSProvider.ELEVENLABS,
            chars_consumed=len(text),
            output_format=config.output_format,
        )

    async def list_voices(self, locale: str | None = None) -> list[VoiceInfo]:
        """List voices available on ElevenLabs.

        Uses the voices.search() endpoint. ElevenLabs doesn't natively
        filter by locale, so we fetch all and filter client-side if a
        locale is specified (matching against the voice's labels or name).
        """
        from app.core.config import settings

        api_key = settings.ELEVENLABS_API_KEY
        if not api_key:
            raise TTSConfigurationError(
                "ELEVENLABS_API_KEY must be set to list ElevenLabs voices"
            )

        client = ElevenLabs(api_key=api_key)

        try:
            response = client.voices.search(page_size=100)
        except Exception as exc:
            raise TTSProviderError(
                "elevenlabs", f"Failed to list voices: {exc}"
            ) from exc

        result: list[VoiceInfo] = []
        for voice in response.voices:
            # ElevenLabs voices don't have a strict locale field like
            # Azure/Edge. Use labels dict if available for filtering.
            voice_locale = ""
            if hasattr(voice, "labels") and voice.labels:
                voice_locale = voice.labels.get("language", "")

            if locale and locale.lower() not in voice_locale.lower():
                continue

            gender = ""
            if hasattr(voice, "labels") and voice.labels:
                gender = voice.labels.get("gender", "")

            result.append(
                VoiceInfo(
                    voice_id=voice.voice_id,
                    name=voice.name,
                    gender=gender,
                    locale=voice_locale,
                    provider=TTSProvider.ELEVENLABS,
                )
            )
        return result
