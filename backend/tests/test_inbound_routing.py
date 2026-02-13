"""Tests for inbound call routing — routing engine, protocol models, bridge integration, and API."""

import json
import uuid
from datetime import time
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.contact import Contact
from app.models.gateway_phone import GatewayPhone
from app.models.inbound_routing_rule import InboundRoutingRule
from app.models.interaction import Interaction
from app.services.gateway_bridge.call_manager import CallManager, CallRecord
from app.services.gateway_bridge.models import (
    AnswerCallMessage,
    BackendMessageType,
    ForwardCallMessage,
    GatewayMessageType,
    IncomingCallMessage,
    RejectCallMessage,
    RoutingAction,
)
from app.services.inbound_router import InboundCallRouter, RoutingDecision

# ---------------------------------------------------------------------------
# Protocol model tests for new message types
# ---------------------------------------------------------------------------


class TestInboundProtocolModels:
    def test_incoming_call_message(self):
        msg = IncomingCallMessage(
            call_id="call-1",
            from_number="+9771234567",
            to_number="+9779876543",
            carrier="NTC",
            sim_slot=0,
            gateway_id="gw-1",
        )
        assert msg.type == GatewayMessageType.INCOMING_CALL
        data = json.loads(msg.model_dump_json())
        assert data["type"] == "INCOMING_CALL"
        assert data["from_number"] == "+9771234567"
        assert data["to_number"] == "+9779876543"
        assert data["carrier"] == "NTC"
        assert data["sim_slot"] == 0

    def test_incoming_call_defaults(self):
        msg = IncomingCallMessage(
            call_id="call-1",
            from_number="+977123",
            to_number="+977456",
            gateway_id="gw-1",
        )
        assert msg.carrier == ""
        assert msg.sim_slot == 0

    def test_answer_call_message(self):
        msg = AnswerCallMessage(call_id="call-1")
        assert msg.type == BackendMessageType.ANSWER_CALL
        data = json.loads(msg.model_dump_json())
        assert data["type"] == "ANSWER_CALL"
        assert data["call_id"] == "call-1"

    def test_reject_call_message(self):
        msg = RejectCallMessage(call_id="call-1", reason="no_matching_rule")
        assert msg.type == BackendMessageType.REJECT_CALL
        data = json.loads(msg.model_dump_json())
        assert data["reason"] == "no_matching_rule"

    def test_reject_call_default_reason(self):
        msg = RejectCallMessage(call_id="call-1")
        assert msg.reason == "rejected"

    def test_forward_call_message(self):
        msg = ForwardCallMessage(call_id="call-1", forward_to="+9779999999")
        assert msg.type == BackendMessageType.FORWARD_CALL
        data = json.loads(msg.model_dump_json())
        assert data["forward_to"] == "+9779999999"

    def test_routing_action_enum(self):
        assert RoutingAction.ANSWER == "answer"
        assert RoutingAction.REJECT == "reject"
        assert RoutingAction.FORWARD == "forward"

    def test_gateway_message_type_incoming(self):
        assert GatewayMessageType.INCOMING_CALL == "INCOMING_CALL"

    def test_backend_message_types_routing(self):
        assert BackendMessageType.ANSWER_CALL == "ANSWER_CALL"
        assert BackendMessageType.REJECT_CALL == "REJECT_CALL"
        assert BackendMessageType.FORWARD_CALL == "FORWARD_CALL"


# ---------------------------------------------------------------------------
# Routing engine tests (with real DB via conftest)
# ---------------------------------------------------------------------------


class TestInboundCallRouter:
    @pytest.fixture(autouse=True)
    def _setup_session_factory(self):
        """Use the shared test engine's sessionmaker so the router gets
        its own session that can still see committed data (StaticPool)."""
        from tests.conftest import TestSessionLocal

        self._session_factory = TestSessionLocal

    def _make_router(self, db_session=None):
        """Create a router backed by the test database."""
        return InboundCallRouter(session_factory=self._session_factory)

    def _make_incoming_call(self, **kwargs):
        defaults = {
            "call_id": "call-test-1",
            "from_number": "+9771234567",
            "to_number": "+9779876543",
            "carrier": "NTC",
            "sim_slot": 0,
            "gateway_id": "gw-test-1",
        }
        defaults.update(kwargs)
        return IncomingCallMessage(**defaults)

    def test_unknown_gateway_defaults_to_answer(self, db):
        """When gateway_id is not registered, default to ANSWER."""
        router = self._make_router()
        msg = self._make_incoming_call(gateway_id="unknown-gw")

        decision = router._route_sync(msg)
        assert decision.action == RoutingAction.ANSWER
        assert decision.org_id is None

    def test_auto_answer_gateway_no_rules(self, db, org):
        """Gateway with auto_answer=True and no rules → ANSWER."""
        gw = GatewayPhone(
            gateway_id="gw-auto",
            org_id=org.id,
            phone_number="+9779876543",
            auto_answer=True,
            is_active=True,
        )
        db.add(gw)
        db.commit()

        router = self._make_router()
        msg = self._make_incoming_call(gateway_id="gw-auto")

        decision = router._route_sync(msg)
        assert decision.action == RoutingAction.ANSWER
        assert decision.org_id == org.id
        assert decision.gateway_phone_id == gw.id

    def test_no_auto_answer_no_rules_rejects(self, db, org):
        """Gateway with auto_answer=False and no rules → REJECT."""
        gw = GatewayPhone(
            gateway_id="gw-manual",
            org_id=org.id,
            phone_number="+9779876543",
            auto_answer=False,
            is_active=True,
        )
        db.add(gw)
        db.commit()

        router = self._make_router()
        msg = self._make_incoming_call(gateway_id="gw-manual")

        decision = router._route_sync(msg)
        assert decision.action == RoutingAction.REJECT
        assert decision.reject_reason == "no_matching_rule"

    def test_rule_match_all_answers(self, db, org):
        """Rule with match_type='all' matches any caller."""
        gw = GatewayPhone(
            gateway_id="gw-rules",
            org_id=org.id,
            phone_number="+9779876543",
            auto_answer=False,
            is_active=True,
        )
        db.add(gw)
        rule = InboundRoutingRule(
            org_id=org.id,
            name="Answer all",
            match_type="all",
            action="answer",
            is_active=True,
            priority=0,
        )
        db.add(rule)
        db.commit()

        router = self._make_router()
        msg = self._make_incoming_call(gateway_id="gw-rules")

        decision = router._route_sync(msg)
        assert decision.action == RoutingAction.ANSWER
        assert decision.rule_id == rule.id
        assert decision.rule_name == "Answer all"

    def test_rule_prefix_match(self, db, org):
        """Rule with match_type='prefix' matches caller number prefix."""
        gw = GatewayPhone(
            gateway_id="gw-prefix",
            org_id=org.id,
            phone_number="+9779876543",
            auto_answer=False,
            is_active=True,
        )
        db.add(gw)
        rule = InboundRoutingRule(
            org_id=org.id,
            name="NTC prefix",
            match_type="prefix",
            caller_pattern="+9771*",
            action="answer",
            is_active=True,
            priority=0,
        )
        db.add(rule)
        db.commit()

        router = self._make_router()

        # Matching prefix
        msg = self._make_incoming_call(gateway_id="gw-prefix", from_number="+9771234567")
        decision = router._route_sync(msg)
        assert decision.action == RoutingAction.ANSWER

        # Non-matching prefix
        msg2 = self._make_incoming_call(gateway_id="gw-prefix", from_number="+9779999999")
        decision2 = router._route_sync(msg2)
        assert decision2.action == RoutingAction.REJECT  # auto_answer=False, no rule match

    def test_rule_exact_match(self, db, org):
        """Rule with match_type='exact' matches specific number."""
        gw = GatewayPhone(
            gateway_id="gw-exact",
            org_id=org.id,
            phone_number="+9779876543",
            auto_answer=False,
            is_active=True,
        )
        db.add(gw)
        rule = InboundRoutingRule(
            org_id=org.id,
            name="VIP caller",
            match_type="exact",
            caller_pattern="+9771111111",
            action="forward",
            forward_to="+9772222222",
            is_active=True,
            priority=0,
        )
        db.add(rule)
        db.commit()

        router = self._make_router()

        # Exact match
        msg = self._make_incoming_call(gateway_id="gw-exact", from_number="+9771111111")
        decision = router._route_sync(msg)
        assert decision.action == RoutingAction.FORWARD
        assert decision.forward_to == "+9772222222"

        # No match
        msg2 = self._make_incoming_call(gateway_id="gw-exact", from_number="+9773333333")
        decision2 = router._route_sync(msg2)
        assert decision2.action == RoutingAction.REJECT

    def test_rule_contact_only_match(self, db, org):
        """Rule with match_type='contact_only' matches known contacts."""
        gw = GatewayPhone(
            gateway_id="gw-contacts",
            org_id=org.id,
            phone_number="+9779876543",
            auto_answer=False,
            is_active=True,
        )
        db.add(gw)

        contact = Contact(
            org_id=org.id,
            phone="+9771234567",
            name="Known Caller",
        )
        db.add(contact)

        rule = InboundRoutingRule(
            org_id=org.id,
            name="Known callers only",
            match_type="contact_only",
            action="answer",
            is_active=True,
            priority=0,
        )
        db.add(rule)
        db.commit()

        router = self._make_router()

        # Known contact → ANSWER
        msg = self._make_incoming_call(gateway_id="gw-contacts", from_number="+9771234567")
        decision = router._route_sync(msg)
        assert decision.action == RoutingAction.ANSWER
        assert decision.contact_id == contact.id
        assert decision.contact_name == "Known Caller"

        # Unknown caller → REJECT (auto_answer=False, contact_only rule doesn't match)
        msg2 = self._make_incoming_call(gateway_id="gw-contacts", from_number="+9779999999")
        decision2 = router._route_sync(msg2)
        assert decision2.action == RoutingAction.REJECT

    def test_rule_priority_ordering(self, db, org):
        """Lower priority number wins (evaluated first)."""
        gw = GatewayPhone(
            gateway_id="gw-priority",
            org_id=org.id,
            phone_number="+9779876543",
            auto_answer=False,
            is_active=True,
        )
        db.add(gw)

        # Priority 10: reject all
        reject_rule = InboundRoutingRule(
            org_id=org.id,
            name="Reject all (low priority)",
            match_type="all",
            action="reject",
            is_active=True,
            priority=10,
        )
        db.add(reject_rule)

        # Priority 1: answer all (wins because lower priority number)
        answer_rule = InboundRoutingRule(
            org_id=org.id,
            name="Answer all (high priority)",
            match_type="all",
            action="answer",
            is_active=True,
            priority=1,
        )
        db.add(answer_rule)
        db.commit()

        router = self._make_router()
        msg = self._make_incoming_call(gateway_id="gw-priority")
        decision = router._route_sync(msg)

        assert decision.action == RoutingAction.ANSWER
        assert decision.rule_name == "Answer all (high priority)"

    def test_inactive_rules_skipped(self, db, org):
        """Inactive rules are not evaluated."""
        gw = GatewayPhone(
            gateway_id="gw-inactive",
            org_id=org.id,
            phone_number="+9779876543",
            auto_answer=False,
            is_active=True,
        )
        db.add(gw)

        rule = InboundRoutingRule(
            org_id=org.id,
            name="Disabled answer rule",
            match_type="all",
            action="answer",
            is_active=False,
            priority=0,
        )
        db.add(rule)
        db.commit()

        router = self._make_router()
        msg = self._make_incoming_call(gateway_id="gw-inactive")
        decision = router._route_sync(msg)

        # Rule is inactive, auto_answer=False → REJECT
        assert decision.action == RoutingAction.REJECT

    def test_inactive_gateway_defaults_to_answer(self, db, org):
        """Inactive gateway phone is not found, defaults to ANSWER."""
        gw = GatewayPhone(
            gateway_id="gw-dead",
            org_id=org.id,
            phone_number="+9779876543",
            is_active=False,
        )
        db.add(gw)
        db.commit()

        router = self._make_router()
        msg = self._make_incoming_call(gateway_id="gw-dead")
        decision = router._route_sync(msg)

        assert decision.action == RoutingAction.ANSWER
        assert decision.org_id is None  # Gateway not found

    def test_gateway_system_instruction_override(self, db, org):
        """Gateway's system_instruction is used when no rule matches."""
        gw = GatewayPhone(
            gateway_id="gw-custom",
            org_id=org.id,
            phone_number="+9779876543",
            auto_answer=True,
            is_active=True,
            system_instruction="Custom agent prompt",
            voice_name="Aoede",
        )
        db.add(gw)
        db.commit()

        router = self._make_router()
        msg = self._make_incoming_call(gateway_id="gw-custom")
        decision = router._route_sync(msg)

        assert decision.action == RoutingAction.ANSWER
        assert decision.system_instruction == "Custom agent prompt"
        assert decision.voice_name == "Aoede"

    def test_rule_system_instruction_override(self, db, org):
        """Rule's system_instruction takes precedence when rule matches."""
        gw = GatewayPhone(
            gateway_id="gw-rule-override",
            org_id=org.id,
            phone_number="+9779876543",
            auto_answer=False,
            is_active=True,
            system_instruction="Gateway default prompt",
        )
        db.add(gw)

        rule = InboundRoutingRule(
            org_id=org.id,
            name="Custom rule",
            match_type="all",
            action="answer",
            is_active=True,
            system_instruction="Rule-specific prompt",
            voice_name="Puck",
            priority=0,
        )
        db.add(rule)
        db.commit()

        router = self._make_router()
        msg = self._make_incoming_call(gateway_id="gw-rule-override")
        decision = router._route_sync(msg)

        assert decision.system_instruction == "Rule-specific prompt"
        assert decision.voice_name == "Puck"

    def test_log_interaction(self, db, org):
        """Routing decision is logged as an inbound_call interaction."""
        gw = GatewayPhone(
            gateway_id="gw-log",
            org_id=org.id,
            phone_number="+9779876543",
            auto_answer=True,
            is_active=True,
        )
        db.add(gw)
        db.commit()

        router = self._make_router()
        msg = self._make_incoming_call(gateway_id="gw-log")
        decision = router._route_sync(msg)

        interaction_id = router._log_interaction_sync(decision, msg)
        assert interaction_id is not None

        interaction = db.get(Interaction, interaction_id)
        assert interaction is not None
        assert interaction.type == "inbound_call"
        assert interaction.org_id == org.id
        assert interaction.status == "in_progress"
        assert interaction.metadata_["call_id"] == "call-test-1"
        assert interaction.metadata_["routing_action"] == "answer"

    def test_log_interaction_reject(self, db, org):
        """Rejected calls are logged as completed interactions."""
        gw = GatewayPhone(
            gateway_id="gw-log-reject",
            org_id=org.id,
            phone_number="+9779876543",
            auto_answer=False,
            is_active=True,
        )
        db.add(gw)
        db.commit()

        router = self._make_router()
        msg = self._make_incoming_call(gateway_id="gw-log-reject")
        decision = router._route_sync(msg)

        assert decision.action == RoutingAction.REJECT
        interaction_id = router._log_interaction_sync(decision, msg)

        interaction = db.get(Interaction, interaction_id)
        assert interaction.status == "completed"
        assert interaction.metadata_["routing_action"] == "reject"


# ---------------------------------------------------------------------------
# Bridge integration tests for INCOMING_CALL flow
# ---------------------------------------------------------------------------


class TestGatewayBridgeInboundRouting:
    def _make_mock_ws(self):
        ws = AsyncMock()
        ws.client = MagicMock()
        ws.client.host = "192.168.1.100"
        ws.client.port = 54321
        ws.accept = AsyncMock()
        ws.send_text = AsyncMock()
        ws.send_bytes = AsyncMock()
        ws.client_state = MagicMock()
        ws.client_state.__eq__ = lambda self, other: True
        return ws

    def _make_mock_call_manager(self):
        mgr = AsyncMock(spec=CallManager)
        mock_session = AsyncMock()
        mock_session.session_id = "gemini-sess-1"
        mock_session.receive = MagicMock(return_value=self._empty_async_iter())

        mock_record = CallRecord(
            call_id="call-1",
            gateway_id="gw-1",
            caller_number="+977123",
            session=mock_session,
        )
        mgr.create_session = AsyncMock(return_value=mock_record)
        mgr.get_session = MagicMock(return_value=mock_session)
        mgr.end_session = AsyncMock()
        return mgr, mock_session

    @staticmethod
    async def _empty_async_iter():
        return
        yield

    @pytest.mark.asyncio
    async def test_incoming_call_answer_flow(self):
        """INCOMING_CALL → ANSWER_CALL → CALL_CONNECTED → SESSION_READY."""
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, mock_session = self._make_mock_call_manager()

        # Mock router that always answers
        mock_router = AsyncMock()
        mock_router.route = AsyncMock(
            return_value=RoutingDecision(action=RoutingAction.ANSWER, call_id="call-1")
        )
        mock_router.log_interaction = AsyncMock(return_value=uuid.uuid4())

        incoming_msg = json.dumps({
            "type": "INCOMING_CALL",
            "call_id": "call-1",
            "from_number": "+9771234567",
            "to_number": "+9779876543",
            "carrier": "NTC",
            "sim_slot": 0,
            "gateway_id": "gw-1",
        })
        connected_msg = json.dumps({
            "type": "CALL_CONNECTED",
            "call_id": "call-1",
            "caller_number": "+9771234567",
            "gateway_id": "gw-1",
        })

        ws.receive = AsyncMock(side_effect=[
            {"type": "websocket.receive", "text": incoming_msg},
            {"type": "websocket.receive", "text": connected_msg},
            {"type": "websocket.disconnect"},
        ])

        bridge = GatewayBridge(websocket=ws, call_manager=mgr, inbound_router=mock_router)
        await bridge.run()

        # Should have called route()
        mock_router.route.assert_awaited_once()

        # Should have sent ANSWER_CALL then SESSION_READY
        sent_messages = [json.loads(c[0][0]) for c in ws.send_text.call_args_list]
        assert sent_messages[0]["type"] == "ANSWER_CALL"
        assert sent_messages[0]["call_id"] == "call-1"
        assert sent_messages[1]["type"] == "SESSION_READY"
        assert sent_messages[1]["call_id"] == "call-1"

        # Should have created Gemini session
        mgr.create_session.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_incoming_call_reject_flow(self):
        """INCOMING_CALL → REJECT_CALL — no Gemini session created."""
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, _ = self._make_mock_call_manager()

        mock_router = AsyncMock()
        mock_router.route = AsyncMock(
            return_value=RoutingDecision(
                action=RoutingAction.REJECT,
                call_id="call-1",
                reject_reason="no_matching_rule",
            )
        )
        mock_router.log_interaction = AsyncMock(return_value=uuid.uuid4())

        incoming_msg = json.dumps({
            "type": "INCOMING_CALL",
            "call_id": "call-1",
            "from_number": "+9771234567",
            "to_number": "+9779876543",
            "gateway_id": "gw-1",
        })

        ws.receive = AsyncMock(side_effect=[
            {"type": "websocket.receive", "text": incoming_msg},
            {"type": "websocket.disconnect"},
        ])

        bridge = GatewayBridge(websocket=ws, call_manager=mgr, inbound_router=mock_router)
        await bridge.run()

        # Should have sent REJECT_CALL
        sent_data = json.loads(ws.send_text.call_args_list[0][0][0])
        assert sent_data["type"] == "REJECT_CALL"
        assert sent_data["reason"] == "no_matching_rule"

        # No Gemini session created
        mgr.create_session.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_incoming_call_forward_flow(self):
        """INCOMING_CALL → FORWARD_CALL — no Gemini session created."""
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, _ = self._make_mock_call_manager()

        mock_router = AsyncMock()
        mock_router.route = AsyncMock(
            return_value=RoutingDecision(
                action=RoutingAction.FORWARD,
                call_id="call-1",
                forward_to="+9779999999",
            )
        )
        mock_router.log_interaction = AsyncMock(return_value=uuid.uuid4())

        incoming_msg = json.dumps({
            "type": "INCOMING_CALL",
            "call_id": "call-1",
            "from_number": "+9771234567",
            "to_number": "+9779876543",
            "gateway_id": "gw-1",
        })

        ws.receive = AsyncMock(side_effect=[
            {"type": "websocket.receive", "text": incoming_msg},
            {"type": "websocket.disconnect"},
        ])

        bridge = GatewayBridge(websocket=ws, call_manager=mgr, inbound_router=mock_router)
        await bridge.run()

        sent_data = json.loads(ws.send_text.call_args_list[0][0][0])
        assert sent_data["type"] == "FORWARD_CALL"
        assert sent_data["forward_to"] == "+9779999999"

        mgr.create_session.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_incoming_call_with_session_config_override(self):
        """ANSWER decision with custom system_instruction passes config to Gemini."""
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, _ = self._make_mock_call_manager()

        mock_router = AsyncMock()
        mock_router.route = AsyncMock(
            return_value=RoutingDecision(
                action=RoutingAction.ANSWER,
                call_id="call-1",
                system_instruction="Custom prompt",
                voice_name="Puck",
            )
        )
        mock_router.log_interaction = AsyncMock(return_value=uuid.uuid4())

        incoming_msg = json.dumps({
            "type": "INCOMING_CALL",
            "call_id": "call-1",
            "from_number": "+977123",
            "to_number": "+977456",
            "gateway_id": "gw-1",
        })
        connected_msg = json.dumps({
            "type": "CALL_CONNECTED",
            "call_id": "call-1",
            "caller_number": "+977123",
            "gateway_id": "gw-1",
        })

        ws.receive = AsyncMock(side_effect=[
            {"type": "websocket.receive", "text": incoming_msg},
            {"type": "websocket.receive", "text": connected_msg},
            {"type": "websocket.disconnect"},
        ])

        bridge = GatewayBridge(websocket=ws, call_manager=mgr, inbound_router=mock_router)
        await bridge.run()

        # Check that session_config was passed with overrides
        call_kwargs = mgr.create_session.call_args[1]
        assert call_kwargs["session_config"] is not None
        assert call_kwargs["session_config"].system_instruction == "Custom prompt"
        assert call_kwargs["session_config"].voice_name == "Puck"

    @pytest.mark.asyncio
    async def test_backward_compat_call_connected_without_incoming(self):
        """CALL_CONNECTED without prior INCOMING_CALL still works (backward compat)."""
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, _ = self._make_mock_call_manager()

        call_msg = json.dumps({
            "type": "CALL_CONNECTED",
            "call_id": "call-1",
            "caller_number": "+977123",
            "gateway_id": "gw-1",
        })

        ws.receive = AsyncMock(side_effect=[
            {"type": "websocket.receive", "text": call_msg},
            {"type": "websocket.disconnect"},
        ])

        bridge = GatewayBridge(websocket=ws, call_manager=mgr)
        await bridge.run()

        # Session should be created with no config overrides
        mgr.create_session.assert_awaited_once_with(
            call_id="call-1",
            gateway_id="gw-1",
            caller_number="+977123",
            session_config=None,
        )

    @pytest.mark.asyncio
    async def test_no_router_defaults_to_answer(self):
        """Without inbound_router, INCOMING_CALL defaults to ANSWER."""
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, _ = self._make_mock_call_manager()

        incoming_msg = json.dumps({
            "type": "INCOMING_CALL",
            "call_id": "call-1",
            "from_number": "+977123",
            "to_number": "+977456",
            "gateway_id": "gw-1",
        })
        connected_msg = json.dumps({
            "type": "CALL_CONNECTED",
            "call_id": "call-1",
            "caller_number": "+977123",
            "gateway_id": "gw-1",
        })

        ws.receive = AsyncMock(side_effect=[
            {"type": "websocket.receive", "text": incoming_msg},
            {"type": "websocket.receive", "text": connected_msg},
            {"type": "websocket.disconnect"},
        ])

        # No inbound_router passed
        bridge = GatewayBridge(websocket=ws, call_manager=mgr)
        await bridge.run()

        # Should send ANSWER_CALL
        sent = json.loads(ws.send_text.call_args_list[0][0][0])
        assert sent["type"] == "ANSWER_CALL"

    @pytest.mark.asyncio
    async def test_call_ended_cleans_pending_decision(self):
        """CALL_ENDED for a pending (not yet connected) call cleans up."""
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, _ = self._make_mock_call_manager()

        mock_router = AsyncMock()
        mock_router.route = AsyncMock(
            return_value=RoutingDecision(action=RoutingAction.ANSWER, call_id="call-1")
        )
        mock_router.log_interaction = AsyncMock(return_value=uuid.uuid4())

        incoming_msg = json.dumps({
            "type": "INCOMING_CALL",
            "call_id": "call-1",
            "from_number": "+977123",
            "to_number": "+977456",
            "gateway_id": "gw-1",
        })
        end_msg = json.dumps({
            "type": "CALL_ENDED",
            "call_id": "call-1",
            "reason": "caller_hangup",
        })

        ws.receive = AsyncMock(side_effect=[
            {"type": "websocket.receive", "text": incoming_msg},
            {"type": "websocket.receive", "text": end_msg},
            {"type": "websocket.disconnect"},
        ])

        bridge = GatewayBridge(websocket=ws, call_manager=mgr, inbound_router=mock_router)
        await bridge.run()

        # No Gemini session should have been created (caller hung up before answering)
        mgr.create_session.assert_not_awaited()


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


class TestGatewayPhoneAPI:
    def test_create_gateway_phone(self, client, org_id):
        response = client.post(
            "/api/v1/inbound/gateway-phones",
            json={
                "gateway_id": "android-gw-001",
                "org_id": str(org_id),
                "phone_number": "+9779876543",
                "label": "Office Phone",
                "auto_answer": True,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["gateway_id"] == "android-gw-001"
        assert data["phone_number"] == "+9779876543"
        assert data["auto_answer"] is True
        assert data["is_active"] is True

    def test_create_duplicate_gateway_id(self, client, org_id):
        payload = {
            "gateway_id": "dup-gw",
            "org_id": str(org_id),
            "phone_number": "+9779876543",
        }
        client.post("/api/v1/inbound/gateway-phones", json=payload)
        response = client.post("/api/v1/inbound/gateway-phones", json=payload)
        assert response.status_code == 409

    def test_list_gateway_phones(self, client, org_id):
        client.post(
            "/api/v1/inbound/gateway-phones",
            json={
                "gateway_id": "list-gw-1",
                "org_id": str(org_id),
                "phone_number": "+977111",
            },
        )
        client.post(
            "/api/v1/inbound/gateway-phones",
            json={
                "gateway_id": "list-gw-2",
                "org_id": str(org_id),
                "phone_number": "+977222",
            },
        )

        response = client.get(f"/api/v1/inbound/gateway-phones?org_id={org_id}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    def test_update_gateway_phone(self, client, org_id):
        create_resp = client.post(
            "/api/v1/inbound/gateway-phones",
            json={
                "gateway_id": "upd-gw",
                "org_id": str(org_id),
                "phone_number": "+977333",
            },
        )
        phone_id = create_resp.json()["id"]

        response = client.patch(
            f"/api/v1/inbound/gateway-phones/{phone_id}",
            json={"auto_answer": False, "label": "Updated"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["auto_answer"] is False
        assert data["label"] == "Updated"

    def test_deactivate_gateway_phone(self, client, org_id):
        create_resp = client.post(
            "/api/v1/inbound/gateway-phones",
            json={
                "gateway_id": "del-gw",
                "org_id": str(org_id),
                "phone_number": "+977444",
            },
        )
        phone_id = create_resp.json()["id"]

        response = client.delete(f"/api/v1/inbound/gateway-phones/{phone_id}")
        assert response.status_code == 204

        # Verify it's deactivated
        get_resp = client.get(f"/api/v1/inbound/gateway-phones/{phone_id}")
        assert get_resp.json()["is_active"] is False

    def test_get_nonexistent_gateway_phone(self, client):
        response = client.get(f"/api/v1/inbound/gateway-phones/{uuid.uuid4()}")
        assert response.status_code == 404


class TestRoutingRuleAPI:
    def test_create_routing_rule(self, client, org_id):
        response = client.post(
            "/api/v1/inbound/routing-rules",
            json={
                "org_id": str(org_id),
                "name": "Answer all calls",
                "match_type": "all",
                "action": "answer",
                "priority": 0,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Answer all calls"
        assert data["action"] == "answer"
        assert data["is_active"] is True

    def test_create_forward_rule_without_forward_to(self, client, org_id):
        response = client.post(
            "/api/v1/inbound/routing-rules",
            json={
                "org_id": str(org_id),
                "name": "Bad forward",
                "action": "forward",
            },
        )
        assert response.status_code == 422

    def test_create_forward_rule_with_forward_to(self, client, org_id):
        response = client.post(
            "/api/v1/inbound/routing-rules",
            json={
                "org_id": str(org_id),
                "name": "Forward VIP",
                "match_type": "exact",
                "caller_pattern": "+9771111111",
                "action": "forward",
                "forward_to": "+9779999999",
                "priority": 5,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["forward_to"] == "+9779999999"

    def test_list_routing_rules(self, client, org_id):
        for i in range(3):
            client.post(
                "/api/v1/inbound/routing-rules",
                json={
                    "org_id": str(org_id),
                    "name": f"Rule {i}",
                    "priority": i,
                },
            )

        response = client.get(f"/api/v1/inbound/routing-rules?org_id={org_id}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        # Should be sorted by priority
        assert [r["priority"] for r in data] == [0, 1, 2]

    def test_update_routing_rule(self, client, org_id):
        create_resp = client.post(
            "/api/v1/inbound/routing-rules",
            json={
                "org_id": str(org_id),
                "name": "Original",
                "action": "answer",
            },
        )
        rule_id = create_resp.json()["id"]

        response = client.patch(
            f"/api/v1/inbound/routing-rules/{rule_id}",
            json={"name": "Updated", "action": "reject"},
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated"
        assert response.json()["action"] == "reject"

    def test_delete_routing_rule(self, client, org_id):
        create_resp = client.post(
            "/api/v1/inbound/routing-rules",
            json={
                "org_id": str(org_id),
                "name": "Deletable",
            },
        )
        rule_id = create_resp.json()["id"]

        response = client.delete(f"/api/v1/inbound/routing-rules/{rule_id}")
        assert response.status_code == 204

        # Verify deletion
        get_resp = client.get(f"/api/v1/inbound/routing-rules/{rule_id}")
        assert get_resp.status_code == 404

    def test_get_nonexistent_rule(self, client):
        response = client.get(f"/api/v1/inbound/routing-rules/{uuid.uuid4()}")
        assert response.status_code == 404

    def test_create_rule_with_time_window(self, client, org_id):
        response = client.post(
            "/api/v1/inbound/routing-rules",
            json={
                "org_id": str(org_id),
                "name": "Business hours",
                "match_type": "all",
                "action": "answer",
                "time_start": "09:00:00",
                "time_end": "17:00:00",
                "days_of_week": [0, 1, 2, 3, 4],  # Mon-Fri
                "priority": 0,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["time_start"] == "09:00:00"
        assert data["time_end"] == "17:00:00"
        assert data["days_of_week"] == [0, 1, 2, 3, 4]


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


class TestGatewayPhoneModel:
    def test_create_gateway_phone(self, db, org):
        gw = GatewayPhone(
            gateway_id="model-test-gw",
            org_id=org.id,
            phone_number="+977111",
        )
        db.add(gw)
        db.commit()
        db.refresh(gw)

        assert gw.id is not None
        assert gw.gateway_id == "model-test-gw"
        assert gw.auto_answer is True
        assert gw.is_active is True
        assert repr(gw) == "<GatewayPhone model-test-gw (active, auto-answer)>"

    def test_gateway_phone_repr_flags(self, db, org):
        gw = GatewayPhone(
            gateway_id="repr-test",
            org_id=org.id,
            phone_number="+977222",
            auto_answer=False,
            is_active=False,
        )
        db.add(gw)
        db.commit()
        assert repr(gw) == "<GatewayPhone repr-test ()>"


class TestInboundRoutingRuleModel:
    def test_create_rule(self, db, org):
        rule = InboundRoutingRule(
            org_id=org.id,
            name="Test rule",
            match_type="all",
            action="answer",
            priority=0,
        )
        db.add(rule)
        db.commit()
        db.refresh(rule)

        assert rule.id is not None
        assert rule.name == "Test rule"
        assert repr(rule) == "<InboundRoutingRule 'Test rule' action=answer priority=0>"

    def test_rule_with_time_window(self, db, org):
        rule = InboundRoutingRule(
            org_id=org.id,
            name="Business hours",
            match_type="all",
            action="answer",
            time_start=time(9, 0),
            time_end=time(17, 0),
            days_of_week=[0, 1, 2, 3, 4],
            priority=0,
        )
        db.add(rule)
        db.commit()
        db.refresh(rule)

        assert rule.time_start == time(9, 0)
        assert rule.time_end == time(17, 0)
        assert rule.days_of_week == [0, 1, 2, 3, 4]


class TestInteractionInboundSupport:
    def test_interaction_nullable_campaign_id(self, db, org):
        """Inbound calls can be created without campaign_id."""
        interaction = Interaction(
            org_id=org.id,
            type="inbound_call",
            status="in_progress",
            metadata_={"call_id": "test-call"},
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        assert interaction.campaign_id is None
        assert interaction.contact_id is None
        assert interaction.org_id == org.id
        assert interaction.type == "inbound_call"

    def test_interaction_with_contact(self, db, org):
        """Inbound call from a known contact."""
        contact = Contact(org_id=org.id, phone="+977123", name="Test Caller")
        db.add(contact)
        db.commit()

        interaction = Interaction(
            org_id=org.id,
            contact_id=contact.id,
            type="inbound_call",
            status="in_progress",
        )
        db.add(interaction)
        db.commit()
        db.refresh(interaction)

        assert interaction.contact_id == contact.id
        assert interaction.campaign_id is None
