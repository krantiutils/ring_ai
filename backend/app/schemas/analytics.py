"""Analytics response schemas for playback tracking."""

import uuid

from pydantic import BaseModel


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
