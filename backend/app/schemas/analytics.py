"""Pydantic schemas for analytics endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Supporting models
# ---------------------------------------------------------------------------


class PeriodCredits(BaseModel):
    """Credits consumed in a single time period (day)."""

    period: str  # ISO date string, e.g. "2026-02-12"
    credits: float


class HourlyBucket(BaseModel):
    """Interaction count bucketed by hour of day (0-23)."""

    hour: int
    count: int


class DailyBucket(BaseModel):
    """Interaction count bucketed by date."""

    date: str  # ISO date string
    count: int


# ---------------------------------------------------------------------------
# GET /analytics/overview
# ---------------------------------------------------------------------------


class OverviewAnalytics(BaseModel):
    """Organization-level analytics summary."""

    # Campaign counts by status
    campaigns_by_status: dict[str, int]

    # Reach
    total_contacts_reached: int  # distinct contacts with completed interactions
    total_calls: int
    total_sms: int

    # Performance
    avg_call_duration_seconds: float | None
    overall_delivery_rate: float | None  # completed / total interactions

    # Credits
    credits_consumed: float
    credits_by_period: list[PeriodCredits]

    # Applied filters
    start_date: datetime | None
    end_date: datetime | None


# ---------------------------------------------------------------------------
# GET /analytics/campaigns/{id}
# ---------------------------------------------------------------------------


class CampaignAnalytics(BaseModel):
    """Detailed analytics for a single campaign."""

    campaign_id: uuid.UUID
    campaign_name: str
    campaign_type: str
    campaign_status: str

    # Status breakdown
    status_breakdown: dict[str, int]  # {"completed": N, "failed": N, ...}
    completion_rate: float | None
    avg_duration_seconds: float | None
    credit_consumption: float

    # Distribution data for charts
    hourly_distribution: list[HourlyBucket]
    daily_distribution: list[DailyBucket]

    # Nepal carrier breakdown (NTC / Ncell / Other)
    carrier_breakdown: dict[str, int]


# ---------------------------------------------------------------------------
# GET /analytics/events
# ---------------------------------------------------------------------------


class AnalyticsEventResponse(BaseModel):
    """Single analytics event."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    interaction_id: uuid.UUID
    event_type: str
    event_data: dict | None
    created_at: datetime


class EventListResponse(BaseModel):
    """Paginated list of analytics events."""

    items: list[AnalyticsEventResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# GET /analytics/campaigns/{id}/live  (SSE payload)
# ---------------------------------------------------------------------------


class CampaignProgress(BaseModel):
    """Real-time campaign progress snapshot."""

    campaign_id: uuid.UUID
    campaign_status: str
    total: int
    completed: int
    failed: int
    pending: int
    in_progress: int
    completion_percentage: float
