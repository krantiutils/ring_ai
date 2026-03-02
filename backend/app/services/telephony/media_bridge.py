"""Twilio Media Streams <-> Gemini Live bridge.

Handles audio resampling between Twilio (8kHz u-law) and Gemini (16kHz/24kHz PCM).
"""

import asyncio
import audioop
import base64
import json
import logging
from dataclasses import dataclass

from fastapi import WebSocket

logger = logging.getLogger(__name__)


def ulaw_to_pcm16(ulaw_bytes: bytes) -> bytes:
    """Decode 8kHz u-law to 16-bit PCM."""
    return audioop.ulaw2lin(ulaw_bytes, 2)


def pcm16_to_ulaw(pcm_bytes: bytes) -> bytes:
    """Encode 16-bit PCM to 8kHz u-law."""
    return audioop.lin2ulaw(pcm_bytes, 2)


def resample_8k_to_16k(pcm_8k: bytes) -> bytes:
    """Resample 8kHz 16-bit mono PCM to 16kHz using linear interpolation."""
    return audioop.ratecv(pcm_8k, 2, 1, 8000, 16000, None)[0]


def resample_24k_to_8k(pcm_24k: bytes) -> bytes:
    """Resample 24kHz 16-bit mono PCM to 8kHz."""
    return audioop.ratecv(pcm_24k, 2, 1, 24000, 8000, None)[0]


def resample_16k_to_8k(pcm_16k: bytes) -> bytes:
    """Resample 16kHz 16-bit mono PCM to 8kHz."""
    return audioop.ratecv(pcm_16k, 2, 1, 16000, 8000, None)[0]


@dataclass
class TwilioMediaBridge:
    """Bridge between Twilio Media Streams WebSocket and a Gemini Live session."""

    ws: WebSocket
    session_id: str
    stream_sid: str = ""
    call_sid: str = ""
    _running: bool = False
    _kickoff_sent: bool = False

    async def run(self) -> None:
        """Main loop: receive Twilio events, forward audio to Gemini session."""
        from app.services.interactive_agent.models import AudioChunk
        from app.services.interactive_agent.pool import SessionPool

        await self.ws.accept()
        self._running = True
        logger.info("TwilioMediaBridge started for session %s", self.session_id)

        # Retrieve the session pool from the app state
        app = self.ws.app
        session_pool: SessionPool | None = getattr(app.state, "session_pool", None)
        if session_pool is None:
            logger.error("No session pool available for %s", self.session_id)
            await self.ws.close(code=1008, reason="Session pool not available")
            return

        session = await session_pool.get_session(self.session_id)
        if session is None:
            logger.error("No Gemini session found for %s", self.session_id)
            await self.ws.close(code=1008, reason="Session not found")
            return

        outbound_task: asyncio.Task | None = None

        def _ensure_outbound_task() -> None:
            nonlocal outbound_task
            if outbound_task is None or outbound_task.done():
                outbound_task = asyncio.create_task(self._send_audio_to_twilio(session))

        try:
            async for raw_message in self.ws.iter_text():
                if not self._running:
                    break

                msg = json.loads(raw_message)
                event = msg.get("event")

                if event == "start":
                    self.stream_sid = msg["start"]["streamSid"]
                    self.call_sid = msg["start"].get("callSid", "")
                    logger.info(
                        "Media stream started: stream=%s call=%s",
                        self.stream_sid,
                        self.call_sid,
                    )
                    # Ensure voice-first behavior on phone calls, same as browser WS flow.
                    if not self._kickoff_sent:
                        await session.send_text(
                            "Start speaking immediately in Nepali. Give one short greeting sentence in Nepali, then ask your first scenario question in Nepali and pause."
                        )
                        self._kickoff_sent = True
                    # Start outbound receive loop only after first upstream send.
                    _ensure_outbound_task()

                elif event == "media":
                    payload = msg["media"]["payload"]
                    ulaw_bytes = base64.b64decode(payload)
                    pcm_8k = ulaw_to_pcm16(ulaw_bytes)
                    pcm_16k = resample_8k_to_16k(pcm_8k)
                    await session.send_audio(AudioChunk(data=pcm_16k))
                    _ensure_outbound_task()

                elif event == "stop":
                    logger.info("Media stream stopped for session %s", self.session_id)
                    break

        except Exception as exc:
            logger.error("TwilioMediaBridge error: %s", exc)
        finally:
            self._running = False
            if outbound_task is not None:
                outbound_task.cancel()
                try:
                    await outbound_task
                except asyncio.CancelledError:
                    pass
            logger.info("TwilioMediaBridge ended for session %s", self.session_id)

    async def _send_audio_to_twilio(self, session) -> None:
        """Forward Gemini audio output to Twilio."""
        try:
            async for response in session.receive():
                if not self._running:
                    break
                if not response.audio_data:
                    continue
                # Twilio requires streamSid on outbound media frames.
                if not self.stream_sid:
                    continue
                pcm_8k = resample_24k_to_8k(response.audio_data)
                ulaw_bytes = pcm16_to_ulaw(pcm_8k)
                payload = base64.b64encode(ulaw_bytes).decode("ascii")

                await self.ws.send_json({
                    "event": "media",
                    "streamSid": self.stream_sid,
                    "media": {"payload": payload},
                })
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.error("Outbound audio error: %s", exc)

    async def clear_playback(self) -> None:
        """Send clear event to Twilio (for barge-in)."""
        if self.stream_sid:
            await self.ws.send_json({
                "event": "clear",
                "streamSid": self.stream_sid,
            })
