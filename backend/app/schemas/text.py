"""Pydantic schemas for SMS/text API endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.services.telephony.models import SmsStatus


class SendSmsRequest(BaseModel):
    """POST /api/v1/text/send request body."""

    to: str = Field(..., min_length=1, description="E.164 phone number")
    message: str = Field(..., min_length=1, max_length=1600, description="SMS body text")
    from_number: str | None = Field(
        None,
        description="Sender number (E.164). Falls back to configured default.",
    )
    template_id: uuid.UUID | None = Field(
        None,
        description="Optional template ID. If provided, 'message' is ignored and template is rendered.",
    )
    variables: dict[str, str] = Field(default_factory=dict)
    campaign_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    callback_url: str | None = None


class SendSmsResponse(BaseModel):
    """POST /api/v1/text/send response."""

    message_sid: str
    status: SmsStatus
    interaction_id: uuid.UUID | None = None


class SmsStatusResponse(BaseModel):
    """GET /api/v1/text/messages/{message_sid} response."""

    message_sid: str
    status: SmsStatus
    to: str | None = None
    from_number: str | None = None
    body: str | None = None
    date_sent: datetime | None = None
    price: str | None = None
    error_code: int | None = None
    error_message: str | None = None
