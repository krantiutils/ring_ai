"""Nepali voice quality validation for all 30 Gemini prebuilt voices.

Connects to the Gemini 2.5 Flash Native Audio API with each voice, sends
standardized Nepali test phrases, and evaluates pronunciation quality via
output transcription accuracy.

Methodology:
    1. For each voice, open a Gemini Live session with TEXT response modality.
    2. Send Nepali text prompts and instruct the model to repeat them exactly.
    3. Compare output transcription against the expected Nepali text.
    4. Score based on transcription match ratio (proxy for pronunciation clarity).
    5. Export results as JSON for review.

Usage:
    GEMINI_API_KEY=<key> python -m scripts.nepali_voice_quality_test [--output results.json]

Requires: GEMINI_API_KEY env var.
"""

import argparse
import asyncio
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from google import genai
from google.genai.types import (
    AudioTranscriptionConfig,
    Content,
    LiveConnectConfig,
    Part,
    PrebuiltVoiceConfig,
    SpeechConfig,
    VoiceConfig,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Nepali test phrases — phonetically diverse set covering:
#   - Common greetings and conversational phrases
#   - Numbers and dates (common in voice campaigns)
#   - Complex consonant clusters (conjuncts) unique to Devanagari
#   - Formal / polite register (used in customer-facing calls)
#   - Long compound sentences testing prosody
# ---------------------------------------------------------------------------

NEPALI_TEST_PHRASES: list[dict[str, str]] = [
    {
        "id": "greeting_basic",
        "text": "नमस्ते, तपाईंलाई कस्तो छ?",
        "category": "greeting",
        "notes": "Basic greeting — tests nasal म, retroflex ट, aspirate छ",
    },
    {
        "id": "greeting_formal",
        "text": "नमस्कार, म Ring AI बाट बोल्दै छु।",
        "category": "greeting",
        "notes": "Formal greeting with code-switch to English brand name",
    },
    {
        "id": "number_phone",
        "text": "तपाईंको फोन नम्बर ९८४१२३४५६७ हो?",
        "category": "numbers",
        "notes": "Phone number with Devanagari digits — tests digit pronunciation",
    },
    {
        "id": "number_amount",
        "text": "तपाईंको बक्यौता रकम पाँच हजार तीन सय पचास रुपैयाँ छ।",
        "category": "numbers",
        "notes": "Currency amount — tests number words and nasal vowels (पाँच, रुपैयाँ)",
    },
    {
        "id": "conjunct_heavy",
        "text": "कृपया प्रतिक्षा गर्नुहोस्, म तपाईंको विवरण जाँच गर्दैछु।",
        "category": "conjuncts",
        "notes": "Heavy conjuncts: कृ, प्र, क्ष — tests complex consonant clusters",
    },
    {
        "id": "conjunct_aspirates",
        "text": "श्री कृष्ण प्रसाद श्रेष्ठज्यू, तपाईंको खातामा समस्या छ।",
        "category": "conjuncts",
        "notes": "Name with श्र, कृष्ण, ष्ठ conjuncts — maximum complexity",
    },
    {
        "id": "polite_request",
        "text": "कृपया आफ्नो विवरण पुष्टि गर्न एक नम्बर थिच्नुहोस्।",
        "category": "formal",
        "notes": "DTMF prompt style — polite imperative with पुष्टि, थिच्नुहोस्",
    },
    {
        "id": "polite_thanks",
        "text": "धन्यवाद, तपाईंको समय र सहयोगको लागि हामी आभारी छौं।",
        "category": "formal",
        "notes": "Thank you closing — tests vowel combinations (आभारी, छौं)",
    },
    {
        "id": "long_compound",
        "text": ("तपाईंको ऋण भुक्तानीको म्याद सकिएको छ, कृपया यथाशीघ्र भुक्तानी गर्नुहोस् अन्यथा थप शुल्क लाग्न सक्छ।"),
        "category": "prosody",
        "notes": "Multi-clause sentence — tests prosody, pausing, ऋ vowel, श्र cluster",
    },
    {
        "id": "date_time",
        "text": "तपाईंको अर्को भुक्तानी मिति माघ १५ गते, बिहान १० बजे सम्म हो।",
        "category": "numbers",
        "notes": "Date/time with Nepali calendar month — tests temporal vocabulary",
    },
]


@dataclass
class VoiceTestResult:
    """Result of testing a single voice with all Nepali phrases."""

    voice_name: str
    characteristic: str
    phrase_results: list[dict] = field(default_factory=list)
    avg_transcription_score: float = 0.0
    overall_quality: str = "untested"  # poor | fair | good | excellent
    error: str | None = None
    latency_ms: float = 0.0


def _score_transcription(expected: str, actual: str | None) -> float:
    """Score transcription accuracy as a float 0.0–1.0.

    Uses character-level overlap ratio. Strips whitespace and punctuation
    for comparison since TTS transcription often normalizes these.
    """
    if actual is None:
        return 0.0

    def _normalize(s: str) -> str:
        # Keep only Devanagari characters and digits for comparison
        return "".join(c for c in s if ("\u0900" <= c <= "\u097f") or ("\u0966" <= c <= "\u096f") or c.isalnum())

    norm_expected = _normalize(expected)
    norm_actual = _normalize(actual)

    if not norm_expected:
        return 1.0 if not norm_actual else 0.0

    # Character-level intersection / union (Jaccard-like)
    expected_chars = list(norm_expected)
    actual_chars = list(norm_actual)

    # Count matching characters in order (longest common subsequence ratio)
    # Simpler approach: character overlap ratio
    matches = 0
    actual_remaining = list(actual_chars)
    for ch in expected_chars:
        if ch in actual_remaining:
            actual_remaining.remove(ch)
            matches += 1

    max_len = max(len(norm_expected), len(norm_actual))
    return matches / max_len if max_len > 0 else 1.0


def _quality_from_score(score: float) -> str:
    """Map average transcription score to a quality label."""
    if score >= 0.85:
        return "excellent"
    if score >= 0.70:
        return "good"
    if score >= 0.50:
        return "fair"
    return "poor"


async def _test_single_voice(
    api_key: str,
    voice_name: str,
    characteristic: str,
    phrases: list[dict[str, str]],
    timeout_per_phrase: float = 30.0,
) -> VoiceTestResult:
    """Test a single Gemini voice with all Nepali phrases.

    Opens a Live session with AUDIO response modality + output transcription,
    sends each phrase as text (instructing the model to repeat it in Nepali),
    and captures the output transcription for scoring.
    """
    result = VoiceTestResult(voice_name=voice_name, characteristic=characteristic)
    start_time = time.monotonic()

    client = genai.Client(
        api_key=api_key,
        http_options={"api_version": "v1alpha"},
    )

    live_config = LiveConnectConfig(
        response_modalities=["AUDIO"],
        speech_config=SpeechConfig(
            voice_config=VoiceConfig(
                prebuilt_voice_config=PrebuiltVoiceConfig(voice_name=voice_name),
            ),
        ),
        system_instruction=Content(
            parts=[
                Part(
                    text=(
                        "You are a Nepali pronunciation test assistant. "
                        "When given Nepali text, repeat it back EXACTLY as written, "
                        "pronouncing every word clearly in Nepali. "
                        "Do not translate, explain, or add anything — just repeat the text."
                    )
                )
            ],
            role="user",
        ),
        output_audio_transcription=AudioTranscriptionConfig(),
        temperature=0.1,  # Low temperature for faithful reproduction
    )

    try:
        async with client.aio.live.connect(
            model="gemini-2.5-flash-native-audio-preview-12-2025",
            config=live_config,
        ) as session:
            for phrase in phrases:
                phrase_result = {
                    "id": phrase["id"],
                    "expected": phrase["text"],
                    "category": phrase["category"],
                    "transcription": None,
                    "score": 0.0,
                    "error": None,
                }

                try:
                    await session.send_client_content(
                        turns=Content(
                            role="user",
                            parts=[Part(text=f"कृपया यो नेपाली वाक्य दोहोर्‍याउनुहोस्: {phrase['text']}")],
                        ),
                        turn_complete=True,
                    )

                    # Collect response until turn complete
                    transcription_parts: list[str] = []
                    try:
                        turn = session.receive()
                        async for message in turn:
                            server_content = getattr(message, "server_content", None)
                            if server_content is None:
                                continue

                            output_tx = getattr(server_content, "output_transcription", None)
                            if output_tx and getattr(output_tx, "text", None):
                                transcription_parts.append(output_tx.text)

                            if getattr(server_content, "turn_complete", False):
                                break
                    except asyncio.TimeoutError:
                        phrase_result["error"] = "timeout"

                    full_transcription = " ".join(transcription_parts).strip() or None
                    phrase_result["transcription"] = full_transcription
                    phrase_result["score"] = _score_transcription(phrase["text"], full_transcription)

                except Exception as exc:
                    phrase_result["error"] = str(exc)
                    logger.warning("Voice %s, phrase %s failed: %s", voice_name, phrase["id"], exc)

                result.phrase_results.append(phrase_result)

    except Exception as exc:
        result.error = str(exc)
        logger.error("Voice %s session failed: %s", voice_name, exc)

    elapsed = time.monotonic() - start_time
    result.latency_ms = round(elapsed * 1000, 1)

    if result.phrase_results and not result.error:
        scores = [pr["score"] for pr in result.phrase_results if pr["error"] is None]
        result.avg_transcription_score = round(sum(scores) / len(scores), 3) if scores else 0.0
        result.overall_quality = _quality_from_score(result.avg_transcription_score)

    return result


async def run_voice_quality_test(
    api_key: str,
    voice_names: list[str] | None = None,
    max_concurrent: int = 5,
) -> list[VoiceTestResult]:
    """Run the Nepali voice quality test across all (or specified) voices.

    Args:
        api_key: Gemini API key.
        voice_names: Optional subset of voices to test. Defaults to all 30.
        max_concurrent: Max concurrent API sessions.

    Returns:
        List of VoiceTestResult, sorted by avg_transcription_score descending.
    """
    # Import here to avoid circular deps when used as a library
    from app.services.interactive_agent.voices import GEMINI_VOICES

    if voice_names is None:
        voices_to_test = list(GEMINI_VOICES.values())
    else:
        voices_to_test = [GEMINI_VOICES[n] for n in voice_names if n in GEMINI_VOICES]

    semaphore = asyncio.Semaphore(max_concurrent)

    async def _bounded_test(voice):
        async with semaphore:
            logger.info("Testing voice: %s (%s)", voice.name, voice.characteristic)
            return await _test_single_voice(
                api_key=api_key,
                voice_name=voice.name,
                characteristic=voice.characteristic,
                phrases=NEPALI_TEST_PHRASES,
            )

    results = await asyncio.gather(*[_bounded_test(v) for v in voices_to_test])
    results = sorted(results, key=lambda r: r.avg_transcription_score, reverse=True)
    return list(results)


def export_results(results: list[VoiceTestResult], output_path: Path) -> None:
    """Export test results to a JSON file."""
    data = {
        "test_date": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "model": "gemini-2.5-flash-native-audio-preview-12-2025",
        "test_phrases_count": len(NEPALI_TEST_PHRASES),
        "methodology": (
            "Each voice repeats standardized Nepali phrases. "
            "Output transcription is compared to expected text using "
            "character-level overlap scoring. Scores: 0.0–1.0."
        ),
        "quality_thresholds": {
            "excellent": ">=0.85",
            "good": ">=0.70",
            "fair": ">=0.50",
            "poor": "<0.50",
        },
        "results": [
            {
                "voice_name": r.voice_name,
                "characteristic": r.characteristic,
                "avg_score": r.avg_transcription_score,
                "quality": r.overall_quality,
                "latency_ms": r.latency_ms,
                "error": r.error,
                "phrases": r.phrase_results,
            }
            for r in results
        ],
        "summary": {
            "total_voices_tested": len(results),
            "excellent": sum(1 for r in results if r.overall_quality == "excellent"),
            "good": sum(1 for r in results if r.overall_quality == "good"),
            "fair": sum(1 for r in results if r.overall_quality == "fair"),
            "poor": sum(1 for r in results if r.overall_quality == "poor"),
            "errors": sum(1 for r in results if r.error is not None),
            "recommended_voices": [r.voice_name for r in results if r.overall_quality in ("excellent", "good")],
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    logger.info("Results exported to %s", output_path)


def print_summary(results: list[VoiceTestResult]) -> None:
    """Print a human-readable summary to stdout."""
    print("\n" + "=" * 72)
    print("NEPALI VOICE QUALITY TEST RESULTS")
    print("=" * 72)
    print(f"{'Voice':<20} {'Characteristic':<15} {'Score':>7} {'Quality':<10} {'Latency':>10}")
    print("-" * 72)

    for r in results:
        if r.error:
            quality_display = f"ERROR: {r.error[:20]}"
        else:
            quality_display = r.overall_quality.upper()

        print(
            f"{r.voice_name:<20} {r.characteristic:<15} {r.avg_transcription_score:>7.3f} "
            f"{quality_display:<10} {r.latency_ms:>8.0f}ms"
        )

    print("-" * 72)

    excellent = [r for r in results if r.overall_quality == "excellent"]
    good = [r for r in results if r.overall_quality == "good"]
    recommended = excellent + good

    if recommended:
        print(f"\nRecommended for Nepali production use ({len(recommended)} voices):")
        for r in recommended:
            print(f"  - {r.voice_name} ({r.characteristic}) — score {r.avg_transcription_score:.3f}")
    else:
        print("\nNo voices scored 'good' or better.")
        print("RECOMMENDATION: Use hybrid mode (Gemini STT+AI, Edge/Azure TTS for Nepali output)")

    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Nepali voice quality validation for Gemini voices")
    parser.add_argument(
        "--output",
        type=str,
        default="scripts/nepali_voice_quality_results.json",
        help="Output JSON file path (default: scripts/nepali_voice_quality_results.json)",
    )
    parser.add_argument(
        "--voices",
        nargs="*",
        help="Specific voice names to test (default: all 30)",
    )
    parser.add_argument(
        "--candidates-only",
        action="store_true",
        help="Only test the 8 Nepali candidate voices",
    )
    parser.add_argument(
        "--max-concurrent",
        type=int,
        default=5,
        help="Max concurrent API sessions (default: 5)",
    )
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        print("ERROR: GEMINI_API_KEY environment variable is required.", file=sys.stderr)
        sys.exit(1)

    voice_names = args.voices
    if args.candidates_only:
        from app.services.interactive_agent.voices import NEPALI_CANDIDATE_VOICES

        voice_names = NEPALI_CANDIDATE_VOICES

    results = asyncio.run(
        run_voice_quality_test(
            api_key=api_key,
            voice_names=voice_names,
            max_concurrent=args.max_concurrent,
        )
    )

    print_summary(results)
    export_results(results, Path(args.output))


if __name__ == "__main__":
    main()
