"""PCM audio resampler — 24 kHz to 16 kHz downsampling.

Uses linear interpolation to convert 16-bit mono PCM audio from Gemini's
24 kHz output sample rate to the 16 kHz sample rate expected by Android
gateway phones. No external dependencies required.

Ratio: 24000 / 16000 = 3 / 2. For every 3 input samples, produce 2 output
samples via linear interpolation.
"""

import struct

# Gemini outputs 24 kHz, gateway expects 16 kHz
SOURCE_RATE = 24000
TARGET_RATE = 16000

# 16-bit signed PCM, little-endian, mono
SAMPLE_FORMAT = "<h"
SAMPLE_SIZE = 2  # bytes per sample


def resample_24k_to_16k(data: bytes) -> bytes:
    """Downsample 16-bit mono PCM from 24 kHz to 16 kHz.

    Uses linear interpolation for smooth sample rate conversion.

    Args:
        data: Raw 16-bit signed PCM bytes at 24 kHz, little-endian, mono.
              Length must be a multiple of 2 (one sample = 2 bytes).

    Returns:
        Resampled 16-bit PCM bytes at 16 kHz.

    Raises:
        ValueError: If data length is not a multiple of SAMPLE_SIZE.
    """
    if len(data) == 0:
        return b""

    if len(data) % SAMPLE_SIZE != 0:
        raise ValueError(
            f"Audio data length ({len(data)}) must be a multiple of {SAMPLE_SIZE} bytes (16-bit samples)"
        )

    num_input_samples = len(data) // SAMPLE_SIZE
    if num_input_samples < 2:
        # Not enough samples to interpolate — pass through
        return data

    # Unpack all input samples at once
    samples = struct.unpack(f"<{num_input_samples}h", data)

    # Calculate the number of output samples
    num_output_samples = int(num_input_samples * TARGET_RATE / SOURCE_RATE)
    if num_output_samples == 0:
        return b""

    ratio = SOURCE_RATE / TARGET_RATE  # 1.5

    output = []
    for i in range(num_output_samples):
        # Position in the input stream for this output sample
        src_pos = i * ratio
        src_idx = int(src_pos)
        frac = src_pos - src_idx

        if src_idx + 1 < num_input_samples:
            # Linear interpolation between two neighboring samples
            sample = samples[src_idx] + frac * (samples[src_idx + 1] - samples[src_idx])
        else:
            sample = samples[src_idx]

        # Clamp to 16-bit range
        sample = max(-32768, min(32767, int(round(sample))))
        output.append(sample)

    return struct.pack(f"<{len(output)}h", *output)
