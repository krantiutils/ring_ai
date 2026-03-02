"""Piper TTS provider — fast offline TTS via piper Python API."""

import asyncio
import io
import json
import logging
import wave
from functools import partial
from pathlib import Path

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

# Lazy-loaded voice cache: voice_id -> PiperVoice
_voice_cache: dict[str, "PiperVoice"] = {}


class PiperProvider(BaseTTSProvider):
    """Offline TTS using Piper ONNX models.

    Requires `piper-tts` pip package and ONNX model files in PIPER_MODELS_DIR.
    """

    def __init__(self) -> None:
        from piper import PiperVoice  # noqa: F401 — import check

        self._models_dir = Path(settings.PIPER_MODELS_DIR)
        if not self._models_dir.exists():
            raise FileNotFoundError(f"Piper models directory not found: {self._models_dir}")
        # Check that at least one model exists
        if not list(self._models_dir.glob("*.onnx")):
            raise FileNotFoundError(f"No ONNX models found in {self._models_dir}")

    @property
    def name(self) -> str:
        return TTSProvider.PIPER.value

    @property
    def info(self) -> ProviderInfo:
        return ProviderInfo(
            provider=TTSProvider.PIPER,
            display_name="Piper",
            description="Fast offline TTS. Free, runs locally via ONNX models.",
            pricing=ProviderPricing(
                cost_per_million_chars=0.0,
                currency="USD",
                notes="Self-hosted, no API costs",
            ),
            requires_api_key=False,
            supported_formats=[AudioFormat.WAV],
        )

    def _get_voice(self, voice_id: str):
        """Load or return cached PiperVoice."""
        if voice_id not in _voice_cache:
            from piper import PiperVoice

            model_path = self._models_dir / f"{voice_id}.onnx"
            if not model_path.exists():
                raise TTSProviderError("piper", f"Model not found: {voice_id}")
            logger.info("Loading Piper voice model: %s", voice_id)
            _voice_cache[voice_id] = PiperVoice.load(str(model_path))
        return _voice_cache[voice_id]

    def _synthesize_blocking(self, voice_id: str, text: str) -> tuple[bytes, int]:
        """Run Piper synthesis (blocking — called via run_in_executor)."""
        try:
            voice = self._get_voice(voice_id)
            buf = io.BytesIO()
            with wave.open(buf, "wb") as wav_file:
                voice.synthesize_wav(text, wav_file)
            audio_bytes = buf.getvalue()
            sample_rate = voice.config.sample_rate
            duration_ms = int((len(audio_bytes) - 44) / (sample_rate * 2) * 1000)
            return audio_bytes, duration_ms
        except TTSProviderError:
            raise
        except Exception as exc:
            raise TTSProviderError("piper", f"Synthesis failed: {exc}") from exc

    async def synthesize(self, text: str, config: TTSConfig) -> TTSResult:
        loop = asyncio.get_running_loop()
        audio_bytes, duration_ms = await loop.run_in_executor(
            None, partial(self._synthesize_blocking, config.voice, text)
        )

        return TTSResult(
            audio_bytes=audio_bytes,
            duration_ms=duration_ms,
            provider_used=TTSProvider.PIPER,
            chars_consumed=len(text),
            output_format=AudioFormat.WAV,
        )

    async def list_voices(self, locale: str | None = None) -> list[VoiceInfo]:
        """Scan PIPER_MODELS_DIR for ONNX models."""
        result: list[VoiceInfo] = []
        if not self._models_dir.exists():
            return result

        pattern = "ne_NP*.onnx" if locale and "ne" in locale.lower() else "*.onnx"
        for model_file in sorted(self._models_dir.glob(pattern)):
            json_sidecar = model_file.with_suffix(".onnx.json")
            voice_id = model_file.stem
            name = voice_id
            gender = "unknown"

            if json_sidecar.exists():
                try:
                    meta = json.loads(json_sidecar.read_text())
                    name = meta.get("name", voice_id)
                    gender = meta.get("gender", "unknown")
                except Exception:
                    pass

            result.append(
                VoiceInfo(
                    voice_id=voice_id,
                    name=name,
                    gender=gender,
                    locale="ne-NP",
                    provider=TTSProvider.PIPER,
                )
            )
        return result
