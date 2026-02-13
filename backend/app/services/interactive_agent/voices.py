"""Gemini prebuilt voice catalog.

All 30 voices supported by the native audio model.
Quality ratings for Nepali are TBD — run voice_quality_test() to evaluate.
"""

from pydantic import BaseModel


class GeminiVoice(BaseModel):
    """Metadata for a Gemini prebuilt voice."""

    name: str
    characteristic: str
    nepali_quality: str = "untested"  # untested | poor | fair | good | excellent


# Complete catalog of all 30 Gemini native audio voices.
# Nepali quality ratings should be filled in after testing (ra-cn88).
GEMINI_VOICES: dict[str, GeminiVoice] = {
    "Zephyr": GeminiVoice(name="Zephyr", characteristic="Bright"),
    "Puck": GeminiVoice(name="Puck", characteristic="Upbeat"),
    "Charon": GeminiVoice(name="Charon", characteristic="Informative"),
    "Kore": GeminiVoice(name="Kore", characteristic="Firm"),
    "Fenrir": GeminiVoice(name="Fenrir", characteristic="Excitable"),
    "Leda": GeminiVoice(name="Leda", characteristic="Youthful"),
    "Orus": GeminiVoice(name="Orus", characteristic="Firm"),
    "Aoede": GeminiVoice(name="Aoede", characteristic="Breezy"),
    "Callirrhoe": GeminiVoice(name="Callirrhoe", characteristic="Easy-going"),
    "Autonoe": GeminiVoice(name="Autonoe", characteristic="Bright"),
    "Enceladus": GeminiVoice(name="Enceladus", characteristic="Breathy"),
    "Iapetus": GeminiVoice(name="Iapetus", characteristic="Clear"),
    "Umbriel": GeminiVoice(name="Umbriel", characteristic="Easy-going"),
    "Algieba": GeminiVoice(name="Algieba", characteristic="Smooth"),
    "Despina": GeminiVoice(name="Despina", characteristic="Smooth"),
    "Erinome": GeminiVoice(name="Erinome", characteristic="Clear"),
    "Algenib": GeminiVoice(name="Algenib", characteristic="Gravelly"),
    "Rasalgethi": GeminiVoice(name="Rasalgethi", characteristic="Informative"),
    "Laomedeia": GeminiVoice(name="Laomedeia", characteristic="Upbeat"),
    "Achernar": GeminiVoice(name="Achernar", characteristic="Soft"),
    "Alnilam": GeminiVoice(name="Alnilam", characteristic="Firm"),
    "Schedar": GeminiVoice(name="Schedar", characteristic="Even"),
    "Gacrux": GeminiVoice(name="Gacrux", characteristic="Mature"),
    "Pulcherrima": GeminiVoice(name="Pulcherrima", characteristic="Forward"),
    "Achird": GeminiVoice(name="Achird", characteristic="Friendly"),
    "Zubenelgenubi": GeminiVoice(name="Zubenelgenubi", characteristic="Casual"),
    "Vindemiatrix": GeminiVoice(name="Vindemiatrix", characteristic="Gentle"),
    "Sadachbia": GeminiVoice(name="Sadachbia", characteristic="Lively"),
    "Sadaltager": GeminiVoice(name="Sadaltager", characteristic="Knowledgeable"),
    "Sulafat": GeminiVoice(name="Sulafat", characteristic="Warm"),
}

# Voices expected to perform well for Nepali based on voice characteristics.
# Firm/clear/informative voices tend to handle non-English phonetics better.
# This is a starting hypothesis — actual quality validation is in ra-cn88.
NEPALI_CANDIDATE_VOICES: list[str] = [
    "Kore",  # Firm — good baseline for clear Nepali articulation
    "Charon",  # Informative — clear enunciation
    "Iapetus",  # Clear
    "Erinome",  # Clear
    "Alnilam",  # Firm
    "Rasalgethi",  # Informative
    "Schedar",  # Even
    "Sulafat",  # Warm
]


def get_voice(name: str) -> GeminiVoice:
    """Look up a voice by name. Raises ValueError if not found."""
    voice = GEMINI_VOICES.get(name)
    if voice is None:
        raise ValueError(f"Unknown Gemini voice '{name}'. Available voices: {', '.join(sorted(GEMINI_VOICES.keys()))}")
    return voice


def list_voices() -> list[GeminiVoice]:
    """Return all available voices sorted by name."""
    return sorted(GEMINI_VOICES.values(), key=lambda v: v.name)
