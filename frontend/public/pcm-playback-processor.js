/**
 * AudioWorklet processor for smooth PCM playback.
 *
 * Receives Int16 PCM chunks (24kHz mono) from the main thread and renders a
 * continuous float stream to the output, avoiding per-chunk source scheduling.
 */

class PcmPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._inputSampleRate = 24000;
    this._step = this._inputSampleRate / sampleRate;
    this._chunks = [];
    this._current = null;
    this._srcPos = 0;
    this._sampleCounter = 0;

    this.port.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "enqueue" && msg.data instanceof ArrayBuffer) {
        this._chunks.push(new Int16Array(msg.data));
      } else if (msg.type === "clear") {
        this._chunks = [];
        this._current = null;
        this._srcPos = 0;
      }
    };
  }

  _ensureCurrent() {
    if (!this._current && this._chunks.length > 0) {
      this._current = this._chunks.shift();
      this._srcPos = 0;
    }
  }

  _nextSourceSample() {
    this._ensureCurrent();
    if (!this._current) return 0;

    const len = this._current.length;
    if (len === 0) {
      this._current = null;
      this._srcPos = 0;
      return 0;
    }

    const i0 = Math.floor(this._srcPos);
    const frac = this._srcPos - i0;

    let s0 = this._current[Math.min(i0, len - 1)];
    let s1 = s0;

    if (i0 + 1 < len) {
      s1 = this._current[i0 + 1];
    } else if (this._chunks.length > 0 && this._chunks[0].length > 0) {
      s1 = this._chunks[0][0];
    }

    const sample = (s0 + (s1 - s0) * frac) / 0x7fff;

    this._srcPos += this._step;
    while (this._current && this._srcPos >= this._current.length) {
      this._srcPos -= this._current.length;
      this._current = this._chunks.length > 0 ? this._chunks.shift() : null;
      if (!this._current) {
        this._srcPos = 0;
        break;
      }
    }

    return sample;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const channel = output[0];

    for (let i = 0; i < channel.length; i++) {
      channel[i] = this._nextSourceSample();
    }

    this._sampleCounter += channel.length;
    if (this._sampleCounter >= sampleRate / 5) {
      const queuedSamples = this._chunks.reduce((acc, chunk) => acc + chunk.length, 0)
        + (this._current ? Math.max(0, this._current.length - Math.floor(this._srcPos)) : 0);
      this.port.postMessage({
        type: "stats",
        queuedSamples,
        queuedSeconds: queuedSamples / this._inputSampleRate,
      });
      this._sampleCounter = 0;
    }

    return true;
  }
}

registerProcessor("pcm-playback-processor", PcmPlaybackProcessor);
