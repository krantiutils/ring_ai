"""Pydantic schemas for voice model API endpoints."""

import uuid

from pydantic import BaseModel


class VoiceModelResponse(BaseModel):
    """Response schema for a single voice model."""

    id: uuid.UUID
    voice_display_name: str
    voice_internal_name: str
    is_premium: bool

    model_config = {"from_attributes": True}


class TestSpeakRequest(BaseModel):
    """POST /api/v1/voice/test-speak/{campaign_id}/ request body."""

    voice_input: int
    message: str


class TestSpeakResponse(BaseModel):
    """POST /api/v1/voice/test-speak/{campaign_id}/ response body."""

    audio_url: str


class DemoCallRequest(BaseModel):
    """POST /api/v1/voice/demo-call/{campaign_id}/ request body."""

    contact_id: uuid.UUID | None = None
    number: str | None = None
