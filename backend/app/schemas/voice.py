"""Pydantic schemas for voice call API endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.services.telephony.models import CallStatus, DTMFRoute


class CampaignCallRequest(BaseModel):
    """POST /api/v1/voice/campaign-call request body."""

    to: str = Field(..., min_length=1, description="E.164 phone number to call")
    from_number: str | None = Field(
        None,
        description="Caller ID (E.164). Falls back to configured default.",
    )
    template_id: uuid.UUID
    variables: dict[str, str] = Field(default_factory=dict)
    tts_config: "TTSCallConfig" = Field(default_factory=lambda: TTSCallConfig())
    callback_url: str | None = None
    dtmf_routes: list[DTMFRoute] = Field(default_factory=list)
    record: bool = False
    record_consent_text: str | None = None


class TTSCallConfig(BaseModel):
    """TTS configuration for a voice call."""

    provider: str = "edge_tts"
    voice: str = "ne-NP-HemkalaNeural"
    rate: str = "+0%"
    pitch: str = "+0Hz"
    fallback_provider: str | None = None


class CampaignCallResponse(BaseModel):
    """POST /api/v1/voice/campaign-call response."""

    call_id: str
    status: CallStatus
    interaction_id: uuid.UUID | None = None


class CallStatusResponse(BaseModel):
    """GET /api/v1/voice/calls/{call_id} response."""

    call_id: str
    status: CallStatus
    duration_seconds: int | None = None
    price: str | None = None
    direction: str | None = None
    from_number: str | None = None
    to_number: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None


class WebhookEvent(BaseModel):
    """Parsed webhook event for internal use."""

    call_id: str
    status: CallStatus
    duration_seconds: int | None = None
    recording_url: str | None = None
    recording_duration: int | None = None
    from_number: str | None = None
    to_number: str | None = None
