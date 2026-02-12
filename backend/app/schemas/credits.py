import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CreditTransactionType = Literal["purchase", "consume", "refund"]


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
