"""OTP API endpoints — send and list OTPs via voice or text."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.otp import OTPRecord
from app.schemas.otp import (
    OTPListResponse,
    OTPSendRequest,
    OTPSendResponse,
)
from app.services.otp import (
    OTPDeliveryError,
    OTPValidationError,
    generate_otp,
    send_otp_sms,
    send_otp_voice,
)
from app.services.telephony.exceptions import TelephonyConfigurationError

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/send", response_model=OTPSendResponse, status_code=201)
async def send_otp(
    payload: OTPSendRequest,
    db: Session = Depends(get_db),
):
    """Send an OTP to a phone number via SMS or voice call.

    - If otp_options='personnel', the caller must provide an OTP value.
    - If otp_options='generated', a random numeric OTP is auto-generated.
    - The {otp} placeholder in the message is replaced with the actual OTP.
    - For voice delivery, the message is synthesized via TTS and played in a call.
    - For text delivery, the message is sent as an SMS.
    """
    # Validate personnel OTP
    if payload.otp_options == "personnel":
        if not payload.otp:
            raise HTTPException(
                status_code=422,
                detail="otp field is required when otp_options='personnel'",
            )
        otp_value = payload.otp
    else:
        try:
            otp_value = generate_otp(payload.otp_length)
        except OTPValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Validate voice_input for voice delivery
    if payload.sms_send_options == "voice" and payload.voice_input is None:
        raise HTTPException(
            status_code=422,
            detail="voice_input is required when sms_send_options='voice'",
        )

    # Substitute {otp} placeholder in the message
    message_body = payload.message.replace("{otp}", otp_value)

    # Deliver OTP
    try:
        if payload.sms_send_options == "text":
            delivery_id = await send_otp_sms(
                to=payload.number,
                message_body=message_body,
            )
        else:
            delivery_id = await send_otp_voice(
                to=payload.number,
                message_body=message_body,
                voice_input=payload.voice_input,
            )
    except TelephonyConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except OTPDeliveryError as exc:
        logger.error("OTP delivery failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Persist OTP record
    record = OTPRecord(
        org_id=payload.org_id,
        phone_number=payload.number,
        message=message_body,
        otp=otp_value,
        otp_options=payload.otp_options,
        sms_send_options=payload.sms_send_options,
        voice_input=payload.voice_input,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    logger.info(
        "OTP sent: id=%s phone=%s method=%s delivery_id=%s",
        record.id,
        payload.number,
        payload.sms_send_options,
        delivery_id,
    )

    return OTPSendResponse(
        id=record.id,
        otp=otp_value,
        status="sent",
        message=f"OTP sent via {payload.sms_send_options}",
    )


@router.get("/list", response_model=OTPListResponse)
def list_otps(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List sent OTPs with pagination."""
    count_query = select(func.count()).select_from(OTPRecord)
    total = db.execute(count_query).scalar_one()

    offset = (page - 1) * page_size
    query = select(OTPRecord).order_by(OTPRecord.created_at.desc()).offset(offset).limit(page_size)
    records = db.execute(query).scalars().all()

    return OTPListResponse(
        items=records,
        total=total,
        page=page,
        page_size=page_size,
    )
