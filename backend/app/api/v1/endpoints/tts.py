import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.tts import tts_router
from app.tts.exceptions import (
    TTSConfigurationError,
    TTSProviderError,
    TTSProviderUnavailableError,
)
from app.tts.models import (
    AudioFormat,
    ProviderInfo,
    SynthesizeRequest,
    TTSConfig,
    VoiceInfo,
    VoicesRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()

_CONTENT_TYPE_MAP: dict[AudioFormat, str] = {
    AudioFormat.MP3: "audio/mpeg",
    AudioFormat.WAV: "audio/wav",
    AudioFormat.PCM: "audio/pcm",
}


@router.post("/synthesize")
async def synthesize(request: SynthesizeRequest) -> Response:
    """Synthesize text to audio.

    Returns raw audio bytes with the appropriate Content-Type header.
    """
    config = TTSConfig(
        provider=request.provider,
        voice=request.voice,
        rate=request.rate,
        pitch=request.pitch,
        volume=request.volume,
        output_format=request.output_format,
        fallback_provider=request.fallback_provider,
    )

    try:
        result = await tts_router.synthesize(request.text, config)
    except TTSProviderUnavailableError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except TTSConfigurationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except TTSProviderError as exc:
        logger.error("TTS synthesis failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    content_type = _CONTENT_TYPE_MAP.get(result.output_format, "application/octet-stream")

    return Response(
        content=result.audio_bytes,
        media_type=content_type,
        headers={
            "X-TTS-Duration-Ms": str(result.duration_ms),
            "X-TTS-Provider": result.provider_used.value,
            "X-TTS-Chars-Consumed": str(result.chars_consumed),
        },
    )


@router.post("/voices", response_model=list[VoiceInfo])
async def list_voices(request: VoicesRequest) -> list[VoiceInfo]:
    """List available voices for a given TTS provider."""
    try:
        return await tts_router.list_voices(
            provider=request.provider,
            locale=request.locale,
        )
    except TTSProviderUnavailableError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except TTSConfigurationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except TTSProviderError as exc:
        logger.error("Failed to list voices: %s", exc, exc_info=True)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/providers")
async def list_providers() -> dict:
    """List all configured TTS providers."""
    return {"providers": tts_router.available_providers}


@router.get("/providers/details", response_model=list[ProviderInfo])
async def provider_details() -> list[ProviderInfo]:
    """Return detailed metadata for all providers including pricing and capabilities."""
    return tts_router.provider_details()
