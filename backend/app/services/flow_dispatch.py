"""Flow action dispatch — sends SMS, Voice, WhatsApp via Twilio."""

from __future__ import annotations

import asyncio
import logging
import re
import threading
import uuid
from dataclasses import dataclass, field

from app.core.config import settings
from app.services.telephony import get_twilio_provider
from app.services.telephony.exceptions import TelephonyConfigurationError

logger = logging.getLogger(__name__)

_TEMPLATE_RE = re.compile(r"\{\{\s*(\w+)\s*\}\}")


class _FlowScriptStore:
    """Thread-safe store for flow voice call scripts (keyed by call temp ID)."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}
        self._lock = threading.Lock()

    def put(self, call_id: str, script: str) -> None:
        with self._lock:
            self._store[call_id] = script

    def get(self, call_id: str) -> str | None:
        with self._lock:
            return self._store.get(call_id)

    def pop(self, call_id: str) -> str | None:
        with self._lock:
            return self._store.pop(call_id, None)


flow_script_store = _FlowScriptStore()


class _FlowAudioStore:
    """Thread-safe store for synthesized audio bytes (keyed by call temp ID)."""

    def __init__(self) -> None:
        self._store: dict[str, bytes] = {}
        self._lock = threading.Lock()

    def put(self, call_id: str, audio: bytes) -> None:
        with self._lock:
            self._store[call_id] = audio

    def get(self, call_id: str) -> bytes | None:
        with self._lock:
            return self._store.get(call_id)

    def pop(self, call_id: str) -> bytes | None:
        with self._lock:
            return self._store.pop(call_id, None)


flow_audio_store = _FlowAudioStore()

_interactive_session_store: dict[str, dict] = {}


@dataclass
class DispatchResult:
    status: str  # queued, initiated, failed, skipped
    provider_id: str = ""
    error: str = ""


def render_template(template: str, row: dict) -> str:
    """Replace ``{{column}}`` placeholders with values from *row*."""
    def _replace(m: re.Match) -> str:
        return str(row.get(m.group(1), ""))
    return _TEMPLATE_RE.sub(_replace, template)


async def dispatch_sms(provider, row: dict, config: dict) -> DispatchResult:
    """Send an SMS to the contact in *row*."""
    phone = row.get("phone", "")
    if not phone:
        return DispatchResult(status="failed", error="No phone number in contact row")

    body = render_template(str(config.get("message", "")), row)

    try:
        result = await provider.send_sms(
            to=phone,
            from_number=row.get("_from_number") or provider.default_from_number,
            body=body,
        )
        return DispatchResult(status=result.status, provider_id=result.message_id)
    except Exception as exc:
        logger.error("SMS dispatch failed to=%s: %s", phone, exc)
        return DispatchResult(status="failed", error=str(exc))


async def dispatch_voice(
    provider, row: dict, config: dict, *, base_url: str
) -> DispatchResult:
    """Initiate a voice call. Uses TTS if tts_provider is configured, otherwise <Say>."""
    phone = row.get("phone", "")
    if not phone:
        return DispatchResult(status="failed", error="No phone number in contact row")

    script = render_template(str(config.get("script", "")), row)
    temp_id = str(uuid.uuid4())

    tts_provider = config.get("tts_provider", "")
    tts_voice = config.get("tts_voice", "")

    if tts_provider and tts_voice:
        # Synthesize audio via TTS router
        try:
            from app.tts import tts_router
            from app.tts.models import TTSConfig as TTSCfg, TTSProvider as TTSProviderEnum, AudioFormat
            tts_config = TTSCfg(
                provider=TTSProviderEnum(tts_provider),
                voice=tts_voice,
                output_format=AudioFormat.MP3,
            )
            result = await tts_router.synthesize(script, tts_config)
            flow_audio_store.put(temp_id, result.audio_bytes)
        except Exception as exc:
            logger.warning("TTS synthesis failed, falling back to <Say>: %s", exc)
            flow_script_store.put(temp_id, script)
    else:
        flow_script_store.put(temp_id, script)

    twiml_url = f"{base_url}/api/v1/voice/flow-twiml/{temp_id}"
    webhook_url = f"{base_url}/api/v1/voice/webhook"

    try:
        result = await provider.initiate_call(
            to=phone,
            from_number=row.get("_from_number") or provider.default_from_number,
            twiml_url=twiml_url,
            status_callback_url=webhook_url,
        )
        # Re-key stores with real call SID
        stored_script = flow_script_store.pop(temp_id)
        if stored_script:
            flow_script_store.put(result.call_id, stored_script)
        stored_audio = flow_audio_store.pop(temp_id)
        if stored_audio:
            flow_audio_store.put(result.call_id, stored_audio)

        return DispatchResult(
            status=str(result.status.value) if hasattr(result.status, "value") else str(result.status),
            provider_id=result.call_id,
        )
    except Exception as exc:
        logger.error("Voice dispatch failed to=%s: %s", phone, exc)
        flow_script_store.pop(temp_id)
        flow_audio_store.pop(temp_id)
        return DispatchResult(status="failed", error=str(exc))


async def dispatch_whatsapp(provider, row: dict, config: dict) -> DispatchResult:
    """Send a WhatsApp message to the contact in *row*."""
    phone = row.get("phone", "")
    if not phone:
        return DispatchResult(status="failed", error="No phone number in contact row")

    body = render_template(str(config.get("message", "")), row)
    wa_number = row.get("_from_number") or settings.TWILIO_WHATSAPP_NUMBER or provider.default_from_number

    try:
        result = await provider.send_sms(
            to=f"whatsapp:{phone}",
            from_number=f"whatsapp:{wa_number}",
            body=body,
        )
        return DispatchResult(status=result.status, provider_id=result.message_id)
    except Exception as exc:
        logger.error("WhatsApp dispatch failed to=%s: %s", phone, exc)
        return DispatchResult(status="failed", error=str(exc))


async def dispatch_voice_interactive(
    provider, row: dict, config: dict, *, base_url: str
) -> DispatchResult:
    """Initiate an interactive two-way voice call."""
    phone = row.get("phone", "")
    if not phone:
        return DispatchResult(status="failed", error="No phone number in contact row")

    session_id = str(uuid.uuid4())

    system_prompt = render_template(str(config.get("system_prompt", "")), row)

    _interactive_session_store[session_id] = {
        "system_prompt": system_prompt,
        "output_mode": config.get("output_mode", "native_audio"),
        "tts_provider": config.get("tts_provider", "edge_tts"),
        "tts_voice": config.get("tts_voice", ""),
        "knowledge_base_id": config.get("knowledge_base_id", ""),
        "max_duration_minutes": int(config.get("max_duration_minutes", 10)),
    }

    twiml_url = f"{base_url}/api/v1/voice/interactive-twiml/{session_id}"
    webhook_url = f"{base_url}/api/v1/voice/webhook"

    try:
        result = await provider.initiate_call(
            to=phone,
            from_number=row.get("_from_number") or provider.default_from_number,
            twiml_url=twiml_url,
            status_callback_url=webhook_url,
        )
        return DispatchResult(
            status=str(result.status.value) if hasattr(result.status, "value") else str(result.status),
            provider_id=result.call_id,
        )
    except Exception as exc:
        logger.error("Interactive voice dispatch failed to=%s: %s", phone, exc)
        _interactive_session_store.pop(session_id, None)
        return DispatchResult(status="failed", error=str(exc))


def dispatch_action(kind: str, row: dict, config: dict) -> DispatchResult:
    """Synchronous entry point — routes to the right async dispatcher.

    Called by the orchestrator and the Celery task.
    """
    if kind not in ("agent_sms", "agent_voice", "agent_whatsapp", "agent_voice_interactive"):
        return DispatchResult(status="skipped")

    try:
        provider = get_twilio_provider()
    except TelephonyConfigurationError as exc:
        return DispatchResult(status="failed", error=f"Not configured: {exc}")

    loop = _get_or_create_event_loop()

    if kind == "agent_sms":
        return loop.run_until_complete(dispatch_sms(provider, row, config))
    elif kind == "agent_voice":
        base_url = settings.TWILIO_BASE_URL or "http://localhost:8000"
        return loop.run_until_complete(
            dispatch_voice(provider, row, config, base_url=base_url)
        )
    elif kind == "agent_whatsapp":
        return loop.run_until_complete(dispatch_whatsapp(provider, row, config))
    elif kind == "agent_voice_interactive":
        base_url = settings.TWILIO_BASE_URL or "http://localhost:8000"
        return loop.run_until_complete(
            dispatch_voice_interactive(provider, row, config, base_url=base_url)
        )

    return DispatchResult(status="skipped")


def _get_or_create_event_loop() -> asyncio.AbstractEventLoop:
    """Get the running event loop or create a new one for sync contexts."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError
        return loop
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop
