"""Request/response schemas for inbound call routing configuration."""

import uuid
from datetime import datetime, time

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Gateway Phone schemas
# ---------------------------------------------------------------------------


class GatewayPhoneCreate(BaseModel):
    gateway_id: str = Field(..., min_length=1, max_length=255, description="Unique device identifier")
    org_id: uuid.UUID
    phone_number: str = Field(..., min_length=1, max_length=20, description="Gateway phone number (E.164)")
    label: str | None = Field(default=None, max_length=255)
    auto_answer: bool = True
    system_instruction: str | None = None
    voice_name: str | None = Field(default=None, max_length=50)


class GatewayPhoneUpdate(BaseModel):
    label: str | None = None
    auto_answer: bool | None = None
    is_active: bool | None = None
    system_instruction: str | None = None
    voice_name: str | None = None


class GatewayPhoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    gateway_id: str
    org_id: uuid.UUID
    phone_number: str
    label: str | None
    auto_answer: bool
    is_active: bool
    system_instruction: str | None
    voice_name: str | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Inbound Routing Rule schemas
# ---------------------------------------------------------------------------


class InboundRoutingRuleCreate(BaseModel):
    org_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=255)
    caller_pattern: str | None = Field(default=None, max_length=255)
    match_type: str = Field(default="all", pattern="^(all|prefix|exact|contact_only)$")
    action: str = Field(default="answer", pattern="^(answer|reject|forward)$")
    forward_to: str | None = Field(default=None, max_length=20)
    system_instruction: str | None = None
    voice_name: str | None = Field(default=None, max_length=50)
    time_start: time | None = None
    time_end: time | None = None
    days_of_week: list[int] | None = Field(default=None, description="Active days: 0=Mon, 6=Sun")
    priority: int = Field(default=0, ge=0)


class InboundRoutingRuleUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    caller_pattern: str | None = None
    match_type: str | None = Field(default=None, pattern="^(all|prefix|exact|contact_only)$")
    action: str | None = Field(default=None, pattern="^(answer|reject|forward)$")
    forward_to: str | None = None
    system_instruction: str | None = None
    voice_name: str | None = None
    time_start: time | None = None
    time_end: time | None = None
    days_of_week: list[int] | None = None
    is_active: bool | None = None
    priority: int | None = Field(default=None, ge=0)


class InboundRoutingRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    caller_pattern: str | None
    match_type: str
    action: str
    forward_to: str | None
    system_instruction: str | None
    voice_name: str | None
    time_start: time | None
    time_end: time | None
    days_of_week: list[int] | None
    is_active: bool
    priority: int
    created_at: datetime
