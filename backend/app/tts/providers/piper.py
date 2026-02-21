"""Piper TTS provider — fast offline TTS via piper binary."""

import asyncio
import io
import json
import logging
import subprocess
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


class PiperProvider(BaseTTSProvider):
    """Offline TTS using the Piper binary.

    Requires `piper` installed at PIPER_BINARY_PATH and ONNX model files
    in PIPER_MODELS_DIR.
    """

    def __init__(self) -> None:
        self._binary = Path(settings.PIPER_BINARY_PATH)
        self._models_dir = Path(settings.PIPER_MODELS_DIR)
        if not self._binary.exists():
            raise FileNotFoundError(f"Piper binary not found: {self._binary}")

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

    def _find_model(self, voice_id: str) -> Path:
        """Find the ONNX model file for a voice ID."""
        model_path = self._models_dir / f"{voice_id}.onnx"
        if model_path.exists():
            return model_path
        if Path(voice_id).suffix == ".onnx" and Path(voice_id).exists():
            return Path(voice_id)
        raise TTSProviderError("piper", f"Model not found: {voice_id}")

    def _synthesize_blocking(self, model_path: str, text: str) -> tuple[bytes, int]:
        """Run piper binary (blocking — called via run_in_executor)."""
        try:
            result = subprocess.run(
                [
                    str(self._binary),
                    "--model", model_path,
                    "--output_raw",
                ],
                input=text.encode("utf-8"),
                capture_output=True,
                timeout=30,
            )
        except subprocess.TimeoutExpired:
            raise TTSProviderError("piper", "Synthesis timed out (30s)")
        except Exception as exc:
            raise TTSProviderError("piper", f"Synthesis failed: {exc}") from exc

        if result.returncode != 0:
            raise TTSProviderError("piper", f"Piper exited with code {result.returncode}: {result.stderr.decode()}")

        raw_audio = result.stdout
        if not raw_audio:
            raise TTSProviderError("piper", "Synthesis returned empty audio")

        # Wrap raw PCM in WAV container (piper outputs 16kHz 16-bit mono by default)
        sample_rate = 16000
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(raw_audio)

        audio_bytes = wav_buffer.getvalue()
        duration_ms = int(len(raw_audio) / (sample_rate * 2) * 1000)
        return audio_bytes, duration_ms

    async def synthesize(self, text: str, config: TTSConfig) -> TTSResult:
        model_path = self._find_model(config.voice)

        loop = asyncio.get_running_loop()
        try:
            audio_bytes, duration_ms = await loop.run_in_executor(
                None, partial(self._synthesize_blocking, str(model_path), text)
            )
        except TTSProviderError:
            raise
        except Exception as exc:
            raise TTSProviderError("piper", f"Synthesis failed: {exc}") from exc

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
