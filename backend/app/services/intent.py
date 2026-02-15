"""Intent detection service — classify caller intent from interaction transcripts via Gemini."""

import json
import logging
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.interaction import Interaction

logger = logging.getLogger(__name__)

# Canonical intent categories.  The LLM is instructed to return one of these.
INTENT_CATEGORIES = [
    "payment",
    "complaint",
    "inquiry",
    "confirmation",
    "opt-out",
    "transfer-request",
    "greeting",
    "follow-up",
    "other",
]

INTENT_SYSTEM_PROMPT = (
    "You are an intent-classification expert specializing in Nepali and South Asian conversational contexts. "
    "Given a call transcript, classify the **primary intent** of the caller.\n\n"
    "You MUST return a JSON object with exactly two fields:\n"
    '- "intent": one of the following categories: ' + ", ".join(f'"{c}"' for c in INTENT_CATEGORIES) + "\n"
    '- "confidence": a float from 0.0 to 1.0 indicating how confident you are\n\n'
    "Rules:\n"
    "- Choose the single best-matching intent for the overall conversation.\n"
    "- If the caller wants to make or discuss a payment: payment\n"
    "- If the caller is unhappy, reporting a problem, or expressing frustration: complaint\n"
    "- If the caller is asking questions or requesting information: inquiry\n"
    "- If the caller is confirming something (appointment, delivery, etc.): confirmation\n"
    "- If the caller wants to stop receiving calls/messages or unsubscribe: opt-out\n"
    "- If the caller asks to be transferred to another person or department: transfer-request\n"
    "- If the conversation is just a greeting with no substantive request: greeting\n"
    "- If the caller is following up on a previous interaction: follow-up\n"
    "- If none of the above fit: other\n\n"
    "Return ONLY the JSON object, no other text."
)

GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class IntentError(Exception):
    """Raised when intent detection fails."""


class IntentResult:
    """Result of an intent classification."""

    __slots__ = ("intent", "confidence")

    def __init__(self, intent: str, confidence: float) -> None:
        if intent not in INTENT_CATEGORIES:
            raise ValueError(f"intent must be one of {INTENT_CATEGORIES}, got {intent!r}")
        if not 0.0 <= confidence <= 1.0:
            raise ValueError(f"confidence must be between 0.0 and 1.0, got {confidence}")
        self.intent = intent
        self.confidence = confidence


async def classify_intent(transcript: str) -> IntentResult:
    """Classify the primary intent of a transcript using Gemini.

    Args:
        transcript: The call transcript text to classify.

    Returns:
        IntentResult with intent category and confidence.

    Raises:
        IntentError: If classification fails (API error, parse error, etc.).
    """
    if not transcript or not transcript.strip():
        raise IntentError("Empty transcript — cannot classify intent")

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise IntentError("GEMINI_API_KEY not configured")

    url = GEMINI_GENERATE_URL.format(model=settings.INTENT_MODEL)

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": INTENT_SYSTEM_PROMPT},
                    {"text": transcript},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 100,
            "responseMimeType": "application/json",
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                json=payload,
                params={"key": api_key},
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Gemini API returned %d: %s",
            exc.response.status_code,
            exc.response.text,
        )
        raise IntentError(f"Gemini API error: {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        logger.error("Gemini API request failed: %s", exc)
        raise IntentError(f"Gemini API request failed: {exc}") from exc

    try:
        data = response.json()
        content = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        parsed = json.loads(content)
        raw_intent = str(parsed["intent"]).lower().strip()
        confidence = float(parsed["confidence"])
    except (KeyError, IndexError, json.JSONDecodeError, TypeError, ValueError) as exc:
        logger.error(
            "Failed to parse intent response: %s (raw: %s)",
            exc,
            content if "content" in dir() else "N/A",
        )
        raise IntentError(f"Failed to parse intent response: {exc}") from exc

    # Normalize: if the model returns something outside our categories, map to "other"
    if raw_intent not in INTENT_CATEGORIES:
        logger.warning("Gemini returned unknown intent %r, mapping to 'other'", raw_intent)
        raw_intent = "other"

    confidence = max(0.0, min(1.0, confidence))

    return IntentResult(intent=raw_intent, confidence=confidence)


async def classify_interaction_intent(db: Session, interaction_id: uuid.UUID) -> IntentResult | None:
    """Classify intent for a single interaction and update the DB record.

    Stores the result in ``Interaction.metadata_`` under keys
    ``"detected_intent"`` and ``"intent_confidence"``.

    Args:
        db: Database session.
        interaction_id: The interaction to classify.

    Returns:
        IntentResult if classification succeeded, None if skipped.
    """
    if not settings.INTENT_ANALYSIS_ENABLED:
        logger.debug("Intent analysis disabled, skipping interaction %s", interaction_id)
        return None

    interaction = db.get(Interaction, interaction_id)
    if interaction is None:
        logger.warning("Interaction %s not found for intent classification", interaction_id)
        return None

    if not interaction.transcript:
        logger.debug("No transcript for interaction %s, skipping intent", interaction_id)
        return None

    try:
        result = await classify_intent(interaction.transcript)
    except IntentError:
        logger.exception("Intent classification failed for interaction %s", interaction_id)
        return None

    existing_meta = interaction.metadata_ or {}
    existing_meta["detected_intent"] = result.intent
    existing_meta["intent_confidence"] = result.confidence
    interaction.metadata_ = existing_meta

    db.commit()

    logger.info(
        "Intent for interaction %s: intent=%s confidence=%.2f",
        interaction_id,
        result.intent,
        result.confidence,
    )

    return result


async def backfill_intents(
    db: Session,
    campaign_id: uuid.UUID | None = None,
    *,
    force: bool = False,
) -> dict:
    """Backfill intent classifications for completed interactions with transcripts.

    Args:
        db: Database session.
        campaign_id: If provided, only backfill interactions for this campaign.
        force: If True, re-classify even if detected_intent is already set.

    Returns:
        Summary dict with counts of classified, skipped, failed interactions.
    """
    if not settings.INTENT_ANALYSIS_ENABLED:
        raise IntentError("Intent analysis is disabled")

    if not settings.GEMINI_API_KEY:
        raise IntentError("GEMINI_API_KEY not configured")

    filters = [
        Interaction.status == "completed",
        Interaction.transcript.isnot(None),
        Interaction.transcript != "",
    ]

    if campaign_id is not None:
        filters.append(Interaction.campaign_id == campaign_id)

    interactions = db.execute(select(Interaction).where(*filters)).scalars().all()

    classified = 0
    skipped = 0
    failed = 0

    for interaction in interactions:
        if not interaction.transcript or not interaction.transcript.strip():
            skipped += 1
            continue

        existing_meta = interaction.metadata_ or {}
        if not force and existing_meta.get("detected_intent"):
            skipped += 1
            continue

        try:
            result = await classify_intent(interaction.transcript)
            existing_meta["detected_intent"] = result.intent
            existing_meta["intent_confidence"] = result.confidence
            interaction.metadata_ = existing_meta
            classified += 1
        except IntentError:
            logger.exception("Intent backfill failed for interaction %s", interaction.id)
            failed += 1

    if classified > 0:
        db.commit()

    summary = {
        "total": len(interactions),
        "classified": classified,
        "skipped": skipped,
        "failed": failed,
    }
    logger.info("Intent backfill complete: %s", summary)
    return summary
