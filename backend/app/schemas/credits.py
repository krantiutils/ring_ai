import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CreditTransactionType = Literal["purchase", "consume", "refund"]
VoiceProviderType = Literal["edge_tts", "azure", "elevenlabs", "cambai", "pre_recorded_upload"]


# ---------------------------------------------------------------------------
# Balance
# ---------------------------------------------------------------------------


class CreditBalanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    org_id: uuid.UUID
    balance: float
    total_purchased: float
    total_consumed: float


# ---------------------------------------------------------------------------
# Transaction history
# ---------------------------------------------------------------------------


class CreditTransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    amount: float
    type: CreditTransactionType
    reference_id: str | None
    description: str | None
    created_at: datetime


class CreditHistoryResponse(BaseModel):
    items: list[CreditTransactionResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Cost estimation
# ---------------------------------------------------------------------------


class CostEstimateResponse(BaseModel):
    campaign_id: uuid.UUID
    campaign_name: str
    campaign_type: str
    total_contacts: int
    cost_per_interaction: float
    estimated_total_cost: float
    current_balance: float
    sufficient_credits: bool


# ---------------------------------------------------------------------------
# Credit purchase (admin/internal)
# ---------------------------------------------------------------------------


class CreditPurchaseRequest(BaseModel):
    org_id: uuid.UUID
    amount: float = Field(..., gt=0)
    description: str | None = None


# ---------------------------------------------------------------------------
# Voice provider quote
# ---------------------------------------------------------------------------


class VoiceCreditQuoteRequest(BaseModel):
    org_id: uuid.UUID
    provider: VoiceProviderType
    text_chars: int = Field(default=0, ge=0, le=100000)
    duration_seconds: int = Field(default=0, ge=0, le=36000)


class VoiceCreditQuoteResponse(BaseModel):
    provider: VoiceProviderType
    is_metered: bool
    requires_purchased_credits: bool
    billing_basis: Literal["characters", "duration", "none"]
    credits_per_1k_chars: float | None = None
    estimated_required_credits: float
    current_balance: float
    sufficient_credits: bool
    note: str
