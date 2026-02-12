"""Telephony call models."""

import uuid
from datetime import UTC, datetime
from enum import Enum

from pydantic import BaseModel, Field


class CallStatus(str, Enum):
    INITIATED = "initiated"
    QUEUED = "queued"
    RINGING = "ringing"
    IN_PROGRESS = "in-progress"
    COMPLETED = "completed"
    BUSY = "busy"
    NO_ANSWER = "no-answer"
    CANCELED = "canceled"
    FAILED = "failed"


class DTMFAction(str, Enum):
    PAYMENT = "payment"
    INFO = "info"
    AGENT = "agent"
    REPEAT = "repeat"


class DTMFRoute(BaseModel):
    digit: str = Field(..., pattern=r"^[0-9*#]$")
    action: DTMFAction
    label: str  # Human-readable label for the option (can be Nepali)


class CallRequest(BaseModel):
    to: str = Field(..., min_length=1, description="E.164 phone number to call")
    from_number: str | None = Field(None, description="Caller ID (E.164). Falls back to default Twilio number.")
    template_id: uuid.UUID
    variables: dict[str, str] = Field(default_factory=dict)
    tts_provider: str = "edge_tts"
    tts_voice: str = "ne-NP-HemkalaNeural"
    tts_rate: str = "+0%"
    tts_pitch: str = "+0Hz"
    callback_url: str | None = Field(None, description="Override status callback URL")
    dtmf_routes: list[DTMFRoute] = Field(default_factory=list)
    record: bool = False
    record_consent_text: str | None = Field(
        None,
        description="If set, plays consent prompt before recording starts",
    )


class CallResult(BaseModel):
    call_id: str
    status: CallStatus


class CallStatusResponse(BaseModel):
    call_id: str
    status: CallStatus
    duration_seconds: int | None = None
    price: str | None = None
    direction: str | None = None
    from_number: str | None = None
    to_number: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None


class WebhookPayload(BaseModel):
    """Twilio status callback payload.

    Field names match Twilio's POST parameter names exactly.
    """

    CallSid: str
    CallStatus: str
    CallDuration: str | None = None
    From: str | None = None
    To: str | None = None
    Direction: str | None = None
    Timestamp: str | None = None
    RecordingUrl: str | None = None
    RecordingSid: str | None = None
    RecordingDuration: str | None = None


class AudioEntry(BaseModel):
    """In-memory audio storage entry for serving TTS audio to Twilio."""

    audio_bytes: bytes
    content_type: str = "audio/mpeg"
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CallContext(BaseModel):
    """Stored context for an active call, used when generating TwiML."""

    call_id: str
    audio_id: str
    dtmf_routes: list[DTMFRoute] = Field(default_factory=list)
    record: bool = False
    record_consent_text: str | None = None
    interaction_id: uuid.UUID | None = None


class SmsResult(BaseModel):
    """Result of sending an SMS message via a telephony provider."""

    message_id: str
    status: str


class FormCallContext(BaseModel):
    """Stored context for an active form/survey voice call.

    Tracks multi-step question flow: which question we're on,
    accumulated answers, and pre-synthesized audio IDs.
    """

    call_id: str
    form_id: uuid.UUID
    contact_id: uuid.UUID
    interaction_id: uuid.UUID | None = None
    questions: list[dict] = Field(default_factory=list)
    audio_ids: dict[str, str] = Field(
        default_factory=dict,
        description="Map of question index (str) to audio_id",
    )
    answers: dict[str, str] = Field(
        default_factory=dict,
        description="Accumulated answers: question index (str) -> answer value",
    )
    current_question: int = 0
