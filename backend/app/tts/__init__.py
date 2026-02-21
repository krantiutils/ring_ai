from app.tts.providers.azure import AzureTTSProvider
from app.tts.providers.edge import EdgeTTSProvider
from app.tts.router import TTSRouter

from app.core.config import settings

__all__ = [
    "AzureTTSProvider",
    "EdgeTTSProvider",
    "TTSRouter",
    "tts_router",
]


def _create_router() -> TTSRouter:
    """Create and configure the default TTSRouter with all providers."""
    router = TTSRouter()
    router.register(EdgeTTSProvider())
    # Azure: only register if credentials are set
    if settings.AZURE_TTS_KEY:
        router.register(AzureTTSProvider())
    # ElevenLabs: only register if API key is set
    if settings.ELEVENLABS_API_KEY:
        try:
            from app.tts.providers.elevenlabs import ElevenLabsProvider

            router.register(ElevenLabsProvider())
        except Exception:
            pass
    # Parler-TTS: only register if torch/model available
    try:
        from app.tts.providers.parler import ParlerTTSProvider

        router.register(ParlerTTSProvider())
    except (ImportError, Exception):
        pass
    # Piper: only register if binary exists
    try:
        from app.tts.providers.piper import PiperProvider

        router.register(PiperProvider())
    except (FileNotFoundError, Exception):
        pass
    return router


tts_router = _create_router()
