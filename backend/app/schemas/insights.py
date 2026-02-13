"""Pydantic schemas for conversation insights endpoint."""

import uuid
from datetime import datetime

from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------


class InsightsRequest(BaseModel):
    """Request body for POST /analytics/insights."""

    campaign_id: uuid.UUID


# ---------------------------------------------------------------------------
# Response sub-models
# ---------------------------------------------------------------------------


class ConversationHighlight(BaseModel):
    """A single notable/unusual interaction flagged automatically."""

    interaction_id: uuid.UUID
    contact_phone: str
    reason: str  # e.g. "extremely_negative_sentiment", "long_duration", "short_duration"
    sentiment_score: float | None
    duration_seconds: int | None
    transcript_preview: str | None  # first ~200 chars of transcript


class TopicCluster(BaseModel):
    """A group of conversations sharing a detected topic/intent."""

    topic: str
    count: int
    avg_sentiment: float | None
    sample_transcripts: list[str]  # up to 3 short previews


class SentimentTrendPoint(BaseModel):
    """Sentiment aggregated for a single day."""

    date: str  # ISO date
    avg_sentiment: float
    count: int


class IntentTrendPoint(BaseModel):
    """Intent distribution for a single day."""

    date: str  # ISO date
    intents: dict[str, int]  # intent -> count


class InteractionExport(BaseModel):
    """Detailed interaction record for export."""

    interaction_id: uuid.UUID
    contact_phone: str
    contact_name: str | None
    status: str
    started_at: datetime | None
    duration_seconds: int | None
    sentiment_score: float | None
    detected_intent: str | None
    transcript: str | None


# ---------------------------------------------------------------------------
# Response
# ---------------------------------------------------------------------------


class InsightsResponse(BaseModel):
    """Full response for POST /analytics/insights."""

    campaign_id: uuid.UUID
    campaign_name: str

    # LLM-generated summary
    summary: str
    common_themes: list[str]

    # Highlights
    highlights: list[ConversationHighlight]

    # Topic clusters
    topic_clusters: list[TopicCluster]

    # Trends
    sentiment_trend: list[SentimentTrendPoint]
    intent_trend: list[IntentTrendPoint]

    # Export data
    interactions: list[InteractionExport]
