"""Tests for two-way SMS — send, inbound webhook, delivery status, conversations,
auto-response rules, handoff, and message history."""

from unittest.mock import AsyncMock, patch

import pytest

from app.models import Contact, PhoneNumber, SmsConversation, SmsMessage, AutoResponseRule
from app.services.sms import (
    check_handoff_needed,
    find_or_create_conversation,
    match_auto_response,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def contact(db, org):
    """Create a test contact."""
    c = Contact(org_id=org.id, phone="+9779812345678", name="Test User")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def phone_number(db, org):
    """Register a Twilio phone number for the test org."""
    pn = PhoneNumber(
        phone_number="+15551234567",
        org_id=org.id,
        is_active=True,
        is_broker=True,
    )
    db.add(pn)
    db.commit()
    db.refresh(pn)
    return pn


@pytest.fixture
def conversation(db, org, contact):
    """Create a test conversation."""
    conv = SmsConversation(
        org_id=org.id,
        contact_id=contact.id,
        status="active",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@pytest.fixture
def auto_response_rule(db, org):
    """Create a test auto-response rule."""
    rule = AutoResponseRule(
        org_id=org.id,
        keyword="info",
        match_type="contains",
        response_template="Thank you for your inquiry. We'll get back to you soon.",
        is_active=True,
        priority=0,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


# ---------------------------------------------------------------------------
# POST /send — Outbound SMS
# ---------------------------------------------------------------------------


class TestSendSms:
    @patch("app.services.sms.get_twilio_provider")
    def test_send_sms_success(self, mock_get_provider, client, db, org, contact):
        mock_provider = mock_get_provider.return_value
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(
            return_value=type("SmsResult", (), {"message_id": "SM-test-123", "status": "queued"})()
        )

        response = client.post(
            "/api/v1/text/send",
            json={
                "to": "+9779812345678",
                "body": "Hello from Ring AI",
                "org_id": str(org.id),
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["twilio_sid"] == "SM-test-123"
        assert data["status"] == "queued"
        assert data["direction"] == "outbound"
        assert data["conversation_id"] is not None
        assert data["message_id"] is not None

        # Verify DB records
        msg = db.query(SmsMessage).first()
        assert msg is not None
        assert msg.direction == "outbound"
        assert msg.body == "Hello from Ring AI"
        assert msg.twilio_sid == "SM-test-123"

        conv = db.query(SmsConversation).first()
        assert conv is not None
        assert conv.contact_id == contact.id
        assert conv.org_id == org.id
        assert conv.status == "active"

    def test_send_sms_contact_not_found(self, client, org):
        response = client.post(
            "/api/v1/text/send",
            json={
                "to": "+9779999999999",
                "body": "Hello",
                "org_id": str(org.id),
            },
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"]

    def test_send_sms_missing_body(self, client, org):
        response = client.post(
            "/api/v1/text/send",
            json={
                "to": "+9779812345678",
                "org_id": str(org.id),
            },
        )
        assert response.status_code == 422

    @patch("app.services.sms.get_twilio_provider")
    def test_send_sms_twilio_failure(self, mock_get_provider, client, db, org, contact):
        from app.services.telephony.exceptions import TelephonyProviderError

        mock_provider = mock_get_provider.return_value
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(
            side_effect=TelephonyProviderError("twilio", "API error")
        )

        response = client.post(
            "/api/v1/text/send",
            json={
                "to": "+9779812345678",
                "body": "Hello",
                "org_id": str(org.id),
            },
        )
        assert response.status_code == 502

    @patch("app.services.sms.get_twilio_provider")
    def test_send_sms_creates_conversation_once(self, mock_get_provider, client, db, org, contact):
        """Sending multiple messages to same contact reuses the conversation."""
        mock_provider = mock_get_provider.return_value
        mock_provider.default_from_number = "+15551234567"
        mock_provider.send_sms = AsyncMock(
            return_value=type("SmsResult", (), {"message_id": "SM-1", "status": "queued"})()
        )

        # Send two messages
        for _ in range(2):
            response = client.post(
                "/api/v1/text/send",
                json={
                    "to": "+9779812345678",
                    "body": "Message",
                    "org_id": str(org.id),
                },
            )
            assert response.status_code == 201

        # Should have 1 conversation, 2 messages
        convs = db.query(SmsConversation).all()
        msgs = db.query(SmsMessage).all()
        assert len(convs) == 1
        assert len(msgs) == 2


# ---------------------------------------------------------------------------
# POST /webhook — Inbound SMS
# ---------------------------------------------------------------------------


class TestInboundWebhook:
    def test_inbound_sms_with_known_contact(self, client, db, org, contact, phone_number):
        response = client.post(
            "/api/v1/text/webhook",
            data={
                "MessageSid": "SM-inbound-1",
                "From": "+9779812345678",
                "To": "+15551234567",
                "Body": "Hello, I have a question",
            },
        )
        assert response.status_code == 200
        assert "text/xml" in response.headers["content-type"]
        assert "<Response>" in response.text

        # Verify inbound message recorded
        msg = db.query(SmsMessage).first()
        assert msg is not None
        assert msg.direction == "inbound"
        assert msg.body == "Hello, I have a question"
        assert msg.twilio_sid == "SM-inbound-1"
        assert msg.status == "received"

        # Verify conversation created
        conv = db.query(SmsConversation).first()
        assert conv is not None
        assert conv.contact_id == contact.id
        assert conv.status == "active"

    def test_inbound_sms_creates_new_contact(self, client, db, org, phone_number):
        """Inbound from unknown number creates a new contact."""
        response = client.post(
            "/api/v1/text/webhook",
            data={
                "MessageSid": "SM-inbound-new",
                "From": "+9779876543210",
                "To": "+15551234567",
                "Body": "Hi there",
            },
        )
        assert response.status_code == 200

        # New contact should be created
        new_contact = db.query(Contact).filter(Contact.phone == "+9779876543210").first()
        assert new_contact is not None
        assert new_contact.org_id == org.id

    def test_inbound_sms_unknown_twilio_number(self, client, db):
        """Inbound to an unregistered Twilio number returns empty TwiML."""
        response = client.post(
            "/api/v1/text/webhook",
            data={
                "MessageSid": "SM-unknown",
                "From": "+9779812345678",
                "To": "+19999999999",
                "Body": "Hello",
            },
        )
        assert response.status_code == 200
        assert "<Response></Response>" in response.text

        # No message should be recorded
        assert db.query(SmsMessage).count() == 0

    def test_inbound_sms_missing_sid(self, client):
        response = client.post(
            "/api/v1/text/webhook",
            data={
                "From": "+9779812345678",
                "To": "+15551234567",
                "Body": "Hello",
            },
        )
        assert response.status_code == 200
        assert "<Response></Response>" in response.text

    def test_inbound_sms_auto_response(self, client, db, org, contact, phone_number, auto_response_rule):
        """Inbound message matching auto-response rule triggers reply."""
        response = client.post(
            "/api/v1/text/webhook",
            data={
                "MessageSid": "SM-auto-1",
                "From": "+9779812345678",
                "To": "+15551234567",
                "Body": "I need some info please",
            },
        )
        assert response.status_code == 200
        assert "<Message>" in response.text
        assert "Thank you for your inquiry" in response.text

        # Should have 2 messages: 1 inbound + 1 auto-response outbound
        msgs = db.query(SmsMessage).all()
        assert len(msgs) == 2
        inbound = [m for m in msgs if m.direction == "inbound"]
        outbound = [m for m in msgs if m.direction == "outbound"]
        assert len(inbound) == 1
        assert len(outbound) == 1
        assert outbound[0].body == "Thank you for your inquiry. We'll get back to you soon."

    def test_inbound_sms_handoff_keyword(self, client, db, org, contact, phone_number):
        """Inbound message with 'help' keyword flags conversation for handoff."""
        response = client.post(
            "/api/v1/text/webhook",
            data={
                "MessageSid": "SM-handoff-1",
                "From": "+9779812345678",
                "To": "+15551234567",
                "Body": "I need help with my order",
            },
        )
        assert response.status_code == 200

        conv = db.query(SmsConversation).first()
        assert conv is not None
        assert conv.status == "needs_handoff"

    def test_inbound_sms_threads_to_existing_conversation(
        self, client, db, org, contact, phone_number, conversation
    ):
        """Multiple inbound messages from same contact thread to same conversation."""
        for i in range(3):
            client.post(
                "/api/v1/text/webhook",
                data={
                    "MessageSid": f"SM-thread-{i}",
                    "From": "+9779812345678",
                    "To": "+15551234567",
                    "Body": f"Message {i}",
                },
            )

        # All 3 messages should be in the existing conversation
        msgs = db.query(SmsMessage).filter(SmsMessage.conversation_id == conversation.id).all()
        assert len(msgs) == 3

        # Only 1 conversation
        convs = db.query(SmsConversation).all()
        assert len(convs) == 1


# ---------------------------------------------------------------------------
# POST /status — Delivery status webhook
# ---------------------------------------------------------------------------


class TestStatusWebhook:
    def test_delivery_status_update(self, client, db, conversation):
        # Create an outbound message to track
        msg = SmsMessage(
            conversation_id=conversation.id,
            direction="outbound",
            body="Test",
            from_number="+15551234567",
            to_number="+9779812345678",
            twilio_sid="SM-status-1",
            status="queued",
        )
        db.add(msg)
        db.commit()

        # Simulate Twilio status callback
        response = client.post(
            "/api/v1/text/status",
            data={
                "MessageSid": "SM-status-1",
                "MessageStatus": "delivered",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["message_status"] == "delivered"

        # Verify DB update
        db.refresh(msg)
        assert msg.status == "delivered"

    def test_delivery_status_failed(self, client, db, conversation):
        msg = SmsMessage(
            conversation_id=conversation.id,
            direction="outbound",
            body="Test",
            from_number="+15551234567",
            to_number="+9779812345678",
            twilio_sid="SM-fail-1",
            status="queued",
        )
        db.add(msg)
        db.commit()

        response = client.post(
            "/api/v1/text/status",
            data={
                "MessageSid": "SM-fail-1",
                "MessageStatus": "failed",
            },
        )
        assert response.status_code == 200

        db.refresh(msg)
        assert msg.status == "failed"

    def test_delivery_status_unknown_message(self, client):
        response = client.post(
            "/api/v1/text/status",
            data={
                "MessageSid": "SM-unknown-999",
                "MessageStatus": "delivered",
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ignored"

    def test_delivery_status_missing_fields(self, client):
        response = client.post(
            "/api/v1/text/status",
            data={},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ignored"

    def test_delivery_status_unknown_status(self, client):
        response = client.post(
            "/api/v1/text/status",
            data={
                "MessageSid": "SM-123",
                "MessageStatus": "bogus_status",
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ignored"


# ---------------------------------------------------------------------------
# GET /conversations
# ---------------------------------------------------------------------------


class TestListConversations:
    def test_list_empty(self, client, org):
        response = client.get(f"/api/v1/text/conversations?org_id={org.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_list_with_conversations(self, client, db, org, conversation):
        response = client.get(f"/api/v1/text/conversations?org_id={org.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["id"] == str(conversation.id)
        assert data["items"][0]["status"] == "active"

    def test_list_filter_by_status(self, client, db, org, contact):
        # Create conversations with different statuses
        for status in ("active", "needs_handoff", "closed"):
            conv = SmsConversation(org_id=org.id, contact_id=contact.id, status=status)
            db.add(conv)
        db.commit()

        response = client.get(f"/api/v1/text/conversations?org_id={org.id}&status=needs_handoff")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["status"] == "needs_handoff"

    def test_list_pagination(self, client, db, org, contact):
        for _ in range(5):
            db.add(SmsConversation(org_id=org.id, contact_id=contact.id, status="active"))
        db.commit()

        response = client.get(f"/api/v1/text/conversations?org_id={org.id}&page=1&page_size=2")
        data = response.json()
        assert data["total"] == 5
        assert len(data["items"]) == 2


# ---------------------------------------------------------------------------
# GET /conversations/{id}/messages
# ---------------------------------------------------------------------------


class TestListConversationMessages:
    def test_list_messages(self, client, db, conversation):
        for i in range(3):
            db.add(SmsMessage(
                conversation_id=conversation.id,
                direction="outbound" if i % 2 == 0 else "inbound",
                body=f"Message {i}",
                from_number="+15551234567",
                to_number="+9779812345678",
                status="sent",
            ))
        db.commit()

        response = client.get(f"/api/v1/text/conversations/{conversation.id}/messages")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3

    def test_list_messages_not_found(self, client):
        import uuid

        fake_id = uuid.uuid4()
        response = client.get(f"/api/v1/text/conversations/{fake_id}/messages")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# PUT /conversations/{id}/handoff
# ---------------------------------------------------------------------------


class TestConversationHandoff:
    def test_flag_for_handoff(self, client, db, conversation):
        response = client.put(
            f"/api/v1/text/conversations/{conversation.id}/handoff",
            json={"status": "needs_handoff"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "needs_handoff"

        db.refresh(conversation)
        assert conversation.status == "needs_handoff"

    def test_close_conversation(self, client, db, conversation):
        response = client.put(
            f"/api/v1/text/conversations/{conversation.id}/handoff",
            json={"status": "closed"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "closed"

    def test_reactivate_conversation(self, client, db, conversation):
        conversation.status = "needs_handoff"
        db.commit()

        response = client.put(
            f"/api/v1/text/conversations/{conversation.id}/handoff",
            json={"status": "active"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "active"

    def test_handoff_not_found(self, client):
        import uuid

        response = client.put(
            f"/api/v1/text/conversations/{uuid.uuid4()}/handoff",
            json={"status": "needs_handoff"},
        )
        assert response.status_code == 404

    def test_handoff_invalid_status(self, client, conversation):
        response = client.put(
            f"/api/v1/text/conversations/{conversation.id}/handoff",
            json={"status": "invalid_status"},
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /contacts/{id}/history
# ---------------------------------------------------------------------------


class TestContactHistory:
    def test_contact_history(self, client, db, contact, conversation):
        for i in range(3):
            db.add(SmsMessage(
                conversation_id=conversation.id,
                direction="inbound",
                body=f"Message {i}",
                from_number="+9779812345678",
                to_number="+15551234567",
                status="received",
            ))
        db.commit()

        response = client.get(f"/api/v1/text/contacts/{contact.id}/history")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3

    def test_contact_history_not_found(self, client):
        import uuid

        response = client.get(f"/api/v1/text/contacts/{uuid.uuid4()}/history")
        assert response.status_code == 404

    def test_contact_history_empty(self, client, contact):
        response = client.get(f"/api/v1/text/contacts/{contact.id}/history")
        assert response.status_code == 200
        assert response.json()["total"] == 0


# ---------------------------------------------------------------------------
# POST /auto-response-rules
# ---------------------------------------------------------------------------


class TestAutoResponseRules:
    def test_create_rule(self, client, db, org):
        response = client.post(
            "/api/v1/text/auto-response-rules",
            json={
                "org_id": str(org.id),
                "keyword": "pricing",
                "match_type": "contains",
                "response_template": "Our pricing starts at $10/mo.",
                "is_active": True,
                "priority": 1,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["keyword"] == "pricing"
        assert data["match_type"] == "contains"
        assert data["is_active"] is True

        rule = db.query(AutoResponseRule).first()
        assert rule is not None
        assert rule.keyword == "pricing"

    def test_create_rule_exact_match(self, client, db, org):
        response = client.post(
            "/api/v1/text/auto-response-rules",
            json={
                "org_id": str(org.id),
                "keyword": "STOP",
                "match_type": "exact",
                "response_template": "You have been unsubscribed.",
            },
        )
        assert response.status_code == 201
        assert response.json()["match_type"] == "exact"

    def test_list_rules(self, client, db, org):
        # Create rules
        for i in range(3):
            db.add(AutoResponseRule(
                org_id=org.id,
                keyword=f"keyword{i}",
                match_type="contains",
                response_template=f"Response {i}",
                priority=i,
            ))
        db.commit()

        response = client.get(f"/api/v1/text/auto-response-rules?org_id={org.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        # Should be ordered by priority
        assert data["items"][0]["keyword"] == "keyword0"

    def test_list_rules_empty(self, client, org):
        response = client.get(f"/api/v1/text/auto-response-rules?org_id={org.id}")
        assert response.status_code == 200
        assert response.json()["total"] == 0


# ---------------------------------------------------------------------------
# Service layer unit tests
# ---------------------------------------------------------------------------


class TestSmsService:
    def test_find_or_create_conversation_creates(self, db, org, contact):
        conv = find_or_create_conversation(db, org.id, contact.id)
        assert conv is not None
        assert conv.status == "active"
        assert conv.org_id == org.id
        assert conv.contact_id == contact.id

    def test_find_or_create_conversation_reuses(self, db, org, contact, conversation):
        conv = find_or_create_conversation(db, org.id, contact.id)
        assert conv.id == conversation.id

    def test_find_or_create_conversation_ignores_closed(self, db, org, contact):
        closed = SmsConversation(
            org_id=org.id,
            contact_id=contact.id,
            status="closed",
        )
        db.add(closed)
        db.commit()

        conv = find_or_create_conversation(db, org.id, contact.id)
        assert conv.id != closed.id
        assert conv.status == "active"

    def test_check_handoff_needed(self):
        assert check_handoff_needed("I need help") is True
        assert check_handoff_needed("talk to an agent") is True
        assert check_handoff_needed("HELP") is True
        assert check_handoff_needed("can I get support?") is True
        assert check_handoff_needed("STOP") is True
        assert check_handoff_needed("Hello there") is False
        assert check_handoff_needed("What is the price?") is False

    def test_match_auto_response_contains(self, db, org, auto_response_rule):
        rule = match_auto_response(db, org.id, "I want some info about pricing")
        assert rule is not None
        assert rule.id == auto_response_rule.id

    def test_match_auto_response_no_match(self, db, org, auto_response_rule):
        rule = match_auto_response(db, org.id, "Hello there")
        assert rule is None

    def test_match_auto_response_exact(self, db, org):
        exact_rule = AutoResponseRule(
            org_id=org.id,
            keyword="stop",
            match_type="exact",
            response_template="Unsubscribed.",
            is_active=True,
            priority=0,
        )
        db.add(exact_rule)
        db.commit()

        # Exact match
        assert match_auto_response(db, org.id, "stop") is not None
        assert match_auto_response(db, org.id, "STOP") is not None
        # Not exact — "stop please" shouldn't match exact
        assert match_auto_response(db, org.id, "stop please") is None

    def test_match_auto_response_priority(self, db, org):
        """Higher priority (lower number) rule should match first."""
        db.add(AutoResponseRule(
            org_id=org.id,
            keyword="sale",
            match_type="contains",
            response_template="Low priority",
            is_active=True,
            priority=10,
        ))
        db.add(AutoResponseRule(
            org_id=org.id,
            keyword="sale",
            match_type="contains",
            response_template="High priority",
            is_active=True,
            priority=1,
        ))
        db.commit()

        rule = match_auto_response(db, org.id, "big sale today")
        assert rule is not None
        assert rule.response_template == "High priority"

    def test_match_auto_response_inactive_ignored(self, db, org):
        db.add(AutoResponseRule(
            org_id=org.id,
            keyword="promo",
            match_type="contains",
            response_template="Promo active",
            is_active=False,
        ))
        db.commit()

        assert match_auto_response(db, org.id, "promo code") is None
