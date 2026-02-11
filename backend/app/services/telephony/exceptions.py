"""Telephony service exceptions."""


class TelephonyError(Exception):
    """Base exception for telephony operations."""


class TelephonyProviderError(TelephonyError):
    """Raised when a telephony provider operation fails."""

    def __init__(self, provider: str, message: str) -> None:
        self.provider = provider
        super().__init__(f"[{provider}] {message}")


class TelephonyConfigurationError(TelephonyError):
    """Raised when telephony configuration is missing or invalid."""
