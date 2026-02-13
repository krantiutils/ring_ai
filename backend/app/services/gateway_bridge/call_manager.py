"""Call session manager — maps gateway call_id to Gemini AgentSession.

Handles the lifecycle of call-to-session mappings:
- create_session: Acquires a Gemini session from the pool for a new call
- get_session: Looks up the session for an active call
- end_session: Tears down the session and removes the mapping
- teardown_all: Bulk cleanup for shutdown

Thread-safe via asyncio.Lock for all mutations.
"""

import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.services.interactive_agent.models import SessionConfig
from app.services.interactive_agent.pool import SessionPool
from app.services.interactive_agent.session import AgentSession

logger = logging.getLogger(__name__)


@dataclass
class CallRecord:
    """Metadata about an active call and its Gemini session."""

    call_id: str
    gateway_id: str
    caller_number: str
    session: AgentSession
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class CallManager:
    """Maps call_id → AgentSession, manages call lifecycle.

    Uses the SessionPool to acquire/release Gemini sessions. One CallManager
    instance serves all gateway connections.

    Usage::

        mgr = CallManager(pool=session_pool)
        record = await mgr.create_session("call-1", "gw-1", "+977...")
        session = mgr.get_session("call-1")
        await mgr.end_session("call-1")
    """

    def __init__(self, pool: SessionPool) -> None:
        self._pool = pool
        self._calls: dict[str, CallRecord] = {}

    @property
    def active_call_count(self) -> int:
        return len(self._calls)

    async def create_session(
        self,
        call_id: str,
        gateway_id: str,
        caller_number: str,
        session_config: SessionConfig | None = None,
    ) -> CallRecord:
        """Acquire a Gemini session from the pool and map it to the call.

        Args:
            call_id: Unique call identifier from the gateway.
            gateway_id: Identifier of the Android gateway device.
            caller_number: Caller's phone number.
            session_config: Optional custom config for the Gemini session.

        Returns:
            CallRecord with the session and call metadata.

        Raises:
            ValueError: If call_id is already active.
            SessionPoolExhaustedError: If the pool has no capacity.
            SessionError: If the Gemini session fails to start.
        """
        if call_id in self._calls:
            raise ValueError(f"Call {call_id} already has an active session")

        session = await self._pool.acquire(config=session_config)

        record = CallRecord(
            call_id=call_id,
            gateway_id=gateway_id,
            caller_number=caller_number,
            session=session,
        )
        self._calls[call_id] = record

        logger.info(
            "Call %s mapped to Gemini session %s (gateway=%s, caller=%s)",
            call_id,
            session.session_id,
            gateway_id,
            caller_number,
        )
        return record

    def get_session(self, call_id: str) -> AgentSession | None:
        """Look up the Gemini session for an active call.

        Returns None if no session is mapped to this call_id.
        """
        record = self._calls.get(call_id)
        return record.session if record else None

    def get_record(self, call_id: str) -> CallRecord | None:
        """Look up the full call record for an active call."""
        return self._calls.get(call_id)

    async def end_session(self, call_id: str) -> None:
        """Tear down the Gemini session for a call and remove the mapping.

        Safe to call multiple times or on nonexistent call_ids.
        """
        record = self._calls.pop(call_id, None)
        if record is None:
            logger.warning("end_session: call %s not found (already ended?)", call_id)
            return

        session_id = record.session.session_id
        try:
            await self._pool.release(session_id)
        except Exception as exc:
            logger.error("Error releasing session %s for call %s: %s", session_id, call_id, exc)

        logger.info("Call %s ended, Gemini session %s released", call_id, session_id)

    async def teardown_all(self) -> None:
        """End all active calls. Used during shutdown."""
        call_ids = list(self._calls.keys())
        if not call_ids:
            logger.info("CallManager teardown: no active calls")
            return

        logger.info("CallManager teardown: ending %d active calls", len(call_ids))
        for call_id in call_ids:
            await self.end_session(call_id)
        logger.info("CallManager teardown complete")
