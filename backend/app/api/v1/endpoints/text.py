"""SMS/Text API endpoints — send SMS, delivery status webhook, message status."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import Interaction, Template
from app.schemas.text import SendSmsRequest, SendSmsResponse, SmsStatusResponse
from app.services.telephony import (
    SmsStatus,
    get_twilio_provider,
)
from app.services.telephony.exceptions import (
    TelephonyConfigurationError,
    TelephonyProviderError,
)
from app.services.templates import UndefinedVariableError, render

logger = logging.getLogger(__name__)

router = APIRouter()

# Twilio SMS status → Interaction status mapping
_SMS_TO_INTERACTION_STATUS: dict[SmsStatus, str] = {
    SmsStatus.QUEUED: "in_progress",
    SmsStatus.SENT: "in_progress",
    SmsStatus.DELIVERED: "completed",
    SmsStatus.UNDELIVERED: "failed",
    SmsStatus.FAILED: "failed",
}

# Twilio SMS status string → our SmsStatus enum
_SMS_STATUS_MAP: dict[str, SmsStatus] = {
    "queued": SmsStatus.QUEUED,
    "sent": SmsStatus.SENT,
    "delivered": SmsStatus.DELIVERED,
    "undelivered": SmsStatus.UNDELIVERED,
    "failed": SmsStatus.FAILED,
}

# Terminal SMS statuses that indicate final delivery outcome
_TERMINAL_SMS_STATUSES = {SmsStatus.DELIVERED, SmsStatus.UNDELIVERED, SmsStatus.FAILED}


@router.post("/send", response_model=SendSmsResponse, status_code=201)
async def send_sms(
    payload: SendSmsRequest,
    db: Session = Depends(get_db),
):
    """Send a single SMS message.

    Supports two modes:
    1. Direct message: provide 'message' field with SMS body text.
    2. Template mode: provide 'template_id' and 'variables', template is rendered as SMS body.
    """
    # Resolve message body
    if payload.template_id is not None:
        template = db.get(Template, payload.template_id)
        if template is None:
            raise HTTPException(status_code=404, detail="Template not found")
        if template.type != "text":
            raise HTTPException(
                status_code=422,
                detail=f"Template type must be 'text', got '{template.type}'",
            )
        try:
            body = render(template.content, payload.variables)
        except UndefinedVariableError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Missing required variable: {exc.variable_name}",
            ) from exc
    else:
        body = payload.message

    # Get Twilio provider
    try:
        provider = get_twilio_provider()
    except TelephonyConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    from_number = payload.from_number or provider.default_from_number
    if not from_number:
        raise HTTPException(
            status_code=422,
            detail="No from_number provided and no default Twilio number configured",
        )

    base_url = settings.TWILIO_BASE_URL
    webhook_url = payload.callback_url
    if not webhook_url and base_url:
        webhook_url = f"{base_url}/api/v1/text/webhook"

    # Send SMS
    try:
        result = await provider.send_sms(
            to=payload.to,
            body=body,
            from_number=from_number,
            status_callback_url=webhook_url,
        )
    except TelephonyProviderError as exc:
        logger.error("SMS send failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Create Interaction record (best-effort)
    interaction_id = None
    if payload.campaign_id and payload.contact_id:
        try:
            interaction = Interaction(
                campaign_id=payload.campaign_id,
                contact_id=payload.contact_id,
                type="sms",
                status="in_progress",
                metadata_={
                    "twilio_message_sid": result.message_sid,
                    "sms_body": body,
                },
            )
            db.add(interaction)
            db.commit()
            db.refresh(interaction)
            interaction_id = interaction.id
        except Exception:
            logger.exception(
                "Failed to create Interaction record for SMS %s",
                result.message_sid,
            )
            db.rollback()

    return SendSmsResponse(
        message_sid=result.message_sid,
        status=result.status,
        interaction_id=interaction_id,
    )


@router.post("/webhook")
async def handle_sms_webhook(request: Request, db: Session = Depends(get_db)):
    """Twilio SMS delivery status callback webhook.

    Updates Interaction records based on SMS delivery status.
    Must return 200 quickly to Twilio.
    """
    form_data = await request.form()
    form_dict = dict(form_data)

    message_sid = form_dict.get("MessageSid", "")
    message_status_str = form_dict.get("MessageStatus", "")
    error_code = form_dict.get("ErrorCode")
    error_message = form_dict.get("ErrorMessage")

    logger.info(
        "SMS webhook received: MessageSid=%s Status=%s",
        message_sid,
        message_status_str,
    )

    if not message_sid:
        return {"status": "ignored", "reason": "no MessageSid"}

    sms_status = _SMS_STATUS_MAP.get(message_status_str)
    if sms_status is None:
        logger.warning("Unknown Twilio SMS status: %s", message_status_str)
        return {"status": "ignored", "reason": f"unknown status: {message_status_str}"}

    # Find the Interaction by twilio_message_sid stored in metadata JSONB
    try:
        interaction = db.execute(
            select(Interaction).where(
                Interaction.type == "sms",
                Interaction.metadata_["twilio_message_sid"].as_string() == message_sid,
            )
        ).scalar_one_or_none()

        if interaction:
            interaction_status = _SMS_TO_INTERACTION_STATUS.get(
                sms_status, "in_progress"
            )
            interaction.status = interaction_status

            existing_meta = dict(interaction.metadata_ or {})
            existing_meta["last_webhook_status"] = message_status_str
            if error_code:
                existing_meta["error_code"] = error_code
            if error_message:
                existing_meta["error_message"] = error_message
            interaction.metadata_ = existing_meta

            db.commit()
            logger.info(
                "Updated SMS interaction %s: status=%s",
                interaction.id,
                interaction_status,
            )
    except Exception:
        logger.exception("Failed to update interaction for SMS %s", message_sid)
        db.rollback()

    return {"status": "ok", "sms_status": sms_status.value}


@router.get("/messages/{message_sid}", response_model=SmsStatusResponse)
async def get_sms_status(message_sid: str):
    """Get current status of an SMS message from Twilio."""
    try:
        provider = get_twilio_provider()
    except TelephonyConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        status = await provider.get_sms_status(message_sid)
    except TelephonyProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return SmsStatusResponse(
        message_sid=status.message_sid,
        status=status.status,
        to=status.to,
        from_number=status.from_number,
        body=status.body,
        date_sent=status.date_sent,
        price=status.price,
        error_code=status.error_code,
        error_message=status.error_message,
    )
