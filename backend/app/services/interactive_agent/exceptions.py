"""Interactive agent service exceptions."""


class InteractiveAgentError(Exception):
    """Base exception for all interactive agent operations."""


class GeminiClientError(InteractiveAgentError):
    """Raised when the Gemini Live API client encounters an error."""

    def __init__(self, message: str) -> None:
        super().__init__(f"[gemini] {message}")


class GeminiConfigurationError(InteractiveAgentError):
    """Raised when Gemini configuration is missing or invalid."""


class SessionError(InteractiveAgentError):
    """Raised when a session operation fails (create, extend, teardown)."""

    def __init__(self, session_id: str, message: str) -> None:
        self.session_id = session_id
        super().__init__(f"[session:{session_id}] {message}")


class SessionTimeoutError(SessionError):
    """Raised when a session exceeds its timeout or the WebSocket GoAway fires."""


class SessionPoolExhaustedError(InteractiveAgentError):
    """Raised when the connection pool has no capacity for a new session."""

    def __init__(self, max_sessions: int) -> None:
        self.max_sessions = max_sessions
        super().__init__(f"Connection pool exhausted: {max_sessions} concurrent sessions at capacity")
