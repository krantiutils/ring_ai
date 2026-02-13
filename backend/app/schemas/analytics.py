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

    # Sentiment
    avg_sentiment_score: float | None

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

    # Sentiment
    avg_sentiment_score: float | None

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


# ---------------------------------------------------------------------------
# Playback tracking schemas
# ---------------------------------------------------------------------------


class PlaybackBucket(BaseModel):
    """A single bucket in the playback distribution."""

    bucket: str
    count: int


class ContactPlayback(BaseModel):
    """Per-contact playback data within a campaign."""

    contact_id: uuid.UUID
    contact_phone: str
    contact_name: str | None
    playback_duration_seconds: int | None
    playback_percentage: float | None
    audio_duration_seconds: int | None
    call_duration_seconds: int | None
    status: str


class CampaignPlaybackDetail(BaseModel):
    """Detailed playback data for a campaign — per-contact breakdown + aggregates."""

    campaign_id: uuid.UUID
    avg_playback_percentage: float | None
    avg_playback_duration_seconds: float | None
    contacts: list[ContactPlayback]


class PlaybackDistribution(BaseModel):
    """Playback distribution across 4 buckets for a campaign."""

    campaign_id: uuid.UUID
    buckets: list[PlaybackBucket]


class DashboardPlaybackWidget(BaseModel):
    """Dashboard widget data: org-wide average playback and distribution."""

    avg_playback_percentage: float | None
    total_completed_calls: int
    distribution: list[PlaybackBucket]


# ---------------------------------------------------------------------------
# Sentiment analysis schemas
# ---------------------------------------------------------------------------


class SentimentBackfillResponse(BaseModel):
    """Response from sentiment backfill operation."""

    total: int
    analyzed: int
    skipped: int
    failed: int


class CampaignSentimentSummary(BaseModel):
    """Sentiment summary for a campaign."""

    campaign_id: uuid.UUID
    avg_sentiment_score: float | None
    positive_count: int  # score > 0.3
    neutral_count: int  # -0.3 <= score <= 0.3
    negative_count: int  # score < -0.3
    analyzed_count: int  # total with sentiment_score set
