"""Voice call API endpoints — outbound campaign calls via Twilio."""

import logging
import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import Interaction, PhoneNumber, Template
from app.schemas.voice import CampaignCallRequest, CampaignCallResponse, CallStatusResponse
from app.services.telephony import (
    AudioEntry,
    CallContext,
    CallStatus,
    WebhookPayload,
    audio_store,
    call_context_store,
    generate_call_twiml,
    generate_dtmf_response_twiml,
    get_twilio_provider,
)
from app.services.telephony.exceptions import (
    TelephonyConfigurationError,
    TelephonyProviderError,
)
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
            TTSProvider(payload.tts_config.fallback_provider)
            if payload.tts_config.fallback_provider
            else None
        ),
    )

    try:
        tts_result = await tts_router.synthesize(rendered_text, tts_config)
    except TTSError as exc:
        logger.error("TTS synthesis failed for campaign call: %s", exc)
        raise HTTPException(
            status_code=502, detail=f"TTS synthesis failed: {exc}"
        ) from exc

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
            select(PhoneNumber).where(
                PhoneNumber.org_id == template.org_id,
                PhoneNumber.is_active.is_(True),
                PhoneNumber.is_broker.is_(True),
            ).limit(1)
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
            detail="TWILIO_BASE_URL not configured. "
            "Set it to a publicly reachable URL for Twilio callbacks.",
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
    interaction_id = None
    try:
        interaction = Interaction(
            campaign_id=template.org_id,  # placeholder — real campaign ID comes from executor
            contact_id=template.org_id,  # placeholder
            type="outbound_call",
            status="in_progress",
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
async def handle_webhook(request: Request, db: Session = Depends(get_db)):
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
                interaction_status = _CALL_TO_INTERACTION_STATUS.get(
                    call_status, "in_progress"
                )
                interaction.status = interaction_status

                if call_duration:
                    interaction.duration_seconds = int(call_duration)

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
                        from app.services.credits import (
                            COST_PER_INTERACTION as CREDIT_COSTS,
                            refund_credits,
                        )
                        from app.services.campaigns import CAMPAIGN_TYPE_TO_INTERACTION_TYPE

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
