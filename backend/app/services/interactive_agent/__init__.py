"""Interactive Agent service — Gemini 2.5 Flash Native Audio integration.

Public API:
    - SessionPool: Connection pool for concurrent Gemini Live sessions.
    - AgentSession: Single session lifecycle manager.
    - GeminiLiveClient: Low-level async WebSocket client.
    - SessionConfig: Configuration for creating sessions.
    - AudioChunk: PCM audio data to send to Gemini.
    - AgentResponse: Audio/text response from Gemini.
    - voices: Voice catalog (get_voice, list_voices, GEMINI_VOICES).
"""

from app.services.interactive_agent.client import GeminiLiveClient
from app.services.interactive_agent.exceptions import (
    GeminiClientError,
    GeminiConfigurationError,
    InteractiveAgentError,
    SessionError,
    SessionPoolExhaustedError,
    SessionTimeoutError,
)
from app.services.interactive_agent.models import (
    AgentResponse,
    AudioChunk,
    SessionConfig,
    SessionInfo,
    SessionState,
)
from app.services.interactive_agent.pool import SessionPool
from app.services.interactive_agent.session import AgentSession
from app.services.interactive_agent.voices import (
    GEMINI_VOICES,
    NEPALI_CANDIDATE_VOICES,
    get_voice,
    list_voices,
)

__all__ = [
    "AgentResponse",
    "AgentSession",
    "AudioChunk",
    "GEMINI_VOICES",
    "GeminiClientError",
    "GeminiConfigurationError",
    "GeminiLiveClient",
    "InteractiveAgentError",
    "NEPALI_CANDIDATE_VOICES",
    "SessionConfig",
    "SessionError",
    "SessionInfo",
    "SessionPool",
    "SessionPoolExhaustedError",
    "SessionState",
    "SessionTimeoutError",
    "get_voice",
    "list_voices",
]
