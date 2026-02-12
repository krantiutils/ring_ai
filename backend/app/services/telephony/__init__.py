"""Telephony service — outbound voice calling via Twilio."""

import logging
import threading

from app.services.telephony.base import BaseTelephonyProvider
from app.services.telephony.exceptions import (
    TelephonyConfigurationError,
    TelephonyError,
    TelephonyProviderError,
)
from app.services.telephony.models import (
    AudioEntry,
    CallContext,
    CallRequest,
    CallResult,
    CallStatus,
    CallStatusResponse,
    DTMFAction,
    DTMFRoute,
    SmsResult,
    WebhookPayload,
)
from app.services.telephony.twilio import (
    TwilioProvider,
    generate_call_twiml,
    generate_dtmf_response_twiml,
)

logger = logging.getLogger(__name__)

__all__ = [
    "AudioEntry",
    "AudioStore",
    "BaseTelephonyProvider",
    "CallContext",
    "CallRequest",
    "CallResult",
    "CallStatus",
    "CallStatusResponse",
    "DTMFAction",
    "DTMFRoute",
    "SmsResult",
    "TelephonyConfigurationError",
    "TelephonyError",
    "TelephonyProviderError",
    "TwilioProvider",
    "WebhookPayload",
    "generate_call_twiml",
    "generate_dtmf_response_twiml",
    "get_twilio_provider",
]


class AudioStore:
    """Thread-safe in-memory store for TTS audio served to Twilio.

    In production, replace with S3/CDN backed storage.
    Entries auto-expire (caller should implement cleanup if needed).
    """

    def __init__(self) -> None:
        self._store: dict[str, AudioEntry] = {}
        self._lock = threading.Lock()

    def put(self, audio_id: str, entry: AudioEntry) -> None:
        with self._lock:
            self._store[audio_id] = entry

    def get(self, audio_id: str) -> AudioEntry | None:
        with self._lock:
            return self._store.get(audio_id)

    def delete(self, audio_id: str) -> None:
        with self._lock:
            self._store.pop(audio_id, None)

    def size(self) -> int:
        with self._lock:
            return len(self._store)


class CallContextStore:
    """Thread-safe in-memory store for active call contexts."""

    def __init__(self) -> None:
        self._store: dict[str, CallContext] = {}
        self._lock = threading.Lock()

    def put(self, call_id: str, context: CallContext) -> None:
        with self._lock:
            self._store[call_id] = context

    def get(self, call_id: str) -> CallContext | None:
        with self._lock:
            return self._store.get(call_id)

    def delete(self, call_id: str) -> None:
        with self._lock:
            self._store.pop(call_id, None)


# Singletons
audio_store = AudioStore()
call_context_store = CallContextStore()

# Lazy-initialized Twilio provider (avoids import-time errors when creds missing)
_twilio_provider: TwilioProvider | None = None
_twilio_lock = threading.Lock()


def get_twilio_provider() -> TwilioProvider:
    """Get or create the Twilio provider singleton.

    Raises TelephonyConfigurationError if credentials are not configured.
    """
    global _twilio_provider  # noqa: PLW0603
    if _twilio_provider is not None:
        return _twilio_provider

    with _twilio_lock:
        # Double-check after acquiring lock
        if _twilio_provider is not None:
            return _twilio_provider

        from app.core.config import settings

        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
            raise TelephonyConfigurationError(
                "Twilio credentials not configured. "
                "Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables."
            )

        _twilio_provider = TwilioProvider(
            account_sid=settings.TWILIO_ACCOUNT_SID,
            auth_token=settings.TWILIO_AUTH_TOKEN,
            default_from_number=settings.TWILIO_PHONE_NUMBER,
        )
        logger.info("Twilio provider initialized")
        return _twilio_provider
