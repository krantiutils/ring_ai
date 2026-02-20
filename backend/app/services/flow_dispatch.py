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
            from_number=provider.default_from_number,
            body=body,
        )
        return DispatchResult(status=result.status, provider_id=result.message_id)
    except Exception as exc:
        logger.error("SMS dispatch failed to=%s: %s", phone, exc)
        return DispatchResult(status="failed", error=str(exc))


async def dispatch_voice(
    provider, row: dict, config: dict, *, base_url: str
) -> DispatchResult:
    """Initiate a voice call to the contact in *row*.

    Uses Twilio <Say> TwiML for the script. The TwiML is served via the
    existing ``/api/v1/voice/flow-twiml/{call_id}`` endpoint (added by this
    feature) so Twilio can fetch it when the call connects.
    """
    phone = row.get("phone", "")
    if not phone:
        return DispatchResult(status="failed", error="No phone number in contact row")

    script = render_template(str(config.get("script", "")), row)

    temp_id = str(uuid.uuid4())
    flow_script_store.put(temp_id, script)

    twiml_url = f"{base_url}/api/v1/voice/flow-twiml/{temp_id}"
    webhook_url = f"{base_url}/api/v1/voice/webhook"

    try:
        result = await provider.initiate_call(
            to=phone,
            from_number=provider.default_from_number,
            twiml_url=twiml_url,
            status_callback_url=webhook_url,
        )
        # Re-key script store with real call SID
        stored = flow_script_store.pop(temp_id)
        if stored:
            flow_script_store.put(result.call_id, stored)

        return DispatchResult(
            status=str(result.status.value) if hasattr(result.status, "value") else str(result.status),
            provider_id=result.call_id,
        )
    except Exception as exc:
        logger.error("Voice dispatch failed to=%s: %s", phone, exc)
        flow_script_store.pop(temp_id)
        return DispatchResult(status="failed", error=str(exc))


async def dispatch_whatsapp(provider, row: dict, config: dict) -> DispatchResult:
    """Send a WhatsApp message to the contact in *row*."""
    phone = row.get("phone", "")
    if not phone:
        return DispatchResult(status="failed", error="No phone number in contact row")

    body = render_template(str(config.get("message", "")), row)
    wa_number = settings.TWILIO_WHATSAPP_NUMBER
    if not wa_number:
        wa_number = provider.default_from_number

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


def dispatch_action(kind: str, row: dict, config: dict) -> DispatchResult:
    """Synchronous entry point — routes to the right async dispatcher.

    Called by the orchestrator and the Celery task.
    """
    if kind not in ("agent_sms", "agent_voice", "agent_whatsapp"):
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
