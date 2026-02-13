from enum import Enum

from pydantic import BaseModel, Field


class TTSProvider(str, Enum):
    EDGE_TTS = "edge_tts"
    AZURE = "azure"
    CAMB_AI = "camb_ai"


class AudioFormat(str, Enum):
    MP3 = "mp3"
    WAV = "wav"
    PCM = "pcm"


class TTSConfig(BaseModel):
    provider: TTSProvider
    voice: str
    rate: str = "+0%"
    pitch: str = "+0Hz"
    volume: str = "+0%"
    output_format: AudioFormat = AudioFormat.MP3
    # Azure-specific — ignored for edge_tts
    api_key: str | None = None
    region: str | None = None
    # CAMB.AI-specific — ignored for other providers
    speech_model: str | None = None  # "mars-pro", "mars-flash", "mars-instruct"
    mood: str | None = None  # Free-text mood instruction (requires mars-instruct)
    # Optional fallback provider on failure
    fallback_provider: TTSProvider | None = None


class TTSResult(BaseModel):
    audio_bytes: bytes
    duration_ms: int
    provider_used: TTSProvider
    chars_consumed: int
    output_format: AudioFormat


class VoiceInfo(BaseModel):
    voice_id: str
    name: str
    gender: str
    locale: str
    provider: TTSProvider


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    provider: TTSProvider
    voice: str
    rate: str = "+0%"
    pitch: str = "+0Hz"
    volume: str = "+0%"
    output_format: AudioFormat = AudioFormat.MP3
    speech_model: str | None = None
    mood: str | None = None
    fallback_provider: TTSProvider | None = None


class VoicesRequest(BaseModel):
    provider: TTSProvider
    locale: str | None = None
