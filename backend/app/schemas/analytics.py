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

    campaigns_by_status: dict[str, int]
    total_contacts_reached: int
    total_calls: int
    total_sms: int
    avg_call_duration_seconds: float | None
    overall_delivery_rate: float | None
    credits_consumed: float
    credits_by_period: list[PeriodCredits]
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
    status_breakdown: dict[str, int]
    completion_rate: float | None
    avg_duration_seconds: float | None
    credit_consumption: float
    hourly_distribution: list[HourlyBucket]
    daily_distribution: list[DailyBucket]
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


# ---------------------------------------------------------------------------
# GET /analytics/dashboard  (dashboard summary)
# ---------------------------------------------------------------------------


class TopCampaign(BaseModel):
    name: str
    success_rate: float


class PlaybackBucket(BaseModel):
    range: str
    count: int


class WeeklyCreditUsage(BaseModel):
    week: str
    message: float
    call: float


class DashboardSummary(BaseModel):
    """Full dashboard summary for the home page."""

    campaigns_by_type: dict[str, int]
    call_outcomes: dict[str, int]
    credits_purchased: float
    credits_topup: float
    top_performing_campaign: TopCampaign | None
    total_credits_used: float
    remaining_credits: float
    total_campaigns: int
    campaigns_breakdown: dict[str, int]
    total_outbound_calls: int
    successful_calls: int
    failed_calls: int
    total_outbound_sms: int
    total_call_duration_seconds: float
    total_owned_numbers: int
    avg_playback_percent: float
    avg_credit_spent: dict[str, float]
    playback_distribution: list[PlaybackBucket]
    credit_usage_over_time: list[WeeklyCreditUsage]


# ---------------------------------------------------------------------------
# GET /analytics/credits  (credit transactions)
# ---------------------------------------------------------------------------


class CreditTransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    org_id: uuid.UUID
    type: str
    credit_type: str
    credit_rate: float
    amount: float
    from_source: str
    campaign_id: uuid.UUID | None
    campaign_name: str | None
    description: str | None
    created_at: datetime


class CreditTransactionListResponse(BaseModel):
    items: list[CreditTransactionResponse]
    total: int
    page: int
    page_size: int
