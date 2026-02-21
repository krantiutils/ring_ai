"""Parler-TTS provider — self-hosted AI4Bharat Indic TTS model."""

import asyncio
import io
import logging
import wave
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

# Lazy-loaded model cache
_model = None
_tokenizer = None
_device = None

# Voice description presets
VOICE_PRESETS = {
    "nepali_female_calm": {
        "name": "Nepali Female (Calm)",
        "description": "A female speaker with a calm, clear Nepali accent, speaking at a moderate pace in a quiet environment.",
        "gender": "female",
    },
    "nepali_male_warm": {
        "name": "Nepali Male (Warm)",
        "description": "A male speaker with a warm, conversational Nepali accent, speaking naturally with moderate pace.",
        "gender": "male",
    },
    "nepali_female_energetic": {
        "name": "Nepali Female (Energetic)",
        "description": "A female speaker with an energetic, enthusiastic Nepali accent, speaking clearly at a slightly fast pace.",
        "gender": "female",
    },
    "nepali_male_deep": {
        "name": "Nepali Male (Deep)",
        "description": "A male speaker with a deep, authoritative Nepali accent, speaking slowly and clearly.",
        "gender": "male",
    },
}


def _load_model():
    """Load the Parler-TTS model on first use."""
    global _model, _tokenizer, _device
    if _model is not None:
        return _model, _tokenizer, _device

    import torch
    from parler_tts import ParlerTTSForConditionalGeneration
    from transformers import AutoTokenizer

    if torch.cuda.is_available():
        _device = "cuda"
    elif settings.PARLER_FORCE_CPU:
        _device = "cpu"
    else:
        raise RuntimeError("CUDA not available and PARLER_FORCE_CPU is not set")

    model_id = settings.PARLER_MODEL_ID
    logger.info("Loading Parler-TTS model %s on %s...", model_id, _device)
    _model = ParlerTTSForConditionalGeneration.from_pretrained(model_id).to(_device)
    _tokenizer = AutoTokenizer.from_pretrained(model_id)
    logger.info("Parler-TTS model loaded successfully")
    return _model, _tokenizer, _device


class ParlerTTSProvider(BaseTTSProvider):
    """Self-hosted TTS using AI4Bharat's Indic Parler-TTS model.

    Requires torch + CUDA (or PARLER_FORCE_CPU=true for CPU inference).
    """

    def __init__(self) -> None:
        import torch
        if not torch.cuda.is_available() and not settings.PARLER_FORCE_CPU:
            raise ImportError("CUDA not available and PARLER_FORCE_CPU not set")

    @property
    def name(self) -> str:
        return TTSProvider.PARLER_TTS.value

    @property
    def info(self) -> ProviderInfo:
        return ProviderInfo(
            provider=TTSProvider.PARLER_TTS,
            display_name="Parler-TTS (AI4Bharat)",
            description="Self-hosted Indic TTS model. Free to run, GPU recommended.",
            pricing=ProviderPricing(
                cost_per_million_chars=0.0,
                currency="USD",
                notes="Self-hosted — compute cost is separate",
            ),
            requires_api_key=False,
            supported_formats=[AudioFormat.WAV],
        )

    def _synthesize_blocking(self, voice_description: str, text: str) -> tuple[bytes, int]:
        """Run model inference (blocking — called via run_in_executor)."""
        import torch
        import numpy as np

        model, tokenizer, device = _load_model()

        input_ids = tokenizer(voice_description, return_tensors="pt").input_ids.to(device)
        prompt_ids = tokenizer(text, return_tensors="pt").input_ids.to(device)

        with torch.no_grad():
            generation = model.generate(input_ids=input_ids, prompt_input_ids=prompt_ids)

        audio_np = generation.cpu().numpy().squeeze()
        sample_rate = model.config.sampling_rate

        # Convert to WAV bytes
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            audio_int16 = (audio_np * 32767).astype(np.int16)
            wav_file.writeframes(audio_int16.tobytes())

        audio_bytes = wav_buffer.getvalue()
        duration_ms = int(len(audio_np) / sample_rate * 1000)
        return audio_bytes, duration_ms

    async def synthesize(self, text: str, config: TTSConfig) -> TTSResult:
        preset = VOICE_PRESETS.get(config.voice)
        description = preset["description"] if preset else config.voice

        loop = asyncio.get_running_loop()
        try:
            audio_bytes, duration_ms = await loop.run_in_executor(
                None, partial(self._synthesize_blocking, description, text)
            )
        except Exception as exc:
            raise TTSProviderError("parler_tts", f"Synthesis failed: {exc}") from exc

        return TTSResult(
            audio_bytes=audio_bytes,
            duration_ms=duration_ms,
            provider_used=TTSProvider.PARLER_TTS,
            chars_consumed=len(text),
            output_format=AudioFormat.WAV,
        )

    async def list_voices(self, locale: str | None = None) -> list[VoiceInfo]:
        return [
            VoiceInfo(
                voice_id=key,
                name=preset["name"],
                gender=preset["gender"],
                locale="ne-NP",
                provider=TTSProvider.PARLER_TTS,
            )
            for key, preset in VOICE_PRESETS.items()
        ]
