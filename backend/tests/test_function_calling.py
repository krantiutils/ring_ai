"""Tests for function calling in Gemini agent sessions (ra-d13g).

Covers:
- Tool declarations and build_tools()
- SessionConfig with tool_names
- AgentResponse with tool_calls / FunctionCallPart
- ToolExecutor dispatch and error handling
- Client tool_call detection in receive()
- Client send_tool_response()
- Session send_tool_response()
- GatewayBridge tool call handling
- Agent call endpoint (POST /api/v1/voice/agent-call)
- Gateway bridge models (ToolExecutionMessage)
"""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.interactive_agent.models import (
    AgentResponse,
    FunctionCallPart,
    SessionConfig,
)
from app.services.interactive_agent.tools import (
    DEFAULT_TOOLS,
    TOOL_DECLARATIONS,
    ToolExecutor,
    ToolResult,
    build_tools,
)


# ---------------------------------------------------------------------------
# Tool declarations unit tests
# ---------------------------------------------------------------------------


class TestToolDeclarations:
    def test_all_four_tools_defined(self):
        assert len(TOOL_DECLARATIONS) == 4
        assert "lookup_account" in TOOL_DECLARATIONS
        assert "check_balance" in TOOL_DECLARATIONS
        assert "initiate_payment" in TOOL_DECLARATIONS
        assert "transfer_to_human" in TOOL_DECLARATIONS

    def test_default_tools_includes_all(self):
        assert set(DEFAULT_TOOLS) == set(TOOL_DECLARATIONS.keys())

    def test_declarations_have_names_and_descriptions(self):
        for name, decl in TOOL_DECLARATIONS.items():
            assert decl.name == name
            assert decl.description
            assert len(decl.description) > 10

    def test_lookup_account_has_phone_parameter(self):
        decl = TOOL_DECLARATIONS["lookup_account"]
        assert "phone_number" in decl.parameters.properties
        assert "phone_number" in decl.parameters.required

    def test_check_balance_has_org_id_parameter(self):
        decl = TOOL_DECLARATIONS["check_balance"]
        assert "org_id" in decl.parameters.properties
        assert "org_id" in decl.parameters.required

    def test_initiate_payment_has_required_params(self):
        decl = TOOL_DECLARATIONS["initiate_payment"]
        assert "org_id" in decl.parameters.properties
        assert "amount" in decl.parameters.properties
        assert "org_id" in decl.parameters.required
        assert "amount" in decl.parameters.required

    def test_transfer_to_human_has_reason(self):
        decl = TOOL_DECLARATIONS["transfer_to_human"]
        assert "reason" in decl.parameters.properties
        assert "summary" in decl.parameters.properties
        assert "reason" in decl.parameters.required


# ---------------------------------------------------------------------------
# build_tools unit tests
# ---------------------------------------------------------------------------


class TestBuildTools:
    def test_build_all_tools(self):
        tools = build_tools()
        assert len(tools) == 1  # One Tool object with all declarations
        assert len(tools[0].function_declarations) == 4

    def test_build_subset(self):
        tools = build_tools(["lookup_account", "check_balance"])
        assert len(tools) == 1
        assert len(tools[0].function_declarations) == 2
        names = {d.name for d in tools[0].function_declarations}
        assert names == {"lookup_account", "check_balance"}

    def test_build_single_tool(self):
        tools = build_tools(["transfer_to_human"])
        assert len(tools[0].function_declarations) == 1
        assert tools[0].function_declarations[0].name == "transfer_to_human"

    def test_build_empty_returns_empty(self):
        tools = build_tools([])
        assert tools == []

    def test_unknown_tool_raises(self):
        with pytest.raises(ValueError, match="Unknown tool 'nonexistent'"):
            build_tools(["nonexistent"])

    def test_unknown_mixed_raises(self):
        with pytest.raises(ValueError, match="Unknown tool"):
            build_tools(["lookup_account", "fake_tool"])


# ---------------------------------------------------------------------------
# SessionConfig with tools unit tests
# ---------------------------------------------------------------------------


class TestSessionConfigTools:
    def test_default_no_tools(self):
        config = SessionConfig()
        assert config.tool_names is None

    def test_custom_tools(self):
        config = SessionConfig(tool_names=["lookup_account", "check_balance"])
        assert config.tool_names == ["lookup_account", "check_balance"]

    def test_all_tools(self):
        config = SessionConfig(tool_names=list(DEFAULT_TOOLS))
        assert len(config.tool_names) == 4

    def test_empty_tools(self):
        config = SessionConfig(tool_names=[])
        assert config.tool_names == []


# ---------------------------------------------------------------------------
# FunctionCallPart unit tests
# ---------------------------------------------------------------------------


class TestFunctionCallPart:
    def test_basic_creation(self):
        part = FunctionCallPart(
            call_id="fc-123",
            name="lookup_account",
            args={"phone_number": "+977123"},
        )
        assert part.call_id == "fc-123"
        assert part.name == "lookup_account"
        assert part.args == {"phone_number": "+977123"}

    def test_empty_args_default(self):
        part = FunctionCallPart(call_id="fc-1", name="transfer_to_human")
        assert part.args == {}

    def test_serialization(self):
        part = FunctionCallPart(
            call_id="fc-1",
            name="check_balance",
            args={"org_id": "abc-123"},
        )
        data = part.model_dump()
        assert data["call_id"] == "fc-1"
        assert data["name"] == "check_balance"
        assert data["args"]["org_id"] == "abc-123"


# ---------------------------------------------------------------------------
# AgentResponse with tool_calls unit tests
# ---------------------------------------------------------------------------


class TestAgentResponseToolCalls:
    def test_default_no_tool_calls(self):
        resp = AgentResponse()
        assert resp.tool_calls == []
        assert resp.has_tool_calls is False

    def test_with_tool_calls(self):
        resp = AgentResponse(
            tool_calls=[
                FunctionCallPart(call_id="fc-1", name="lookup_account", args={"phone_number": "+977123"}),
            ]
        )
        assert resp.has_tool_calls is True
        assert len(resp.tool_calls) == 1
        assert resp.tool_calls[0].name == "lookup_account"

    def test_multiple_tool_calls(self):
        resp = AgentResponse(
            tool_calls=[
                FunctionCallPart(call_id="fc-1", name="lookup_account", args={}),
                FunctionCallPart(call_id="fc-2", name="check_balance", args={}),
            ]
        )
        assert resp.has_tool_calls is True
        assert len(resp.tool_calls) == 2

    def test_tool_calls_with_audio(self):
        """Tool calls and audio can coexist in theory."""
        resp = AgentResponse(
            audio_data=b"\x00" * 100,
            tool_calls=[FunctionCallPart(call_id="fc-1", name="lookup_account", args={})],
        )
        assert resp.has_tool_calls is True
        assert resp.audio_data is not None


# ---------------------------------------------------------------------------
# ToolResult unit tests
# ---------------------------------------------------------------------------


class TestToolResult:
    def test_to_function_response(self):
        result = ToolResult(
            name="lookup_account",
            call_id="fc-1",
            result={"found": True, "name": "Test User"},
        )
        fr = result.to_function_response()
        assert fr.name == "lookup_account"
        assert fr.id == "fc-1"
        assert fr.response == {"found": True, "name": "Test User"}


# ---------------------------------------------------------------------------
# ToolExecutor unit tests
# ---------------------------------------------------------------------------


class TestToolExecutor:
    @pytest.mark.asyncio
    async def test_execute_unknown_tool(self):
        executor = ToolExecutor()
        result = await executor.execute("nonexistent", {}, call_id="fc-1")
        assert "error" in result.result
        assert "Unknown tool" in result.result["error"]

    @pytest.mark.asyncio
    async def test_execute_transfer_to_human(self):
        """transfer_to_human doesn't need DB, should always work."""
        executor = ToolExecutor()
        result = await executor.execute(
            "transfer_to_human",
            {"reason": "caller_request", "summary": "Customer wants help"},
            call_id="fc-1",
        )
        assert result.result["action"] == "transfer_to_human"
        assert result.result["reason"] == "caller_request"
        assert result.result["summary"] == "Customer wants help"
        assert result.result["status"] == "transfer_requested"

    @pytest.mark.asyncio
    async def test_execute_transfer_default_reason(self):
        executor = ToolExecutor()
        result = await executor.execute("transfer_to_human", {}, call_id="fc-1")
        assert result.result["reason"] == "unspecified"

    @pytest.mark.asyncio
    async def test_execute_lookup_no_db(self):
        executor = ToolExecutor()
        result = await executor.execute(
            "lookup_account", {"phone_number": "+977123"}, call_id="fc-1"
        )
        assert "error" in result.result
        assert "Database not available" in result.result["error"]

    @pytest.mark.asyncio
    async def test_execute_check_balance_no_db(self):
        executor = ToolExecutor()
        result = await executor.execute(
            "check_balance", {"org_id": str(uuid.uuid4())}, call_id="fc-1"
        )
        assert "error" in result.result

    @pytest.mark.asyncio
    async def test_execute_initiate_payment_no_db(self):
        executor = ToolExecutor()
        result = await executor.execute(
            "initiate_payment", {"org_id": str(uuid.uuid4()), "amount": 100}, call_id="fc-1"
        )
        assert "error" in result.result

    @pytest.mark.asyncio
    async def test_execute_lookup_missing_phone(self):
        executor = ToolExecutor(db_session_factory=MagicMock())
        result = await executor.execute("lookup_account", {}, call_id="fc-1")
        assert "error" in result.result
        assert "phone_number is required" in result.result["error"]

    @pytest.mark.asyncio
    async def test_execute_check_balance_missing_org(self):
        executor = ToolExecutor(db_session_factory=MagicMock())
        result = await executor.execute("check_balance", {}, call_id="fc-1")
        assert "error" in result.result
        assert "org_id is required" in result.result["error"]

    @pytest.mark.asyncio
    async def test_execute_check_balance_invalid_uuid(self):
        executor = ToolExecutor(db_session_factory=MagicMock())
        result = await executor.execute(
            "check_balance", {"org_id": "not-a-uuid"}, call_id="fc-1"
        )
        assert "error" in result.result
        assert "Invalid org_id" in result.result["error"]

    @pytest.mark.asyncio
    async def test_execute_payment_invalid_amount(self):
        executor = ToolExecutor(db_session_factory=MagicMock())
        result = await executor.execute(
            "initiate_payment", {"org_id": str(uuid.uuid4()), "amount": -10}, call_id="fc-1"
        )
        assert "error" in result.result
        assert "amount must be positive" in result.result["error"]

    @pytest.mark.asyncio
    async def test_execute_payment_zero_amount(self):
        executor = ToolExecutor(db_session_factory=MagicMock())
        result = await executor.execute(
            "initiate_payment", {"org_id": str(uuid.uuid4()), "amount": 0}, call_id="fc-1"
        )
        assert "error" in result.result
        assert "amount must be positive" in result.result["error"]

    @pytest.mark.asyncio
    async def test_execute_exception_caught(self):
        """Exceptions during execution should be caught and returned as errors."""
        executor = ToolExecutor()

        # Monkey-patch to raise
        async def _boom(args):
            raise RuntimeError("DB exploded")

        executor._lookup_account = _boom

        result = await executor.execute(
            "lookup_account", {"phone_number": "+977123"}, call_id="fc-1"
        )
        assert "error" in result.result
        assert "Tool execution failed" in result.result["error"]

    @pytest.mark.asyncio
    async def test_lookup_account_with_mock_db(self):
        """Test lookup_account with a mocked database returning a contact."""
        mock_contact = MagicMock()
        mock_contact.id = uuid.uuid4()
        mock_contact.org_id = uuid.uuid4()
        mock_contact.name = "Test User"
        mock_contact.phone = "+9771234567"
        mock_contact.carrier = "Ncell"
        mock_contact.metadata_ = {"age": "25", "city": "Kathmandu"}

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_contact

        mock_db = MagicMock()
        mock_db.execute.return_value = mock_result

        executor = ToolExecutor(db_session_factory=lambda: mock_db)
        result = await executor.execute(
            "lookup_account", {"phone_number": "+9771234567"}, call_id="fc-1"
        )

        assert result.result["found"] is True
        assert result.result["name"] == "Test User"
        assert result.result["phone"] == "+9771234567"
        assert result.result["carrier"] == "Ncell"
        assert result.result["attributes"]["city"] == "Kathmandu"
        mock_db.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_lookup_account_not_found(self):
        """Test lookup_account when contact doesn't exist."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_db = MagicMock()
        mock_db.execute.return_value = mock_result

        executor = ToolExecutor(db_session_factory=lambda: mock_db)
        result = await executor.execute(
            "lookup_account", {"phone_number": "+977999"}, call_id="fc-1"
        )

        assert result.result["found"] is False
        mock_db.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_check_balance_with_mock_db(self):
        """Test check_balance with a mocked credit record."""
        org_id = uuid.uuid4()

        mock_credit = MagicMock()
        mock_credit.org_id = org_id
        mock_credit.balance = 500.0
        mock_credit.total_purchased = 1000.0
        mock_credit.total_consumed = 500.0

        mock_db = MagicMock()

        with patch("app.services.credits.get_balance", return_value=mock_credit):
            executor = ToolExecutor(db_session_factory=lambda: mock_db)
            result = await executor.execute(
                "check_balance", {"org_id": str(org_id)}, call_id="fc-1"
            )

        assert result.result["balance"] == 500.0
        assert result.result["total_purchased"] == 1000.0
        assert result.result["total_consumed"] == 500.0
        assert result.result["currency"] == "NPR"
        mock_db.close.assert_called_once()


# ---------------------------------------------------------------------------
# Client _build_live_config with tools unit tests
# ---------------------------------------------------------------------------


class TestClientBuildLiveConfigTools:
    def test_no_tools_no_tools_config(self):
        from app.services.interactive_agent.client import _build_live_config

        config = SessionConfig(tool_names=None)
        live_config = _build_live_config(config)
        assert live_config.tools is None

    def test_with_tools_adds_to_config(self):
        from app.services.interactive_agent.client import _build_live_config

        config = SessionConfig(tool_names=["lookup_account", "check_balance"])
        live_config = _build_live_config(config)
        assert live_config.tools is not None
        assert len(live_config.tools) == 1
        assert len(live_config.tools[0].function_declarations) == 2

    def test_all_tools_in_config(self):
        from app.services.interactive_agent.client import _build_live_config

        config = SessionConfig(tool_names=list(DEFAULT_TOOLS))
        live_config = _build_live_config(config)
        assert live_config.tools is not None
        assert len(live_config.tools[0].function_declarations) == 4

    def test_invalid_tool_name_raises(self):
        from app.services.interactive_agent.client import _build_live_config
        from app.services.interactive_agent.exceptions import GeminiConfigurationError

        config = SessionConfig(tool_names=["nonexistent_tool"])
        with pytest.raises(GeminiConfigurationError, match="Unknown tool"):
            _build_live_config(config)

    def test_empty_tools_no_tools_config(self):
        from app.services.interactive_agent.client import _build_live_config

        config = SessionConfig(tool_names=[])
        live_config = _build_live_config(config)
        # Empty list shouldn't add tools
        assert live_config.tools is None


# ---------------------------------------------------------------------------
# Client send_tool_response unit tests
# ---------------------------------------------------------------------------


class TestClientSendToolResponse:
    @pytest.mark.asyncio
    @patch("app.services.interactive_agent.client.genai.Client")
    async def test_send_tool_response_before_connect_raises(self, mock_genai_client_cls):
        from app.services.interactive_agent.client import GeminiLiveClient
        from app.services.interactive_agent.exceptions import GeminiClientError

        client = GeminiLiveClient(api_key="test-key", config=SessionConfig())
        with pytest.raises(GeminiClientError, match="not connected"):
            await client.send_tool_response([])

    @pytest.mark.asyncio
    @patch("app.services.interactive_agent.client.genai.Client")
    async def test_send_tool_response_delegates(self, mock_genai_client_cls):
        from google.genai.types import FunctionResponse

        from app.services.interactive_agent.client import GeminiLiveClient

        client = GeminiLiveClient(api_key="test-key", config=SessionConfig())

        # Simulate connected state
        mock_session = AsyncMock()
        client._session = mock_session
        client._connected = True

        responses = [
            FunctionResponse(id="fc-1", name="lookup_account", response={"found": True}),
        ]
        await client.send_tool_response(responses)

        mock_session.send_tool_response.assert_awaited_once_with(
            function_responses=responses,
        )


# ---------------------------------------------------------------------------
# Client receive() tool_call detection unit tests
# ---------------------------------------------------------------------------


class TestClientReceiveToolCalls:
    @pytest.mark.asyncio
    @patch("app.services.interactive_agent.client.genai.Client")
    async def test_receive_detects_tool_call(self, mock_genai_client_cls):
        from app.services.interactive_agent.client import GeminiLiveClient

        client = GeminiLiveClient(api_key="test-key", config=SessionConfig())

        # Mock a Gemini message with tool_call
        mock_fc = MagicMock()
        mock_fc.id = "fc-1"
        mock_fc.name = "lookup_account"
        mock_fc.args = {"phone_number": "+977123"}

        mock_tool_call = MagicMock()
        mock_tool_call.function_calls = [mock_fc]

        mock_message = MagicMock()
        mock_message.tool_call = mock_tool_call
        mock_message.server_content = None
        mock_message.session_resumption_update = None
        mock_message.go_away = None

        # Create async iterator mock
        async def _fake_receive():
            yield mock_message

        mock_session = MagicMock()
        mock_session.receive.return_value = _fake_receive()
        client._session = mock_session
        client._connected = True

        responses = []
        async for resp in client.receive():
            responses.append(resp)

        assert len(responses) == 1
        assert responses[0].has_tool_calls
        assert responses[0].tool_calls[0].call_id == "fc-1"
        assert responses[0].tool_calls[0].name == "lookup_account"
        assert responses[0].tool_calls[0].args == {"phone_number": "+977123"}

    @pytest.mark.asyncio
    @patch("app.services.interactive_agent.client.genai.Client")
    async def test_receive_multiple_function_calls(self, mock_genai_client_cls):
        from app.services.interactive_agent.client import GeminiLiveClient

        client = GeminiLiveClient(api_key="test-key", config=SessionConfig())

        mock_fc1 = MagicMock()
        mock_fc1.id = "fc-1"
        mock_fc1.name = "lookup_account"
        mock_fc1.args = {"phone_number": "+977123"}

        mock_fc2 = MagicMock()
        mock_fc2.id = "fc-2"
        mock_fc2.name = "check_balance"
        mock_fc2.args = {"org_id": "abc"}

        mock_tool_call = MagicMock()
        mock_tool_call.function_calls = [mock_fc1, mock_fc2]

        mock_message = MagicMock()
        mock_message.tool_call = mock_tool_call
        mock_message.server_content = None
        mock_message.session_resumption_update = None
        mock_message.go_away = None

        async def _fake_receive():
            yield mock_message

        mock_session = MagicMock()
        mock_session.receive.return_value = _fake_receive()
        client._session = mock_session
        client._connected = True

        responses = []
        async for resp in client.receive():
            responses.append(resp)

        assert len(responses) == 1
        assert len(responses[0].tool_calls) == 2

    @pytest.mark.asyncio
    @patch("app.services.interactive_agent.client.genai.Client")
    async def test_receive_tool_call_then_audio(self, mock_genai_client_cls):
        """Tool call followed by audio response (after tool_response sent)."""
        from app.services.interactive_agent.client import GeminiLiveClient

        client = GeminiLiveClient(api_key="test-key", config=SessionConfig())

        # Tool call message
        mock_fc = MagicMock()
        mock_fc.id = "fc-1"
        mock_fc.name = "lookup_account"
        mock_fc.args = {}

        mock_tool_call = MagicMock()
        mock_tool_call.function_calls = [mock_fc]

        tool_msg = MagicMock()
        tool_msg.tool_call = mock_tool_call
        tool_msg.server_content = None
        tool_msg.session_resumption_update = None
        tool_msg.go_away = None

        # Audio message
        mock_server_content = MagicMock()
        mock_server_content.model_turn = None
        mock_server_content.input_transcription = None
        mock_server_content.output_transcription = None
        mock_server_content.turn_complete = True
        mock_server_content.interrupted = False

        audio_msg = MagicMock()
        audio_msg.tool_call = None
        audio_msg.server_content = mock_server_content
        audio_msg.data = b"\x00" * 100
        audio_msg.text = None
        audio_msg.session_resumption_update = None
        audio_msg.go_away = None

        async def _fake_receive():
            yield tool_msg
            yield audio_msg

        mock_session = MagicMock()
        mock_session.receive.return_value = _fake_receive()
        client._session = mock_session
        client._connected = True

        responses = []
        async for resp in client.receive():
            responses.append(resp)

        assert len(responses) == 2
        assert responses[0].has_tool_calls
        assert responses[1].is_turn_complete
        assert responses[1].audio_data == b"\x00" * 100


# ---------------------------------------------------------------------------
# Session send_tool_response unit tests
# ---------------------------------------------------------------------------


class TestSessionSendToolResponse:
    @pytest.mark.asyncio
    async def test_send_tool_response_delegates(self):
        from app.services.interactive_agent.session import AgentSession

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.connect = AsyncMock()
            mock_instance.send_tool_response = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            session = AgentSession(api_key="test-key", config=SessionConfig())
            await session.start()

            from google.genai.types import FunctionResponse

            responses = [
                FunctionResponse(id="fc-1", name="lookup_account", response={"found": True}),
            ]
            await session.send_tool_response(responses)

            mock_instance.send_tool_response.assert_awaited_once_with(responses)

    @pytest.mark.asyncio
    async def test_send_tool_response_when_closed_raises(self):
        from app.services.interactive_agent.exceptions import SessionError
        from app.services.interactive_agent.session import AgentSession

        with patch("app.services.interactive_agent.session.GeminiLiveClient") as MockClient:
            mock_instance = AsyncMock()
            mock_instance.resumption_handle = None
            MockClient.return_value = mock_instance

            session = AgentSession(api_key="test-key", config=SessionConfig())
            with pytest.raises(SessionError, match="not active"):
                await session.send_tool_response([])


# ---------------------------------------------------------------------------
# Gateway bridge models unit tests
# ---------------------------------------------------------------------------


class TestGatewayBridgeModels:
    def test_tool_execution_message(self):
        from app.services.gateway_bridge.models import (
            BackendMessageType,
            ToolExecutionMessage,
        )

        msg = ToolExecutionMessage(
            call_id="call-1",
            tool_name="lookup_account",
            tool_call_id="fc-1",
            status="executing",
        )
        assert msg.type == BackendMessageType.TOOL_EXECUTION
        data = json.loads(msg.model_dump_json())
        assert data["type"] == "TOOL_EXECUTION"
        assert data["tool_name"] == "lookup_account"
        assert data["tool_call_id"] == "fc-1"
        assert data["status"] == "executing"

    def test_tool_execution_completed(self):
        from app.services.gateway_bridge.models import ToolExecutionMessage

        msg = ToolExecutionMessage(
            call_id="call-1",
            tool_name="check_balance",
            tool_call_id="fc-2",
            status="completed",
        )
        data = json.loads(msg.model_dump_json())
        assert data["status"] == "completed"

    def test_backend_message_type_includes_tool_execution(self):
        from app.services.gateway_bridge.models import BackendMessageType

        assert BackendMessageType.TOOL_EXECUTION == "TOOL_EXECUTION"


# ---------------------------------------------------------------------------
# Gateway bridge tool call handling unit tests
# ---------------------------------------------------------------------------


class TestGatewayBridgeToolCalls:
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

    def _make_mock_call_manager(self, mock_session):
        from app.services.gateway_bridge.call_manager import CallManager, CallRecord

        mgr = AsyncMock(spec=CallManager)
        mock_record = CallRecord(
            call_id="call-1",
            gateway_id="gw-1",
            caller_number="+977123",
            session=mock_session,
        )
        mgr.create_session = AsyncMock(return_value=mock_record)
        mgr.get_session = MagicMock(return_value=mock_session)
        mgr.end_session = AsyncMock()
        return mgr

    @pytest.mark.asyncio
    async def test_bridge_handles_tool_call_in_relay(self):
        """When Gemini returns a tool_call, bridge should execute and respond."""
        import asyncio

        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()

        # Create a mock session that yields a tool_call then turn_complete
        mock_session = AsyncMock()
        mock_session.session_id = "gemini-sess-1"
        mock_session.send_tool_response = AsyncMock()

        tool_response = AgentResponse(
            tool_calls=[FunctionCallPart(call_id="fc-1", name="transfer_to_human", args={"reason": "test"})],
        )
        turn_complete_response = AgentResponse(is_turn_complete=True)

        async def _fake_receive():
            yield tool_response
            yield turn_complete_response

        mock_session.receive = _fake_receive

        mgr = self._make_mock_call_manager(mock_session)

        # Create a tool executor
        tool_executor = ToolExecutor()

        call_msg = json.dumps({
            "type": "CALL_CONNECTED",
            "call_id": "call-1",
            "caller_number": "+977123",
            "gateway_id": "gw-1",
        })

        # Use an event to delay disconnect until relay processes
        relay_done = asyncio.Event()

        original_send_tool_response = mock_session.send_tool_response

        async def _send_and_signal(*args, **kwargs):
            await original_send_tool_response(*args, **kwargs)
            relay_done.set()

        mock_session.send_tool_response = AsyncMock(side_effect=_send_and_signal)

        call_count = 0

        async def _fake_ws_receive():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {"type": "websocket.receive", "text": call_msg}
            # Wait for relay to finish processing before disconnecting
            await relay_done.wait()
            await asyncio.sleep(0.05)
            return {"type": "websocket.disconnect"}

        ws.receive = _fake_ws_receive

        bridge = GatewayBridge(websocket=ws, call_manager=mgr, tool_executor=tool_executor)
        await bridge.run()

        # Should have sent tool response back to Gemini
        mock_session.send_tool_response.assert_awaited_once()
        tool_responses = mock_session.send_tool_response.call_args[0][0]
        assert len(tool_responses) == 1
        assert tool_responses[0].name == "transfer_to_human"

        # Should have sent TOOL_EXECUTION messages to gateway
        sent_texts = [call[0][0] for call in ws.send_text.call_args_list]
        tool_msgs = [json.loads(t) for t in sent_texts if "TOOL_EXECUTION" in t]
        assert len(tool_msgs) == 2  # executing + completed
        assert tool_msgs[0]["status"] == "executing"
        assert tool_msgs[1]["status"] == "completed"

    @pytest.mark.asyncio
    async def test_bridge_no_executor_sends_error(self):
        """When no ToolExecutor is configured, send error responses."""
        import asyncio

        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()

        mock_session = AsyncMock()
        mock_session.session_id = "gemini-sess-1"
        mock_session.send_tool_response = AsyncMock()

        tool_response = AgentResponse(
            tool_calls=[FunctionCallPart(call_id="fc-1", name="lookup_account", args={})],
        )

        async def _fake_receive():
            yield tool_response

        mock_session.receive = _fake_receive

        mgr = self._make_mock_call_manager(mock_session)

        relay_done = asyncio.Event()
        original_send = mock_session.send_tool_response

        async def _send_and_signal(*args, **kwargs):
            await original_send(*args, **kwargs)
            relay_done.set()

        mock_session.send_tool_response = AsyncMock(side_effect=_send_and_signal)

        call_msg = json.dumps({
            "type": "CALL_CONNECTED",
            "call_id": "call-1",
            "caller_number": "+977123",
            "gateway_id": "gw-1",
        })

        call_count = 0

        async def _fake_ws_receive():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {"type": "websocket.receive", "text": call_msg}
            await relay_done.wait()
            await asyncio.sleep(0.05)
            return {"type": "websocket.disconnect"}

        ws.receive = _fake_ws_receive

        # No tool_executor
        bridge = GatewayBridge(websocket=ws, call_manager=mgr, tool_executor=None)
        await bridge.run()

        # Should still send a tool response (with error)
        mock_session.send_tool_response.assert_awaited_once()
        error_responses = mock_session.send_tool_response.call_args[0][0]
        assert "error" in error_responses[0].response


# ---------------------------------------------------------------------------
# Agent call endpoint unit tests
# ---------------------------------------------------------------------------


class TestAgentCallEndpoint:
    def test_create_agent_call(self):
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)
        response = client.post(
            "/api/v1/voice/agent-call",
            json={
                "system_prompt": "You are a helpful assistant.",
                "voice_name": "Kore",
                "tools": ["lookup_account", "check_balance"],
                "temperature": 0.5,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert "config_id" in data
        assert data["available_tools"] == ["lookup_account", "check_balance"]
        assert data["session_config"]["system_instruction"] == "You are a helpful assistant."
        assert data["session_config"]["voice_name"] == "Kore"
        assert data["session_config"]["temperature"] == 0.5

    def test_create_agent_call_defaults(self):
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)
        response = client.post(
            "/api/v1/voice/agent-call",
            json={"system_prompt": "Test prompt"},
        )
        assert response.status_code == 201
        data = response.json()
        assert len(data["available_tools"]) == 4
        assert data["session_config"]["voice_name"] == "Kore"

    def test_create_agent_call_invalid_tool(self):
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)
        response = client.post(
            "/api/v1/voice/agent-call",
            json={
                "system_prompt": "Test",
                "tools": ["lookup_account", "fake_tool"],
            },
        )
        assert response.status_code == 422
        assert "Unknown tool" in response.json()["detail"]

    def test_create_agent_call_invalid_output_mode(self):
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)
        response = client.post(
            "/api/v1/voice/agent-call",
            json={
                "system_prompt": "Test",
                "output_mode": "invalid",
            },
        )
        assert response.status_code == 422

    def test_list_available_tools(self):
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)
        response = client.get("/api/v1/voice/agent-call/tools")
        assert response.status_code == 200
        data = response.json()
        assert len(data["tools"]) == 4
        names = [t["name"] for t in data["tools"]]
        assert "lookup_account" in names
        assert "check_balance" in names
        assert "initiate_payment" in names
        assert "transfer_to_human" in names
        # Each tool should have a description
        for tool in data["tools"]:
            assert "description" in tool
            assert len(tool["description"]) > 0

    def test_create_agent_call_with_callback(self):
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)
        response = client.post(
            "/api/v1/voice/agent-call",
            json={
                "system_prompt": "Test",
                "callback_url": "https://example.com/webhook",
            },
        )
        assert response.status_code == 201

        from app.api.v1.endpoints.agent_call import get_agent_callback

        config_id = response.json()["config_id"]
        assert get_agent_callback(config_id) == "https://example.com/webhook"

    def test_create_agent_call_hybrid_mode(self):
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)
        response = client.post(
            "/api/v1/voice/agent-call",
            json={
                "system_prompt": "Test",
                "output_mode": "hybrid",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["session_config"]["output_mode"] == "hybrid"
