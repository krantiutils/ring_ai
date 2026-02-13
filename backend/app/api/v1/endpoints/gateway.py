"""WebSocket endpoint for Android gateway phone connections.

Gateways connect via WebSocket to relay phone call audio to/from Gemini.
Protocol: JSON text frames for control, binary frames for PCM audio.

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
        2. Create a GatewayBridge to manage the audio relay
        3. Run the bridge (blocks until WS disconnects)
    """
    await websocket.accept()

    # Access the call_manager from app state (set during lifespan startup)
    call_manager = websocket.app.state.call_manager

    remote = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info("Gateway connected from %s", remote)

    bridge = GatewayBridge(websocket=websocket, call_manager=call_manager, db_factory=SessionLocal)
    await bridge.run()

    logger.info("Gateway disconnected: %s", remote)
