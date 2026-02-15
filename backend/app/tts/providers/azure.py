import asyncio
import logging
from functools import partial

import azure.cognitiveservices.speech as speechsdk

from app.tts.base import BaseTTSProvider
from app.tts.exceptions import TTSConfigurationError, TTSProviderError
from app.tts.models import AudioFormat, ProviderInfo, ProviderPricing, TTSConfig, TTSProvider, TTSResult, VoiceInfo

logger = logging.getLogger(__name__)

# Mapping from our AudioFormat enum to Azure SDK output format constants.
_AZURE_FORMAT_MAP: dict[AudioFormat, speechsdk.SpeechSynthesisOutputFormat] = {
    AudioFormat.MP3: speechsdk.SpeechSynthesisOutputFormat.Audio24Khz160KBitRateMonoMp3,
    AudioFormat.WAV: speechsdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm,
    AudioFormat.PCM: speechsdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm,
}

# Approximate bytes per second for duration estimation.
_BYTES_PER_MS: dict[AudioFormat, float] = {
    AudioFormat.MP3: 20.0,  # ~160kbps = 20 bytes/ms
    AudioFormat.WAV: 48.0,  # 24kHz 16-bit mono = 48 bytes/ms
    AudioFormat.PCM: 48.0,
}


def _build_ssml(text: str, config: TTSConfig) -> str:
    """Build SSML markup for fine-grained prosody control."""
    # Escape XML special characters
    escaped = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )

    return (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xml:lang="ne-NP">'
        f'<voice name="{config.voice}">'
        f'<prosody rate="{config.rate}" pitch="{config.pitch}" '
        f'volume="{config.volume}">'
        f"{escaped}"
        f"</prosody>"
        f"</voice>"
        f"</speak>"
    )


def _synthesize_blocking(text: str, config: TTSConfig) -> tuple[bytes, speechsdk.ResultReason, str | None]:
    """Run Azure synthesis in a blocking context (meant for thread pool).

    Returns (audio_bytes, reason, error_detail).
    """
    speech_config = speechsdk.SpeechConfig(
        subscription=config.api_key,
        region=config.region,
    )

    azure_format = _AZURE_FORMAT_MAP.get(config.output_format)
    if azure_format is not None:
        speech_config.set_speech_synthesis_output_format(azure_format)

    # Use None audio_config to get bytes in memory (no speaker/file output).
    synthesizer = speechsdk.SpeechSynthesizer(
        speech_config=speech_config,
        audio_config=None,
    )

    ssml = _build_ssml(text, config)
    result = synthesizer.speak_ssml_async(ssml).get()

    error_detail = None
    if result.reason == speechsdk.ResultReason.Canceled:
        cancellation = result.cancellation_details
        error_detail = f"Canceled: {cancellation.reason}. Error: {cancellation.error_details}"

    return result.audio_data, result.reason, error_detail


class AzureTTSProvider(BaseTTSProvider):
    """TTS provider using Azure Cognitive Services Neural TTS.

    Production-grade with SLA. Requires subscription key and region.
    Supports SSML for fine prosody control.
    Pricing: $16/1M chars, free tier 500K chars/month.
    """

    @property
    def name(self) -> str:
        return TTSProvider.AZURE.value

    @property
    def info(self) -> ProviderInfo:
        return ProviderInfo(
            provider=TTSProvider.AZURE,
            display_name="Azure Cognitive Services",
            description=(
                "Production-grade Neural TTS with SLA. Supports SSML for fine prosody control. 400+ neural voices."
            ),
            pricing=ProviderPricing(
                cost_per_million_chars=16.0,
                free_tier_chars=500_000,
                currency="USD",
                notes="$16/1M chars, free tier 500K chars/month",
            ),
            requires_api_key=True,
            supported_formats=[AudioFormat.MP3, AudioFormat.WAV, AudioFormat.PCM],
        )

    async def synthesize(self, text: str, config: TTSConfig) -> TTSResult:
        if not config.api_key:
            raise TTSConfigurationError("Azure TTS requires 'api_key' in TTSConfig")
        if not config.region:
            raise TTSConfigurationError("Azure TTS requires 'region' in TTSConfig")

        loop = asyncio.get_running_loop()

        try:
            audio_data, reason, error_detail = await loop.run_in_executor(
                None,
                partial(_synthesize_blocking, text, config),
            )
        except Exception as exc:
            raise TTSProviderError("azure", f"Synthesis failed: {exc}") from exc

        if reason == speechsdk.ResultReason.Canceled:
            raise TTSProviderError("azure", error_detail or "Synthesis was canceled")

        if reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
            raise TTSProviderError("azure", f"Unexpected result reason: {reason}")

        if not audio_data:
            raise TTSProviderError("azure", "Synthesis returned empty audio")

        bpm = _BYTES_PER_MS.get(config.output_format, 20.0)
        duration_ms = int(len(audio_data) / bpm) if bpm > 0 else 0

        return TTSResult(
            audio_bytes=audio_data,
            duration_ms=duration_ms,
            provider_used=TTSProvider.AZURE,
            chars_consumed=len(text),
            output_format=config.output_format,
        )

    async def list_voices(self, locale: str | None = None) -> list[VoiceInfo]:
        """List voices available on Azure.

        This makes a network call to the Azure API to fetch the current
        voice catalog. Requires api_key and region via environment.
        """
        from app.core.config import settings

        api_key = settings.AZURE_TTS_KEY
        region = settings.AZURE_TTS_REGION

        if not api_key or not region:
            raise TTSConfigurationError("AZURE_TTS_KEY and AZURE_TTS_REGION must be set to list Azure voices")

        loop = asyncio.get_running_loop()

        def _list_blocking() -> list[speechsdk.VoiceInfo]:
            speech_config = speechsdk.SpeechConfig(subscription=api_key, region=region)
            synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
            result = synthesizer.get_voices_async().get()
            if result.reason == speechsdk.ResultReason.VoicesListRetrieved:
                return result.voices
            raise TTSProviderError(
                "azure",
                f"Failed to list voices: {result.reason}",
            )

        try:
            raw_voices = await loop.run_in_executor(None, _list_blocking)
        except TTSProviderError:
            raise
        except Exception as exc:
            raise TTSProviderError("azure", f"Failed to list voices: {exc}") from exc

        result: list[VoiceInfo] = []
        for v in raw_voices:
            if locale and v.locale != locale:
                continue
            result.append(
                VoiceInfo(
                    voice_id=v.short_name,
                    name=v.local_name,
                    gender=str(v.gender.name) if hasattr(v.gender, "name") else str(v.gender),
                    locale=v.locale,
                    provider=TTSProvider.AZURE,
                )
            )
        return result
