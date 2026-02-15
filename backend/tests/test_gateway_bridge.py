"""Tests for the gateway bridge service — audio relay between Android gateways and Gemini."""

import json
import struct
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.gateway_bridge.call_manager import CallManager, CallRecord
from app.services.gateway_bridge.models import (
    BackendMessageType,
    CallConnectedMessage,
    CallEndedMessage,
    CallTranscriptMessage,
    GatewayMessageType,
    SessionErrorMessage,
    SessionReadyMessage,
    TurnCompleteMessage,
)
from app.services.gateway_bridge.resampler import (
    SOURCE_RATE,
    TARGET_RATE,
    resample_24k_to_16k,
)

# ---------------------------------------------------------------------------
# Resampler unit tests
# ---------------------------------------------------------------------------


class TestResampler:
    def test_empty_input(self):
        assert resample_24k_to_16k(b"") == b""

    def test_single_sample_passthrough(self):
        """Single sample can't be interpolated, should pass through."""
        data = struct.pack("<h", 1000)
        result = resample_24k_to_16k(data)
        assert result == data

    def test_invalid_length_raises(self):
        with pytest.raises(ValueError, match="multiple of 2"):
            resample_24k_to_16k(b"\x00\x01\x02")  # 3 bytes, not multiple of 2

    def test_output_sample_count_ratio(self):
        """Output should have ~2/3 the samples of input (24kHz → 16kHz)."""
        num_input = 300  # 300 samples at 24kHz
        data = struct.pack(f"<{num_input}h", *range(num_input))
        result = resample_24k_to_16k(data)
        num_output = len(result) // 2
        expected = int(num_input * TARGET_RATE / SOURCE_RATE)
        assert num_output == expected

    def test_output_is_valid_pcm(self):
        """Output bytes should be valid 16-bit PCM (even length, parseable)."""
        num_input = 240
        data = struct.pack(f"<{num_input}h", *[i * 100 for i in range(num_input)])
        result = resample_24k_to_16k(data)
        assert len(result) % 2 == 0
        # Should be able to unpack without error
        num_output = len(result) // 2
        samples = struct.unpack(f"<{num_output}h", result)
        # All samples within 16-bit range
        assert all(-32768 <= s <= 32767 for s in samples)

    def test_silence_stays_silent(self):
        """All-zero input should produce all-zero output."""
        num_input = 240
        data = b"\x00\x00" * num_input
        result = resample_24k_to_16k(data)
        num_output = len(result) // 2
        samples = struct.unpack(f"<{num_output}h", result)
        assert all(s == 0 for s in samples)

    def test_dc_signal_preserved(self):
        """Constant (DC) signal should stay constant after resampling."""
        dc_value = 5000
        num_input = 300
        data = struct.pack(f"<{num_input}h", *[dc_value] * num_input)
        result = resample_24k_to_16k(data)
        num_output = len(result) // 2
        samples = struct.unpack(f"<{num_output}h", result)
        assert all(s == dc_value for s in samples)

    def test_clipping_prevention(self):
        """Near-max values should not overflow after interpolation."""
        # Alternating near-max values
        values = [32767, -32768] * 150
        data = struct.pack(f"<{len(values)}h", *values)
        result = resample_24k_to_16k(data)
        num_output = len(result) // 2
        samples = struct.unpack(f"<{num_output}h", result)
        assert all(-32768 <= s <= 32767 for s in samples)

    def test_small_chunk(self):
        """Small but valid input (6 samples = 12 bytes)."""
        values = [100, 200, 300, 400, 500, 600]
        data = struct.pack(f"<{len(values)}h", *values)
        result = resample_24k_to_16k(data)
        assert len(result) > 0
        assert len(result) % 2 == 0


# ---------------------------------------------------------------------------
# Protocol models unit tests
# ---------------------------------------------------------------------------


class TestProtocolModels:
    def test_call_connected_message(self):
        msg = CallConnectedMessage(
            call_id="call-1",
            caller_number="+9771234567",
            gateway_id="gw-1",
        )
        assert msg.type == GatewayMessageType.CALL_CONNECTED
        data = json.loads(msg.model_dump_json())
        assert data["type"] == "CALL_CONNECTED"
        assert data["call_id"] == "call-1"

    def test_call_ended_message_defaults(self):
        msg = CallEndedMessage(call_id="call-1")
        assert msg.reason == "hangup"
        assert msg.type == GatewayMessageType.CALL_ENDED

    def test_call_ended_message_custom_reason(self):
        msg = CallEndedMessage(call_id="call-1", reason="error")
        assert msg.reason == "error"

    def test_session_ready_message(self):
        msg = SessionReadyMessage(call_id="call-1", session_id="sess-1")
        assert msg.type == BackendMessageType.SESSION_READY
        data = json.loads(msg.model_dump_json())
        assert data["session_id"] == "sess-1"

    def test_session_error_message(self):
        msg = SessionErrorMessage(call_id="call-1", error="pool exhausted")
        assert msg.type == BackendMessageType.SESSION_ERROR
        data = json.loads(msg.model_dump_json())
        assert data["error"] == "pool exhausted"

    def test_turn_complete_message(self):
        msg = TurnCompleteMessage(
            call_id="call-1",
            output_transcript="Hello, how can I help?",
            was_interrupted=False,
        )
        assert msg.type == BackendMessageType.TURN_COMPLETE
        data = json.loads(msg.model_dump_json())
        assert data["was_interrupted"] is False
        assert data["output_transcript"] == "Hello, how can I help?"

    def test_turn_complete_interrupted(self):
        msg = TurnCompleteMessage(
            call_id="call-1",
            was_interrupted=True,
        )
        data = json.loads(msg.model_dump_json())
        assert data["was_interrupted"] is True

    def test_call_transcript_message(self):
        msg = CallTranscriptMessage(
            call_id="call-1",
            speaker="caller",
            text="I need help with my account",
        )
        assert msg.type == BackendMessageType.CALL_TRANSCRIPT
        data = json.loads(msg.model_dump_json())
        assert data["speaker"] == "caller"

    def test_gateway_message_types(self):
        assert GatewayMessageType.CALL_CONNECTED == "CALL_CONNECTED"
        assert GatewayMessageType.CALL_ENDED == "CALL_ENDED"

    def test_backend_message_types(self):
        assert BackendMessageType.SESSION_READY == "SESSION_READY"
        assert BackendMessageType.SESSION_ERROR == "SESSION_ERROR"
        assert BackendMessageType.TURN_COMPLETE == "TURN_COMPLETE"
        assert BackendMessageType.CALL_TRANSCRIPT == "CALL_TRANSCRIPT"


# ---------------------------------------------------------------------------
# CallManager unit tests
# ---------------------------------------------------------------------------


class TestCallManager:
    def _make_mock_pool(self):
        pool = AsyncMock()
        mock_session = AsyncMock()
        mock_session.session_id = "gemini-sess-1"
        pool.acquire = AsyncMock(return_value=mock_session)
        pool.release = AsyncMock()
        return pool, mock_session

    @pytest.mark.asyncio
    async def test_create_session(self):
        pool, mock_session = self._make_mock_pool()
        mgr = CallManager(pool=pool)

        record = await mgr.create_session("call-1", "gw-1", "+977123")
        assert record.call_id == "call-1"
        assert record.gateway_id == "gw-1"
        assert record.caller_number == "+977123"
        assert record.session is mock_session
        assert mgr.active_call_count == 1

    @pytest.mark.asyncio
    async def test_duplicate_call_id_raises(self):
        pool, _ = self._make_mock_pool()
        mgr = CallManager(pool=pool)

        await mgr.create_session("call-1", "gw-1", "+977123")
        with pytest.raises(ValueError, match="already has an active session"):
            await mgr.create_session("call-1", "gw-2", "+977456")

    @pytest.mark.asyncio
    async def test_get_session(self):
        pool, mock_session = self._make_mock_pool()
        mgr = CallManager(pool=pool)

        await mgr.create_session("call-1", "gw-1", "+977123")
        session = mgr.get_session("call-1")
        assert session is mock_session

    @pytest.mark.asyncio
    async def test_get_session_nonexistent(self):
        pool, _ = self._make_mock_pool()
        mgr = CallManager(pool=pool)
        assert mgr.get_session("nonexistent") is None

    @pytest.mark.asyncio
    async def test_get_record(self):
        pool, _ = self._make_mock_pool()
        mgr = CallManager(pool=pool)

        await mgr.create_session("call-1", "gw-1", "+977123")
        record = mgr.get_record("call-1")
        assert record is not None
        assert record.call_id == "call-1"
        assert record.started_at is not None

    @pytest.mark.asyncio
    async def test_end_session(self):
        pool, mock_session = self._make_mock_pool()
        mgr = CallManager(pool=pool)

        await mgr.create_session("call-1", "gw-1", "+977123")
        await mgr.end_session("call-1")

        assert mgr.active_call_count == 0
        pool.release.assert_awaited_once_with("gemini-sess-1")

    @pytest.mark.asyncio
    async def test_end_session_idempotent(self):
        pool, _ = self._make_mock_pool()
        mgr = CallManager(pool=pool)

        await mgr.create_session("call-1", "gw-1", "+977123")
        await mgr.end_session("call-1")
        await mgr.end_session("call-1")  # should not raise
        assert mgr.active_call_count == 0

    @pytest.mark.asyncio
    async def test_teardown_all(self):
        pool, _ = self._make_mock_pool()
        mgr = CallManager(pool=pool)

        await mgr.create_session("call-1", "gw-1", "+977123")

        # Create a second session with a different session_id
        mock_session_2 = AsyncMock()
        mock_session_2.session_id = "gemini-sess-2"
        pool.acquire = AsyncMock(return_value=mock_session_2)
        await mgr.create_session("call-2", "gw-2", "+977456")

        assert mgr.active_call_count == 2
        await mgr.teardown_all()
        assert mgr.active_call_count == 0

    @pytest.mark.asyncio
    async def test_teardown_all_empty(self):
        pool, _ = self._make_mock_pool()
        mgr = CallManager(pool=pool)
        await mgr.teardown_all()  # should not raise
        assert mgr.active_call_count == 0


# ---------------------------------------------------------------------------
# GatewayBridge unit tests
# ---------------------------------------------------------------------------


class TestGatewayBridge:
    def _make_mock_ws(self):
        """Create a mock WebSocket with controllable receive queue."""
        ws = AsyncMock()
        ws.client = MagicMock()
        ws.client.host = "192.168.1.100"
        ws.client.port = 54321
        ws.accept = AsyncMock()
        ws.send_text = AsyncMock()
        ws.send_bytes = AsyncMock()
        ws.client_state = MagicMock()
        ws.client_state.__eq__ = lambda self, other: True  # Always "CONNECTED"
        return ws

    def _make_mock_call_manager(self):
        """Create a mock CallManager."""
        mgr = AsyncMock(spec=CallManager)
        mock_session = AsyncMock()
        mock_session.session_id = "gemini-sess-1"

        # receive() should return an async iterator
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
        yield  # make it an async generator

    @pytest.mark.asyncio
    async def test_call_connected_creates_session(self):
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, mock_session = self._make_mock_call_manager()

        call_msg = json.dumps(
            {
                "type": "CALL_CONNECTED",
                "call_id": "call-1",
                "caller_number": "+977123",
                "gateway_id": "gw-1",
            }
        )

        # Simulate: receive CALL_CONNECTED, then disconnect
        ws.receive = AsyncMock(
            side_effect=[
                {"type": "websocket.receive", "text": call_msg},
                {"type": "websocket.disconnect"},
            ]
        )

        bridge = GatewayBridge(websocket=ws, call_manager=mgr)
        await bridge.run()

        mgr.create_session.assert_awaited_once_with(
            call_id="call-1",
            gateway_id="gw-1",
            caller_number="+977123",
            session_config=None,
        )
        # Should have sent SESSION_READY
        ws.send_text.assert_called()
        sent_data = json.loads(ws.send_text.call_args_list[0][0][0])
        assert sent_data["type"] == "SESSION_READY"
        assert sent_data["call_id"] == "call-1"

    @pytest.mark.asyncio
    async def test_call_ended_tears_down(self):
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, mock_session = self._make_mock_call_manager()

        call_msg = json.dumps(
            {
                "type": "CALL_CONNECTED",
                "call_id": "call-1",
                "caller_number": "+977123",
                "gateway_id": "gw-1",
            }
        )
        end_msg = json.dumps(
            {
                "type": "CALL_ENDED",
                "call_id": "call-1",
                "reason": "hangup",
            }
        )

        ws.receive = AsyncMock(
            side_effect=[
                {"type": "websocket.receive", "text": call_msg},
                {"type": "websocket.receive", "text": end_msg},
                {"type": "websocket.disconnect"},
            ]
        )

        bridge = GatewayBridge(websocket=ws, call_manager=mgr)
        await bridge.run()

        mgr.end_session.assert_awaited_with("call-1")

    @pytest.mark.asyncio
    async def test_audio_forwarded_to_gemini(self):
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, mock_session = self._make_mock_call_manager()

        call_msg = json.dumps(
            {
                "type": "CALL_CONNECTED",
                "call_id": "call-1",
                "caller_number": "+977123",
                "gateway_id": "gw-1",
            }
        )
        pcm_data = b"\x00\x01" * 160  # 320 bytes of PCM

        ws.receive = AsyncMock(
            side_effect=[
                {"type": "websocket.receive", "text": call_msg},
                {"type": "websocket.receive", "bytes": pcm_data},
                {"type": "websocket.disconnect"},
            ]
        )

        bridge = GatewayBridge(websocket=ws, call_manager=mgr)
        await bridge.run()

        mock_session.send_audio.assert_awaited_once()
        sent_chunk = mock_session.send_audio.call_args[0][0]
        assert sent_chunk.data == pcm_data

    @pytest.mark.asyncio
    async def test_audio_without_active_call_discarded(self):
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, mock_session = self._make_mock_call_manager()

        pcm_data = b"\x00\x01" * 160

        ws.receive = AsyncMock(
            side_effect=[
                {"type": "websocket.receive", "bytes": pcm_data},
                {"type": "websocket.disconnect"},
            ]
        )

        bridge = GatewayBridge(websocket=ws, call_manager=mgr)
        await bridge.run()

        # No session, so send_audio should not be called
        mock_session.send_audio.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_session_error_sends_error_message(self):
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, _ = self._make_mock_call_manager()
        mgr.create_session = AsyncMock(side_effect=Exception("pool exhausted"))

        call_msg = json.dumps(
            {
                "type": "CALL_CONNECTED",
                "call_id": "call-1",
                "caller_number": "+977123",
                "gateway_id": "gw-1",
            }
        )

        ws.receive = AsyncMock(
            side_effect=[
                {"type": "websocket.receive", "text": call_msg},
                {"type": "websocket.disconnect"},
            ]
        )

        bridge = GatewayBridge(websocket=ws, call_manager=mgr)
        await bridge.run()

        ws.send_text.assert_called()
        sent_data = json.loads(ws.send_text.call_args_list[0][0][0])
        assert sent_data["type"] == "SESSION_ERROR"
        assert "pool exhausted" in sent_data["error"]

    @pytest.mark.asyncio
    async def test_invalid_json_ignored(self):
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, _ = self._make_mock_call_manager()

        ws.receive = AsyncMock(
            side_effect=[
                {"type": "websocket.receive", "text": "not valid json{{{"},
                {"type": "websocket.disconnect"},
            ]
        )

        bridge = GatewayBridge(websocket=ws, call_manager=mgr)
        await bridge.run()  # should not raise

    @pytest.mark.asyncio
    async def test_unknown_message_type_ignored(self):
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, _ = self._make_mock_call_manager()

        ws.receive = AsyncMock(
            side_effect=[
                {"type": "websocket.receive", "text": json.dumps({"type": "UNKNOWN_TYPE"})},
                {"type": "websocket.disconnect"},
            ]
        )

        bridge = GatewayBridge(websocket=ws, call_manager=mgr)
        await bridge.run()  # should not raise

    @pytest.mark.asyncio
    async def test_disconnect_triggers_cleanup(self):
        from app.services.gateway_bridge.bridge import GatewayBridge

        ws = self._make_mock_ws()
        mgr, _ = self._make_mock_call_manager()

        call_msg = json.dumps(
            {
                "type": "CALL_CONNECTED",
                "call_id": "call-1",
                "caller_number": "+977123",
                "gateway_id": "gw-1",
            }
        )

        ws.receive = AsyncMock(
            side_effect=[
                {"type": "websocket.receive", "text": call_msg},
                {"type": "websocket.disconnect"},
            ]
        )

        bridge = GatewayBridge(websocket=ws, call_manager=mgr)
        await bridge.run()

        # Cleanup should have ended the session
        mgr.end_session.assert_awaited_with("call-1")
