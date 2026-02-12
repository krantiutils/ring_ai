"""Twilio telephony provider implementation."""

import asyncio
import logging
from functools import partial

from twilio.rest import Client
from twilio.twiml.voice_response import Gather, VoiceResponse

from app.services.telephony.base import BaseTelephonyProvider
from app.services.telephony.exceptions import (
    TelephonyConfigurationError,
    TelephonyProviderError,
)
from app.services.telephony.models import (
    CallContext,
    CallResult,
    CallStatus,
    CallStatusResponse,
    DTMFRoute,
    SmsResult,
)

logger = logging.getLogger(__name__)

# Twilio status string → our CallStatus enum
_STATUS_MAP: dict[str, CallStatus] = {
    "queued": CallStatus.QUEUED,
    "initiated": CallStatus.INITIATED,
    "ringing": CallStatus.RINGING,
    "in-progress": CallStatus.IN_PROGRESS,
    "completed": CallStatus.COMPLETED,
    "busy": CallStatus.BUSY,
    "no-answer": CallStatus.NO_ANSWER,
    "canceled": CallStatus.CANCELED,
    "failed": CallStatus.FAILED,
}

# All status events we want callbacks for
DEFAULT_STATUS_EVENTS = [
    "initiated",
    "ringing",
    "answered",
    "completed",
]


class TwilioProvider(BaseTelephonyProvider):
    """Twilio outbound voice call provider."""

    def __init__(
        self,
        account_sid: str,
        auth_token: str,
        default_from_number: str,
    ) -> None:
        if not account_sid or not auth_token:
            raise TelephonyConfigurationError("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required")
        self._account_sid = account_sid
        self._auth_token = auth_token
        self._default_from_number = default_from_number
        self._client = Client(account_sid, auth_token)

    @property
    def name(self) -> str:
        return "twilio"

    @property
    def default_from_number(self) -> str:
        return self._default_from_number

    async def initiate_call(
        self,
        to: str,
        from_number: str,
        twiml_url: str,
        status_callback_url: str,
        status_events: list[str] | None = None,
    ) -> CallResult:
        """Initiate an outbound call via Twilio REST API."""
        if status_events is None:
            status_events = DEFAULT_STATUS_EVENTS

        loop = asyncio.get_running_loop()
        try:
            call = await loop.run_in_executor(
                None,
                partial(
                    self._client.calls.create,
                    to=to,
                    from_=from_number,
                    url=twiml_url,
                    status_callback=status_callback_url,
                    status_callback_event=status_events,
                    status_callback_method="POST",
                    method="POST",
                ),
            )
        except Exception as exc:
            raise TelephonyProviderError("twilio", f"Failed to initiate call: {exc}") from exc

        status = _STATUS_MAP.get(call.status, CallStatus.INITIATED)
        logger.info(
            "Twilio call initiated: sid=%s to=%s status=%s",
            call.sid,
            to,
            status.value,
        )
        return CallResult(call_id=call.sid, status=status)

    async def get_call_status(self, call_id: str) -> CallStatusResponse:
        """Fetch call details from Twilio."""
        loop = asyncio.get_running_loop()
        try:
            call = await loop.run_in_executor(
                None,
                partial(self._client.calls, call_id).fetch,
            )
        except Exception as exc:
            raise TelephonyProviderError("twilio", f"Failed to fetch call {call_id}: {exc}") from exc

        status = _STATUS_MAP.get(call.status, CallStatus.FAILED)
        duration = int(call.duration) if call.duration else None

        return CallStatusResponse(
            call_id=call.sid,
            status=status,
            duration_seconds=duration,
            price=call.price,
            direction=call.direction,
            from_number=call.from_formatted,
            to_number=call.to_formatted,
            started_at=call.start_time,
            ended_at=call.end_time,
        )

    async def cancel_call(self, call_id: str) -> CallResult:
        """Cancel a queued or ringing call."""
        loop = asyncio.get_running_loop()
        try:
            call = await loop.run_in_executor(
                None,
                partial(
                    self._client.calls(call_id).update,
                    status="canceled",
                ),
            )
        except Exception as exc:
            raise TelephonyProviderError("twilio", f"Failed to cancel call {call_id}: {exc}") from exc

        status = _STATUS_MAP.get(call.status, CallStatus.CANCELED)
        return CallResult(call_id=call.sid, status=status)

    async def send_sms(
        self,
        to: str,
        from_number: str,
        body: str,
    ) -> SmsResult:
        """Send an SMS message via Twilio REST API.

        Args:
            to: Destination phone number (E.164).
            from_number: Sender phone number (E.164).
            body: The message text.

        Returns:
            SmsResult with the Twilio message SID and initial status.

        Raises:
            TelephonyProviderError: If the Twilio API call fails.
        """
        loop = asyncio.get_running_loop()
        try:
            message = await loop.run_in_executor(
                None,
                partial(
                    self._client.messages.create,
                    to=to,
                    from_=from_number,
                    body=body,
                ),
            )
        except Exception as exc:
            raise TelephonyProviderError(
                "twilio", f"Failed to send SMS to {to}: {exc}"
            ) from exc

        logger.info(
            "Twilio SMS sent: sid=%s to=%s status=%s",
            message.sid,
            to,
            message.status,
        )
        return SmsResult(message_id=message.sid, status=message.status)


def generate_call_twiml(
    call_context: CallContext,
    audio_url: str,
    dtmf_action_url: str,
) -> str:
    """Generate TwiML for an outbound campaign call.

    The TwiML flow:
    1. If recording requested with consent, play consent text first
    2. Start recording (if enabled)
    3. Play the synthesized audio
    4. If DTMF routes configured, gather keypress input
    5. If no input gathered, hang up gracefully

    Args:
        call_context: Context with call config (DTMF routes, recording, etc.)
        audio_url: URL where the TTS audio is served.
        dtmf_action_url: URL to POST DTMF input to.

    Returns:
        TwiML XML string.
    """
    response = VoiceResponse()

    # Recording consent + start
    if call_context.record:
        if call_context.record_consent_text:
            response.say(
                call_context.record_consent_text,
                language="ne-NP",
            )
        response.record(
            recording_status_callback=dtmf_action_url.replace("/dtmf/", "/recording/"),
            recording_status_callback_method="POST",
            max_length=600,  # 10 minutes max
            play_beep=False,
        )

    # If DTMF routes are configured, wrap audio play in a Gather
    if call_context.dtmf_routes:
        gather = Gather(
            num_digits=1,
            action=dtmf_action_url,
            method="POST",
            timeout=10,
        )
        gather.play(audio_url)

        # Add voice prompts for DTMF options
        dtmf_prompt = _build_dtmf_prompt(call_context.dtmf_routes)
        if dtmf_prompt:
            gather.say(dtmf_prompt, language="ne-NP")

        response.append(gather)

        # No input fallback — replay instructions once, then hang up
        response.say("कुनै इनपुट प्राप्त भएन। धन्यवाद।", language="ne-NP")
    else:
        # No DTMF — just play audio and hang up
        response.play(audio_url)

    response.hangup()
    return str(response)


def generate_dtmf_response_twiml(digit: str, routes: list[DTMFRoute]) -> str:
    """Generate TwiML response for a DTMF keypress.

    Args:
        digit: The digit pressed by the caller.
        routes: Configured DTMF routes.

    Returns:
        TwiML XML string.
    """
    response = VoiceResponse()

    matched_route = None
    for route in routes:
        if route.digit == digit:
            matched_route = route
            break

    if matched_route is None:
        response.say("अमान्य विकल्प। धन्यवाद।", language="ne-NP")
        response.hangup()
        return str(response)

    # Route-specific TwiML
    if matched_route.action.value == "agent":
        response.say("कृपया पर्खनुहोस्, एजेन्टमा जोडिँदैछ।", language="ne-NP")
        # In production, this would Dial to an agent queue
        response.hangup()
    elif matched_route.action.value == "repeat":
        response.say("फेरि सुन्नुहोस्।", language="ne-NP")
        response.redirect("")  # Redirect to same TwiML URL to replay
    elif matched_route.action.value == "payment":
        response.say(
            "भुक्तानी सेवामा जोडिँदैछ।",
            language="ne-NP",
        )
        response.hangup()
    elif matched_route.action.value == "info":
        response.say(
            "थप जानकारीको लागि धन्यवाद। हामी तपाईंलाई सम्पर्क गर्नेछौं।",
            language="ne-NP",
        )
        response.hangup()
    else:
        response.say("धन्यवाद।", language="ne-NP")
        response.hangup()

    return str(response)


def _build_dtmf_prompt(routes: list[DTMFRoute]) -> str:
    """Build a combined prompt string from DTMF routes."""
    parts = []
    for route in routes:
        parts.append(f"{route.label} को लागि {route.digit} थिच्नुहोस्।")
    return " ".join(parts)
