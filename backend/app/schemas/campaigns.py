import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CampaignType = Literal["voice", "text", "form"]
CampaignStatus = Literal["draft", "scheduled", "active", "paused", "completed"]


# ---------------------------------------------------------------------------
# Campaign schemas
# ---------------------------------------------------------------------------


class ScheduleConfig(BaseModel):
    """Schedule configuration for a campaign."""

    mode: Literal["immediate", "scheduled", "recurring"]
    scheduled_at: datetime | None = None
    cron_expression: str | None = None
    timezone: str = "Asia/Kathmandu"


class CampaignCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: CampaignType
    org_id: uuid.UUID
    template_id: uuid.UUID | None = None
    form_id: uuid.UUID | None = None
    schedule_config: dict | None = None


class CampaignUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    template_id: uuid.UUID | None = None
    form_id: uuid.UUID | None = None
    schedule_config: dict | None = None


class CampaignStartRequest(BaseModel):
    """Optional body for POST /campaigns/{id}/start."""

    schedule: datetime | None = None


class CampaignResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    name: str
    type: CampaignType
    status: CampaignStatus
    template_id: uuid.UUID | None
    form_id: uuid.UUID | None
    schedule_config: dict | None
    scheduled_at: datetime | None
    created_at: datetime
    updated_at: datetime


class CampaignStats(BaseModel):
    total_contacts: int = 0
    completed: int = 0
    failed: int = 0
    pending: int = 0
    in_progress: int = 0
    avg_duration_seconds: float | None = None
    delivery_rate: float | None = None
    cost_estimate: float | None = None


class CampaignWithStats(CampaignResponse):
    stats: CampaignStats


class CampaignListResponse(BaseModel):
    items: list[CampaignResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Contact schemas (campaign-scoped)
# ---------------------------------------------------------------------------


class ContactResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    phone: str
    name: str | None
    metadata_: dict | None = Field(None, alias="metadata_")
    created_at: datetime


class ContactListResponse(BaseModel):
    items: list[ContactResponse]
    total: int
    page: int
    page_size: int


class ContactUploadResponse(BaseModel):
    created: int
    skipped: int
    errors: list[str]
