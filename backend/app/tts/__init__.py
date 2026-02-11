from app.tts.providers.azure import AzureTTSProvider
from app.tts.providers.edge import EdgeTTSProvider
from app.tts.router import TTSRouter

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
    router.register(AzureTTSProvider())
    return router


tts_router = _create_router()
