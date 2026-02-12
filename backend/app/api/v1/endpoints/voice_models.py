"""Voice models API — list voices, test speak, demo call."""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import Campaign, Contact, Template, VoiceModel
from app.schemas.voice_models import (
    DemoCallRequest,
    TestSpeakRequest,
    TestSpeakResponse,
    VoiceModelResponse,
)
from app.services.telephony import (
    AudioEntry,
    CallContext,
    audio_store,
    call_context_store,
    get_twilio_provider,
)
from app.services.telephony.exceptions import (
    TelephonyConfigurationError,
    TelephonyProviderError,
)
from app.services.templates import UndefinedVariableError, extract_variables, render
from app.tts import tts_router
from app.tts.exceptions import TTSError
from app.tts.models import TTSConfig, TTSProvider

logger = logging.getLogger(__name__)

router = APIRouter()

# Default voices seeded when no VoiceModel rows exist.
# These map to the known Edge TTS + Azure Nepali voices,
# plus display-friendly names matching TingTing's voice list.
DEFAULT_VOICES: list[dict] = [
    {
        "voice_display_name": "Hemkala",
        "voice_internal_name": "ne-NP-HemkalaNeural",
        "provider": "edge_tts",
        "locale": "ne-NP",
        "gender": "Female",
        "is_premium": False,
    },
    {
        "voice_display_name": "Sagar",
        "voice_internal_name": "ne-NP-SagarNeural",
        "provider": "edge_tts",
        "locale": "ne-NP",
        "gender": "Male",
        "is_premium": False,
    },
    {
        "voice_display_name": "Hemkala Premium",
        "voice_internal_name": "ne-NP-HemkalaNeural-azure",
        "provider": "azure",
        "locale": "ne-NP",
        "gender": "Female",
        "is_premium": True,
    },
    {
        "voice_display_name": "Sagar Premium",
        "voice_internal_name": "ne-NP-SagarNeural-azure",
        "provider": "azure",
        "locale": "ne-NP",
        "gender": "Male",
        "is_premium": True,
    },
]


def _seed_default_voices(db: Session) -> list[VoiceModel]:
    """Seed default voices if the table is empty. Returns all voice models."""
    existing = db.query(VoiceModel).all()
    if existing:
        return existing

    models = []
    for voice_data in DEFAULT_VOICES:
        vm = VoiceModel(**voice_data)
        db.add(vm)
        models.append(vm)
    db.commit()
    for vm in models:
        db.refresh(vm)
    return models


def _resolve_voice_internal_name(voice_model: VoiceModel) -> tuple[TTSProvider, str]:
    """Map a VoiceModel to the actual TTS provider enum and voice ID.

    For Azure premium voices, we use the base Azure voice name
    (strip the '-azure' suffix) and route to the Azure provider.
    """
    if voice_model.provider == "azure":
        # Strip the '-azure' suffix to get the real Azure voice name
        real_voice = voice_model.voice_internal_name.removesuffix("-azure")
        return TTSProvider.AZURE, real_voice
    return TTSProvider.EDGE_TTS, voice_model.voice_internal_name


@router.get("/", response_model=list[VoiceModelResponse])
def list_voice_models(db: Session = Depends(get_db)):
    """List available voice models.

    Returns all configured voice models, seeding defaults on first call.
    """
    models = _seed_default_voices(db)
    return models


@router.post(
    "/test-speak/{campaign_id}/",
    response_model=TestSpeakResponse,
    status_code=201,
)
async def test_speak(
    campaign_id: uuid.UUID,
    payload: TestSpeakRequest,
    db: Session = Depends(get_db),
):
    """Synthesize TTS audio for a test message and return the audio URL.

    voice_input is the 1-based index into the voice models list (ordered by
    DB insertion). The caller should use the list from GET /voice-models/ to
    determine the index.
    """
    # Validate campaign exists
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Resolve voice model by index
    voice_models = _seed_default_voices(db)
    voice_idx = payload.voice_input - 1  # 1-based to 0-based
    if voice_idx < 0 or voice_idx >= len(voice_models):
        raise HTTPException(
            status_code=422,
            detail=f"voice_input must be between 1 and {len(voice_models)}",
        )
    voice_model = voice_models[voice_idx]

    tts_provider, voice_name = _resolve_voice_internal_name(voice_model)

    config_kwargs: dict = {
        "provider": tts_provider,
        "voice": voice_name,
    }
    # For Azure, inject credentials from settings
    if tts_provider == TTSProvider.AZURE:
        if not settings.AZURE_TTS_KEY or not settings.AZURE_TTS_REGION:
            # Fall back to edge_tts if Azure not configured
            config_kwargs["provider"] = TTSProvider.EDGE_TTS
            config_kwargs["voice"] = voice_model.voice_internal_name.removesuffix("-azure")
        else:
            config_kwargs["api_key"] = settings.AZURE_TTS_KEY
            config_kwargs["region"] = settings.AZURE_TTS_REGION

    tts_config = TTSConfig(**config_kwargs)

    try:
        tts_result = await tts_router.synthesize(payload.message, tts_config)
    except TTSError as exc:
        logger.error("Test-speak TTS synthesis failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"TTS synthesis failed: {exc}") from exc

    # Store audio temporarily
    audio_id = str(uuid.uuid4())
    audio_store.put(
        audio_id,
        AudioEntry(
            audio_bytes=tts_result.audio_bytes,
            content_type="audio/mpeg",
        ),
    )

    audio_url = f"/api/v1/voice/audio/{audio_id}"
    return TestSpeakResponse(audio_url=audio_url)


@router.post(
    "/demo-call/{campaign_id}/",
    status_code=201,
)
async def demo_call(
    campaign_id: uuid.UUID,
    payload: DemoCallRequest,
    db: Session = Depends(get_db),
):
    """Make a single test call for pre-launch verification.

    Uses the campaign's linked template and voice config to synthesize audio,
    then initiates one outbound call via Twilio.
    """
    if payload.contact_id is None and payload.number is None:
        raise HTTPException(
            status_code=422,
            detail="Either contact_id or number must be provided",
        )

    # Load campaign
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign.template_id is None:
        raise HTTPException(status_code=422, detail="Campaign has no linked template")

    # Load template
    template = db.get(Template, campaign.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Campaign template not found")

    if template.type != "voice":
        raise HTTPException(
            status_code=422,
            detail=f"Template type must be 'voice', got '{template.type}'",
        )

    # Resolve target phone number
    contact_name = "Demo"
    if payload.contact_id is not None:
        contact = db.get(Contact, payload.contact_id)
        if contact is None:
            raise HTTPException(status_code=404, detail="Contact not found")
        to_number = contact.phone
        contact_name = contact.name or "Demo"
    else:
        to_number = payload.number

    # Render template — provide empty variables for any that aren't available
    # For a demo call, use placeholder values for required variables
    variables: dict[str, str] = {"name": contact_name}
    try:
        rendered_text = render(template.content, variables)
    except UndefinedVariableError:
        # For demo calls, fill in missing variables with placeholder text
        # Re-render with all required variables filled
        all_vars = extract_variables(template.content)
        for var in all_vars:
            if var not in variables:
                variables[var] = f"[{var}]"
        rendered_text = render(template.content, variables)

    # Determine TTS config from template voice_config or defaults
    voice_config = template.voice_config or {}
    provider_str = voice_config.get("provider", "edge_tts")
    voice_name = voice_config.get("voice", "ne-NP-HemkalaNeural")
    rate = voice_config.get("rate", "+0%")
    pitch = voice_config.get("pitch", "+0Hz")

    try:
        tts_provider_enum = TTSProvider(provider_str)
    except ValueError:
        tts_provider_enum = TTSProvider.EDGE_TTS

    config_kwargs: dict = {
        "provider": tts_provider_enum,
        "voice": voice_name,
        "rate": rate,
        "pitch": pitch,
    }
    if tts_provider_enum == TTSProvider.AZURE:
        config_kwargs["api_key"] = settings.AZURE_TTS_KEY
        config_kwargs["region"] = settings.AZURE_TTS_REGION

    tts_config = TTSConfig(**config_kwargs)

    try:
        tts_result = await tts_router.synthesize(rendered_text, tts_config)
    except TTSError as exc:
        logger.error("Demo call TTS synthesis failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"TTS synthesis failed: {exc}") from exc

    # Store audio for Twilio to fetch
    audio_id = str(uuid.uuid4())
    audio_store.put(
        audio_id,
        AudioEntry(
            audio_bytes=tts_result.audio_bytes,
            content_type="audio/mpeg",
        ),
    )

    # Resolve Twilio provider
    try:
        provider = get_twilio_provider()
    except TelephonyConfigurationError as exc:
        audio_store.delete(audio_id)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    from_number = provider.default_from_number
    if not from_number:
        audio_store.delete(audio_id)
        raise HTTPException(
            status_code=422,
            detail="No default Twilio phone number configured",
        )

    base_url = settings.TWILIO_BASE_URL
    if not base_url:
        audio_store.delete(audio_id)
        raise HTTPException(
            status_code=503,
            detail="TWILIO_BASE_URL not configured",
        )

    # Create call context
    temp_call_id = str(uuid.uuid4())
    call_context = CallContext(call_id=temp_call_id, audio_id=audio_id)
    call_context_store.put(temp_call_id, call_context)

    twiml_url = f"{base_url}/api/v1/voice/twiml/{temp_call_id}"
    webhook_url = f"{base_url}/api/v1/voice/webhook"

    try:
        result = await provider.initiate_call(
            to=to_number,
            from_number=from_number,
            twiml_url=twiml_url,
            status_callback_url=webhook_url,
        )
    except TelephonyProviderError as exc:
        logger.error("Demo call Twilio initiation failed: %s", exc)
        audio_store.delete(audio_id)
        call_context_store.delete(temp_call_id)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Update context with real call ID
    call_context.call_id = result.call_id
    call_context_store.put(result.call_id, call_context)

    return {
        "call_id": result.call_id,
        "status": result.status.value,
        "to": to_number,
        "message": "Demo call initiated",
    }
