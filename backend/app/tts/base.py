import abc

from app.tts.models import ProviderInfo, TTSConfig, TTSResult, VoiceInfo


class BaseTTSProvider(abc.ABC):
    """Abstract base class for TTS providers.

    All providers must implement synthesize(), list_voices(), and info.
    """

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Provider identifier string (must match TTSProvider enum value)."""

    @property
    @abc.abstractmethod
    def info(self) -> ProviderInfo:
        """Return metadata about this provider (pricing, capabilities)."""

    @abc.abstractmethod
    async def synthesize(self, text: str, config: TTSConfig) -> TTSResult:
        """Synthesize text to audio bytes.

        Args:
            text: The text to convert to speech.
            config: TTS configuration (voice, rate, pitch, format, etc.)

        Returns:
            TTSResult with audio bytes and metadata.

        Raises:
            TTSProviderError: If synthesis fails.
        """

    @abc.abstractmethod
    async def list_voices(self, locale: str | None = None) -> list[VoiceInfo]:
        """List available voices for this provider.

        Args:
            locale: Optional locale filter (e.g. "ne-NP").

        Returns:
            List of VoiceInfo objects.
        """
