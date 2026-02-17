"""Pydantic schemas for WhatsApp demo bridge endpoints."""

from datetime import datetime

from pydantic import BaseModel, Field


class WhatsAppDemoSessionCreateRequest(BaseModel):
    language: str = Field(default="ne", min_length=2, max_length=8)
    voice_name: str = Field(default="Kore", min_length=1, max_length=64)
    from_number: str | None = Field(default=None, description="Sender number, with or without whatsapp: prefix")
    to_number: str | None = Field(default=None, description="Recipient number, with or without whatsapp: prefix")


class WhatsAppDemoSessionCreateResponse(BaseModel):
    session_id: str
    provider: str
    status: str
    created_at: datetime


class WhatsAppDemoMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=299)
    from_number: str | None = None
    to_number: str | None = None


class WhatsAppDemoMessageResponse(BaseModel):
    session_id: str
    assistant_message: str
    provider: str
    delivery_status: str
    delivery_id: str | None = None


class WhatsAppDemoSessionInfoResponse(BaseModel):
    session_id: str
    provider: str
    status: str
    turns: int
    last_assistant_message: str | None = None
    created_at: datetime
    expires_at: datetime


class WhatsAppSurveyStartRequest(BaseModel):
    from_number: str = Field(..., min_length=7, max_length=32)
    to_numbers: list[str] = Field(..., min_length=1)
    question: str = Field(..., min_length=3, max_length=299)
    options: list[str] = Field(..., min_length=2, max_length=9)


class WhatsAppSurveyStartResponse(BaseModel):
    survey_id: str
    status: str
    recipients: int


class WhatsAppSurveyResultsResponse(BaseModel):
    survey_id: str
    question: str
    options: list[str]
    counts: dict[str, int]
    responses: dict[str, str]
