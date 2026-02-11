"""Abstract telephony provider interface."""

from abc import ABC, abstractmethod

from app.services.telephony.models import CallResult, CallStatusResponse


class BaseTelephonyProvider(ABC):
    """Abstract base class for telephony providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier string."""

    @abstractmethod
    async def initiate_call(
        self,
        to: str,
        from_number: str,
        twiml_url: str,
        status_callback_url: str,
        status_events: list[str] | None = None,
    ) -> CallResult:
        """Initiate an outbound call.

        Args:
            to: Destination phone number (E.164).
            from_number: Caller ID (E.164).
            twiml_url: URL Twilio will fetch for TwiML instructions on connect.
            status_callback_url: URL for status webhooks.
            status_events: Which status events to receive callbacks for.

        Returns:
            CallResult with the provider's call ID and initial status.
        """

    @abstractmethod
    async def get_call_status(self, call_id: str) -> CallStatusResponse:
        """Fetch current status of a call.

        Args:
            call_id: Provider-specific call identifier (e.g. Twilio CallSid).

        Returns:
            CallStatusResponse with current call details.
        """

    @abstractmethod
    async def cancel_call(self, call_id: str) -> CallResult:
        """Cancel/hang up an in-progress or queued call.

        Args:
            call_id: Provider-specific call identifier.

        Returns:
            CallResult with updated status.
        """
