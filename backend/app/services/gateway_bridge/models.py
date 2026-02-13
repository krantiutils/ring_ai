"""Gateway bridge WebSocket protocol models.

Defines the JSON control messages exchanged between Android gateway
phones and the backend over WebSocket. Audio data is sent as raw binary
frames (16-bit PCM, 16 kHz, mono) and is NOT represented here.

Protocol:
    Gateway → Backend (text frames):
        CALL_CONNECTED  — new inbound call answered
        CALL_ENDED      — call terminated (hangup, error, etc.)

    Backend → Gateway (text frames):
        SESSION_READY   — Gemini session created, audio bridge active
        SESSION_ERROR   — failed to create Gemini session
        TURN_COMPLETE   — Gemini finished its response turn
        CALL_TRANSCRIPT — partial or final transcript update

    Both directions (binary frames):
        Raw PCM audio — 16-bit, 16 kHz, mono, little-endian
"""

from enum import Enum

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Gateway → Backend messages
# ---------------------------------------------------------------------------


class GatewayMessageType(str, Enum):
    """Message types sent FROM the gateway TO the backend."""

    INCOMING_CALL = "INCOMING_CALL"
    CALL_CONNECTED = "CALL_CONNECTED"
    CALL_ENDED = "CALL_ENDED"


class IncomingCallMessage(BaseModel):
    """Sent when a gateway phone receives an incoming call (not yet answered).

    The backend evaluates routing rules and responds with ANSWER_CALL,
    REJECT_CALL, or FORWARD_CALL.
    """

    type: GatewayMessageType = GatewayMessageType.INCOMING_CALL
    call_id: str = Field(..., description="Unique call identifier from the gateway")
    from_number: str = Field(..., description="Caller's phone number (E.164)")
    to_number: str = Field(..., description="Called number — the gateway phone's number (E.164)")
    carrier: str = Field(default="", description="Carrier name (e.g. NTC, Ncell)")
    sim_slot: int = Field(default=0, description="SIM slot index on the gateway device (0 or 1)")
    gateway_id: str = Field(..., description="Identifier of the Android gateway device")


class CallConnectedMessage(BaseModel):
    """Sent when a gateway phone answers an inbound call."""

    type: GatewayMessageType = GatewayMessageType.CALL_CONNECTED
    call_id: str = Field(..., description="Unique call identifier from the gateway")
    caller_number: str = Field(..., description="Caller's phone number (E.164)")
    gateway_id: str = Field(..., description="Identifier of the Android gateway device")
    org_id: str | None = Field(None, description="Organization ID for knowledge base lookup")
    knowledge_base_id: str | None = Field(None, description="Knowledge base ID for RAG context injection")


class CallEndedMessage(BaseModel):
    """Sent when a call ends (hangup, network drop, gateway error)."""

    type: GatewayMessageType = GatewayMessageType.CALL_ENDED
    call_id: str
    reason: str = Field(default="hangup", description="Termination reason: hangup, error, timeout")


# ---------------------------------------------------------------------------
# Backend → Gateway messages
# ---------------------------------------------------------------------------


class RoutingAction(str, Enum):
    """Routing decision for an incoming call."""

    ANSWER = "answer"
    REJECT = "reject"
    FORWARD = "forward"


class BackendMessageType(str, Enum):
    """Message types sent FROM the backend TO the gateway."""

    ANSWER_CALL = "ANSWER_CALL"
    REJECT_CALL = "REJECT_CALL"
    FORWARD_CALL = "FORWARD_CALL"
    SESSION_READY = "SESSION_READY"
    SESSION_ERROR = "SESSION_ERROR"
    TURN_COMPLETE = "TURN_COMPLETE"
    CALL_TRANSCRIPT = "CALL_TRANSCRIPT"
    TOOL_EXECUTION = "TOOL_EXECUTION"


class AnswerCallMessage(BaseModel):
    """Sent to instruct the gateway to answer an incoming call."""

    type: BackendMessageType = BackendMessageType.ANSWER_CALL
    call_id: str


class RejectCallMessage(BaseModel):
    """Sent to instruct the gateway to reject an incoming call."""

    type: BackendMessageType = BackendMessageType.REJECT_CALL
    call_id: str
    reason: str = Field(default="rejected", description="Rejection reason for logging")


class ForwardCallMessage(BaseModel):
    """Sent to instruct the gateway to forward an incoming call."""

    type: BackendMessageType = BackendMessageType.FORWARD_CALL
    call_id: str
    forward_to: str = Field(..., description="Phone number to forward the call to (E.164)")


class SessionReadyMessage(BaseModel):
    """Sent when a Gemini session is created and the audio bridge is active."""

    type: BackendMessageType = BackendMessageType.SESSION_READY
    call_id: str
    session_id: str


class SessionErrorMessage(BaseModel):
    """Sent when Gemini session creation fails."""

    type: BackendMessageType = BackendMessageType.SESSION_ERROR
    call_id: str
    error: str


class TurnCompleteMessage(BaseModel):
    """Sent when Gemini finishes a response turn."""

    type: BackendMessageType = BackendMessageType.TURN_COMPLETE
    call_id: str
    output_transcript: str | None = None
    input_transcript: str | None = None
    was_interrupted: bool = False


class ToolExecutionMessage(BaseModel):
    """Sent when a tool function is being executed or has completed."""

    type: BackendMessageType = BackendMessageType.TOOL_EXECUTION
    call_id: str
    tool_name: str = Field(..., description="Name of the tool being executed")
    tool_call_id: str = Field(..., description="Unique ID for this function call")
    status: str = Field(..., description="'executing' or 'completed'")


class CallTranscriptMessage(BaseModel):
    """Sent for transcript updates during a call."""

    type: BackendMessageType = BackendMessageType.CALL_TRANSCRIPT
    call_id: str
    speaker: str = Field(..., description="'caller' or 'agent'")
    text: str
