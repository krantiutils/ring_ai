import logging

import httpx

from app.tts.base import BaseTTSProvider
from app.tts.exceptions import TTSConfigurationError, TTSProviderError
from app.tts.models import AudioFormat, TTSConfig, TTSProvider, TTSResult, VoiceInfo

logger = logging.getLogger(__name__)

_CAMB_BASE_URL = "https://client.camb.ai/apis"

# Mapping from AudioFormat to CAMB.AI output format strings.
# mars-instruct does NOT support MP3.
_CAMB_FORMAT_MAP: dict[AudioFormat, str] = {
    AudioFormat.MP3: "mp3",
    AudioFormat.WAV: "wav",
    AudioFormat.PCM: "pcm-s16le",
}

# Formats supported by mars-instruct (no MP3).
_MARS_INSTRUCT_FORMATS: set[AudioFormat] = {AudioFormat.WAV, AudioFormat.PCM}

# Approximate bytes per millisecond for duration estimation.
_BYTES_PER_MS: dict[AudioFormat, float] = {
    AudioFormat.MP3: 20.0,   # ~160kbps
    AudioFormat.WAV: 48.0,   # 24kHz 16-bit mono
    AudioFormat.PCM: 48.0,
}

# Pre-defined mood instruction templates for user convenience.
MOOD_INSTRUCTIONS: dict[str, str] = {
    "calm": "Speak in a calm, soothing, and relaxed tone with gentle pacing.",
    "energetic": "Speak with high energy, enthusiasm, and an upbeat pace.",
    "dramatic": "Speak with dramatic emphasis, varied intonation, and theatrical delivery.",
    "conversational": "Speak in a natural, casual, conversational tone as if talking to a friend.",
}

# Default speech model when none specified.
_DEFAULT_SPEECH_MODEL = "mars-pro"

# Timeout for CAMB.AI API requests.
_REQUEST_TIMEOUT = 60.0


def _resolve_mood_instruction(mood: str | None) -> str | None:
    """Resolve a mood keyword to an instruction string.

    If the mood matches a known keyword (calm, energetic, etc.), the
    pre-defined instruction is returned. Otherwise the raw string is
    passed through as a custom instruction.
    """
    if mood is None:
        return None
    return MOOD_INSTRUCTIONS.get(mood.lower(), mood)


class CambAITTSProvider(BaseTTSProvider):
    """TTS provider using CAMB.AI streaming TTS API.

    Supports Nepali voices with dialect awareness and mood control
    via the mars-instruct model. Uses the streaming endpoint for
    synchronous audio synthesis.

    Authentication: API key via x-api-key header.
    Pricing: Credit-based — 0.35-0.60 credits per 1K characters
    depending on plan tier. Free tier: 21 credits.
    """

    @property
    def name(self) -> str:
        return TTSProvider.CAMB_AI.value

    def _get_api_key(self, config: TTSConfig) -> str:
        """Resolve API key from config or environment settings."""
        if config.api_key:
            return config.api_key

        from app.core.config import settings

        if settings.CAMB_AI_API_KEY:
            return settings.CAMB_AI_API_KEY

        raise TTSConfigurationError(
            "CAMB.AI TTS requires an API key. Set CAMB_AI_API_KEY in environment "
            "or pass api_key in TTSConfig."
        )

    def _resolve_speech_model(self, config: TTSConfig) -> str:
        """Determine which speech model to use.

        If mood instructions are present, mars-instruct is required.
        Otherwise, use the explicitly requested model or default to mars-pro.
        """
        if config.mood:
            if config.speech_model and config.speech_model != "mars-instruct":
                raise TTSConfigurationError(
                    f"Mood instructions require 'mars-instruct' model, "
                    f"but '{config.speech_model}' was requested."
                )
            return "mars-instruct"

        return config.speech_model or _DEFAULT_SPEECH_MODEL

    def _validate_format(self, model: str, output_format: AudioFormat) -> None:
        """Validate that the output format is supported by the model."""
        if model == "mars-instruct" and output_format not in _MARS_INSTRUCT_FORMATS:
            raise TTSConfigurationError(
                f"mars-instruct does not support {output_format.value} output. "
                f"Use WAV or PCM instead."
            )

    def _build_request_body(
        self,
        text: str,
        config: TTSConfig,
        model: str,
    ) -> dict:
        """Build the JSON request body for the streaming TTS endpoint."""
        body: dict = {
            "text": text,
            "voice_id": int(config.voice),
            "language": "ne-NP",
            "speech_model": model,
        }

        # Output format configuration.
        camb_format = _CAMB_FORMAT_MAP.get(config.output_format)
        if camb_format:
            body["output_configuration"] = {"format": camb_format}

        # Mood / user instructions (mars-instruct only).
        if model == "mars-instruct" and config.mood:
            instruction = _resolve_mood_instruction(config.mood)
            if instruction:
                body["user_instructions"] = instruction

        return body

    async def synthesize(self, text: str, config: TTSConfig) -> TTSResult:
        api_key = self._get_api_key(config)
        model = self._resolve_speech_model(config)
        self._validate_format(model, config.output_format)

        body = self._build_request_body(text, config, model)

        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                response = await client.post(
                    f"{_CAMB_BASE_URL}/tts-stream",
                    json=body,
                    headers={"x-api-key": api_key},
                )
        except httpx.TimeoutException as exc:
            raise TTSProviderError("camb_ai", f"Request timed out: {exc}") from exc
        except httpx.HTTPError as exc:
            raise TTSProviderError("camb_ai", f"HTTP error: {exc}") from exc

        if response.status_code != 200:
            detail = response.text[:500] if response.text else f"status {response.status_code}"
            raise TTSProviderError("camb_ai", f"API returned {response.status_code}: {detail}")

        audio_bytes = response.content
        if not audio_bytes:
            raise TTSProviderError("camb_ai", "Synthesis returned empty audio")

        bpm = _BYTES_PER_MS.get(config.output_format, 20.0)
        duration_ms = int(len(audio_bytes) / bpm) if bpm > 0 else 0

        return TTSResult(
            audio_bytes=audio_bytes,
            duration_ms=duration_ms,
            provider_used=TTSProvider.CAMB_AI,
            chars_consumed=len(text),
            output_format=config.output_format,
        )

    async def list_voices(self, locale: str | None = None) -> list[VoiceInfo]:
        from app.core.config import settings

        api_key = settings.CAMB_AI_API_KEY
        if not api_key:
            raise TTSConfigurationError(
                "CAMB_AI_API_KEY must be set to list CAMB.AI voices"
            )

        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                response = await client.get(
                    f"{_CAMB_BASE_URL}/list-voices",
                    headers={"x-api-key": api_key},
                )
        except httpx.HTTPError as exc:
            raise TTSProviderError("camb_ai", f"Failed to list voices: {exc}") from exc

        if response.status_code != 200:
            raise TTSProviderError(
                "camb_ai",
                f"Failed to list voices: status {response.status_code}",
            )

        data = response.json()
        voices_raw = data if isinstance(data, list) else data.get("voices", [])

        result: list[VoiceInfo] = []
        for voice in voices_raw:
            voice_locale = voice.get("language", voice.get("locale", ""))
            if locale and voice_locale != locale:
                continue
            result.append(
                VoiceInfo(
                    voice_id=str(voice.get("id", voice.get("voice_id", ""))),
                    name=voice.get("name", "Unknown"),
                    gender=voice.get("gender", "Unknown"),
                    locale=voice_locale,
                    provider=TTSProvider.CAMB_AI,
                )
            )

        return result
