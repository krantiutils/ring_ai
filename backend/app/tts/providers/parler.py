"""AI4Bharat Indic Parler-TTS provider — high-quality Nepali TTS."""

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
_desc_tokenizer = None
_device = None

# Voice presets with natural language descriptions for controllable synthesis
VOICE_PRESETS = {
    "amrita_calm": {
        "name": "Amrita (Calm)",
        "description": "Amrita speaks with a high pitch at a slow pace. Her voice is clear, with excellent recording quality.",
        "gender": "female",
    },
    "amrita_happy": {
        "name": "Amrita (Happy)",
        "description": "Amrita speaks with a happy tone, high pitch at a moderate pace. Her voice is clear and cheerful.",
        "gender": "female",
    },
    "arvind_calm": {
        "name": "Arvind (Calm)",
        "description": "Arvind speaks with a low pitch at a moderate pace. His voice is calm and clear, with good recording quality.",
        "gender": "male",
    },
    "arvind_formal": {
        "name": "Arvind (Formal)",
        "description": "Arvind speaks with a deep, authoritative tone at a slow pace. His voice is steady and professional.",
        "gender": "male",
    },
}


def _load_model():
    """Load the Indic Parler-TTS model on first use."""
    global _model, _tokenizer, _desc_tokenizer, _device
    if _model is not None:
        return _model, _tokenizer, _desc_tokenizer, _device

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
    dtype = torch.float16 if _device == "cuda" else torch.float32
    logger.info("Loading Indic Parler-TTS model %s on %s (dtype=%s)...", model_id, _device, dtype)
    _model = ParlerTTSForConditionalGeneration.from_pretrained(model_id, torch_dtype=dtype).to(_device)
    # DAC audio encoder/decoder needs float32 to avoid silent output from fp16 underflow
    if dtype == torch.float16:
        _model.audio_encoder = _model.audio_encoder.to(torch.float32)
        logger.info("Upcast audio_encoder to float32 for DAC stability")
    _tokenizer = AutoTokenizer.from_pretrained(model_id)
    _desc_tokenizer = AutoTokenizer.from_pretrained(_model.config.text_encoder._name_or_path)
    logger.info("Indic Parler-TTS model loaded successfully")
    return _model, _tokenizer, _desc_tokenizer, _device


class ParlerTTSProvider(BaseTTSProvider):
    """Self-hosted TTS using AI4Bharat's Indic Parler-TTS model.

    Supports 21 languages (20 Indic + English) with controllable voice descriptions.
    Requires torch + CUDA (or PARLER_FORCE_CPU=true). Uses float16 on GPU.
    """

    def __init__(self) -> None:
        import torch
        from parler_tts import ParlerTTSForConditionalGeneration  # noqa: F401

        if not torch.cuda.is_available() and not settings.PARLER_FORCE_CPU:
            raise ImportError("CUDA not available and PARLER_FORCE_CPU not set")

    @property
    def name(self) -> str:
        return TTSProvider.PARLER_TTS.value

    @property
    def info(self) -> ProviderInfo:
        return ProviderInfo(
            provider=TTSProvider.PARLER_TTS,
            display_name="Indic Parler-TTS",
            description="AI4Bharat's high-quality Indic TTS. Free, GPU recommended. Native Nepali support.",
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

        model, tokenizer, desc_tokenizer, device = _load_model()

        desc_inputs = desc_tokenizer(voice_description, return_tensors="pt").to(device)
        prompt_inputs = tokenizer(text, return_tensors="pt").to(device)

        with torch.no_grad():
            generation = model.generate(
                input_ids=desc_inputs.input_ids,
                attention_mask=desc_inputs.attention_mask,
                prompt_input_ids=prompt_inputs.input_ids,
                prompt_attention_mask=prompt_inputs.attention_mask,
            )

        audio_np = generation.cpu().float().numpy().squeeze()
        sample_rate = model.config.sampling_rate

        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
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
