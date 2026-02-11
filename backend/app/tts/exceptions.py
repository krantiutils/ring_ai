class TTSError(Exception):
    """Base exception for all TTS-related errors."""


class TTSProviderError(TTSError):
    """Raised when a TTS provider encounters an error during synthesis."""

    def __init__(self, provider: str, message: str) -> None:
        self.provider = provider
        super().__init__(f"[{provider}] {message}")


class TTSConfigurationError(TTSError):
    """Raised when TTS configuration is invalid or incomplete."""


class TTSProviderUnavailableError(TTSError):
    """Raised when a requested TTS provider is not registered or not available."""

    def __init__(self, provider: str) -> None:
        self.provider = provider
        super().__init__(f"TTS provider '{provider}' is not available")
