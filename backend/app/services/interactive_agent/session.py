"""Session lifecycle manager for Gemini Live API sessions.

Handles create, extend (reconnect with session resumption), teardown,
and timeout enforcement. Each AgentSession wraps a GeminiLiveClient
and adds lifecycle tracking. Supports function calling via send_tool_response().
"""

import asyncio
import logging
from datetime import UTC, datetime

from google.genai.types import FunctionResponse

from app.services.interactive_agent.client import GeminiLiveClient
from app.services.interactive_agent.exceptions import (
    SessionError,
    SessionTimeoutError,
)
from app.services.interactive_agent.models import (
    AudioChunk,
    SessionConfig,
    SessionInfo,
    SessionState,
)

logger = logging.getLogger(__name__)

# Buffer before the hard 10-min WebSocket limit. Start reconnection
# at (timeout - EXTEND_BUFFER_SECONDS) to avoid data loss.
EXTEND_BUFFER_SECONDS = 60


class AgentSession:
    """Manages the full lifecycle of one Gemini Live interactive session.

    Wraps a GeminiLiveClient and adds:
    - State tracking (connecting, active, extending, closing, closed, error)
    - Timeout enforcement with automatic reconnection via session resumption
    - Activity-based metrics (chunks sent/received, bytes transferred)
    - Clean teardown with error propagation

    Usage::

        session = AgentSession(api_key="...", config=SessionConfig(...))
        await session.start()
        try:
            await session.send_audio(AudioChunk(data=pcm_bytes))
            async for response in session.receive():
                ...
        finally:
            await session.teardown()
    """

    def __init__(self, api_key: str, config: SessionConfig) -> None:
        self._api_key = api_key
        self._config = config
        self._client = GeminiLiveClient(api_key=api_key, config=config)
        self._state = SessionState.CLOSED
        self._created_at = datetime.now(UTC)
        self._last_activity_at = datetime.now(UTC)
        self._timeout_task: asyncio.Task | None = None
        self._extending = False

        # Metrics
        self._chunks_sent = 0
        self._chunks_received = 0
        self._bytes_sent = 0
        self._bytes_received = 0

    @property
    def session_id(self) -> str:
        return self._config.session_id

    @property
    def state(self) -> SessionState:
        return self._state

    @property
    def info(self) -> SessionInfo:
        return SessionInfo(
            session_id=self.session_id,
            state=self._state,
            voice_name=self._config.voice_name,
            created_at=self._created_at,
            last_activity_at=self._last_activity_at,
            resumption_handle=self._client.resumption_handle,
            audio_chunks_sent=self._chunks_sent,
            audio_chunks_received=self._chunks_received,
            total_input_bytes=self._bytes_sent,
            total_output_bytes=self._bytes_received,
        )

    async def start(self) -> None:
        """Create a new session: connect to Gemini and start the timeout timer.

        Raises:
            SessionError: If the session is already active or connection fails.
        """
        if self._state == SessionState.ACTIVE:
            raise SessionError(self.session_id, "Session is already active")

        self._state = SessionState.CONNECTING
        try:
            await self._client.connect()
            self._state = SessionState.ACTIVE
            self._created_at = datetime.now(UTC)
            self._touch()
            self._start_timeout_timer()
            logger.info("Session %s started", self.session_id)
        except Exception as exc:
            self._state = SessionState.ERROR
            raise SessionError(self.session_id, f"Failed to start: {exc}") from exc

    async def extend(self) -> None:
        """Extend the session by reconnecting with a session resumption handle.

        This preserves the full conversation context across the WebSocket
        reconnection boundary. Should be called before the 10-minute
        WebSocket limit is reached (the timeout timer handles this
        automatically).

        Raises:
            SessionError: If no resumption handle is available.
            SessionTimeoutError: If extension fails.
        """
        handle = self._client.resumption_handle
        if handle is None:
            raise SessionError(
                self.session_id,
                "Cannot extend: no session resumption handle available. The API may not have sent one yet.",
            )

        self._state = SessionState.EXTENDING
        self._extending = True
        logger.info("Session %s extending via resumption handle", self.session_id)

        try:
            await self._client.close()
            self._client = GeminiLiveClient(api_key=self._api_key, config=self._config)
            await self._client.connect(resumption_handle=handle)
            self._state = SessionState.ACTIVE
            self._touch()
            self._cancel_timeout_timer()
            self._start_timeout_timer()
            logger.info("Session %s extended successfully", self.session_id)
        except Exception as exc:
            self._state = SessionState.ERROR
            raise SessionTimeoutError(self.session_id, f"Failed to extend session: {exc}") from exc
        finally:
            self._extending = False

    async def teardown(self) -> None:
        """Gracefully close the session and release all resources."""
        if self._state in (SessionState.CLOSED, SessionState.CLOSING):
            return

        self._state = SessionState.CLOSING
        self._cancel_timeout_timer()

        try:
            await self._client.close()
        except Exception as exc:
            logger.warning("Error during teardown of session %s: %s", self.session_id, exc)
        finally:
            self._state = SessionState.CLOSED
            logger.info(
                "Session %s torn down (sent=%d chunks/%d bytes, received=%d chunks/%d bytes)",
                self.session_id,
                self._chunks_sent,
                self._bytes_sent,
                self._chunks_received,
                self._bytes_received,
            )

    async def send_audio(self, chunk: AudioChunk) -> None:
        """Send a PCM audio chunk. Updates metrics.

        Raises:
            SessionError: If session is not active.
        """
        self._ensure_active()
        await self._client.send_audio(chunk)
        self._chunks_sent += 1
        self._bytes_sent += len(chunk.data)
        self._touch()

    async def send_audio_end(self) -> None:
        """Signal end of audio stream.

        Raises:
            SessionError: If session is not active.
        """
        self._ensure_active()
        await self._client.send_audio_end()
        self._touch()

    async def send_text(self, text: str) -> None:
        """Send a text message (non-realtime, turn-based).

        Raises:
            SessionError: If session is not active.
        """
        self._ensure_active()
        await self._client.send_text(text)
        self._touch()

    async def send_tool_response(self, function_responses: list[FunctionResponse]) -> None:
        """Send function call results back to Gemini after executing tools.

        Args:
            function_responses: List of FunctionResponse objects with execution results.

        Raises:
            SessionError: If session is not active.
        """
        self._ensure_active()
        await self._client.send_tool_response(function_responses)
        self._touch()

    async def receive(self):
        """Async iterator yielding AgentResponse objects. Updates metrics.

        Yields:
            AgentResponse with audio, text, transcripts, and lifecycle signals.

        Raises:
            SessionError: If session is not active.
        """
        self._ensure_active()
        async for response in self._client.receive():
            if response.audio_data:
                self._chunks_received += 1
                self._bytes_received += len(response.audio_data)
            self._touch()
            yield response

    def _touch(self) -> None:
        """Update last activity timestamp."""
        self._last_activity_at = datetime.now(UTC)

    def _ensure_active(self) -> None:
        """Raise if session is not in a state that allows I/O."""
        if self._state not in (SessionState.ACTIVE, SessionState.EXTENDING):
            raise SessionError(
                self.session_id,
                f"Session is {self._state.value}, not active. Call start() first.",
            )

    def _start_timeout_timer(self) -> None:
        """Schedule automatic session extension before the WebSocket limit."""
        timeout_seconds = (self._config.timeout_minutes * 60) - EXTEND_BUFFER_SECONDS
        if timeout_seconds <= 0:
            timeout_seconds = self._config.timeout_minutes * 60

        self._timeout_task = asyncio.create_task(self._timeout_handler(timeout_seconds))

    def _cancel_timeout_timer(self) -> None:
        """Cancel the running timeout timer if any."""
        if self._timeout_task is not None and not self._timeout_task.done():
            self._timeout_task.cancel()
            self._timeout_task = None

    async def _timeout_handler(self, timeout_seconds: float) -> None:
        """Fires when the session approaches its WebSocket time limit.

        Attempts automatic extension via session resumption. If extension
        fails, logs the error but does not crash — the caller should
        handle SessionTimeoutError from subsequent I/O calls.
        """
        try:
            await asyncio.sleep(timeout_seconds)
        except asyncio.CancelledError:
            return

        logger.warning(
            "Session %s approaching timeout (%ds), attempting extension",
            self.session_id,
            timeout_seconds,
        )

        try:
            await self.extend()
        except Exception as exc:
            logger.error(
                "Session %s auto-extend failed: %s. Session will expire.",
                self.session_id,
                exc,
            )
