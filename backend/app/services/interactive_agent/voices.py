"""Gemini prebuilt voice catalog.

All 30 voices supported by the native audio model.
Quality ratings for Nepali are populated by running the voice quality test:
    GEMINI_API_KEY=<key> python -m scripts.nepali_voice_quality_test
"""

import json
import logging
from pathlib import Path

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class GeminiVoice(BaseModel):
    """Metadata for a Gemini prebuilt voice."""

    name: str
    characteristic: str
    nepali_quality: str = "untested"  # untested | poor | fair | good | excellent
    nepali_score: float | None = None  # 0.0–1.0 transcription accuracy score


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


def get_best_nepali_voice() -> GeminiVoice:
    """Return the highest-scored voice for Nepali, or the default if none tested.

    Prefers voices with quality 'excellent' or 'good'. Falls back to 'Kore'
    (the default) if no voice has been tested yet.
    """
    tested = [
        v for v in GEMINI_VOICES.values() if v.nepali_quality in ("excellent", "good") and v.nepali_score is not None
    ]
    if tested:
        return max(tested, key=lambda v: v.nepali_score or 0.0)
    return GEMINI_VOICES["Kore"]


def load_quality_results(results_path: Path) -> int:
    """Load voice quality test results from JSON and update the catalog.

    Args:
        results_path: Path to the JSON results file from nepali_voice_quality_test.

    Returns:
        Number of voices updated.

    Raises:
        FileNotFoundError: If results file doesn't exist.
        json.JSONDecodeError: If results file is malformed.
    """
    with open(results_path, encoding="utf-8") as f:
        data = json.load(f)

    updated = 0
    for entry in data.get("results", []):
        voice_name = entry.get("voice_name")
        if voice_name not in GEMINI_VOICES:
            logger.warning("Ignoring unknown voice in results: %s", voice_name)
            continue

        quality = entry.get("quality", "untested")
        score = entry.get("avg_score")

        if quality not in ("poor", "fair", "good", "excellent"):
            logger.warning("Invalid quality '%s' for voice %s, skipping", quality, voice_name)
            continue

        voice = GEMINI_VOICES[voice_name]
        GEMINI_VOICES[voice_name] = voice.model_copy(update={"nepali_quality": quality, "nepali_score": score})
        updated += 1

    logger.info("Loaded Nepali quality scores for %d voices from %s", updated, results_path)
    return updated
