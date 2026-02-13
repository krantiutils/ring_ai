"""WebSocket endpoint for Android gateway phone connections.

Gateways connect via WebSocket to relay phone call audio to/from Gemini.
Protocol: JSON text frames for control, binary frames for PCM audio.

Inbound call flow:
    1. Gateway sends INCOMING_CALL → backend evaluates routing rules
    2. Backend sends ANSWER_CALL / REJECT_CALL / FORWARD_CALL
    3. On ANSWER: gateway answers → CALL_CONNECTED → audio bridge starts

Route: /api/v1/gateway/ws
"""

import logging

from fastapi import APIRouter, WebSocket

from app.core.database import SessionLocal
from app.services.gateway_bridge.bridge import GatewayBridge

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def gateway_websocket(websocket: WebSocket) -> None:
    """Handle a WebSocket connection from an Android gateway phone.

    Lifecycle:
        1. Accept the WebSocket connection
        2. Create a GatewayBridge with tool executor for function calling
        3. Run the bridge (blocks until WS disconnects)
    """
    await websocket.accept()

    # Access services from app state (set during lifespan startup)
    call_manager = websocket.app.state.call_manager
    tool_executor = getattr(websocket.app.state, "tool_executor", None)
    inbound_router = getattr(websocket.app.state, "inbound_router", None)

    remote = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info("Gateway connected from %s", remote)

    bridge = GatewayBridge(
        websocket=websocket,
        call_manager=call_manager,
        tool_executor=tool_executor,
        inbound_router=inbound_router,
        db_factory=SessionLocal,
    )
    await bridge.run()

    logger.info("Gateway disconnected: %s", remote)
