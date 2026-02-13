"""SMS service — business logic for two-way SMS conversations."""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.auto_response_rule import AutoResponseRule
from app.models.contact import Contact
from app.models.sms_conversation import SmsConversation
from app.models.sms_message import SmsMessage
from app.services.telephony import SmsResult, get_twilio_provider
from app.services.telephony.exceptions import TelephonyProviderError

logger = logging.getLogger(__name__)

# Keywords that trigger human handoff (case-insensitive)
HANDOFF_KEYWORDS = {"help", "agent", "human", "operator", "support", "stop"}


class SmsServiceError(Exception):
    """Base exception for SMS service operations."""


class ConversationNotFound(SmsServiceError):
    """Raised when a conversation is not found."""


def find_or_create_conversation(
    db: Session,
    org_id,
    contact_id,
) -> SmsConversation:
    """Find an existing active conversation or create a new one.

    Looks for an active (non-closed) conversation between the org and contact.
    If none exists, creates a new one with status='active'.
    """
    conversation = db.execute(
        select(SmsConversation).where(
            SmsConversation.org_id == org_id,
            SmsConversation.contact_id == contact_id,
            SmsConversation.status != "closed",
        )
    ).scalar_one_or_none()

    if conversation is not None:
        return conversation

    conversation = SmsConversation(
        org_id=org_id,
        contact_id=contact_id,
        status="active",
    )
    db.add(conversation)
    db.flush()
    return conversation


def find_contact_by_phone(db: Session, phone: str, org_id=None) -> Contact | None:
    """Find a contact by phone number, optionally scoped to an org."""
    query = select(Contact).where(Contact.phone == phone)
    if org_id is not None:
        query = query.where(Contact.org_id == org_id)
    return db.execute(query).scalar_one_or_none()


def resolve_org_from_twilio_number(db: Session, to_number: str):
    """Resolve which organization owns a Twilio phone number.

    Checks the phone_numbers table for a matching number. Falls back to
    the global Twilio default number (single-org mode).

    Returns org_id or None.
    """
    from app.models.phone_number import PhoneNumber

    phone_record = db.execute(
        select(PhoneNumber).where(
            PhoneNumber.phone_number == to_number,
            PhoneNumber.is_active.is_(True),
        )
    ).scalar_one_or_none()

    if phone_record is not None:
        return phone_record.org_id

    return None


async def send_sms_message(
    db: Session,
    org_id,
    contact_id,
    to: str,
    body: str,
    from_number: str | None = None,
    status_callback: str | None = None,
) -> SmsMessage:
    """Send an outbound SMS and record it in the conversation thread.

    1. Finds or creates a conversation for this org+contact
    2. Sends via Twilio
    3. Creates SmsMessage record with direction='outbound'
    4. Updates conversation.last_message_at

    Returns the created SmsMessage.
    """
    provider = get_twilio_provider()
    sender = from_number or provider.default_from_number

    if not sender:
        raise SmsServiceError("No from_number provided and no default Twilio number configured")

    conversation = find_or_create_conversation(db, org_id, contact_id)

    result: SmsResult = await provider.send_sms(
        to=to,
        from_number=sender,
        body=body,
        status_callback=status_callback,
    )

    now = datetime.now(timezone.utc)
    message = SmsMessage(
        conversation_id=conversation.id,
        direction="outbound",
        body=body,
        from_number=sender,
        to_number=to,
        twilio_sid=result.message_id,
        status=result.status,
    )
    db.add(message)

    conversation.last_message_at = now
    db.commit()
    db.refresh(message)

    logger.info(
        "Outbound SMS sent: msg_id=%s twilio_sid=%s to=%s conv=%s",
        message.id,
        result.message_id,
        to,
        conversation.id,
    )

    return message


def record_inbound_message(
    db: Session,
    conversation: SmsConversation,
    body: str,
    from_number: str,
    to_number: str,
    twilio_sid: str,
) -> SmsMessage:
    """Record an inbound SMS message in the conversation thread."""
    now = datetime.now(timezone.utc)
    message = SmsMessage(
        conversation_id=conversation.id,
        direction="inbound",
        body=body,
        from_number=from_number,
        to_number=to_number,
        twilio_sid=twilio_sid,
        status="received",
    )
    db.add(message)
    conversation.last_message_at = now
    db.flush()
    return message


def match_auto_response(db: Session, org_id, message_body: str) -> AutoResponseRule | None:
    """Find the highest-priority matching auto-response rule for a message.

    Evaluates active rules for the org in priority order (ascending).
    Returns the first matching rule, or None.
    """
    rules = db.execute(
        select(AutoResponseRule)
        .where(
            AutoResponseRule.org_id == org_id,
            AutoResponseRule.is_active.is_(True),
        )
        .order_by(AutoResponseRule.priority.asc())
    ).scalars().all()

    normalized_body = message_body.strip().lower()

    for rule in rules:
        keyword = rule.keyword.strip().lower()
        if rule.match_type == "exact":
            if normalized_body == keyword:
                return rule
        elif rule.match_type == "contains":
            if keyword in normalized_body:
                return rule

    return None


def check_handoff_needed(message_body: str) -> bool:
    """Check if an inbound message contains keywords that require human handoff."""
    normalized = message_body.strip().lower()
    # Strip common punctuation from each word before matching
    words = {w.strip(".,!?;:'\"") for w in normalized.split()}
    return bool(words & HANDOFF_KEYWORDS)


def flag_for_handoff(db: Session, conversation: SmsConversation) -> None:
    """Flag a conversation as needing human attention."""
    if conversation.status != "needs_handoff":
        conversation.status = "needs_handoff"
        logger.info("Conversation %s flagged for human handoff", conversation.id)


def update_message_status(db: Session, twilio_sid: str, new_status: str) -> SmsMessage | None:
    """Update delivery status of an SMS message by its Twilio SID.

    Called by the delivery status webhook.
    Returns the updated message, or None if not found.
    """
    message = db.execute(
        select(SmsMessage).where(SmsMessage.twilio_sid == twilio_sid)
    ).scalar_one_or_none()

    if message is None:
        logger.warning("Status update for unknown twilio_sid: %s", twilio_sid)
        return None

    message.status = new_status
    db.commit()
    db.refresh(message)

    logger.info(
        "SMS status updated: twilio_sid=%s new_status=%s",
        twilio_sid,
        new_status,
    )
    return message
