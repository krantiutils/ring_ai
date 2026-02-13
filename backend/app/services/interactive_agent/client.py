"""Gemini Live API async client.

Wraps the google-genai SDK to provide a queue-based send/receive architecture
for real-time audio streaming with the Gemini 2.5 Flash Native Audio model.

Supports function calling: when tools are configured in SessionConfig,
Gemini may return tool_call responses. The caller must execute the function
and send back a tool_response via send_tool_response() before the model
continues its turn.
"""

import logging
from collections.abc import AsyncIterator

from google import genai
from google.genai.types import (
    AudioTranscriptionConfig,
    Content,
    FunctionResponse,
    LiveConnectConfig,
    Part,
    PrebuiltVoiceConfig,
    SpeechConfig,
    VoiceConfig,
)

from app.services.interactive_agent.exceptions import (
    GeminiClientError,
    GeminiConfigurationError,
)
from app.services.interactive_agent.models import (
    AgentResponse,
    AudioChunk,
    FunctionCallPart,
    OutputMode,
    SessionConfig,
)
from app.services.interactive_agent.tools import build_tools
from app.services.interactive_agent.voices import get_voice

logger = logging.getLogger(__name__)


def _build_live_config(config: SessionConfig) -> LiveConnectConfig:
    """Build a LiveConnectConfig from our SessionConfig.

    Raises GeminiConfigurationError if voice_name is invalid.
    """
    try:
        get_voice(config.voice_name)
    except ValueError as exc:
        raise GeminiConfigurationError(str(exc)) from exc

    # In hybrid mode, Gemini produces text responses (not audio).
    # The caller (HybridSession) routes text through the TTS provider router.
    if config.output_mode == OutputMode.HYBRID:
        kwargs: dict = {
            "response_modalities": ["TEXT"],
            "temperature": config.temperature,
        }
    else:
        kwargs: dict = {
            "response_modalities": ["AUDIO"],
            "speech_config": SpeechConfig(
                voice_config=VoiceConfig(
                    prebuilt_voice_config=PrebuiltVoiceConfig(
                        voice_name=config.voice_name,
                    )
                ),
            ),
            "temperature": config.temperature,
        }

    if config.system_instruction:
        kwargs["system_instruction"] = Content(
            parts=[Part(text=config.system_instruction)],
            role="user",
        )

    if config.enable_input_transcription:
        kwargs["input_audio_transcription"] = AudioTranscriptionConfig()

    if config.enable_output_transcription:
        kwargs["output_audio_transcription"] = AudioTranscriptionConfig()

    # Function calling tools
    if config.tool_names:
        try:
            kwargs["tools"] = build_tools(config.tool_names)
        except ValueError as exc:
            raise GeminiConfigurationError(str(exc)) from exc

    return LiveConnectConfig(**kwargs)


class GeminiLiveClient:
    """Async client for the Gemini Live API.

    Manages a single WebSocket session. For multiple concurrent sessions,
    create multiple GeminiLiveClient instances (managed by the SessionPool).

    Usage::

        client = GeminiLiveClient(api_key="...", config=SessionConfig(...))
        await client.connect()
        try:
            await client.send_audio(AudioChunk(data=pcm_bytes))
            async for response in client.receive():
                if response.audio_data:
                    play(response.audio_data)
        finally:
            await client.close()
    """

    def __init__(self, api_key: str, config: SessionConfig) -> None:
        if not api_key:
            raise GeminiConfigurationError("GEMINI_API_KEY is required. Set it in .env or environment.")

        self._api_key = api_key
        self._config = config
        self._genai_client = genai.Client(
            api_key=api_key,
            http_options={"api_version": "v1alpha"},
        )
        self._session = None
        self._live_config = _build_live_config(config)
        self._connected = False
        self._resumption_handle: str | None = None

    @property
    def session_id(self) -> str:
        return self._config.session_id

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def resumption_handle(self) -> str | None:
        return self._resumption_handle

    async def connect(self, resumption_handle: str | None = None) -> None:
        """Open a WebSocket connection to the Gemini Live API.

        Args:
            resumption_handle: If provided, resumes a previous session
                using the saved handle (preserves conversation context).

        Raises:
            GeminiClientError: If the connection fails.
        """
        if self._connected:
            logger.warning("Session %s already connected, skipping", self.session_id)
            return

        live_config = self._live_config

        if resumption_handle is not None:
            live_config = LiveConnectConfig(
                **{
                    **live_config.model_dump(exclude_none=True),
                    "session_resumption": {"handle": resumption_handle},
                }
            )

        try:
            self._session = await self._genai_client.aio.live.connect(
                model=self._config.model_id,
                config=live_config,
            ).__aenter__()
            self._connected = True
            logger.info(
                "Gemini session %s connected (model=%s, voice=%s)",
                self.session_id,
                self._config.model_id,
                self._config.voice_name,
            )
        except Exception as exc:
            self._connected = False
            raise GeminiClientError(f"Failed to connect session {self.session_id}: {exc}") from exc

    async def close(self) -> None:
        """Close the WebSocket connection and clean up."""
        if self._session is not None:
            try:
                await self._session.__aexit__(None, None, None)
            except Exception as exc:
                logger.warning("Error closing session %s: %s", self.session_id, exc)
            finally:
                self._session = None
                self._connected = False
                logger.info("Gemini session %s closed", self.session_id)

    async def send_audio(self, chunk: AudioChunk) -> None:
        """Send a PCM audio chunk to the Gemini session.

        Args:
            chunk: AudioChunk with raw 16-bit PCM data at 16 kHz.

        Raises:
            GeminiClientError: If not connected or send fails.
        """
        self._ensure_connected()
        try:
            await self._session.send_realtime_input(
                audio={"data": chunk.data, "mime_type": chunk.mime_type},
            )
        except Exception as exc:
            raise GeminiClientError(f"Failed to send audio on session {self.session_id}: {exc}") from exc

    async def send_audio_end(self) -> None:
        """Signal that the audio stream has ended (user stopped talking).

        Raises:
            GeminiClientError: If not connected or send fails.
        """
        self._ensure_connected()
        try:
            await self._session.send_realtime_input(audio_stream_end=True)
        except Exception as exc:
            raise GeminiClientError(f"Failed to send audio_stream_end on session {self.session_id}: {exc}") from exc

    async def send_text(self, text: str) -> None:
        """Send a text message to the Gemini session (non-realtime, turn-based).

        Args:
            text: The text content to send.

        Raises:
            GeminiClientError: If not connected or send fails.
        """
        self._ensure_connected()
        try:
            await self._session.send_client_content(
                turns=Content(role="user", parts=[Part(text=text)]),
                turn_complete=True,
            )
        except Exception as exc:
            raise GeminiClientError(f"Failed to send text on session {self.session_id}: {exc}") from exc

    async def send_tool_response(self, function_responses: list[FunctionResponse]) -> None:
        """Send function call results back to the Gemini session.

        After receiving a tool_call in an AgentResponse, execute the functions
        and send back the results. Gemini will then continue its response turn.

        Args:
            function_responses: List of FunctionResponse objects with results.

        Raises:
            GeminiClientError: If not connected or send fails.
        """
        self._ensure_connected()
        try:
            await self._session.send_tool_response(
                function_responses=function_responses,
            )
            logger.info(
                "Session %s sent %d tool response(s)",
                self.session_id,
                len(function_responses),
            )
        except Exception as exc:
            raise GeminiClientError(
                f"Failed to send tool response on session {self.session_id}: {exc}"
            ) from exc

    async def receive(self) -> AsyncIterator[AgentResponse]:
        """Async iterator that yields AgentResponse objects from the session.

        Yields audio data, text transcripts, tool calls, turn completion signals,
        and interruption events. Also captures session resumption handles
        for reconnection.

        When a tool_call is yielded, the caller must:
        1. Pause audio forwarding
        2. Execute the function(s) in tool_calls
        3. Call send_tool_response() with the results
        4. Resume receiving — Gemini will continue its turn

        Yields:
            AgentResponse objects.

        Raises:
            GeminiClientError: If not connected or receive fails.
        """
        self._ensure_connected()
        try:
            turn = self._session.receive()
            async for message in turn:
                # Capture session resumption handles for reconnection
                if hasattr(message, "session_resumption_update"):
                    update = message.session_resumption_update
                    if update and getattr(update, "new_handle", None):
                        self._resumption_handle = update.new_handle

                # Check for GoAway (imminent connection termination)
                if hasattr(message, "go_away") and message.go_away is not None:
                    time_left = getattr(message.go_away, "time_left", "unknown")
                    logger.warning(
                        "Session %s received GoAway — connection ending in %s",
                        self.session_id,
                        time_left,
                    )

                # Handle tool calls from Gemini
                tool_call = getattr(message, "tool_call", None)
                if tool_call is not None:
                    function_calls = getattr(tool_call, "function_calls", None)
                    if function_calls:
                        parts = []
                        for fc in function_calls:
                            parts.append(FunctionCallPart(
                                call_id=fc.id,
                                name=fc.name,
                                args=dict(fc.args) if fc.args else {},
                            ))
                        logger.info(
                            "Session %s received %d tool call(s): %s",
                            self.session_id,
                            len(parts),
                            [p.name for p in parts],
                        )
                        yield AgentResponse(tool_calls=parts)
                        continue

                # Extract content from server_content
                server_content = getattr(message, "server_content", None)
                if server_content is None:
                    continue

                response = AgentResponse()

                # Audio and text from model turn
                model_turn = getattr(server_content, "model_turn", None)
                if model_turn and model_turn.parts:
                    for part in model_turn.parts:
                        if hasattr(part, "inline_data") and part.inline_data:
                            response.audio_data = part.inline_data.data
                        if hasattr(part, "text") and part.text:
                            response.text = part.text

                # Shorthand accessors (data/text directly on message)
                if response.audio_data is None and hasattr(message, "data") and message.data:
                    response.audio_data = message.data
                if response.text is None and hasattr(message, "text") and message.text:
                    response.text = message.text

                # Input/output transcriptions
                input_tx = getattr(server_content, "input_transcription", None)
                if input_tx and getattr(input_tx, "text", None):
                    response.input_transcript = input_tx.text

                output_tx = getattr(server_content, "output_transcription", None)
                if output_tx and getattr(output_tx, "text", None):
                    response.output_transcript = output_tx.text

                # Turn lifecycle
                if getattr(server_content, "turn_complete", False):
                    response.is_turn_complete = True

                if getattr(server_content, "interrupted", False):
                    response.is_interrupted = True

                yield response

        except GeneratorExit:
            return
        except Exception as exc:
            raise GeminiClientError(f"Error receiving on session {self.session_id}: {exc}") from exc

    def _ensure_connected(self) -> None:
        """Raise if the session is not connected."""
        if not self._connected or self._session is None:
            raise GeminiClientError(f"Session {self.session_id} is not connected. Call connect() first.")
