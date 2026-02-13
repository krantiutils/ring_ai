"""Pydantic schemas for SMS/Text API endpoints."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Send SMS
# ---------------------------------------------------------------------------


class SmsSendRequest(BaseModel):
    """POST /api/v1/text/send request body."""

    to: str = Field(..., min_length=1, description="Recipient phone number (E.164)")
    body: str = Field(..., min_length=1, max_length=1600, description="Message text")
    org_id: uuid.UUID = Field(..., description="Organization ID")
    from_number: str | None = Field(None, description="Sender phone number (E.164). Falls back to Twilio default.")


class SmsSendResponse(BaseModel):
    """POST /api/v1/text/send response."""

    message_id: uuid.UUID
    twilio_sid: str
    conversation_id: uuid.UUID
    status: str
    direction: str = "outbound"


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------


class ConversationResponse(BaseModel):
    """Single SMS conversation in list/detail responses."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    contact_id: uuid.UUID
    status: str
    last_message_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ConversationListResponse(BaseModel):
    """GET /api/v1/text/conversations response."""

    items: list[ConversationResponse]
    total: int
    page: int
    page_size: int


class ConversationHandoffRequest(BaseModel):
    """PUT /api/v1/text/conversations/{id}/handoff request body."""

    status: Literal["needs_handoff", "active", "closed"] = Field(
        ..., description="New conversation status"
    )


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------


class MessageResponse(BaseModel):
    """Single SMS message in list responses."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    conversation_id: uuid.UUID
    direction: str
    body: str
    from_number: str
    to_number: str
    twilio_sid: str | None
    status: str
    created_at: datetime


class MessageListResponse(BaseModel):
    """Paginated list of SMS messages."""

    items: list[MessageResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Auto-response rules
# ---------------------------------------------------------------------------


class AutoResponseRuleCreateRequest(BaseModel):
    """POST /api/v1/text/auto-response-rules request body."""

    org_id: uuid.UUID = Field(..., description="Organization ID")
    keyword: str = Field(..., min_length=1, max_length=255, description="Keyword to match")
    match_type: Literal["exact", "contains"] = Field("contains", description="How to match the keyword")
    response_template: str = Field(..., min_length=1, description="Response message to send")
    is_active: bool = Field(True, description="Whether the rule is active")
    priority: int = Field(0, ge=0, description="Priority (lower = higher priority)")


class AutoResponseRuleResponse(BaseModel):
    """Single auto-response rule in list/detail responses."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    keyword: str
    match_type: str
    response_template: str
    is_active: bool
    priority: int
    created_at: datetime


class AutoResponseRuleListResponse(BaseModel):
    """GET /api/v1/text/auto-response-rules response."""

    items: list[AutoResponseRuleResponse]
    total: int
