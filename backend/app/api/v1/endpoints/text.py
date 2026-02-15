"""SMS/Text API endpoints — two-way SMS with conversation threading.

Endpoints:
    POST /send              — Send an outbound SMS
    POST /webhook           — Twilio inbound SMS webhook
    POST /status            — Twilio delivery status webhook
    GET  /conversations     — List SMS conversations for an org
    GET  /conversations/{id}/messages — Messages in a conversation
    PUT  /conversations/{id}/handoff  — Update conversation status (handoff/close)
    GET  /contacts/{id}/history       — SMS history for a contact
    POST /auto-response-rules         — Create auto-response rule
    GET  /auto-response-rules         — List auto-response rules for an org
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.auto_response_rule import AutoResponseRule
from app.models.contact import Contact
from app.models.sms_conversation import SmsConversation
from app.models.sms_message import SmsMessage
from app.schemas.text import (
    AutoResponseRuleCreateRequest,
    AutoResponseRuleListResponse,
    AutoResponseRuleResponse,
    ConversationHandoffRequest,
    ConversationListResponse,
    ConversationResponse,
    MessageListResponse,
    SmsSendRequest,
    SmsSendResponse,
)
from app.services.sms import (
    SmsServiceError,
    check_handoff_needed,
    find_contact_by_phone,
    find_or_create_conversation,
    flag_for_handoff,
    match_auto_response,
    record_inbound_message,
    resolve_org_from_twilio_number,
    send_sms_message,
    update_message_status,
)
from app.services.telephony.exceptions import (
    TelephonyConfigurationError,
    TelephonyProviderError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /send — Send an outbound SMS
# ---------------------------------------------------------------------------


@router.post("/send", response_model=SmsSendResponse, status_code=201)
async def send_sms(
    payload: SmsSendRequest,
    db: Session = Depends(get_db),
):
    """Send an outbound SMS message.

    Finds or creates a conversation thread for the org+contact,
    sends the message via Twilio, and records it in the database.
    """
    # Resolve contact — must exist in the org
    contact = find_contact_by_phone(db, payload.to, org_id=payload.org_id)
    if contact is None:
        raise HTTPException(
            status_code=404,
            detail=f"Contact with phone '{payload.to}' not found in org {payload.org_id}",
        )

    # Build status callback URL for delivery tracking
    base_url = settings.TWILIO_BASE_URL
    status_callback = f"{base_url}/api/v1/text/status" if base_url else None

    try:
        message = await send_sms_message(
            db=db,
            org_id=payload.org_id,
            contact_id=contact.id,
            to=payload.to,
            body=payload.body,
            from_number=payload.from_number,
            status_callback=status_callback,
        )
    except TelephonyConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except TelephonyProviderError as exc:
        logger.error("SMS send failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except SmsServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return SmsSendResponse(
        message_id=message.id,
        twilio_sid=message.twilio_sid or "",
        conversation_id=message.conversation_id,
        status=message.status,
    )


# ---------------------------------------------------------------------------
# POST /webhook — Twilio inbound SMS webhook
# ---------------------------------------------------------------------------


@router.post("/webhook")
async def handle_inbound_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """Handle inbound SMS from Twilio.

    Twilio POSTs form-encoded data when an SMS is received.
    This endpoint:
    1. Records the inbound message
    2. Checks for handoff keywords → flags conversation
    3. Checks auto-response rules → sends auto-reply if matched
    4. Returns empty TwiML (or TwiML with auto-response)
    """
    form_data = await request.form()
    form_dict = dict(form_data)

    message_sid = form_dict.get("MessageSid", "")
    from_number = form_dict.get("From", "")
    to_number = form_dict.get("To", "")
    body = form_dict.get("Body", "")

    logger.info(
        "Inbound SMS: sid=%s from=%s to=%s body_len=%d",
        message_sid,
        from_number,
        to_number,
        len(body),
    )

    if not message_sid or not from_number:
        return PlainTextResponse(
            content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
            media_type="text/xml",
        )

    # Resolve org from the Twilio number that received the message
    org_id = resolve_org_from_twilio_number(db, to_number)

    # Find or create the contact (inbound may come from unknown numbers)
    contact = find_contact_by_phone(db, from_number, org_id=org_id)
    if contact is None and org_id is not None:
        # Create a new contact for this inbound sender
        contact = Contact(
            org_id=org_id,
            phone=from_number,
        )
        db.add(contact)
        db.flush()
        logger.info("Created new contact for inbound SMS: phone=%s org=%s", from_number, org_id)

    if contact is None or org_id is None:
        # Cannot thread without org context — log and return empty TwiML
        logger.warning(
            "Inbound SMS from %s to %s — cannot resolve org, ignoring",
            from_number,
            to_number,
        )
        return PlainTextResponse(
            content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
            media_type="text/xml",
        )

    # Find or create conversation
    conversation = find_or_create_conversation(db, org_id, contact.id)

    # Record the inbound message
    record_inbound_message(
        db=db,
        conversation=conversation,
        body=body,
        from_number=from_number,
        to_number=to_number,
        twilio_sid=message_sid,
    )

    # Check for handoff keywords
    if check_handoff_needed(body):
        flag_for_handoff(db, conversation)

    # Check auto-response rules
    twiml_body = ""
    rule = match_auto_response(db, org_id, body)
    if rule is not None:
        twiml_body = rule.response_template
        # Record the auto-response as an outbound message
        auto_msg = SmsMessage(
            conversation_id=conversation.id,
            direction="outbound",
            body=twiml_body,
            from_number=to_number,
            to_number=from_number,
            status="sent",
        )
        db.add(auto_msg)
        logger.info(
            "Auto-response triggered: rule=%s conv=%s keyword='%s'",
            rule.id,
            conversation.id,
            rule.keyword,
        )

    db.commit()

    # Return TwiML — with auto-response Message if applicable
    if twiml_body:
        twiml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{twiml_body}</Message></Response>'
    else:
        twiml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

    return PlainTextResponse(content=twiml, media_type="text/xml")


# ---------------------------------------------------------------------------
# POST /status — Twilio delivery status webhook
# ---------------------------------------------------------------------------


@router.post("/status")
async def handle_status_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """Handle SMS delivery status updates from Twilio.

    Twilio POSTs form-encoded data with MessageSid and MessageStatus
    when a message status changes (queued → sent → delivered / failed).
    """
    form_data = await request.form()
    form_dict = dict(form_data)

    message_sid = form_dict.get("MessageSid", "")
    message_status = form_dict.get("MessageStatus", "")

    logger.info("SMS status webhook: sid=%s status=%s", message_sid, message_status)

    if not message_sid or not message_status:
        return {"status": "ignored", "reason": "missing MessageSid or MessageStatus"}

    # Validate status is one we recognize
    valid_statuses = {"queued", "sent", "delivered", "failed", "undelivered"}
    if message_status not in valid_statuses:
        logger.warning("Unknown SMS status: %s", message_status)
        return {"status": "ignored", "reason": f"unknown status: {message_status}"}

    message = update_message_status(db, message_sid, message_status)
    if message is None:
        return {"status": "ignored", "reason": "message not found"}

    return {"status": "ok", "message_status": message_status}


# ---------------------------------------------------------------------------
# GET /conversations — List SMS conversations
# ---------------------------------------------------------------------------


@router.get("/conversations", response_model=ConversationListResponse)
def list_conversations(
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    status: str | None = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List SMS conversations for an organization, with optional status filter."""
    base_filter = SmsConversation.org_id == org_id
    filters = [base_filter]
    if status:
        filters.append(SmsConversation.status == status)

    count_query = select(func.count()).select_from(SmsConversation).where(*filters)
    total = db.execute(count_query).scalar_one()

    offset = (page - 1) * page_size
    query = (
        select(SmsConversation)
        .where(*filters)
        .order_by(SmsConversation.last_message_at.desc().nullslast())
        .offset(offset)
        .limit(page_size)
    )
    conversations = db.execute(query).scalars().all()

    return ConversationListResponse(
        items=conversations,
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# GET /conversations/{id}/messages — Messages in a conversation
# ---------------------------------------------------------------------------


@router.get("/conversations/{conversation_id}/messages", response_model=MessageListResponse)
def list_conversation_messages(
    conversation_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """List messages in a specific SMS conversation, ordered chronologically."""
    conversation = db.get(SmsConversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    count_query = select(func.count()).select_from(SmsMessage).where(SmsMessage.conversation_id == conversation_id)
    total = db.execute(count_query).scalar_one()

    offset = (page - 1) * page_size
    query = (
        select(SmsMessage)
        .where(SmsMessage.conversation_id == conversation_id)
        .order_by(SmsMessage.created_at.asc())
        .offset(offset)
        .limit(page_size)
    )
    messages = db.execute(query).scalars().all()

    return MessageListResponse(
        items=messages,
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# PUT /conversations/{id}/handoff — Update conversation status
# ---------------------------------------------------------------------------


@router.put("/conversations/{conversation_id}/handoff", response_model=ConversationResponse)
def update_conversation_status(
    conversation_id: uuid.UUID,
    payload: ConversationHandoffRequest,
    db: Session = Depends(get_db),
):
    """Update a conversation's status (flag for handoff, close, or reactivate)."""
    conversation = db.get(SmsConversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conversation.status = payload.status
    db.commit()
    db.refresh(conversation)

    logger.info("Conversation %s status updated to %s", conversation_id, payload.status)
    return conversation


# ---------------------------------------------------------------------------
# GET /contacts/{id}/history — SMS history for a contact
# ---------------------------------------------------------------------------


@router.get("/contacts/{contact_id}/history", response_model=MessageListResponse)
def get_contact_sms_history(
    contact_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Retrieve SMS history for a specific contact across all conversations."""
    contact = db.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Get all conversation IDs for this contact
    conv_ids_query = select(SmsConversation.id).where(SmsConversation.contact_id == contact_id)

    count_query = select(func.count()).select_from(SmsMessage).where(SmsMessage.conversation_id.in_(conv_ids_query))
    total = db.execute(count_query).scalar_one()

    offset = (page - 1) * page_size
    query = (
        select(SmsMessage)
        .where(SmsMessage.conversation_id.in_(conv_ids_query))
        .order_by(SmsMessage.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    messages = db.execute(query).scalars().all()

    return MessageListResponse(
        items=messages,
        total=total,
        page=page,
        page_size=page_size,
    )


# ---------------------------------------------------------------------------
# POST /auto-response-rules — Create auto-response rule
# ---------------------------------------------------------------------------


@router.post("/auto-response-rules", response_model=AutoResponseRuleResponse, status_code=201)
def create_auto_response_rule(
    payload: AutoResponseRuleCreateRequest,
    db: Session = Depends(get_db),
):
    """Create a new auto-response rule for inbound SMS keyword matching."""
    rule = AutoResponseRule(
        org_id=payload.org_id,
        keyword=payload.keyword,
        match_type=payload.match_type,
        response_template=payload.response_template,
        is_active=payload.is_active,
        priority=payload.priority,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    logger.info("Auto-response rule created: id=%s keyword='%s' org=%s", rule.id, rule.keyword, rule.org_id)
    return rule


# ---------------------------------------------------------------------------
# GET /auto-response-rules — List auto-response rules
# ---------------------------------------------------------------------------


@router.get("/auto-response-rules", response_model=AutoResponseRuleListResponse)
def list_auto_response_rules(
    org_id: uuid.UUID = Query(..., description="Organization ID"),
    db: Session = Depends(get_db),
):
    """List all auto-response rules for an organization."""
    count_query = select(func.count()).select_from(AutoResponseRule).where(AutoResponseRule.org_id == org_id)
    total = db.execute(count_query).scalar_one()

    query = select(AutoResponseRule).where(AutoResponseRule.org_id == org_id).order_by(AutoResponseRule.priority.asc())
    rules = db.execute(query).scalars().all()

    return AutoResponseRuleListResponse(items=rules, total=total)
