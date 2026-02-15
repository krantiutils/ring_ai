"""Sentiment analysis service — analyze interaction transcripts via LLM."""

import json
import logging
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.interaction import Interaction

logger = logging.getLogger(__name__)

SENTIMENT_SYSTEM_PROMPT = (
    "You are a sentiment analysis expert specializing in Nepali and South Asian conversational contexts. "
    "Analyze the following call transcript and return a JSON object with exactly two fields:\n"
    '- "score": a float from -1.0 (very negative) to +1.0 (very positive), where 0.0 is neutral\n'
    '- "confidence": a float from 0.0 to 1.0 indicating how confident you are in the score\n\n'
    "Consider:\n"
    "- The overall emotional tone of the conversation\n"
    "- Cultural context of Nepali communication patterns\n"
    "- Whether the caller seemed satisfied, frustrated, or neutral\n"
    "- The outcome of the interaction (resolved, unresolved, etc.)\n\n"
    "Return ONLY the JSON object, no other text."
)

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"


class SentimentError(Exception):
    """Raised when sentiment analysis fails."""


class SentimentResult:
    """Result of a sentiment analysis."""

    __slots__ = ("score", "confidence")

    def __init__(self, score: float, confidence: float) -> None:
        if not -1.0 <= score <= 1.0:
            raise ValueError(f"score must be between -1.0 and 1.0, got {score}")
        if not 0.0 <= confidence <= 1.0:
            raise ValueError(f"confidence must be between 0.0 and 1.0, got {confidence}")
        self.score = score
        self.confidence = confidence


async def analyze_sentiment(transcript: str) -> SentimentResult:
    """Analyze sentiment of a transcript using OpenAI.

    Args:
        transcript: The call transcript text to analyze.

    Returns:
        SentimentResult with score and confidence.

    Raises:
        SentimentError: If analysis fails (API error, parse error, etc.).
    """
    if not transcript or not transcript.strip():
        raise SentimentError("Empty transcript — cannot analyze sentiment")

    api_key = settings.OPENAI_API_KEY
    if not api_key:
        raise SentimentError("OPENAI_API_KEY not configured")

    payload = {
        "model": settings.SENTIMENT_MODEL,
        "messages": [
            {"role": "system", "content": SENTIMENT_SYSTEM_PROMPT},
            {"role": "user", "content": transcript},
        ],
        "temperature": 0.0,
        "max_tokens": 100,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                OPENAI_CHAT_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error("OpenAI API returned %d: %s", exc.response.status_code, exc.response.text)
        raise SentimentError(f"OpenAI API error: {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        logger.error("OpenAI API request failed: %s", exc)
        raise SentimentError(f"OpenAI API request failed: {exc}") from exc

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"].strip()
        parsed = json.loads(content)
        score = float(parsed["score"])
        confidence = float(parsed["confidence"])
    except (KeyError, IndexError, json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.error("Failed to parse sentiment response: %s (raw: %s)", exc, content if "content" in dir() else "N/A")
        raise SentimentError(f"Failed to parse sentiment response: {exc}") from exc

    # Clamp values to valid ranges
    score = max(-1.0, min(1.0, score))
    confidence = max(0.0, min(1.0, confidence))

    return SentimentResult(score=score, confidence=confidence)


async def analyze_interaction_sentiment(db: Session, interaction_id: uuid.UUID) -> SentimentResult | None:
    """Analyze sentiment for a single interaction and update the DB record.

    Args:
        db: Database session.
        interaction_id: The interaction to analyze.

    Returns:
        SentimentResult if analysis succeeded, None if skipped.
    """
    if not settings.SENTIMENT_ANALYSIS_ENABLED:
        logger.debug("Sentiment analysis disabled, skipping interaction %s", interaction_id)
        return None

    interaction = db.get(Interaction, interaction_id)
    if interaction is None:
        logger.warning("Interaction %s not found for sentiment analysis", interaction_id)
        return None

    if not interaction.transcript:
        logger.debug("No transcript for interaction %s, skipping sentiment", interaction_id)
        return None

    try:
        result = await analyze_sentiment(interaction.transcript)
    except SentimentError:
        logger.exception("Sentiment analysis failed for interaction %s", interaction_id)
        return None

    interaction.sentiment_score = result.score

    # Store confidence in metadata
    existing_meta = interaction.metadata_ or {}
    existing_meta["sentiment_confidence"] = result.confidence
    interaction.metadata_ = existing_meta

    db.commit()

    logger.info(
        "Sentiment for interaction %s: score=%.2f confidence=%.2f",
        interaction_id,
        result.score,
        result.confidence,
    )

    return result


async def backfill_sentiment(
    db: Session,
    campaign_id: uuid.UUID | None = None,
    *,
    force: bool = False,
) -> dict:
    """Backfill sentiment scores for existing completed interactions with transcripts.

    Args:
        db: Database session.
        campaign_id: If provided, only backfill interactions for this campaign.
        force: If True, re-analyze even if sentiment_score is already set.

    Returns:
        Summary dict with counts of analyzed, skipped, failed interactions.
    """
    if not settings.SENTIMENT_ANALYSIS_ENABLED:
        raise SentimentError("Sentiment analysis is disabled")

    if not settings.OPENAI_API_KEY:
        raise SentimentError("OPENAI_API_KEY not configured")

    filters = [
        Interaction.status == "completed",
        Interaction.transcript.isnot(None),
        Interaction.transcript != "",
    ]

    if campaign_id is not None:
        filters.append(Interaction.campaign_id == campaign_id)

    if not force:
        filters.append(Interaction.sentiment_score.is_(None))

    interactions = db.execute(select(Interaction).where(*filters)).scalars().all()

    analyzed = 0
    skipped = 0
    failed = 0

    for interaction in interactions:
        if not interaction.transcript or not interaction.transcript.strip():
            skipped += 1
            continue

        try:
            result = await analyze_sentiment(interaction.transcript)
            interaction.sentiment_score = result.score

            existing_meta = interaction.metadata_ or {}
            existing_meta["sentiment_confidence"] = result.confidence
            interaction.metadata_ = existing_meta

            analyzed += 1
        except SentimentError:
            logger.exception("Sentiment backfill failed for interaction %s", interaction.id)
            failed += 1

    if analyzed > 0:
        db.commit()

    summary = {
        "total": len(interactions),
        "analyzed": analyzed,
        "skipped": skipped,
        "failed": failed,
    }
    logger.info("Sentiment backfill complete: %s", summary)
    return summary
