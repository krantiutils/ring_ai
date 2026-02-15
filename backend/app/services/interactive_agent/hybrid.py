"""Hybrid output session — Gemini STT + AI with external TTS.

When Gemini's native Nepali pronunciation is insufficient, hybrid mode
splits the pipeline:
    - Gemini: handles speech-to-text (input audio) + conversation AI (text response)
    - TTS Router (Edge/Azure): synthesizes the text response into audio output

The HybridSession wraps an AgentSession (configured for TEXT output) and
a TTSRouter, producing AgentResponse objects with audio_data from the
external TTS provider instead of Gemini's native audio.
"""

import logging

from app.services.interactive_agent.models import (
    AgentResponse,
    AudioChunk,
    OutputMode,
    SessionConfig,
    SessionInfo,
    SessionState,
)
from app.services.interactive_agent.session import AgentSession
from app.tts.models import TTSConfig, TTSProvider
from app.tts.router import TTSRouter

logger = logging.getLogger(__name__)


class HybridSession:
    """Session that uses Gemini for STT+AI and an external TTS for audio output.

    Drop-in replacement for AgentSession in the hybrid output path. The
    public interface matches AgentSession so callers don't need to know
    which mode is active.

    Usage::

        tts_router = TTSRouter()
        tts_router.register(EdgeTTSProvider())

        config = SessionConfig(output_mode=OutputMode.HYBRID)
        hybrid = HybridSession(
            api_key="...",
            config=config,
            tts_router=tts_router,
        )
        await hybrid.start()
        try:
            await hybrid.send_audio(AudioChunk(data=pcm_bytes))
            async for response in hybrid.receive():
                if response.audio_data:
                    play(response.audio_data)  # Audio from Edge/Azure TTS
        finally:
            await hybrid.teardown()
    """

    def __init__(
        self,
        api_key: str,
        config: SessionConfig,
        tts_router: TTSRouter,
    ) -> None:
        if config.output_mode != OutputMode.HYBRID:
            raise ValueError(f"HybridSession requires output_mode=HYBRID, got {config.output_mode.value}")

        self._config = config
        self._tts_router = tts_router
        self._inner = AgentSession(api_key=api_key, config=config)

        # Build TTS config from session's hybrid settings
        self._tts_config = TTSConfig(
            provider=TTSProvider(config.hybrid_tts_provider),
            voice=config.hybrid_tts_voice,
        )

    @property
    def session_id(self) -> str:
        return self._inner.session_id

    @property
    def state(self) -> SessionState:
        return self._inner.state

    @property
    def info(self) -> SessionInfo:
        return self._inner.info

    async def start(self) -> None:
        """Start the underlying Gemini session (text-mode)."""
        await self._inner.start()

    async def teardown(self) -> None:
        """Teardown the underlying Gemini session."""
        await self._inner.teardown()

    async def send_audio(self, chunk: AudioChunk) -> None:
        """Forward input audio to Gemini for STT processing."""
        await self._inner.send_audio(chunk)

    async def send_audio_end(self) -> None:
        """Signal end of input audio stream."""
        await self._inner.send_audio_end()

    async def send_text(self, text: str) -> None:
        """Send text directly to Gemini."""
        await self._inner.send_text(text)

    async def receive(self):
        """Yield AgentResponse objects with TTS-synthesized audio.

        For each text response from Gemini, synthesizes audio via the TTS
        router and attaches it to the AgentResponse. Non-text responses
        (transcripts, turn signals) are passed through unchanged.

        Yields:
            AgentResponse with audio_data from TTS when text is present.
        """
        async for response in self._inner.receive():
            # If Gemini returned text, synthesize it to audio via TTS
            if response.text and not response.audio_data:
                try:
                    tts_result = await self._tts_router.synthesize(
                        text=response.text,
                        config=self._tts_config,
                    )
                    response = AgentResponse(
                        audio_data=tts_result.audio_bytes,
                        text=response.text,
                        input_transcript=response.input_transcript,
                        output_transcript=response.output_transcript or response.text,
                        is_turn_complete=response.is_turn_complete,
                        is_interrupted=response.is_interrupted,
                    )
                    logger.debug(
                        "Hybrid TTS: synthesized %d bytes via %s for session %s",
                        len(tts_result.audio_bytes),
                        tts_result.provider_used.value,
                        self.session_id,
                    )
                except Exception as exc:
                    logger.error(
                        "Hybrid TTS synthesis failed for session %s: %s",
                        self.session_id,
                        exc,
                    )
                    # Still yield the text response without audio so the
                    # caller can decide how to handle it
                    response = AgentResponse(
                        text=response.text,
                        input_transcript=response.input_transcript,
                        output_transcript=response.output_transcript or response.text,
                        is_turn_complete=response.is_turn_complete,
                        is_interrupted=response.is_interrupted,
                    )

            yield response

    async def extend(self) -> None:
        """Extend the underlying Gemini session."""
        await self._inner.extend()
