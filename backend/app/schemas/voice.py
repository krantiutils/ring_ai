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


class DemoCallRequest(BaseModel):
    """POST /api/v1/voice/demo-call request body."""

    name: str = Field(..., min_length=1, max_length=120)
    phone: str = Field(..., min_length=7, max_length=32, description="Destination number, ideally E.164 format")
    message: str = Field(..., min_length=1, max_length=400)
    from_number: str | None = None
    tts_config: "TTSCallConfig" = Field(default_factory=lambda: TTSCallConfig())


class DemoCallOtpSendResponse(BaseModel):
    """POST /api/v1/voice/demo-call/otp/send response."""

    request_id: str
    status: str
    expires_in_seconds: int


class DemoCallOtpVerifyRequest(BaseModel):
    """POST /api/v1/voice/demo-call/otp/verify request body."""

    request_id: str = Field(..., min_length=1)
    otp: str = Field(..., min_length=4, max_length=10)


class DemoCallMasterOtpRequest(BaseModel):
    """POST /api/v1/voice/demo-call/master-otp request body."""

    name: str = Field(..., min_length=1, max_length=120)
    phone: str = Field(..., min_length=7, max_length=32, description="Destination number, ideally E.164 format")
    message: str | None = Field(None, min_length=1, max_length=400)
    master_otp: str = Field(..., min_length=4, max_length=10)
    from_number: str | None = None
    tts_config: "TTSCallConfig" = Field(default_factory=lambda: TTSCallConfig())


class DemoCallResponse(BaseModel):
    """POST /api/v1/voice/demo-call response."""

    call_id: str
    status: CallStatus


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
