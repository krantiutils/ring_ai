"""Insights service — deep analytics with LLM-generated summaries for campaigns."""

import json
import logging
import uuid
from collections import defaultdict
from datetime import datetime

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.campaign import Campaign
from app.models.contact import Contact
from app.models.interaction import Interaction
from app.schemas.insights import (
    ConversationHighlight,
    InsightsResponse,
    IntentTrendPoint,
    InteractionExport,
    SentimentTrendPoint,
    TopicCluster,
)

logger = logging.getLogger(__name__)

GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

INSIGHTS_SYSTEM_PROMPT = (
    "You are an analytics expert for Ring AI, a voice/SMS campaign platform in Nepal. "
    "Given campaign statistics and sample transcripts, generate a concise insight report.\n\n"
    "Return a JSON object with exactly two fields:\n"
    '- "summary": a 2-4 sentence natural-language summary of the campaign outcomes, '
    "performance, and notable patterns.\n"
    '- "common_themes": a list of 3-6 short theme strings (e.g. "payment inquiries", '
    '"positive reception to promotional offers") that describe recurring conversation topics.\n\n'
    "Base your analysis on the provided data. Be specific about numbers when relevant. "
    "Return ONLY the JSON object, no other text."
)


class InsightsError(Exception):
    """Raised when insights generation fails."""


async def _generate_llm_summary(
    campaign_name: str,
    stats: dict,
    sample_transcripts: list[str],
) -> tuple[str, list[str]]:
    """Call Gemini to generate a campaign summary and common themes.

    Returns:
        Tuple of (summary_text, common_themes_list).

    Raises:
        InsightsError on API or parse failure.
    """
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        logger.warning("GEMINI_API_KEY not configured — returning fallback summary")
        summary = (
            f"Campaign '{campaign_name}' had {stats.get('total_interactions', 0)} interactions "
            f"with a {stats.get('completion_rate', 0):.0%} completion rate. "
            f"Average sentiment was {stats.get('avg_sentiment', 'N/A')}."
        )
        return summary, ["No LLM analysis available — API key not configured"]

    user_content = (
        f"Campaign: {campaign_name}\n"
        f"Total interactions: {stats.get('total_interactions', 0)}\n"
        f"Completed: {stats.get('completed', 0)}\n"
        f"Failed: {stats.get('failed', 0)}\n"
        f"Completion rate: {stats.get('completion_rate', 0):.1%}\n"
        f"Average sentiment score: {stats.get('avg_sentiment', 'N/A')}\n"
        f"Top intents: {stats.get('top_intents', 'N/A')}\n"
        f"Average call duration: {stats.get('avg_duration', 'N/A')} seconds\n\n"
        f"Sample transcripts ({len(sample_transcripts)}):\n"
    )
    for i, t in enumerate(sample_transcripts[:5], 1):
        user_content += f"\n--- Transcript {i} ---\n{t[:500]}\n"

    url = GEMINI_GENERATE_URL.format(model=settings.INTENT_MODEL)

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": INSIGHTS_SYSTEM_PROMPT},
                    {"text": user_content},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 500,
            "responseMimeType": "application/json",
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                url,
                json=payload,
                params={"key": api_key},
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error("Gemini API returned %d: %s", exc.response.status_code, exc.response.text)
        raise InsightsError(f"Gemini API error: {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        logger.error("Gemini API request failed: %s", exc)
        raise InsightsError(f"Gemini API request failed: {exc}") from exc

    try:
        data = response.json()
        content = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        parsed = json.loads(content)
        summary = str(parsed["summary"])
        common_themes = [str(t) for t in parsed["common_themes"]]
    except (KeyError, IndexError, json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.error("Failed to parse insights response: %s", exc)
        raise InsightsError(f"Failed to parse insights response: {exc}") from exc

    return summary, common_themes


def _compute_highlights(
    db: Session,
    campaign_id: uuid.UUID,
) -> list[ConversationHighlight]:
    """Find notable/unusual interactions automatically.

    Criteria:
    - Extremely negative sentiment (< -0.5)
    - Extremely positive sentiment (> 0.7)
    - Unusually long duration (> 2x average)
    - Very short completed calls (< 10 seconds)
    """
    # Get average duration for comparison
    avg_dur = db.execute(
        select(func.avg(Interaction.duration_seconds)).where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.duration_seconds.isnot(None),
        )
    ).scalar_one()
    avg_duration = float(avg_dur) if avg_dur is not None else 30.0

    highlights: list[ConversationHighlight] = []

    # Negative sentiment interactions
    neg_rows = db.execute(
        select(Interaction, Contact)
        .join(Contact, Interaction.contact_id == Contact.id)
        .where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.sentiment_score.isnot(None),
            Interaction.sentiment_score < -0.5,
        )
        .order_by(Interaction.sentiment_score.asc())
        .limit(5)
    ).all()

    for interaction, contact in neg_rows:
        highlights.append(
            ConversationHighlight(
                interaction_id=interaction.id,
                contact_phone=contact.phone,
                reason="extremely_negative_sentiment",
                sentiment_score=interaction.sentiment_score,
                duration_seconds=interaction.duration_seconds,
                transcript_preview=interaction.transcript[:200] if interaction.transcript else None,
            )
        )

    # Positive sentiment interactions
    pos_rows = db.execute(
        select(Interaction, Contact)
        .join(Contact, Interaction.contact_id == Contact.id)
        .where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.sentiment_score.isnot(None),
            Interaction.sentiment_score > 0.7,
        )
        .order_by(Interaction.sentiment_score.desc())
        .limit(5)
    ).all()

    for interaction, contact in pos_rows:
        highlights.append(
            ConversationHighlight(
                interaction_id=interaction.id,
                contact_phone=contact.phone,
                reason="highly_positive_sentiment",
                sentiment_score=interaction.sentiment_score,
                duration_seconds=interaction.duration_seconds,
                transcript_preview=interaction.transcript[:200] if interaction.transcript else None,
            )
        )

    # Unusually long calls (> 2x average)
    if avg_duration > 0:
        long_rows = db.execute(
            select(Interaction, Contact)
            .join(Contact, Interaction.contact_id == Contact.id)
            .where(
                Interaction.campaign_id == campaign_id,
                Interaction.status == "completed",
                Interaction.duration_seconds.isnot(None),
                Interaction.duration_seconds > avg_duration * 2,
            )
            .order_by(Interaction.duration_seconds.desc())
            .limit(5)
        ).all()

        for interaction, contact in long_rows:
            highlights.append(
                ConversationHighlight(
                    interaction_id=interaction.id,
                    contact_phone=contact.phone,
                    reason="unusually_long_duration",
                    sentiment_score=interaction.sentiment_score,
                    duration_seconds=interaction.duration_seconds,
                    transcript_preview=interaction.transcript[:200] if interaction.transcript else None,
                )
            )

    # Very short completed calls (< 10 seconds)
    short_rows = db.execute(
        select(Interaction, Contact)
        .join(Contact, Interaction.contact_id == Contact.id)
        .where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.duration_seconds.isnot(None),
            Interaction.duration_seconds < 10,
        )
        .order_by(Interaction.duration_seconds.asc())
        .limit(5)
    ).all()

    for interaction, contact in short_rows:
        highlights.append(
            ConversationHighlight(
                interaction_id=interaction.id,
                contact_phone=contact.phone,
                reason="very_short_duration",
                sentiment_score=interaction.sentiment_score,
                duration_seconds=interaction.duration_seconds,
                transcript_preview=interaction.transcript[:200] if interaction.transcript else None,
            )
        )

    return highlights


def _compute_topic_clusters(
    db: Session,
    campaign_id: uuid.UUID,
) -> list[TopicCluster]:
    """Group conversations by detected intent / topic."""
    metadata_rows = db.execute(
        select(Interaction.metadata_, Interaction.sentiment_score, Interaction.transcript).where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.metadata_.isnot(None),
        )
    ).all()

    clusters: dict[str, dict] = defaultdict(
        lambda: {
            "count": 0,
            "sentiment_sum": 0.0,
            "sentiment_count": 0,
            "samples": [],
        }
    )

    for meta, sentiment, transcript in metadata_rows:
        if not meta or "detected_intent" not in meta:
            continue
        topic = meta["detected_intent"]
        cluster = clusters[topic]
        cluster["count"] += 1
        if sentiment is not None:
            cluster["sentiment_sum"] += sentiment
            cluster["sentiment_count"] += 1
        if transcript and len(cluster["samples"]) < 3:
            cluster["samples"].append(transcript[:150])

    result = []
    for topic, data in sorted(clusters.items(), key=lambda x: -x[1]["count"]):
        avg_sent = None
        if data["sentiment_count"] > 0:
            avg_sent = round(data["sentiment_sum"] / data["sentiment_count"], 2)
        result.append(
            TopicCluster(
                topic=topic,
                count=data["count"],
                avg_sentiment=avg_sent,
                sample_transcripts=data["samples"],
            )
        )

    return result


def _compute_sentiment_trend(
    db: Session,
    campaign_id: uuid.UUID,
) -> list[SentimentTrendPoint]:
    """Compute daily sentiment averages over time."""
    rows = db.execute(
        select(Interaction.created_at, Interaction.sentiment_score).where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.sentiment_score.isnot(None),
            Interaction.created_at.isnot(None),
        )
    ).all()

    daily: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "count": 0})
    for created_at, score in rows:
        if created_at is not None:
            day = str(created_at.date()) if isinstance(created_at, datetime) else str(created_at)[:10]
            daily[day]["total"] += score
            daily[day]["count"] += 1

    return [
        SentimentTrendPoint(
            date=day,
            avg_sentiment=round(d["total"] / d["count"], 2),
            count=d["count"],
        )
        for day, d in sorted(daily.items())
    ]


def _compute_intent_trend(
    db: Session,
    campaign_id: uuid.UUID,
) -> list[IntentTrendPoint]:
    """Compute daily intent distributions over time."""
    rows = db.execute(
        select(Interaction.created_at, Interaction.metadata_).where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.metadata_.isnot(None),
            Interaction.created_at.isnot(None),
        )
    ).all()

    daily: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for created_at, meta in rows:
        if not meta or "detected_intent" not in meta:
            continue
        if created_at is not None:
            day = str(created_at.date()) if isinstance(created_at, datetime) else str(created_at)[:10]
            daily[day][meta["detected_intent"]] += 1

    return [IntentTrendPoint(date=day, intents=dict(intents)) for day, intents in sorted(daily.items())]


def _build_export_data(
    db: Session,
    campaign_id: uuid.UUID,
) -> list[InteractionExport]:
    """Build detailed interaction export list."""
    rows = db.execute(
        select(Interaction, Contact)
        .join(Contact, Interaction.contact_id == Contact.id)
        .where(Interaction.campaign_id == campaign_id)
        .order_by(Interaction.created_at)
    ).all()

    result = []
    for interaction, contact in rows:
        meta = interaction.metadata_ or {}
        result.append(
            InteractionExport(
                interaction_id=interaction.id,
                contact_phone=contact.phone,
                contact_name=contact.name,
                status=interaction.status,
                started_at=interaction.started_at,
                duration_seconds=interaction.duration_seconds,
                sentiment_score=interaction.sentiment_score,
                detected_intent=meta.get("detected_intent"),
                transcript=interaction.transcript,
            )
        )
    return result


async def generate_campaign_insights(
    db: Session,
    campaign_id: uuid.UUID,
) -> InsightsResponse:
    """Generate comprehensive insights for a campaign.

    Aggregates SQL data, computes highlights/clusters/trends,
    and calls Gemini for an LLM-generated summary.

    Args:
        db: Database session.
        campaign_id: Campaign to analyze.

    Returns:
        InsightsResponse with all insight sections populated.

    Raises:
        ValueError: If campaign not found.
        InsightsError: If LLM summary generation fails.
    """
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found")

    # --- Aggregate stats for LLM prompt ---
    status_rows = db.execute(
        select(Interaction.status, func.count())
        .where(Interaction.campaign_id == campaign_id)
        .group_by(Interaction.status)
    ).all()
    status_counts = {row[0]: row[1] for row in status_rows}
    total = sum(status_counts.values())
    completed = status_counts.get("completed", 0)
    failed = status_counts.get("failed", 0)
    completion_rate = completed / total if total > 0 else 0.0

    avg_sentiment = db.execute(
        select(func.avg(Interaction.sentiment_score)).where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.sentiment_score.isnot(None),
        )
    ).scalar_one()

    avg_dur = db.execute(
        select(func.avg(Interaction.duration_seconds)).where(
            Interaction.campaign_id == campaign_id,
            Interaction.status == "completed",
            Interaction.duration_seconds.isnot(None),
        )
    ).scalar_one()

    # Compute topic clusters (also gives us top intents)
    topic_clusters = _compute_topic_clusters(db, campaign_id)
    top_intents_str = ", ".join(f"{c.topic} ({c.count})" for c in topic_clusters[:5]) or "none detected"

    # Sample transcripts for LLM
    sample_transcripts = (
        db.execute(
            select(Interaction.transcript)
            .where(
                Interaction.campaign_id == campaign_id,
                Interaction.status == "completed",
                Interaction.transcript.isnot(None),
                Interaction.transcript != "",
            )
            .limit(5)
        )
        .scalars()
        .all()
    )

    stats = {
        "total_interactions": total,
        "completed": completed,
        "failed": failed,
        "completion_rate": completion_rate,
        "avg_sentiment": round(float(avg_sentiment), 2) if avg_sentiment is not None else "N/A",
        "top_intents": top_intents_str,
        "avg_duration": round(float(avg_dur), 1) if avg_dur is not None else "N/A",
    }

    # --- LLM summary ---
    try:
        summary, common_themes = await _generate_llm_summary(campaign.name, stats, sample_transcripts)
    except InsightsError:
        logger.exception("LLM summary generation failed for campaign %s", campaign_id)
        summary = (
            f"Campaign '{campaign.name}' processed {total} interactions with a {completion_rate:.0%} completion rate."
        )
        common_themes = ["Summary generation failed — showing raw stats only"]

    # --- Compute remaining sections ---
    highlights = _compute_highlights(db, campaign_id)
    sentiment_trend = _compute_sentiment_trend(db, campaign_id)
    intent_trend = _compute_intent_trend(db, campaign_id)
    interactions = _build_export_data(db, campaign_id)

    return InsightsResponse(
        campaign_id=campaign.id,
        campaign_name=campaign.name,
        summary=summary,
        common_themes=common_themes,
        highlights=highlights,
        topic_clusters=topic_clusters,
        sentiment_trend=sentiment_trend,
        intent_trend=intent_trend,
        interactions=interactions,
    )
