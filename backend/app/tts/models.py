from enum import Enum

from pydantic import BaseModel, Field


class TTSProvider(str, Enum):
    EDGE_TTS = "edge_tts"
    AZURE = "azure"
    ELEVENLABS = "elevenlabs"


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
    # ElevenLabs-specific — ignored for other providers
    elevenlabs_api_key: str | None = None
    elevenlabs_model_id: str = "eleven_multilingual_v2"
    elevenlabs_language_code: str | None = "nep"
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
    fallback_provider: TTSProvider | None = None
    # ElevenLabs-specific
    elevenlabs_api_key: str | None = None
    elevenlabs_model_id: str = "eleven_multilingual_v2"
    elevenlabs_language_code: str | None = "nep"


class VoicesRequest(BaseModel):
    provider: TTSProvider
    locale: str | None = None
