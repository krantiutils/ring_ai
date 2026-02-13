import io
import logging
import struct

import edge_tts

from app.tts.base import BaseTTSProvider
from app.tts.exceptions import TTSProviderError
from app.tts.models import AudioFormat, ProviderInfo, ProviderPricing, TTSConfig, TTSProvider, TTSResult, VoiceInfo

logger = logging.getLogger(__name__)

# Nepali voices available through Edge TTS
NEPALI_VOICES = {
    "ne-NP-HemkalaNeural": "Hemkala (Female)",
    "ne-NP-SagarNeural": "Sagar (Male)",
}


def _estimate_duration_from_mp3(data: bytes) -> int:
    """Estimate audio duration in milliseconds from MP3 data.

    Parses actual MP3 frame headers to calculate duration from bitrate
    and frame count. Falls back to a rough byte-rate estimate if no
    valid frames are found.
    """
    if len(data) < 4:
        return 0

    offset = 0
    total_frames = 0
    total_samples = 0

    # MPEG audio version -> samples per frame (Layer III)
    samples_per_frame = {1: 1152, 2: 576, 2.5: 576}  # V1  # V2  # V2.5
    sample_rates_table = {
        1: [44100, 48000, 32000],
        2: [22050, 24000, 16000],
        2.5: [11025, 12000, 8000],
    }

    while offset + 4 <= len(data):
        header_bytes = data[offset : offset + 4]
        header = struct.unpack(">I", header_bytes)[0]

        # Check sync word (11 bits)
        if (header >> 21) & 0x7FF != 0x7FF:
            offset += 1
            continue

        version_bits = (header >> 19) & 0x3
        layer_bits = (header >> 17) & 0x3
        bitrate_idx = (header >> 12) & 0xF
        srate_idx = (header >> 10) & 0x3
        padding = (header >> 9) & 0x1

        # Skip invalid combinations
        if version_bits == 1 or layer_bits == 0 or bitrate_idx == 0 or bitrate_idx == 15:
            offset += 1
            continue
        if srate_idx == 3:
            offset += 1
            continue

        version = {0: 2.5, 2: 2, 3: 1}[version_bits]

        # Layer III bitrate table
        if version == 1:
            bitrates = [
                0,
                32,
                40,
                48,
                56,
                64,
                80,
                96,
                112,
                128,
                160,
                192,
                224,
                256,
                320,
            ]
        else:
            bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]

        bitrate = bitrates[bitrate_idx] * 1000
        sample_rate = sample_rates_table[version][srate_idx]
        spf = samples_per_frame[version]

        frame_size = (spf // 8 * bitrate) // sample_rate + padding

        if frame_size < 1:
            offset += 1
            continue

        total_frames += 1
        total_samples += spf
        offset += frame_size

        # Don't parse forever — 10 frames is enough for a decent estimate
        # if the file is very large
        if total_frames >= 10 and len(data) > 100_000:
            # Extrapolate from parsed portion
            avg_frame_size = offset / total_frames
            estimated_total_frames = int(len(data) / avg_frame_size)
            total_samples = estimated_total_frames * spf
            break

    if total_frames == 0:
        # Fallback: assume 128kbps MP3
        return int(len(data) * 8 / 128)

    return int(total_samples / sample_rate * 1000) if sample_rate else 0


class EdgeTTSProvider(BaseTTSProvider):
    """TTS provider using Microsoft Edge's online TTS service.

    Free to use, no API key required. Supports Nepali voices.
    Note: Grey area for commercial-scale usage.
    """

    @property
    def name(self) -> str:
        return TTSProvider.EDGE_TTS.value

    @property
    def info(self) -> ProviderInfo:
        return ProviderInfo(
            provider=TTSProvider.EDGE_TTS,
            display_name="Edge TTS",
            description="Microsoft Edge's online TTS service. Free, no API key required. Supports 400+ voices across 100+ languages.",
            pricing=ProviderPricing(
                cost_per_million_chars=0.0,
                free_tier_chars=None,
                currency="USD",
                notes="Free but grey area for commercial-scale usage",
            ),
            requires_api_key=False,
            supported_formats=[AudioFormat.MP3],
        )

    async def synthesize(self, text: str, config: TTSConfig) -> TTSResult:
        communicate = edge_tts.Communicate(
            text=text,
            voice=config.voice,
            rate=config.rate,
            volume=config.volume,
            pitch=config.pitch,
        )

        audio_buffer = io.BytesIO()
        try:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_buffer.write(chunk["data"])
        except Exception as exc:
            raise TTSProviderError("edge_tts", f"Synthesis failed: {exc}") from exc

        audio_bytes = audio_buffer.getvalue()
        if not audio_bytes:
            raise TTSProviderError("edge_tts", "Synthesis returned empty audio")

        # Edge TTS natively outputs MP3. If a different format was requested,
        # conversion would need an external tool (ffmpeg). For now, we only
        # support MP3 directly from Edge TTS.
        if config.output_format != AudioFormat.MP3:
            raise TTSProviderError(
                "edge_tts",
                f"Edge TTS only supports MP3 output. Requested: {config.output_format.value}",
            )

        duration_ms = _estimate_duration_from_mp3(audio_bytes)

        return TTSResult(
            audio_bytes=audio_bytes,
            duration_ms=duration_ms,
            provider_used=TTSProvider.EDGE_TTS,
            chars_consumed=len(text),
            output_format=AudioFormat.MP3,
        )

    async def list_voices(self, locale: str | None = None) -> list[VoiceInfo]:
        try:
            voices = await edge_tts.list_voices()
        except Exception as exc:
            raise TTSProviderError("edge_tts", f"Failed to list voices: {exc}") from exc

        result: list[VoiceInfo] = []
        for voice in voices:
            if locale and voice["Locale"] != locale:
                continue
            result.append(
                VoiceInfo(
                    voice_id=voice["ShortName"],
                    name=voice["FriendlyName"],
                    gender=voice["Gender"],
                    locale=voice["Locale"],
                    provider=TTSProvider.EDGE_TTS,
                )
            )
        return result
