"""WhatsApp demo bridge endpoints.

Demo-grade interactive messaging flow:
user text -> assistant response -> WhatsApp outbound delivery.
Uses Twilio WhatsApp when configured; otherwise simulated delivery.
"""

import asyncio
import logging
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response

from app.core.config import settings
from app.schemas.whatsapp import (
    WhatsAppDemoMessageRequest,
    WhatsAppDemoMessageResponse,
    WhatsAppDemoSessionCreateRequest,
    WhatsAppDemoSessionCreateResponse,
    WhatsAppDemoSessionInfoResponse,
)
from app.services.interactive_agent.models import OutputMode, SessionConfig
from app.services.telephony import get_twilio_provider
from app.services.telephony.exceptions import TelephonyConfigurationError, TelephonyProviderError

logger = logging.getLogger(__name__)
router = APIRouter()

_LOCK = threading.Lock()
_TTL_SECONDS = 30 * 60
_MAX_TURNS = 20


@dataclass
class WhatsAppDemoState:
    session_id: str
    created_at: datetime
    expires_at: datetime
    language: str
    provider: str
    from_number: str | None = None
    to_number: str | None = None
    turns: int = 0
    last_assistant_message: str = ""


_STORE: dict[str, WhatsAppDemoState] = {}


def _with_whatsapp_prefix(number: str) -> str:
    raw = number.strip()
    if raw.lower().startswith("whatsapp:"):
        return raw
    return f"whatsapp:{raw}"


def _assistant_system_prompt(language: str) -> str:
    lang = language.strip().lower()
    if lang.startswith("en"):
        language_instruction = "Respond in English unless user asks for another language."
    else:
        language_instruction = "Respond in Nepali by default unless user asks for another language."
    return (
        "You are AgentShakti WhatsApp demo assistant. Keep replies concise and practical. "
        "Mention voice, SMS, survey, and human handoff capabilities when relevant. "
        f"{language_instruction}"
    )


def _fallback_reply(message: str, language: str) -> str:
    cleaned = message.strip()
    if language.strip().lower().startswith("en"):
        return (
            f"I heard: \"{cleaned}\". AgentShakti can automate WhatsApp follow-ups, outbound calls, "
            "two-way SMS, and handoff to human agents in one workflow."
        )
    return (
        f"मैले बुझें: \"{cleaned}\"। AgentShakti ले WhatsApp follow-up, outbound call, "
        "two-way SMS, र human handoff एउटै workflow बाट चलाउन मद्दत गर्छ।"
    )


async def _release_session(session_id: str, request: Request) -> None:
    session_pool = getattr(request.app.state, "session_pool", None)
    if session_pool is None:
        return
    try:
        await session_pool.release(session_id)
    except Exception:
        logger.exception("Failed to release WhatsApp demo session %s", session_id)


async def _cleanup_expired(now: datetime, request: Request) -> None:
    expired: list[str] = []
    with _LOCK:
        for session_id, state in _STORE.items():
            if state.expires_at <= now:
                expired.append(session_id)
        for session_id in expired:
            _STORE.pop(session_id, None)
    for session_id in expired:
        await _release_session(session_id, request)


async def _assistant_turn(session, timeout_seconds: float = 25.0) -> str:
    chunks: list[str] = []
    transcript_chunks: list[str] = []
    try:
        async with asyncio.timeout(timeout_seconds):
            async for response in session.receive():
                if response.text:
                    chunks.append(response.text.strip())
                elif response.output_transcript:
                    transcript_chunks.append(response.output_transcript.strip())
                if response.is_turn_complete:
                    break
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Interactive assistant timed out") from exc

    content = " ".join(part for part in chunks if part)
    if not content:
        content = " ".join(part for part in transcript_chunks if part)
    if not content:
        raise HTTPException(status_code=502, detail="No assistant response received")
    return content.strip()


@router.post("/demo/session", response_model=WhatsAppDemoSessionCreateResponse, status_code=201)
async def create_demo_session(payload: WhatsAppDemoSessionCreateRequest, request: Request):
    now = datetime.now(timezone.utc)
    await _cleanup_expired(now, request)

    session_id = uuid.uuid4().hex
    provider = "fallback"

    if settings.GEMINI_API_KEY:
        session_pool = getattr(request.app.state, "session_pool", None)
        if session_pool is None:
            raise HTTPException(status_code=503, detail="Interactive session pool unavailable")
        config = SessionConfig(
            session_id=session_id,
            voice_name=payload.voice_name,
            system_instruction=_assistant_system_prompt(payload.language),
            output_mode=OutputMode.HYBRID,
            tool_names=None,
            timeout_minutes=max(2, settings.GEMINI_SESSION_TIMEOUT_MINUTES),
            temperature=0.5,
        )
        try:
            await session_pool.acquire(config=config, timeout=8.0)
            provider = "gemini"
        except Exception as exc:
            logger.warning("Gemini unavailable for WhatsApp demo; using fallback: %s", exc)
            provider = "fallback"

    with _LOCK:
        _STORE[session_id] = WhatsAppDemoState(
            session_id=session_id,
            created_at=now,
            expires_at=now + timedelta(seconds=_TTL_SECONDS),
            language=payload.language,
            provider=provider,
            from_number=payload.from_number,
            to_number=payload.to_number,
        )

    return WhatsAppDemoSessionCreateResponse(
        session_id=session_id,
        provider=provider,
        status="ready",
        created_at=now,
    )


@router.get("/demo/session/{session_id}", response_model=WhatsAppDemoSessionInfoResponse)
async def get_demo_session(session_id: str, request: Request):
    await _cleanup_expired(datetime.now(timezone.utc), request)
    with _LOCK:
        state = _STORE.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")
    return WhatsAppDemoSessionInfoResponse(
        session_id=state.session_id,
        provider=state.provider,
        status="ready",
        turns=state.turns,
        last_assistant_message=state.last_assistant_message or None,
        created_at=state.created_at,
        expires_at=state.expires_at,
    )


@router.post("/demo/session/{session_id}/message", response_model=WhatsAppDemoMessageResponse)
async def send_demo_message(session_id: str, payload: WhatsAppDemoMessageRequest, request: Request):
    now = datetime.now(timezone.utc)
    await _cleanup_expired(now, request)
    with _LOCK:
        state = _STORE.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    if state.provider == "gemini":
        session_pool = getattr(request.app.state, "session_pool", None)
        session = await session_pool.get_session(session_id) if session_pool else None
        if session is None:
            with _LOCK:
                _STORE.pop(session_id, None)
            raise HTTPException(status_code=404, detail="Session inactive")
        await session.send_text(message)
        assistant_message = await _assistant_turn(session)
    else:
        assistant_message = _fallback_reply(message, state.language)

    from_number = payload.from_number or state.from_number
    to_number = payload.to_number or state.to_number
    delivery_status = "simulated"
    delivery_id: str | None = None

    if from_number and to_number:
        try:
            twilio = get_twilio_provider()
            sms_result = await twilio.send_sms(
                to=_with_whatsapp_prefix(to_number),
                from_number=_with_whatsapp_prefix(from_number),
                body=assistant_message,
            )
            delivery_status = sms_result.status or "sent"
            delivery_id = sms_result.message_id
        except (TelephonyConfigurationError, TelephonyProviderError) as exc:
            logger.warning("WhatsApp delivery fallback to simulated: %s", exc)
            delivery_status = "simulated"

    should_release = False
    with _LOCK:
        fresh = _STORE.get(session_id)
        if fresh:
            fresh.turns += 1
            fresh.last_assistant_message = assistant_message
            fresh.expires_at = now + timedelta(seconds=_TTL_SECONDS)
            fresh.from_number = from_number
            fresh.to_number = to_number
            if fresh.turns >= _MAX_TURNS:
                _STORE.pop(session_id, None)
                should_release = fresh.provider == "gemini"
    if should_release:
        await _release_session(session_id, request)

    return WhatsAppDemoMessageResponse(
        session_id=session_id,
        assistant_message=assistant_message,
        provider=state.provider,
        delivery_status=delivery_status,
        delivery_id=delivery_id,
    )


@router.delete("/demo/session/{session_id}", status_code=204)
async def end_demo_session(session_id: str, request: Request):
    removed: WhatsAppDemoState | None = None
    with _LOCK:
        removed = _STORE.pop(session_id, None)
    if removed and removed.provider == "gemini":
        await _release_session(session_id, request)
    return Response(status_code=204)

