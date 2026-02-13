"""Connection pool for concurrent Gemini Live sessions.

Manages up to N concurrent AgentSessions using an asyncio.Semaphore
for admission control. Tracks all active sessions and provides
bulk teardown for graceful shutdown.
"""

import asyncio
import logging

from app.services.interactive_agent.exceptions import SessionPoolExhaustedError
from app.services.interactive_agent.models import SessionConfig, SessionInfo
from app.services.interactive_agent.session import AgentSession

logger = logging.getLogger(__name__)


class SessionPool:
    """Pool of concurrent Gemini Live sessions with capacity control.

    Uses an asyncio.Semaphore to enforce a hard limit on concurrent
    sessions. Sessions are tracked by session_id for lookup and
    bulk operations.

    Usage::

        pool = SessionPool(api_key="...", max_sessions=1000)
        session = await pool.acquire(SessionConfig(voice_name="Kore"))
        try:
            await session.send_audio(chunk)
            async for resp in session.receive():
                ...
        finally:
            await pool.release(session.session_id)

        # Shutdown
        await pool.teardown_all()
    """

    def __init__(
        self,
        api_key: str,
        max_sessions: int = 1000,
        default_system_instruction: str = "",
        default_model_id: str = "gemini-2.5-flash-native-audio-preview-12-2025",
    ) -> None:
        self._api_key = api_key
        self._max_sessions = max_sessions
        self._default_system_instruction = default_system_instruction
        self._default_model_id = default_model_id
        self._semaphore = asyncio.Semaphore(max_sessions)
        self._sessions: dict[str, AgentSession] = {}
        self._lock = asyncio.Lock()

    @property
    def max_sessions(self) -> int:
        return self._max_sessions

    @property
    def active_count(self) -> int:
        """Number of currently active (non-closed) sessions."""
        return len(self._sessions)

    @property
    def available_slots(self) -> int:
        """Number of remaining session slots."""
        return self._max_sessions - self.active_count

    async def acquire(
        self,
        config: SessionConfig | None = None,
        timeout: float | None = 5.0,
    ) -> AgentSession:
        """Create and start a new session from the pool.

        Args:
            config: Session configuration. If None, uses defaults from pool.
            timeout: Max seconds to wait for a pool slot. None = wait forever.

        Returns:
            A started AgentSession ready for audio streaming.

        Raises:
            SessionPoolExhaustedError: If no slots are available within timeout.
            SessionError: If the session fails to start.
        """
        try:
            acquired = await asyncio.wait_for(self._semaphore.acquire(), timeout=timeout)
        except asyncio.TimeoutError:
            raise SessionPoolExhaustedError(self._max_sessions)

        if not acquired:
            raise SessionPoolExhaustedError(self._max_sessions)

        if config is None:
            config = SessionConfig(
                model_id=self._default_model_id,
                system_instruction=self._default_system_instruction,
            )

        # Apply pool defaults where the config doesn't override
        if not config.system_instruction and self._default_system_instruction:
            config = config.model_copy(update={"system_instruction": self._default_system_instruction})
        if config.model_id == "gemini-2.5-flash-native-audio-preview-12-2025" and self._default_model_id:
            config = config.model_copy(update={"model_id": self._default_model_id})

        session = AgentSession(api_key=self._api_key, config=config)
        try:
            await session.start()
        except Exception:
            self._semaphore.release()
            raise

        async with self._lock:
            self._sessions[session.session_id] = session

        logger.info(
            "Pool acquired session %s (%d/%d active)",
            session.session_id,
            self.active_count,
            self._max_sessions,
        )
        return session

    async def release(self, session_id: str) -> None:
        """Teardown a session and return its slot to the pool.

        Args:
            session_id: The ID of the session to release.

        Safe to call multiple times or on already-closed sessions.
        """
        async with self._lock:
            session = self._sessions.pop(session_id, None)

        if session is None:
            logger.warning("Pool release: session %s not found (already released?)", session_id)
            return

        try:
            await session.teardown()
        except Exception as exc:
            logger.warning("Error releasing session %s: %s", session_id, exc)
        finally:
            self._semaphore.release()
            logger.info(
                "Pool released session %s (%d/%d active)",
                session_id,
                self.active_count,
                self._max_sessions,
            )

    async def get_session(self, session_id: str) -> AgentSession | None:
        """Look up an active session by ID. Returns None if not found."""
        return self._sessions.get(session_id)

    def list_sessions(self) -> list[SessionInfo]:
        """Return metadata for all active sessions."""
        return [s.info for s in self._sessions.values()]

    async def teardown_all(self) -> None:
        """Gracefully tear down all active sessions. Used during app shutdown.

        Tears down sessions concurrently. Errors are logged, not raised.
        """
        async with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()

        if not sessions:
            logger.info("Pool teardown: no active sessions")
            return

        logger.info("Pool teardown: closing %d active sessions", len(sessions))

        async def _teardown_one(session: AgentSession) -> None:
            try:
                await session.teardown()
            except Exception as exc:
                logger.warning("Error in bulk teardown for %s: %s", session.session_id, exc)
            finally:
                self._semaphore.release()

        await asyncio.gather(
            *(_teardown_one(s) for s in sessions),
            return_exceptions=True,
        )
        logger.info("Pool teardown complete")
