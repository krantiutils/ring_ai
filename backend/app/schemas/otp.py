"""Pydantic schemas for OTP API endpoints."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class OTPSendRequest(BaseModel):
    """POST /api/v1/otp/send request body."""

    number: str = Field(..., min_length=1, description="Recipient phone number")
    message: str = Field(
        ...,
        min_length=1,
        description="Message with {otp} placeholder for OTP insertion",
    )
    sms_send_options: Literal["text", "voice"] = Field(
        ..., description="Delivery method: 'text' for SMS, 'voice' for TTS call"
    )
    otp_options: Literal["personnel", "generated"] = Field(
        ...,
        description="'personnel' to provide custom OTP, 'generated' for auto-generation",
    )
    otp: str | None = Field(
        None,
        description="Custom OTP value (required when otp_options='personnel')",
    )
    otp_length: int = Field(6, ge=4, le=10, description="Length of auto-generated OTP (default 6)")
    voice_input: int | None = Field(
        None,
        description="Voice model ID (required when sms_send_options='voice')",
    )
    org_id: uuid.UUID = Field(..., description="Organization ID")


class OTPSendResponse(BaseModel):
    """POST /api/v1/otp/send response."""

    id: uuid.UUID
    otp: str
    status: str
    message: str


class OTPRecordResponse(BaseModel):
    """Single OTP record in list response."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    phone_number: str
    message: str
    otp: str
    otp_options: str
    sms_send_options: str
    created_at: datetime


class OTPListResponse(BaseModel):
    """GET /api/v1/otp/list response."""

    items: list[OTPRecordResponse]
    total: int
    page: int
    page_size: int
