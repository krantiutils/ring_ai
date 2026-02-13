import logging

from app.tts.base import BaseTTSProvider
from app.tts.exceptions import TTSProviderError, TTSProviderUnavailableError
from app.tts.models import ProviderInfo, TTSConfig, TTSProvider, TTSResult, VoiceInfo

logger = logging.getLogger(__name__)


class TTSRouter:
    """Main entry point for TTS synthesis.

    Maintains a registry of providers and routes synthesis requests
    to the appropriate one based on config. Supports optional fallback
    to a secondary provider when the primary fails.
    """

    def __init__(self) -> None:
        self._providers: dict[str, BaseTTSProvider] = {}

    def register(self, provider: BaseTTSProvider) -> None:
        """Register a TTS provider."""
        self._providers[provider.name] = provider
        logger.info("Registered TTS provider: %s", provider.name)

    def get_provider(self, provider: TTSProvider) -> BaseTTSProvider:
        """Get a registered provider by enum value.

        Raises:
            TTSProviderUnavailableError: If provider is not registered.
        """
        impl = self._providers.get(provider.value)
        if impl is None:
            raise TTSProviderUnavailableError(provider.value)
        return impl

    @property
    def available_providers(self) -> list[str]:
        """Return names of all registered providers."""
        return list(self._providers.keys())

    async def synthesize(self, text: str, config: TTSConfig) -> TTSResult:
        """Synthesize text using the configured provider.

        If config.fallback_provider is set and the primary provider fails,
        the fallback provider will be tried.

        Args:
            text: The text to synthesize.
            config: TTS configuration.

        Returns:
            TTSResult with audio data.

        Raises:
            TTSProviderUnavailableError: If the requested provider is not registered.
            TTSProviderError: If synthesis fails (and fallback also fails, if configured).
        """
        primary = self.get_provider(config.provider)

        try:
            return await primary.synthesize(text, config)
        except TTSProviderError:
            if config.fallback_provider is None:
                raise
            logger.warning(
                "Primary provider %s failed, trying fallback %s",
                config.provider.value,
                config.fallback_provider.value,
                exc_info=True,
            )

        # Attempt fallback
        fallback = self.get_provider(config.fallback_provider)
        fallback_config = config.model_copy(
            update={
                "provider": config.fallback_provider,
                "fallback_provider": None,  # prevent infinite fallback chain
            }
        )
        return await fallback.synthesize(text, fallback_config)

    async def list_voices(self, provider: TTSProvider, locale: str | None = None) -> list[VoiceInfo]:
        """List voices for a specific provider."""
        impl = self.get_provider(provider)
        return await impl.list_voices(locale=locale)

    def provider_details(self) -> list[ProviderInfo]:
        """Return detailed metadata for all registered providers."""
        return [provider.info for provider in self._providers.values()]
