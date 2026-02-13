"""Gateway bridge service — audio relay between Android gateways and Gemini Live API.

Public API:
    - GatewayBridge: Per-connection audio bridge (WebSocket ↔ Gemini).
    - CallManager: Maps call_id → Gemini session, handles lifecycle.
    - resample_24k_to_16k: Downsample Gemini 24 kHz output to gateway 16 kHz.
    - Protocol models: CallConnectedMessage, CallEndedMessage, etc.
"""

from app.services.gateway_bridge.bridge import GatewayBridge
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
from app.services.gateway_bridge.resampler import resample_24k_to_16k

__all__ = [
    "BackendMessageType",
    "CallConnectedMessage",
    "CallEndedMessage",
    "CallManager",
    "CallRecord",
    "CallTranscriptMessage",
    "GatewayBridge",
    "GatewayMessageType",
    "SessionErrorMessage",
    "SessionReadyMessage",
    "TurnCompleteMessage",
    "resample_24k_to_16k",
]
