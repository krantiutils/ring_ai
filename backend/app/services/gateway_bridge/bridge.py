"""Gateway audio bridge — relays PCM audio between Android gateway and Gemini.

Each active call runs two concurrent async tasks:
1. gateway_to_gemini: reads binary PCM from the WebSocket, forwards to Gemini
2. gemini_to_gateway: reads AgentResponses from Gemini, resamples audio
   from 24 kHz to 16 kHz, sends binary PCM back to the gateway

Inbound call routing:
    1. Gateway sends INCOMING_CALL → bridge evaluates routing rules
    2. Bridge sends ANSWER_CALL / REJECT_CALL / FORWARD_CALL decision
    3. On ANSWER: gateway answers, sends CALL_CONNECTED → bridge creates
       Gemini session and starts audio relay

Barge-in is handled natively by Gemini's send_realtime_input — sending
caller audio while Gemini is speaking triggers interruption. The bridge
detects `is_interrupted` on the response and stops forwarding stale audio.

Function calling: When Gemini returns a tool_call, the bridge pauses audio
forwarding, executes the function via the ToolExecutor, sends the result
back to Gemini, and resumes audio relay. Tool execution is async and
non-blocking to the main event loop.

Lifecycle:
    1. Gateway sends INCOMING_CALL → bridge routes, sends decision
    2. If ANSWER → gateway sends CALL_CONNECTED → bridge creates Gemini session
    3. Audio flows bidirectionally until CALL_ENDED
    3a. Tool calls are handled inline during the audio relay
    4. On CALL_ENDED or WebSocket disconnect → teardown Gemini session

Supports optional RAG knowledge base context injection: when the gateway
CALL_CONNECTED message includes org_id and knowledge_base_id, relevant
context is retrieved and injected into the Gemini system instruction.
"""

import asyncio
import json
import logging
import uuid

from fastapi import WebSocket, WebSocketDisconnect
from google.genai.types import FunctionResponse
from sqlalchemy.orm import Session as DBSession
from starlette.websockets import WebSocketState

from app.services.gateway_bridge.call_manager import CallManager
from app.services.gateway_bridge.models import (
    AnswerCallMessage,
    CallConnectedMessage,
    CallEndedMessage,
    ForwardCallMessage,
    GatewayMessageType,
    IncomingCallMessage,
    RejectCallMessage,
    RoutingAction,
    SessionErrorMessage,
    SessionReadyMessage,
    ToolExecutionMessage,
    TurnCompleteMessage,
)
from app.services.gateway_bridge.resampler import resample_24k_to_16k
from app.services.inbound_router import InboundCallRouter, RoutingDecision
from app.services.interactive_agent.exceptions import InteractiveAgentError
from app.services.interactive_agent.models import AudioChunk, SessionConfig
from app.services.interactive_agent.tools import ToolExecutor

logger = logging.getLogger(__name__)


class GatewayBridge:
    """Manages the full audio bridge for one gateway WebSocket connection.

    A single gateway device may handle multiple sequential calls over one
    WebSocket connection (one call at a time per connection).

    Usage::

        bridge = GatewayBridge(
            websocket=ws,
            call_manager=mgr,
            inbound_router=router,
        )
        await bridge.run()  # blocks until WS disconnect
    """

    def __init__(
        self,
        websocket: WebSocket,
        call_manager: CallManager,
        tool_executor: ToolExecutor | None = None,
        inbound_router: InboundCallRouter | None = None,
        db_factory: type[DBSession] | None = None,
    ) -> None:
        self._ws = websocket
        self._call_manager = call_manager
        self._tool_executor = tool_executor
        self._inbound_router = inbound_router
        self._db_factory = db_factory
        self._active_call_id: str | None = None
        self._gemini_relay_task: asyncio.Task | None = None
        self._running = True
        # Pending routing decisions — keyed by call_id, consumed when CALL_CONNECTED arrives
        self._pending_decisions: dict[str, RoutingDecision] = {}

    async def run(self) -> None:
        """Main loop: read messages from gateway, dispatch by type.

        Blocks until the WebSocket is closed or an unrecoverable error occurs.
        """
        try:
            while self._running:
                message = await self._ws.receive()

                if message["type"] == "websocket.disconnect":
                    break

                if message["type"] == "websocket.receive":
                    if "bytes" in message and message["bytes"]:
                        await self._handle_audio(message["bytes"])
                    elif "text" in message and message["text"]:
                        await self._handle_control(message["text"])

        except WebSocketDisconnect:
            logger.info("Gateway WebSocket disconnected")
        except Exception as exc:
            logger.error("Gateway bridge error: %s", exc, exc_info=True)
        finally:
            await self._cleanup()

    async def _handle_control(self, raw: str) -> None:
        """Parse and dispatch a JSON control message from the gateway."""
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Invalid JSON from gateway: %s", raw[:200])
            return

        msg_type = data.get("type")
        if msg_type == GatewayMessageType.INCOMING_CALL:
            await self._on_incoming_call(IncomingCallMessage(**data))
        elif msg_type == GatewayMessageType.CALL_CONNECTED:
            await self._on_call_connected(CallConnectedMessage(**data))
        elif msg_type == GatewayMessageType.CALL_ENDED:
            await self._on_call_ended(CallEndedMessage(**data))
        else:
            logger.warning("Unknown gateway message type: %s", msg_type)

    async def _handle_audio(self, pcm_data: bytes) -> None:
        """Forward raw PCM audio from gateway to the active Gemini session."""
        if self._active_call_id is None:
            return  # No active call, discard audio

        session = self._call_manager.get_session(self._active_call_id)
        if session is None:
            return

        try:
            await session.send_audio(AudioChunk(data=pcm_data))
        except InteractiveAgentError as exc:
            logger.error(
                "Failed to send audio to Gemini for call %s: %s",
                self._active_call_id,
                exc,
            )

    async def _on_incoming_call(self, msg: IncomingCallMessage) -> None:
        """Handle an INCOMING_CALL — evaluate routing rules and send decision."""
        logger.info(
            "Incoming call: call_id=%s, from=%s, to=%s, gateway=%s, carrier=%s, sim=%d",
            msg.call_id,
            msg.from_number,
            msg.to_number,
            msg.gateway_id,
            msg.carrier,
            msg.sim_slot,
        )

        # Evaluate routing rules
        if self._inbound_router is not None:
            decision = await self._inbound_router.route(msg)
        else:
            # No router configured — default to ANSWER
            logger.warning("No inbound router configured, defaulting to ANSWER for call %s", msg.call_id)
            decision = RoutingDecision(action=RoutingAction.ANSWER, call_id=msg.call_id)

        logger.info(
            "Routing decision for call %s: %s (rule=%s)",
            msg.call_id,
            decision.action.value,
            decision.rule_name or "default",
        )

        # Log the inbound interaction
        if self._inbound_router is not None:
            asyncio.create_task(self._inbound_router.log_interaction(decision, msg))

        # Send routing decision to gateway
        if decision.action == RoutingAction.ANSWER:
            self._pending_decisions[msg.call_id] = decision
            await self._send_json(AnswerCallMessage(call_id=msg.call_id))
        elif decision.action == RoutingAction.REJECT:
            await self._send_json(RejectCallMessage(call_id=msg.call_id, reason=decision.reject_reason))
        elif decision.action == RoutingAction.FORWARD:
            if decision.forward_to:
                await self._send_json(ForwardCallMessage(call_id=msg.call_id, forward_to=decision.forward_to))
            else:
                logger.error(
                    "FORWARD decision for call %s but no forward_to number — falling back to ANSWER",
                    msg.call_id,
                )
                self._pending_decisions[msg.call_id] = decision
                await self._send_json(AnswerCallMessage(call_id=msg.call_id))

    async def _on_call_connected(self, msg: CallConnectedMessage) -> None:
        """Handle a call that has been answered by the gateway.

        This may follow an ANSWER_CALL decision (new flow) or arrive
        directly for backward compatibility with gateways that auto-answer.
        """
        logger.info(
            "Call connected: call_id=%s, caller=%s, gateway=%s",
            msg.call_id,
            msg.caller_number,
            msg.gateway_id,
        )

        # Tear down any stale session from a previous call
        if self._active_call_id is not None:
            logger.warning(
                "New call %s while %s still active — tearing down old call",
                msg.call_id,
                self._active_call_id,
            )
            await self._teardown_call()

        # Retrieve pending routing decision (if INCOMING_CALL was processed)
        decision = self._pending_decisions.pop(msg.call_id, None)

        # Build session config from routing decision overrides
        session_config = None
        if decision is not None:
            overrides = {}
            if decision.system_instruction:
                overrides["system_instruction"] = decision.system_instruction
            if decision.voice_name:
                overrides["voice_name"] = decision.voice_name
            if overrides:
                session_config = SessionConfig(**overrides)

        # Build optional RAG context parameters
        kb_kwargs: dict = {}
        db = None
        if msg.knowledge_base_id and self._db_factory is not None:
            try:
                db = self._db_factory()
                kb_kwargs["db"] = db
                kb_kwargs["knowledge_base_id"] = uuid.UUID(msg.knowledge_base_id)
            except (ValueError, TypeError):
                logger.warning("Invalid knowledge_base_id in CALL_CONNECTED: %s", msg.knowledge_base_id)
                if db is not None:
                    db.close()
                    db = None

        try:
            record = await self._call_manager.create_session(
                call_id=msg.call_id,
                gateway_id=msg.gateway_id,
                caller_number=msg.caller_number,
                session_config=session_config,
                **kb_kwargs,
            )
        except Exception as exc:
            logger.error("Failed to create Gemini session for call %s: %s", msg.call_id, exc)
            await self._send_json(SessionErrorMessage(call_id=msg.call_id, error=str(exc)))
            return
        finally:
            if db is not None:
                db.close()

        self._active_call_id = msg.call_id

        # Notify gateway that the audio bridge is ready
        await self._send_json(
            SessionReadyMessage(
                call_id=msg.call_id,
                session_id=record.session.session_id,
            )
        )

        # Start the Gemini → gateway audio relay task
        self._gemini_relay_task = asyncio.create_task(self._relay_gemini_to_gateway(msg.call_id, record.session))

    async def _on_call_ended(self, msg: CallEndedMessage) -> None:
        """Handle call termination from the gateway."""
        logger.info("Call ended: call_id=%s, reason=%s", msg.call_id, msg.reason)

        # Clean up any pending decision for this call
        self._pending_decisions.pop(msg.call_id, None)

        if self._active_call_id == msg.call_id:
            await self._teardown_call()
        else:
            # Might be a late/duplicate CALL_ENDED for a call we already cleaned up
            await self._call_manager.end_session(msg.call_id)

    async def _relay_gemini_to_gateway(self, call_id: str, session) -> None:
        """Read responses from Gemini and forward audio to the gateway.

        Runs as a background task for the duration of the call.
        Handles:
        - Audio resampling (24kHz → 16kHz)
        - Function calling (tool_call → execute → tool_response)
        - Turn completion notifications
        - Barge-in / interruption detection
        - Transcript forwarding
        """
        accumulated_input_transcript = ""
        accumulated_output_transcript = ""

        try:
            async for response in session.receive():
                # Handle tool calls from Gemini — pause audio, execute, respond
                if response.has_tool_calls:
                    await self._handle_tool_calls(call_id, session, response.tool_calls)
                    continue

                # Forward resampled audio to the gateway
                if response.audio_data:
                    try:
                        resampled = resample_24k_to_16k(response.audio_data)
                        await self._ws.send_bytes(resampled)
                    except Exception as exc:
                        logger.error("Failed to send audio to gateway for call %s: %s", call_id, exc)
                        break

                # Accumulate transcripts
                if response.input_transcript:
                    accumulated_input_transcript += response.input_transcript

                if response.output_transcript:
                    accumulated_output_transcript += response.output_transcript

                # Turn complete — Gemini finished speaking
                if response.is_turn_complete:
                    await self._send_json(
                        TurnCompleteMessage(
                            call_id=call_id,
                            output_transcript=accumulated_output_transcript or None,
                            input_transcript=accumulated_input_transcript or None,
                            was_interrupted=False,
                        )
                    )
                    accumulated_input_transcript = ""
                    accumulated_output_transcript = ""

                # Barge-in — caller interrupted Gemini
                if response.is_interrupted:
                    logger.info("Call %s: barge-in detected", call_id)
                    await self._send_json(
                        TurnCompleteMessage(
                            call_id=call_id,
                            output_transcript=accumulated_output_transcript or None,
                            input_transcript=accumulated_input_transcript or None,
                            was_interrupted=True,
                        )
                    )
                    accumulated_input_transcript = ""
                    accumulated_output_transcript = ""

        except asyncio.CancelledError:
            logger.info("Gemini relay task cancelled for call %s", call_id)
        except Exception as exc:
            logger.error("Gemini relay error for call %s: %s", call_id, exc, exc_info=True)

    async def _handle_tool_calls(self, call_id: str, session, tool_calls) -> None:
        """Execute tool function calls and send results back to Gemini.

        Args:
            call_id: The active call ID (for logging and gateway notifications).
            session: The active AgentSession.
            tool_calls: List of FunctionCallPart from the AgentResponse.
        """
        if self._tool_executor is None:
            logger.warning(
                "Call %s: received tool calls but no ToolExecutor configured — sending error responses",
                call_id,
            )
            error_responses = [
                FunctionResponse(
                    id=tc.call_id,
                    name=tc.name,
                    response={"error": "Tool execution not available"},
                )
                for tc in tool_calls
            ]
            await session.send_tool_response(error_responses)
            return

        # Execute all function calls and collect responses
        function_responses = []
        for tc in tool_calls:
            logger.info(
                "Call %s: executing tool %s(call_id=%s)",
                call_id,
                tc.name,
                tc.call_id,
            )

            # Notify gateway that a tool is being executed
            await self._send_json(
                ToolExecutionMessage(
                    call_id=call_id,
                    tool_name=tc.name,
                    tool_call_id=tc.call_id,
                    status="executing",
                )
            )

            result = await self._tool_executor.execute(name=tc.name, args=tc.args, call_id=tc.call_id)
            function_responses.append(result.to_function_response())

            # Notify gateway that tool execution completed
            await self._send_json(
                ToolExecutionMessage(
                    call_id=call_id,
                    tool_name=tc.name,
                    tool_call_id=tc.call_id,
                    status="completed",
                )
            )

        # Send all function responses back to Gemini
        await session.send_tool_response(function_responses)
        logger.info(
            "Call %s: sent %d tool response(s) back to Gemini",
            call_id,
            len(function_responses),
        )

    async def _teardown_call(self) -> None:
        """Tear down the active call: cancel relay task, release session."""
        call_id = self._active_call_id
        if call_id is None:
            return

        self._active_call_id = None

        # Cancel the Gemini → gateway relay task
        if self._gemini_relay_task is not None and not self._gemini_relay_task.done():
            self._gemini_relay_task.cancel()
            try:
                await self._gemini_relay_task
            except asyncio.CancelledError:
                pass
            self._gemini_relay_task = None

        # Release the Gemini session back to the pool
        await self._call_manager.end_session(call_id)

    async def _cleanup(self) -> None:
        """Final cleanup when the WebSocket connection closes."""
        await self._teardown_call()
        self._pending_decisions.clear()
        logger.info("Gateway bridge cleaned up")

    async def _send_json(self, message) -> None:
        """Send a Pydantic model as a JSON text frame to the gateway."""
        try:
            if self._ws.client_state == WebSocketState.CONNECTED:
                await self._ws.send_text(message.model_dump_json())
        except Exception as exc:
            logger.warning("Failed to send message to gateway: %s", exc)
