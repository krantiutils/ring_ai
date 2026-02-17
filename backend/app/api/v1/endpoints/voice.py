"""Voice call API endpoints — outbound campaign calls via Twilio."""

import asyncio
import logging
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import Interaction, PhoneNumber, Template
from app.schemas.voice import (
    CallStatusResponse,
    CampaignCallRequest,
    CampaignCallResponse,
    DemoCallMasterOtpRequest,
    DemoCallOtpSendResponse,
    DemoCallOtpVerifyRequest,
    DemoCallRequest,
    DemoCallResponse,
    InteractiveDemoHandoffCallRequest,
    InteractiveDemoMessageRequest,
    InteractiveDemoMessageResponse,
    InteractiveDemoStartRequest,
    InteractiveDemoStartResponse,
)
from app.services.interactive_agent.models import OutputMode, SessionConfig
from app.services.otp import generate_otp
from app.services.telephony import (
    AudioEntry,
    CallContext,
    CallStatus,
    FormCallContext,
    audio_store,
    call_context_store,
    form_call_context_store,
    generate_call_twiml,
    generate_dtmf_response_twiml,
    generate_form_question_twiml,
    get_twilio_provider,
)
from app.services.telephony.exceptions import (
    TelephonyConfigurationError,
    TelephonyProviderError,
)
from app.services.telephony.twilio import generate_form_completion_twiml
from app.services.templates import UndefinedVariableError, render
from app.tts import tts_router
from app.tts.exceptions import TTSError
from app.tts.models import TTSConfig, TTSProvider

logger = logging.getLogger(__name__)

router = APIRouter()

# Twilio status → Interaction status mapping
_CALL_TO_INTERACTION_STATUS: dict[CallStatus, str] = {
    CallStatus.INITIATED: "in_progress",
    CallStatus.QUEUED: "in_progress",
    CallStatus.RINGING: "in_progress",
    CallStatus.IN_PROGRESS: "in_progress",
    CallStatus.COMPLETED: "completed",
    CallStatus.BUSY: "failed",
    CallStatus.NO_ANSWER: "failed",
    CallStatus.CANCELED: "failed",
    CallStatus.FAILED: "failed",
}

_DEMO_OTP_MESSAGE = "Your AgentShakti demo verification code is {otp}. Valid for 5 minutes. Do not share this code."
_MASTER_DEMO_OTP = "34026"
_MASTER_OTP_CALL_MESSAGE = "यो AgentShakti को डेमो कल हो। हामी तपाईंलाई हाम्रो प्लेटफर्म छोटकरीमा देखाउँछौं।"
_DEMO_OTP_LOCK = threading.Lock()
_INTERACTIVE_DEMO_LOCK = threading.Lock()
_INTERACTIVE_DEMO_TTL_SECONDS = 30 * 60
_INTERACTIVE_DEMO_MAX_TURNS = 20


@dataclass
class InteractiveDemoState:
    session_id: str
    expires_at: datetime
    turns: int = 0
    last_assistant_message: str = ""


_INTERACTIVE_DEMO_STORE: dict[str, InteractiveDemoState] = {}


@dataclass
class DemoCallOtpState:
    otp: str
    payload: DemoCallRequest
    expires_at: datetime
    attempts: int = 0


_DEMO_CALL_OTP_STORE: dict[str, DemoCallOtpState] = {}


def _normalize_nepal_phone(phone: str) -> str | None:
    digits = "".join(ch for ch in phone if ch.isdigit())
    if digits.startswith("977") and len(digits) == 13:
        digits = digits[3:]
    if len(digits) == 10 and digits.startswith("9"):
        return digits
    return None


def _cleanup_expired_demo_otps(now: datetime) -> None:
    expired_ids = [req_id for req_id, state in _DEMO_CALL_OTP_STORE.items() if state.expires_at <= now]
    for req_id in expired_ids:
        _DEMO_CALL_OTP_STORE.pop(req_id, None)


def _interactive_demo_system_prompt(language: str) -> str:
    lang = language.strip().lower()
    if lang.startswith("en"):
        language_instruction = "Respond in English unless user asks for another language."
    else:
        language_instruction = "Respond in Nepali by default unless user asks for another language."
    return (
        "You are AgentShakti demo assistant. Keep replies concise, clear, and actionable. "
        "Mention how AgentShakti helps with outbound voice, SMS, surveys, and human handoff when relevant. "
        "End each turn with one clear next action question. "
        f"{language_instruction}"
    )


async def _release_interactive_session(session_id: str, request: Request) -> None:
    session_pool = getattr(request.app.state, "session_pool", None)
    if session_pool is None:
        return
    try:
        await session_pool.release(session_id)
    except Exception:
        logger.exception("Failed to release interactive demo session %s", session_id)


async def _cleanup_expired_interactive_sessions(now: datetime, request: Request) -> None:
    expired: list[str] = []
    with _INTERACTIVE_DEMO_LOCK:
        for session_id, state in _INTERACTIVE_DEMO_STORE.items():
            if state.expires_at <= now:
                expired.append(session_id)
        for session_id in expired:
            _INTERACTIVE_DEMO_STORE.pop(session_id, None)

    for session_id in expired:
        await _release_interactive_session(session_id, request)


async def _send_demo_call_otp_sms(phone: str, otp: str) -> None:
    token = settings.AAKASH_SMS_TOKEN
    if not token:
        raise HTTPException(status_code=503, detail="Aakash OTP SMS is not configured")

    normalized = _normalize_nepal_phone(phone)
    if not normalized:
        raise HTTPException(status_code=422, detail="Phone must be a valid Nepal mobile number")

    payload = {
        "auth_token": token,
        "to": normalized,
        "text": _DEMO_OTP_MESSAGE.format(otp=otp),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(settings.AAKASH_SMS_API_URL, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"OTP SMS delivery failed: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"OTP SMS provider returned invalid JSON: {exc}") from exc

    if data.get("error"):
        msg = data.get("message", "Aakash SMS rejected request")
        raise HTTPException(status_code=502, detail=f"OTP SMS delivery failed: {msg}")
    invalid = (data.get("data") or {}).get("invalid") or []
    if invalid:
        raise HTTPException(status_code=422, detail="OTP SMS delivery failed: invalid phone number")


async def _run_sentiment_analysis(interaction_id: uuid.UUID) -> None:
    """Background task: analyze sentiment for a completed interaction."""
    from app.core.database import SessionLocal
    from app.services.sentiment import analyze_interaction_sentiment

    db = SessionLocal()
    try:
        await analyze_interaction_sentiment(db, interaction_id)
    except Exception:
        logger.exception("Background sentiment analysis failed for %s", interaction_id)
    finally:
        db.close()


async def _place_demo_call(payload: DemoCallRequest) -> DemoCallResponse:
    script_text = f"Namaste {payload.name}. {payload.message}"
    tts_config = TTSConfig(
        provider=TTSProvider(payload.tts_config.provider),
        voice=payload.tts_config.voice,
        rate=payload.tts_config.rate,
        pitch=payload.tts_config.pitch,
        fallback_provider=(
            TTSProvider(payload.tts_config.fallback_provider) if payload.tts_config.fallback_provider else None
        ),
    )

    try:
        tts_result = await tts_router.synthesize(script_text, tts_config)
    except TTSError as exc:
        logger.error("TTS synthesis failed for demo call: %s", exc)
        raise HTTPException(status_code=502, detail=f"TTS synthesis failed: {exc}") from exc

    audio_id = str(uuid.uuid4())
    audio_store.put(
        audio_id,
        AudioEntry(
            audio_bytes=tts_result.audio_bytes,
            content_type="audio/mpeg",
        ),
    )

    try:
        provider = get_twilio_provider()
    except TelephonyConfigurationError as exc:
        audio_store.delete(audio_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    from_number = payload.from_number or provider.default_from_number
    if not from_number:
        audio_store.delete(audio_id)
        raise HTTPException(
            status_code=422,
            detail="No from_number provided and no default Twilio number configured",
        )

    base_url = settings.TWILIO_BASE_URL
    if not base_url:
        audio_store.delete(audio_id)
        raise HTTPException(
            status_code=503,
            detail="TWILIO_BASE_URL not configured. Set a publicly reachable URL for Twilio callbacks.",
        )

    temp_call_id = str(uuid.uuid4())
    call_context_store.put(
        temp_call_id,
        CallContext(
            call_id=temp_call_id,
            audio_id=audio_id,
            dtmf_routes=[],
            record=False,
            record_consent_text=None,
        ),
    )

    twiml_url = f"{base_url}/api/v1/voice/twiml/{temp_call_id}"
    webhook_url = f"{base_url}/api/v1/voice/webhook"

    try:
        result = await provider.initiate_call(
            to=payload.phone,
            from_number=from_number,
            twiml_url=twiml_url,
            status_callback_url=webhook_url,
        )
    except TelephonyProviderError as exc:
        logger.error("Twilio demo call initiation failed: %s", exc)
        audio_store.delete(audio_id)
        call_context_store.delete(temp_call_id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    context = call_context_store.get(temp_call_id)
    if context is not None:
        context.call_id = result.call_id
        call_context_store.put(result.call_id, context)

    return DemoCallResponse(
        call_id=result.call_id,
        status=result.status,
    )


async def _collect_assistant_turn(session, timeout_seconds: float = 25.0) -> str:
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
        raise HTTPException(status_code=504, detail="Interactive agent timed out") from exc

    content = " ".join(part for part in chunks if part)
    if not content:
        content = " ".join(part for part in transcript_chunks if part)
    if not content:
        raise HTTPException(status_code=502, detail="No assistant response received")
    return content.strip()


@router.post("/campaign-call", response_model=CampaignCallResponse, status_code=201)
async def initiate_campaign_call(
    payload: CampaignCallRequest,
    db: Session = Depends(get_db),
):
    """Initiate an outbound broadcast call.

    Flow:
    1. Load and render template with provided variables
    2. Synthesize audio via TTS router
    3. Store audio for Twilio to fetch
    4. Initiate Twilio call pointing to our TwiML endpoint
    5. Create Interaction record
    """
    # 1. Load template
    template = db.get(Template, payload.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    if template.type != "voice":
        raise HTTPException(
            status_code=422,
            detail=f"Template type must be 'voice', got '{template.type}'",
        )

    # 2. Render template with variables
    try:
        rendered_text = render(template.content, payload.variables)
    except UndefinedVariableError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required variable: {exc.variable_name}",
        ) from exc

    # 3. Synthesize TTS audio
    tts_config = TTSConfig(
        provider=TTSProvider(payload.tts_config.provider),
        voice=payload.tts_config.voice,
        rate=payload.tts_config.rate,
        pitch=payload.tts_config.pitch,
        fallback_provider=(
            TTSProvider(payload.tts_config.fallback_provider) if payload.tts_config.fallback_provider else None
        ),
    )

    try:
        tts_result = await tts_router.synthesize(rendered_text, tts_config)
    except TTSError as exc:
        logger.error("TTS synthesis failed for campaign call: %s", exc)
        raise HTTPException(status_code=502, detail=f"TTS synthesis failed: {exc}") from exc

    # 4. Store audio for Twilio to fetch
    audio_id = str(uuid.uuid4())
    audio_store.put(
        audio_id,
        AudioEntry(
            audio_bytes=tts_result.audio_bytes,
            content_type="audio/mpeg",
        ),
    )

    # 5. Resolve Twilio provider and base URL
    try:
        provider = get_twilio_provider()
    except TelephonyConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    from_number = payload.from_number
    if not from_number:
        # Try to resolve from org's broker phone numbers
        broker_phone = db.execute(
            select(PhoneNumber)
            .where(
                PhoneNumber.org_id == template.org_id,
                PhoneNumber.is_active.is_(True),
                PhoneNumber.is_broker.is_(True),
            )
            .limit(1)
        ).scalar_one_or_none()
        if broker_phone is not None:
            from_number = broker_phone.phone_number
        else:
            # Fall back to global default
            from_number = provider.default_from_number
    if not from_number:
        raise HTTPException(
            status_code=422,
            detail="No from_number provided, no broker phone configured for this org, "
            "and no default Twilio number configured",
        )

    base_url = settings.TWILIO_BASE_URL
    if not base_url:
        raise HTTPException(
            status_code=503,
            detail="TWILIO_BASE_URL not configured. Set it to a publicly reachable URL for Twilio callbacks.",
        )

    # Generate a temporary call ID for TwiML URL (will be replaced by Twilio's CallSid)
    temp_call_id = str(uuid.uuid4())

    # Store call context for TwiML generation
    call_context = CallContext(
        call_id=temp_call_id,
        audio_id=audio_id,
        dtmf_routes=payload.dtmf_routes,
        record=payload.record,
        record_consent_text=payload.record_consent_text,
    )
    call_context_store.put(temp_call_id, call_context)

    twiml_url = f"{base_url}/api/v1/voice/twiml/{temp_call_id}"
    webhook_url = payload.callback_url or f"{base_url}/api/v1/voice/webhook"

    # 6. Initiate call via Twilio
    try:
        result = await provider.initiate_call(
            to=payload.to,
            from_number=from_number,
            twiml_url=twiml_url,
            status_callback_url=webhook_url,
        )
    except TelephonyProviderError as exc:
        logger.error("Twilio call initiation failed: %s", exc)
        # Clean up stored audio and context
        audio_store.delete(audio_id)
        call_context_store.delete(temp_call_id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Update context with real Twilio CallSid
    call_context.call_id = result.call_id
    call_context_store.put(result.call_id, call_context)
    # Keep temp_call_id mapping too (TwiML URL uses it)

    # 7. Create Interaction record (best-effort — don't fail the call if DB write fails)
    audio_duration_sec = max(1, tts_result.duration_ms // 1000)
    interaction_id = None
    try:
        interaction = Interaction(
            campaign_id=template.org_id,  # placeholder — real campaign ID comes from executor
            contact_id=template.org_id,  # placeholder
            type="outbound_call",
            status="in_progress",
            audio_duration_seconds=audio_duration_sec,
            metadata_={
                "twilio_call_sid": result.call_id,
                "template_id": str(payload.template_id),
                "audio_id": audio_id,
            },
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)
        interaction_id = interaction.id
        call_context.interaction_id = interaction_id
    except Exception:
        logger.exception("Failed to create Interaction record for call %s", result.call_id)
        db.rollback()

    return CampaignCallResponse(
        call_id=result.call_id,
        status=result.status,
        interaction_id=interaction_id,
    )


@router.post("/demo-call", response_model=DemoCallResponse, status_code=201)
async def initiate_demo_call(payload: DemoCallRequest):
    """Initiate a simple demo call from the homepage experience center.

    This endpoint is intentionally lightweight:
    - Synthesizes the message via TTS
    - Places a Twilio call to the provided phone number
    - Plays the synthesized message and hangs up
    """
    return await _place_demo_call(payload)


@router.post("/demo-call/otp/send", response_model=DemoCallOtpSendResponse, status_code=201)
async def send_demo_call_otp(payload: DemoCallRequest):
    """Send OTP for homepage demo-call verification via Aakash SMS."""
    otp = generate_otp(6)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=settings.DEMO_CALL_OTP_TTL_SECONDS)
    request_id = str(uuid.uuid4())
    sms_status = "sent"

    # Aakash SMS only supports Nepal mobile numbers; non-Nepal numbers can still
    # continue via the master OTP path.
    if _normalize_nepal_phone(payload.phone):
        # Graceful fallback: if SMS token is missing, continue with master OTP path.
        if settings.AAKASH_SMS_TOKEN:
            await _send_demo_call_otp_sms(payload.phone, otp)
        else:
            sms_status = "master_otp_only"
    else:
        sms_status = "master_otp_only"

    with _DEMO_OTP_LOCK:
        _cleanup_expired_demo_otps(now)
        _DEMO_CALL_OTP_STORE[request_id] = DemoCallOtpState(
            otp=otp,
            payload=payload,
            expires_at=expires_at,
        )

    return DemoCallOtpSendResponse(
        request_id=request_id,
        status=sms_status,
        expires_in_seconds=settings.DEMO_CALL_OTP_TTL_SECONDS,
    )


@router.post("/demo-call/otp/verify", response_model=DemoCallResponse, status_code=201)
async def verify_demo_call_otp(payload: DemoCallOtpVerifyRequest):
    """Verify OTP then place the homepage demo call."""
    now = datetime.now(timezone.utc)
    with _DEMO_OTP_LOCK:
        _cleanup_expired_demo_otps(now)
        state = _DEMO_CALL_OTP_STORE.get(payload.request_id)
        if state is None:
            raise HTTPException(status_code=404, detail="OTP request not found or expired")

        provided_otp = payload.otp.strip()
        if provided_otp != state.otp and provided_otp != _MASTER_DEMO_OTP:
            state.attempts += 1
            if state.attempts >= settings.DEMO_CALL_OTP_MAX_ATTEMPTS:
                _DEMO_CALL_OTP_STORE.pop(payload.request_id, None)
                raise HTTPException(status_code=429, detail="OTP attempts exceeded, request a new code")
            raise HTTPException(status_code=422, detail="Invalid OTP")

        _DEMO_CALL_OTP_STORE.pop(payload.request_id, None)
        call_payload = state.payload

    return await _place_demo_call(call_payload)


@router.post("/demo-call/master-otp", response_model=DemoCallResponse, status_code=201)
async def initiate_demo_call_with_master_otp(payload: DemoCallMasterOtpRequest):
    """Directly place demo call via master OTP without OTP-send step."""
    if payload.master_otp.strip() != _MASTER_DEMO_OTP:
        raise HTTPException(status_code=422, detail="Invalid master OTP")

    call_payload = DemoCallRequest(
        name=payload.name,
        phone=payload.phone,
        message=(payload.message.strip() if payload.message else _MASTER_OTP_CALL_MESSAGE),
        from_number=payload.from_number,
        tts_config=payload.tts_config,
    )
    return await _place_demo_call(call_payload)


@router.post("/interactive-demo/start", response_model=InteractiveDemoStartResponse, status_code=201)
async def start_interactive_demo_session(payload: InteractiveDemoStartRequest, request: Request):
    """Start a short-lived interactive chat session backed by Gemini."""
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Interactive demo is not configured")

    now = datetime.now(timezone.utc)
    await _cleanup_expired_interactive_sessions(now, request)

    session_pool = getattr(request.app.state, "session_pool", None)
    if session_pool is None:
        raise HTTPException(status_code=503, detail="Interactive demo is unavailable")

    session_id = uuid.uuid4().hex
    config = SessionConfig(
        session_id=session_id,
        voice_name=payload.voice_name,
        system_instruction=_interactive_demo_system_prompt(payload.language),
        output_mode=OutputMode.HYBRID,
        tool_names=None,
        timeout_minutes=max(2, settings.GEMINI_SESSION_TIMEOUT_MINUTES),
        temperature=0.5,
    )
    try:
        await session_pool.acquire(config=config, timeout=8.0)
    except Exception as exc:
        logger.exception("Failed to start interactive demo session")
        raise HTTPException(status_code=503, detail=f"Could not start interactive session: {exc}") from exc

    with _INTERACTIVE_DEMO_LOCK:
        _INTERACTIVE_DEMO_STORE[session_id] = InteractiveDemoState(
            session_id=session_id,
            expires_at=now + timedelta(seconds=_INTERACTIVE_DEMO_TTL_SECONDS),
        )

    return InteractiveDemoStartResponse(session_id=session_id, status="ready")


@router.post("/interactive-demo/{session_id}/message", response_model=InteractiveDemoMessageResponse)
async def interactive_demo_message(session_id: str, payload: InteractiveDemoMessageRequest, request: Request):
    """Send a user message and return one assistant turn."""
    now = datetime.now(timezone.utc)
    await _cleanup_expired_interactive_sessions(now, request)

    with _INTERACTIVE_DEMO_LOCK:
        state = _INTERACTIVE_DEMO_STORE.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Interactive session not found or expired")

    session_pool = getattr(request.app.state, "session_pool", None)
    session = await session_pool.get_session(session_id) if session_pool else None
    if session is None:
        with _INTERACTIVE_DEMO_LOCK:
            _INTERACTIVE_DEMO_STORE.pop(session_id, None)
        raise HTTPException(status_code=404, detail="Interactive session is not active")

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    await session.send_text(message)
    assistant_message = await _collect_assistant_turn(session)

    should_release = False
    with _INTERACTIVE_DEMO_LOCK:
        fresh = _INTERACTIVE_DEMO_STORE.get(session_id)
        if fresh:
            fresh.turns += 1
            fresh.last_assistant_message = assistant_message
            fresh.expires_at = now + timedelta(seconds=_INTERACTIVE_DEMO_TTL_SECONDS)
            if fresh.turns >= _INTERACTIVE_DEMO_MAX_TURNS:
                _INTERACTIVE_DEMO_STORE.pop(session_id, None)
                should_release = True

    if should_release:
        await _release_interactive_session(session_id, request)

    return InteractiveDemoMessageResponse(session_id=session_id, assistant_message=assistant_message)


@router.post("/interactive-demo/{session_id}/handoff-call", response_model=DemoCallResponse, status_code=201)
async def interactive_demo_handoff_call(
    session_id: str,
    payload: InteractiveDemoHandoffCallRequest,
    request: Request,
):
    """Place a demo call using the latest assistant response or a custom message."""
    now = datetime.now(timezone.utc)
    await _cleanup_expired_interactive_sessions(now, request)

    with _INTERACTIVE_DEMO_LOCK:
        state = _INTERACTIVE_DEMO_STORE.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Interactive session not found or expired")

    message = (payload.message or "").strip() or state.last_assistant_message
    if not message:
        raise HTTPException(status_code=422, detail="No assistant response available for handoff call")

    call_payload = DemoCallRequest(
        name=payload.name,
        phone=payload.phone,
        message=message,
        from_number=payload.from_number,
        tts_config=payload.tts_config,
    )
    return await _place_demo_call(call_payload)


@router.delete("/interactive-demo/{session_id}", status_code=204)
async def interactive_demo_end_session(session_id: str, request: Request):
    """End an interactive demo session and release its Gemini connection."""
    removed = False
    with _INTERACTIVE_DEMO_LOCK:
        if session_id in _INTERACTIVE_DEMO_STORE:
            _INTERACTIVE_DEMO_STORE.pop(session_id, None)
            removed = True

    if removed:
        await _release_interactive_session(session_id, request)
    return Response(status_code=204)


@router.post("/twiml/{call_id}")
async def serve_twiml(call_id: str):
    """TwiML endpoint — Twilio fetches this when a call connects.

    Returns TwiML XML that tells Twilio to play audio, gather DTMF, etc.
    """
    context = call_context_store.get(call_id)
    if context is None:
        logger.warning("TwiML requested for unknown call_id: %s", call_id)
        raise HTTPException(status_code=404, detail="Call context not found")

    base_url = settings.TWILIO_BASE_URL
    audio_url = f"{base_url}/api/v1/voice/audio/{context.audio_id}"
    dtmf_action_url = f"{base_url}/api/v1/voice/dtmf/{call_id}"

    twiml = generate_call_twiml(
        call_context=context,
        audio_url=audio_url,
        dtmf_action_url=dtmf_action_url,
    )

    return PlainTextResponse(content=twiml, media_type="text/xml")


@router.get("/audio/{audio_id}")
async def serve_audio(audio_id: str):
    """Serve synthesized TTS audio to Twilio.

    Twilio calls this URL when it encounters a <Play> verb in TwiML.
    """
    entry = audio_store.get(audio_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Audio not found")

    return Response(
        content=entry.audio_bytes,
        media_type=entry.content_type,
    )


@router.post("/webhook")
async def handle_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Twilio status callback webhook handler.

    Updates the Interaction record with call status, duration, recording URL, etc.
    Must return 200 to Twilio quickly — do not do heavy processing here.
    """
    form_data = await request.form()
    form_dict = dict(form_data)

    call_sid = form_dict.get("CallSid", "")
    call_status_str = form_dict.get("CallStatus", "")
    call_duration = form_dict.get("CallDuration")
    recording_url = form_dict.get("RecordingUrl")

    logger.info(
        "Webhook received: CallSid=%s Status=%s Duration=%s",
        call_sid,
        call_status_str,
        call_duration,
    )

    if not call_sid:
        return {"status": "ignored", "reason": "no CallSid"}

    # Map Twilio status to our CallStatus enum
    status_map = {
        "queued": CallStatus.QUEUED,
        "initiated": CallStatus.INITIATED,
        "ringing": CallStatus.RINGING,
        "in-progress": CallStatus.IN_PROGRESS,
        "completed": CallStatus.COMPLETED,
        "busy": CallStatus.BUSY,
        "no-answer": CallStatus.NO_ANSWER,
        "canceled": CallStatus.CANCELED,
        "failed": CallStatus.FAILED,
    }
    call_status = status_map.get(call_status_str)
    if call_status is None:
        logger.warning("Unknown Twilio status: %s", call_status_str)
        return {"status": "ignored", "reason": f"unknown status: {call_status_str}"}

    # Update Interaction record
    context = call_context_store.get(call_sid)
    if context and context.interaction_id:
        try:
            interaction = db.get(Interaction, context.interaction_id)
            if interaction:
                interaction_status = _CALL_TO_INTERACTION_STATUS.get(call_status, "in_progress")
                interaction.status = interaction_status

                if call_duration:
                    interaction.duration_seconds = int(call_duration)

                    # Calculate playback tracking metrics
                    dur = int(call_duration)
                    if interaction.audio_duration_seconds and interaction.audio_duration_seconds > 0:
                        playback = min(dur, interaction.audio_duration_seconds)
                        interaction.playback_duration_seconds = playback
                        interaction.playback_percentage = min(
                            100.0,
                            (playback / interaction.audio_duration_seconds) * 100,
                        )
                    else:
                        # No audio duration recorded — store call duration as playback
                        interaction.playback_duration_seconds = dur

                if recording_url:
                    interaction.audio_url = recording_url

                # Store full webhook data in metadata
                existing_meta = interaction.metadata_ or {}
                existing_meta["last_webhook_status"] = call_status_str
                if recording_url:
                    existing_meta["recording_url"] = recording_url
                interaction.metadata_ = existing_meta

                db.commit()

                # Refund credits for failed calls that didn't connect
                if interaction_status == "failed" and interaction.campaign_id:
                    try:
                        from app.models.campaign import Campaign
                        from app.services.campaigns import CAMPAIGN_TYPE_TO_INTERACTION_TYPE
                        from app.services.credits import (
                            COST_PER_INTERACTION as CREDIT_COSTS,
                        )
                        from app.services.credits import (
                            refund_credits,
                        )

                        campaign = db.get(Campaign, interaction.campaign_id)
                        if campaign:
                            itype = CAMPAIGN_TYPE_TO_INTERACTION_TYPE.get(campaign.type)
                            cost = CREDIT_COSTS.get(itype, 1.0)
                            refund_credits(
                                db,
                                campaign.org_id,
                                cost,
                                reference_id=str(interaction.id),
                                description=f"Refund for failed call ({call_status_str})",
                            )
                    except Exception:
                        logger.exception(
                            "Failed to refund credits for interaction %s",
                            context.interaction_id,
                        )

                # Trigger sentiment analysis for completed calls with transcripts
                if interaction_status == "completed" and interaction.transcript:
                    background_tasks.add_task(_run_sentiment_analysis, interaction.id)

                logger.info(
                    "Updated interaction %s: status=%s duration=%s",
                    context.interaction_id,
                    interaction_status,
                    call_duration,
                )
        except Exception:
            logger.exception("Failed to update interaction for call %s", call_sid)
            db.rollback()

    # Clean up audio and context on terminal statuses
    if call_status in (
        CallStatus.COMPLETED,
        CallStatus.BUSY,
        CallStatus.NO_ANSWER,
        CallStatus.CANCELED,
        CallStatus.FAILED,
    ):
        if context:
            audio_store.delete(context.audio_id)
            call_context_store.delete(call_sid)
            logger.info("Cleaned up resources for completed call %s", call_sid)

    return {"status": "ok", "call_status": call_status.value}


@router.post("/dtmf/{call_id}")
async def handle_dtmf(call_id: str, request: Request):
    """Handle DTMF keypress from Twilio.

    Twilio POSTs here when a user presses a key during a <Gather>.
    Returns TwiML with the appropriate response for the pressed digit.
    """
    form_data = await request.form()
    digits = form_data.get("Digits", "")

    logger.info("DTMF received: call_id=%s digits=%s", call_id, digits)

    context = call_context_store.get(call_id)
    if context is None:
        logger.warning("DTMF for unknown call_id: %s", call_id)
        raise HTTPException(status_code=404, detail="Call context not found")

    twiml = generate_dtmf_response_twiml(
        digit=str(digits),
        routes=context.dtmf_routes,
    )

    return PlainTextResponse(content=twiml, media_type="text/xml")


@router.get("/calls/{call_id}", response_model=CallStatusResponse)
async def get_call_status(call_id: str):
    """Get current status of a call from Twilio."""
    try:
        provider = get_twilio_provider()
    except TelephonyConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        status = await provider.get_call_status(call_id)
    except TelephonyProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return CallStatusResponse(
        call_id=status.call_id,
        status=status.status,
        duration_seconds=status.duration_seconds,
        price=status.price,
        direction=status.direction,
        from_number=status.from_number,
        to_number=status.to_number,
        started_at=status.started_at,
        ended_at=status.ended_at,
    )


# ---------------------------------------------------------------------------
# Form/survey voice endpoints — multi-step question TwiML flow
# ---------------------------------------------------------------------------


@router.post("/form-twiml/{call_id}/{question_index}")
async def serve_form_question_twiml(call_id: str, question_index: int):
    """Serve TwiML for a specific form question.

    Twilio calls this when the call connects or after an answer is submitted.
    Returns TwiML that plays the question audio and gathers DTMF input.
    """
    ctx = form_call_context_store.get(call_id)
    if ctx is None:
        logger.warning("Form TwiML requested for unknown call_id: %s", call_id)
        raise HTTPException(status_code=404, detail="Form call context not found")

    if question_index >= len(ctx.questions):
        # All questions answered — completion
        twiml = generate_form_completion_twiml()
        return PlainTextResponse(content=twiml, media_type="text/xml")

    question = ctx.questions[question_index]
    base_url = settings.TWILIO_BASE_URL
    audio_id = ctx.audio_ids.get(str(question_index))
    audio_url = f"{base_url}/api/v1/voice/audio/{audio_id}" if audio_id else None
    answer_action_url = f"{base_url}/api/v1/voice/form-answer/{call_id}/{question_index}"

    twiml = generate_form_question_twiml(
        question=question,
        question_index=question_index,
        total_questions=len(ctx.questions),
        audio_url=audio_url,
        answer_action_url=answer_action_url,
    )
    return PlainTextResponse(content=twiml, media_type="text/xml")


@router.post("/form-answer/{call_id}/{question_index}")
async def handle_form_answer(
    call_id: str,
    question_index: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """Handle DTMF answer for a form question.

    Records the answer, advances to the next question, and returns
    redirect TwiML to the next question (or completion).
    """
    form_data = await request.form()
    digits = form_data.get("Digits", "")

    logger.info(
        "Form answer received: call_id=%s q=%d digits=%s",
        call_id,
        question_index,
        digits,
    )

    ctx = form_call_context_store.get(call_id)
    if ctx is None:
        logger.warning("Form answer for unknown call_id: %s", call_id)
        raise HTTPException(status_code=404, detail="Form call context not found")

    if question_index < len(ctx.questions):
        question = ctx.questions[question_index]
        answer = _map_dtmf_to_answer(question, str(digits))
        ctx.answers[str(question_index)] = answer
        form_call_context_store.put(call_id, ctx)

    next_index = question_index + 1

    if next_index >= len(ctx.questions):
        # All questions answered — save response and complete
        _save_form_response(ctx, db)

        # Clean up audio entries for this form call
        for audio_id in ctx.audio_ids.values():
            audio_store.delete(audio_id)

        twiml = generate_form_completion_twiml()
        return PlainTextResponse(content=twiml, media_type="text/xml")

    # Redirect to next question
    base_url = settings.TWILIO_BASE_URL
    next_url = f"{base_url}/api/v1/voice/form-twiml/{call_id}/{next_index}"

    from twilio.twiml.voice_response import VoiceResponse

    response = VoiceResponse()
    response.redirect(next_url)
    return PlainTextResponse(content=str(response), media_type="text/xml")


def _map_dtmf_to_answer(question: dict, digits: str) -> str:
    """Map DTMF digit(s) to an answer value based on question type."""
    q_type = question.get("type", "text_input")

    if q_type == "multiple_choice":
        options = question.get("options", [])
        try:
            idx = int(digits) - 1
            if 0 <= idx < len(options):
                return options[idx]
        except (ValueError, IndexError):
            pass
        return digits

    elif q_type == "rating":
        return digits

    elif q_type == "yes_no":
        if digits == "1":
            return "yes"
        elif digits == "2":
            return "no"
        return digits

    elif q_type == "numeric":
        return digits

    return digits


def _save_form_response(ctx: FormCallContext, db: Session) -> None:
    """Save accumulated form answers as a FormResponse record."""
    from datetime import datetime, timezone

    from app.models.form_response import FormResponse

    try:
        form_response = FormResponse(
            form_id=ctx.form_id,
            contact_id=ctx.contact_id,
            answers=ctx.answers,
            completed_at=datetime.now(timezone.utc),
        )
        db.add(form_response)
        db.commit()
        logger.info(
            "Saved form response for form=%s contact=%s",
            ctx.form_id,
            ctx.contact_id,
        )
    except Exception:
        logger.exception(
            "Failed to save form response for form=%s contact=%s",
            ctx.form_id,
            ctx.contact_id,
        )
        db.rollback()
