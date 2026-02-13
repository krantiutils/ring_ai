"""Interactive agent Pydantic models."""

import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class OutputMode(str, Enum):
    """How the agent produces audio output.

    NATIVE_AUDIO: Gemini generates audio directly (end-to-end, single model).
    HYBRID: Gemini handles STT + conversation AI (text responses), then the
        existing TTS Provider Router (Edge/Azure) synthesizes the audio output.
        Use hybrid when Gemini's native Nepali pronunciation is insufficient.
    """

    NATIVE_AUDIO = "native_audio"
    HYBRID = "hybrid"


class SessionState(str, Enum):
    """Lifecycle states of a Gemini Live session."""

    CONNECTING = "connecting"
    ACTIVE = "active"
    EXTENDING = "extending"  # Reconnecting with a session resumption handle
    CLOSING = "closing"
    CLOSED = "closed"
    ERROR = "error"


class AudioEncoding(str, Enum):
    PCM_16KHZ = "pcm_16khz"  # Input: 16-bit PCM, 16 kHz, mono, little-endian
    PCM_24KHZ = "pcm_24khz"  # Output: 16-bit PCM, 24 kHz, mono, little-endian


# Audio constants
INPUT_SAMPLE_RATE = 16000
OUTPUT_SAMPLE_RATE = 24000
SAMPLE_WIDTH_BYTES = 2  # 16-bit
CHANNELS = 1
INPUT_MIME_TYPE = "audio/pcm"


class SessionConfig(BaseModel):
    """Configuration for creating a new Gemini Live session."""

    session_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    model_id: str = "gemini-2.5-flash-native-audio-preview-12-2025"
    voice_name: str = "Kore"
    system_instruction: str = ""
    timeout_minutes: int = 10
    enable_input_transcription: bool = True
    enable_output_transcription: bool = True
    temperature: float = 0.7
    output_mode: OutputMode = OutputMode.NATIVE_AUDIO

    # Hybrid mode TTS settings — only used when output_mode is HYBRID.
    # Provider/voice for the TTS router to synthesize Gemini's text responses.
    hybrid_tts_provider: str = "edge_tts"
    hybrid_tts_voice: str = "ne-NP-HemkalaNeural"

    # Function calling — list of tool names to enable for this session.
    # None = no tools. See interactive_agent.tools for available tool names.
    tool_names: list[str] | None = None


class AudioChunk(BaseModel):
    """A chunk of PCM audio data to send to Gemini."""

    data: bytes
    mime_type: str = INPUT_MIME_TYPE
    sample_rate: int = INPUT_SAMPLE_RATE
    timestamp_ms: int | None = None

    model_config = {"arbitrary_types_allowed": True}


class FunctionCallPart(BaseModel):
    """A single function call from a Gemini tool_call response."""

    call_id: str
    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class AgentResponse(BaseModel):
    """A response from the Gemini Live agent.

    May contain audio data, text transcriptions, tool calls, or combinations.
    When tool_calls is non-empty, the caller must execute the functions and
    send the results back via send_tool_response() before Gemini continues.
    """

    audio_data: bytes | None = None
    text: str | None = None
    input_transcript: str | None = None
    output_transcript: str | None = None
    is_turn_complete: bool = False
    is_interrupted: bool = False
    tool_calls: list[FunctionCallPart] = Field(default_factory=list)

    model_config = {"arbitrary_types_allowed": True}

    @property
    def has_tool_calls(self) -> bool:
        """Whether this response contains function calls that need execution."""
        return len(self.tool_calls) > 0


class SessionInfo(BaseModel):
    """Snapshot of session metadata for monitoring and pool tracking."""

    session_id: str
    state: SessionState
    voice_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    last_activity_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    resumption_handle: str | None = None
    audio_chunks_sent: int = 0
    audio_chunks_received: int = 0
    total_input_bytes: int = 0
    total_output_bytes: int = 0
