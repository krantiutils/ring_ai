"""OTP service — generation, SMS delivery, and voice delivery."""

import asyncio
import logging
import secrets
import uuid
from functools import partial

from app.services.telephony import (
    AudioEntry,
    CallContext,
    CallResult,
    audio_store,
    call_context_store,
    get_twilio_provider,
)
from app.services.telephony.exceptions import (
    TelephonyProviderError,
)
from app.tts import tts_router
from app.tts.models import TTSConfig, TTSProvider

logger = logging.getLogger(__name__)


class OTPError(Exception):
    """Base exception for OTP service errors."""


class OTPDeliveryError(OTPError):
    """Raised when OTP delivery fails (SMS or voice)."""

    def __init__(self, method: str, detail: str) -> None:
        self.method = method
        self.detail = detail
        super().__init__(f"OTP delivery via {method} failed: {detail}")


class OTPValidationError(OTPError):
    """Raised when OTP request validation fails."""


def generate_otp(length: int = 6) -> str:
    """Generate a cryptographically random numeric OTP of the given length.

    Args:
        length: Number of digits (4-10).

    Returns:
        Numeric string of exactly `length` digits, zero-padded.
    """
    if length < 4 or length > 10:
        raise OTPValidationError(f"OTP length must be between 4 and 10, got {length}")
    upper = 10**length
    return str(secrets.randbelow(upper)).zfill(length)


async def send_otp_sms(
    to: str,
    message_body: str,
) -> str:
    """Send an OTP via Twilio SMS.

    Args:
        to: Recipient phone number in E.164 format.
        message_body: The message text with OTP already substituted.

    Returns:
        Twilio message SID.

    Raises:
        OTPDeliveryError: If SMS sending fails.
        TelephonyConfigurationError: If Twilio is not configured.
    """
    provider = get_twilio_provider()
    from_number = provider.default_from_number
    if not from_number:
        raise OTPDeliveryError("text", "No default Twilio phone number configured")

    loop = asyncio.get_running_loop()
    try:
        message = await loop.run_in_executor(
            None,
            partial(
                provider._client.messages.create,
                to=to,
                from_=from_number,
                body=message_body,
            ),
        )
    except Exception as exc:
        raise OTPDeliveryError("text", str(exc)) from exc

    logger.info("OTP SMS sent: sid=%s to=%s", message.sid, to)
    return message.sid


async def send_otp_voice(
    to: str,
    message_body: str,
    voice_input: int | None = None,
) -> str:
    """Send an OTP via voice call (TTS + Twilio outbound call).

    Synthesizes the message via TTS, stores the audio, and initiates a Twilio
    call that plays the audio.

    Args:
        to: Recipient phone number in E.164 format.
        message_body: The message text with OTP already substituted.
        voice_input: Voice model ID (currently maps to voice selection).

    Returns:
        Twilio call SID.

    Raises:
        OTPDeliveryError: If voice delivery fails.
        TelephonyConfigurationError: If Twilio is not configured.
    """
    from app.core.config import settings

    # Synthesize TTS audio
    tts_config = TTSConfig(
        provider=TTSProvider.EDGE_TTS,
        voice="ne-NP-HemkalaNeural",
    )

    try:
        tts_result = await tts_router.synthesize(message_body, tts_config)
    except Exception as exc:
        raise OTPDeliveryError("voice", f"TTS synthesis failed: {exc}") from exc

    # Store audio for Twilio to fetch
    audio_id = str(uuid.uuid4())
    audio_store.put(
        audio_id,
        AudioEntry(
            audio_bytes=tts_result.audio_bytes,
            content_type="audio/mpeg",
        ),
    )

    # Initiate Twilio call
    provider = get_twilio_provider()
    from_number = provider.default_from_number
    if not from_number:
        audio_store.delete(audio_id)
        raise OTPDeliveryError("voice", "No default Twilio phone number configured")

    base_url = settings.TWILIO_BASE_URL
    if not base_url:
        audio_store.delete(audio_id)
        raise OTPDeliveryError(
            "voice",
            "TWILIO_BASE_URL not configured for voice callbacks",
        )

    temp_call_id = str(uuid.uuid4())
    call_context = CallContext(
        call_id=temp_call_id,
        audio_id=audio_id,
    )
    call_context_store.put(temp_call_id, call_context)

    twiml_url = f"{base_url}/api/v1/voice/twiml/{temp_call_id}"
    webhook_url = f"{base_url}/api/v1/voice/webhook"

    try:
        result: CallResult = await provider.initiate_call(
            to=to,
            from_number=from_number,
            twiml_url=twiml_url,
            status_callback_url=webhook_url,
        )
    except TelephonyProviderError as exc:
        audio_store.delete(audio_id)
        call_context_store.delete(temp_call_id)
        raise OTPDeliveryError("voice", str(exc)) from exc

    # Update context with real Twilio CallSid
    call_context.call_id = result.call_id
    call_context_store.put(result.call_id, call_context)

    logger.info("OTP voice call initiated: call_id=%s to=%s", result.call_id, to)
    return result.call_id
