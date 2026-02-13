"""Interactive Agent service — Gemini 2.5 Flash Native Audio integration.

Public API:
    - SessionPool: Connection pool for concurrent Gemini Live sessions.
    - AgentSession: Single session lifecycle manager.
    - HybridSession: Gemini STT+AI with external TTS (Edge/Azure) output.
    - GeminiLiveClient: Low-level async WebSocket client.
    - SessionConfig: Configuration for creating sessions.
    - OutputMode: NATIVE_AUDIO or HYBRID output mode.
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
from app.services.interactive_agent.hybrid import HybridSession
from app.services.interactive_agent.models import (
    AgentResponse,
    AudioChunk,
    OutputMode,
    SessionConfig,
    SessionInfo,
    SessionState,
)
from app.services.interactive_agent.pool import SessionPool
from app.services.interactive_agent.session import AgentSession
from app.services.interactive_agent.voices import (
    GEMINI_VOICES,
    NEPALI_CANDIDATE_VOICES,
    get_best_nepali_voice,
    get_voice,
    list_voices,
    load_quality_results,
)

__all__ = [
    "AgentResponse",
    "AgentSession",
    "AudioChunk",
    "GEMINI_VOICES",
    "GeminiClientError",
    "GeminiConfigurationError",
    "GeminiLiveClient",
    "HybridSession",
    "InteractiveAgentError",
    "NEPALI_CANDIDATE_VOICES",
    "OutputMode",
    "SessionConfig",
    "SessionError",
    "SessionInfo",
    "SessionPool",
    "SessionPoolExhaustedError",
    "SessionState",
    "SessionTimeoutError",
    "get_best_nepali_voice",
    "get_voice",
    "list_voices",
    "load_quality_results",
]
