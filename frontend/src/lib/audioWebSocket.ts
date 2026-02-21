/**
 * LiveAudioSession — real-time bidirectional audio over WebSocket.
 *
 * Captures mic via AudioWorklet, streams 16 kHz Int16 PCM to the backend,
 * receives Int16 PCM + JSON transcript frames, and plays audio through a
 * phone-realism filter chain (300 Hz–3400 Hz bandpass).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
const PLAYBACK_SAMPLE_RATE = 16000;

export type SessionState = "connecting" | "active" | "ended";

export interface LiveAudioSessionOptions {
  onTranscript?: (text: string, speaker: "agent" | "user") => void;
  onTimeout?: () => void;
  onStateChange?: (state: SessionState) => void;
  onAudioLevel?: (level: number) => void;
}

export class LiveAudioSession {
  private sessionId: string;
  private opts: LiveAudioSessionOptions;

  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;

  // Playback filter chain nodes
  private lowpassFilter: BiquadFilterNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  private animFrameId: number | null = null;
  private state: SessionState = "connecting";

  constructor(sessionId: string, options: LiveAudioSessionOptions = {}) {
    this.sessionId = sessionId;
    this.opts = options;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    this.setState("connecting");

    // 1. Request microphone access
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // 2. Create AudioContext (browser default sample rate, usually 48 kHz)
    this.audioCtx = new AudioContext();

    // 3. Build playback filter chain: source -> lowpass(3400) -> highpass(300) -> gain -> analyser -> destination
    this.lowpassFilter = this.audioCtx.createBiquadFilter();
    this.lowpassFilter.type = "lowpass";
    this.lowpassFilter.frequency.value = 3400;

    this.highpassFilter = this.audioCtx.createBiquadFilter();
    this.highpassFilter.type = "highpass";
    this.highpassFilter.frequency.value = 300;

    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = 1.0;

    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;

    // Chain: lowpass -> highpass -> gain -> analyser -> destination
    this.lowpassFilter.connect(this.highpassFilter);
    this.highpassFilter.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    // 4. Set up mic capture via AudioWorklet
    await this.audioCtx.audioWorklet.addModule("/pcm-capture-processor.js");
    const micSource = this.audioCtx.createMediaStreamSource(this.micStream);
    this.workletNode = new AudioWorkletNode(this.audioCtx, "pcm-capture-processor");

    this.workletNode.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      // Forward Int16 PCM buffer to the WebSocket
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(ev.data);
      }
    };

    micSource.connect(this.workletNode);
    // AudioWorkletNode output is not needed (no passthrough to speakers)
    // but we must connect to keep the node alive in some browsers.
    this.workletNode.connect(this.audioCtx.createGain()); // sink (silent)

    // 5. Open WebSocket
    const wsUrl = API_BASE.replace(/^http/, "ws");
    this.ws = new WebSocket(`${wsUrl}/voice/live-agent/ws/${this.sessionId}`);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.setState("active");
    };

    this.ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === "string") {
        this.handleJsonMessage(ev.data);
      } else if (ev.data instanceof ArrayBuffer) {
        this.handleAudioFrame(ev.data);
      }
    };

    this.ws.onerror = () => {
      // WebSocket errors are also followed by onclose, handled there.
    };

    this.ws.onclose = () => {
      this.setState("ended");
    };

    // 6. Start audio-level animation loop
    this.startAudioLevelLoop();
  }

  disconnect(): void {
    // Stop animation loop
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // Close WebSocket
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    // Disconnect worklet
    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch {
        // ignore
      }
      this.workletNode = null;
    }

    // Stop all mic tracks
    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        track.stop();
      }
      this.micStream = null;
    }

    // Close AudioContext
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {
        // ignore
      }
      this.audioCtx = null;
    }

    // Null out filter chain references
    this.lowpassFilter = null;
    this.highpassFilter = null;
    this.gainNode = null;
    this.analyser = null;

    this.setState("ended");
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private setState(s: SessionState): void {
    if (this.state === s) return;
    this.state = s;
    this.opts.onStateChange?.(s);
  }

  /**
   * Handle a JSON text frame from the WebSocket.
   */
  private handleJsonMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as {
        type: string;
        role?: string;
        text?: string;
      };

      if (msg.type === "transcript" && msg.text) {
        const speaker: "agent" | "user" =
          msg.role === "user" ? "user" : "agent";
        this.opts.onTranscript?.(msg.text, speaker);
      } else if (msg.type === "timeout") {
        this.opts.onTimeout?.();
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  /**
   * Handle a binary audio frame (Int16 PCM at 16 kHz) from the WebSocket.
   * Convert to Float32, create an AudioBuffer, and play through the
   * phone-realism filter chain.
   */
  private handleAudioFrame(buffer: ArrayBuffer): void {
    if (!this.audioCtx || !this.lowpassFilter) return;

    const int16 = new Int16Array(buffer);
    const float32 = new Float32Array(int16.length);

    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 0x7fff;
    }

    const audioBuf = this.audioCtx.createBuffer(
      1, // mono
      float32.length,
      PLAYBACK_SAMPLE_RATE,
    );
    audioBuf.getChannelData(0).set(float32);

    const source = this.audioCtx.createBufferSource();
    source.buffer = audioBuf;
    // Connect source into the phone-realism filter chain
    source.connect(this.lowpassFilter);
    source.start();
  }

  /**
   * Periodically read the analyser node to produce an audio level 0-1,
   * delivered via the onAudioLevel callback.
   */
  private startAudioLevelLoop(): void {
    if (!this.analyser || !this.opts.onAudioLevel) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const tick = () => {
      if (!this.analyser) return;

      this.analyser.getByteFrequencyData(dataArray);

      // Compute RMS-like average, normalized to 0-1
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length; // 0-255
      const level = Math.min(1, avg / 255);

      this.opts.onAudioLevel?.(level);

      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);
  }
}
