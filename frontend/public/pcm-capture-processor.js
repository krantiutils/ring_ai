/**
 * AudioWorklet processor: captures Float32 mic input, converts to Int16 PCM,
 * and posts the buffer to the main thread. Downsamples from the source
 * sample-rate (commonly 48 kHz) to 16 kHz when necessary.
 *
 * Register with:
 *   await audioContext.audioWorklet.addModule('/pcm-capture-processor.js');
 *   const node = new AudioWorkletNode(audioContext, 'pcm-capture-processor');
 */

const TARGET_SAMPLE_RATE = 16000;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** @type {number} ratio of source rate to target rate (e.g. 3 for 48kHz->16kHz) */
    this._downsampleRatio = Math.round(sampleRate / TARGET_SAMPLE_RATE);
    if (this._downsampleRatio < 1) this._downsampleRatio = 1;
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} _outputs
   * @returns {boolean}
   */
  process(inputs, _outputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true; // keep processor alive
    }

    const float32 = input[0]; // mono channel 0
    const ratio = this._downsampleRatio;

    // Number of samples after downsampling
    const outLength = Math.floor(float32.length / ratio);
    if (outLength === 0) return true;

    const int16 = new Int16Array(outLength);

    for (let i = 0; i < outLength; i++) {
      // Clamp to [-1, 1] then scale to Int16 range
      const sample = Math.max(-1, Math.min(1, float32[i * ratio]));
      int16[i] = sample * 0x7fff;
    }

    // Transfer the underlying ArrayBuffer to the main thread (zero-copy)
    this.port.postMessage(int16.buffer, [int16.buffer]);

    return true; // keep processor alive
  }
}

registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
