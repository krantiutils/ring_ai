/**
 * LiveAudioSession — real-time bidirectional audio over WebSocket.
 *
 * Rewritten for stable long-form playback and deterministic interruption:
 * - Mic capture: AudioWorklet -> 16k Int16 PCM -> 20ms WS chunks
 * - Playback: continuous AudioWorklet PCM sink (no per-chunk source scheduling)
 * - Barge-in: speech-energy based interrupt + stale-turn audio drop
 */

const MIC_WS_CHUNK_BYTES = 640; // 20 ms @ 16kHz Int16 mono
const ENABLE_LOCAL_BROWSER_STT = false; // Keep phone behavior backend-driven

function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/v1`;
}

export type SessionState = "connecting" | "active" | "ended";

export interface LiveAudioSessionOptions {
  onTranscript?: (text: string, speaker: "agent" | "user") => void;
  onLocalTranscript?: (text: string, isFinal: boolean) => void;
  onTimeout?: () => void;
  onStateChange?: (state: SessionState) => void;
  onAudioLevel?: (level: number) => void;
}

type PlaybackStats = {
  type: "stats";
  queuedSamples: number;
  queuedSeconds: number;
};

export class LiveAudioSession {
  private sessionId: string;
  private opts: LiveAudioSessionOptions;

  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private workletSink: GainNode | null = null;
  private playbackNode: AudioWorkletNode | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API has no standard TS types
  private speechRecognition: any = null;

  // Playback filter chain nodes
  private lowpassFilter: BiquadFilterNode | null = null;
  private highpassFilter: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  private animFrameId: number | null = null;
  private state: SessionState = "connecting";
  private micSendBuffer = new Uint8Array(0);

  // Interruption / turn state
  private userSpeaking = false;
  private consecutiveSpeechChunks = 0;
  private lastSpeechAtMs = 0;
  private lastAudioEndSignalAtMs = 0;
  private lastBargeInAtMs = 0;
  private droppingStaleAgentAudio = false;
  private waitingForFreshAssistantTurn = false;
  private waitingSinceMs = 0;

  // Startup gate so assistant can speak first
  private allowMicStreaming = false;
  private micStartTimer: number | null = null;

  // Playback backlog telemetry from playback worklet
  private queuedPlaybackSec = 0;

  constructor(sessionId: string, options: LiveAudioSessionOptions = {}) {
    this.sessionId = sessionId;
    this.opts = options;
  }

  async connect(): Promise<void> {
    this.setState("connecting");

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone not available. Use HTTPS or localhost.");
    }

    this.micStream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Microphone prompt timed out")), 15000),
      ),
    ]);

    this.audioCtx = new AudioContext();
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    // Playback chain: playback worklet -> lowpass -> highpass -> gain -> analyser -> destination
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

    this.lowpassFilter.connect(this.highpassFilter);
    this.highpassFilter.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    await this.audioCtx.audioWorklet.addModule("/pcm-capture-processor.js");
    await this.audioCtx.audioWorklet.addModule("/pcm-playback-processor.js");

    // Mic capture worklet
    const micSource = this.audioCtx.createMediaStreamSource(this.micStream);
    this.workletNode = new AudioWorkletNode(this.audioCtx, "pcm-capture-processor");

    this.workletNode.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      if (!this.allowMicStreaming) return;

      const incoming = new Uint8Array(ev.data);
      const merged = new Uint8Array(this.micSendBuffer.length + incoming.length);
      merged.set(this.micSendBuffer, 0);
      merged.set(incoming, this.micSendBuffer.length);
      this.micSendBuffer = merged;

      while (this.micSendBuffer.length >= MIC_WS_CHUNK_BYTES) {
        const chunk = this.micSendBuffer.slice(0, MIC_WS_CHUNK_BYTES);
        this.updateSpeechStateAndBargeIn(chunk);
        if (this.shouldForwardMicChunk()) {
          this.ws.send(chunk.buffer);
        }
        this.micSendBuffer = this.micSendBuffer.slice(MIC_WS_CHUNK_BYTES);
      }
    };

    micSource.connect(this.workletNode);
    this.workletSink = this.audioCtx.createGain();
    this.workletSink.gain.value = 0;
    this.workletNode.connect(this.workletSink);
    this.workletSink.connect(this.audioCtx.destination);

    // Playback worklet
    this.playbackNode = new AudioWorkletNode(this.audioCtx, "pcm-playback-processor");
    this.playbackNode.port.onmessage = (ev: MessageEvent<PlaybackStats>) => {
      const msg = ev.data;
      if (!msg || msg.type !== "stats") return;
      this.queuedPlaybackSec = msg.queuedSeconds;
    };
    this.playbackNode.connect(this.lowpassFilter);

    const wsUrl = buildWsUrl();
    const fullWsUrl = `${wsUrl}/voice/live-agent/ws/${this.sessionId}`;
    this.ws = new WebSocket(fullWsUrl);
    this.ws.binaryType = "arraybuffer";

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("WebSocket connection timed out"));
      }, 10000);

      this.ws!.onopen = () => {
        clearTimeout(timer);
        this.setState("active");

        // Greeting-first behavior: brief hold before mic uplink.
        this.allowMicStreaming = false;
        this.micStartTimer = window.setTimeout(() => {
          this.allowMicStreaming = true;
          this.micStartTimer = null;
        }, 350);

        resolve();
      };

      this.ws!.onerror = () => {
        clearTimeout(timer);
        reject(new Error("WebSocket connection failed"));
      };
    });

    this.ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === "string") {
        this.handleJsonMessage(ev.data);
      } else if (ev.data instanceof ArrayBuffer) {
        this.handleAudioFrame(ev.data);
      }
    };

    this.ws.onclose = () => {
      this.setState("ended");
    };

    if (ENABLE_LOCAL_BROWSER_STT) {
      this.startLocalRecognition();
    }
    this.startAudioLevelLoop();
  }

  disconnect(): void {
    this.interruptPlayback();

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }

    if (this.micStartTimer !== null) {
      window.clearTimeout(this.micStartTimer);
      this.micStartTimer = null;
    }

    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch {
        // ignore
      }
      this.workletNode = null;
    }

    if (this.playbackNode) {
      try {
        this.playbackNode.disconnect();
      } catch {
        // ignore
      }
      this.playbackNode = null;
    }

    if (this.workletSink) {
      try {
        this.workletSink.disconnect();
      } catch {
        // ignore
      }
      this.workletSink = null;
    }

    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        track.stop();
      }
      this.micStream = null;
    }

    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {
        // ignore
      }
      this.audioCtx = null;
    }

    this.lowpassFilter = null;
    this.highpassFilter = null;
    this.gainNode = null;
    this.analyser = null;

    this.setState("ended");

    this.micSendBuffer = new Uint8Array(0);
    this.userSpeaking = false;
    this.consecutiveSpeechChunks = 0;
    this.lastSpeechAtMs = 0;
    this.lastAudioEndSignalAtMs = 0;
    this.lastBargeInAtMs = 0;
    this.droppingStaleAgentAudio = false;
    this.waitingForFreshAssistantTurn = false;
    this.waitingSinceMs = 0;
    this.allowMicStreaming = false;
    this.queuedPlaybackSec = 0;

    if (ENABLE_LOCAL_BROWSER_STT) {
      this.stopLocalRecognition();
    }
  }

  private setState(s: SessionState): void {
    if (this.state === s) return;
    this.state = s;
    this.opts.onStateChange?.(s);
  }

  private handleJsonMessage(raw: string): void {
    try {
      const msg = JSON.parse(raw) as {
        type: string;
        role?: string;
        text?: string;
      };

      if (msg.type === "transcript" && msg.text) {
        const speaker: "agent" | "user" = msg.role === "user" ? "user" : "agent";

        if (speaker === "agent") {
          this.allowMicStreaming = true;
          if (this.waitingForFreshAssistantTurn) {
            this.droppingStaleAgentAudio = false;
            this.waitingForFreshAssistantTurn = false;
          }
        }

        if (speaker === "user" && this.audioCtx) {
          const hasQueuedAgentAudio = this.queuedPlaybackSec > 0.08;
          if (hasQueuedAgentAudio) {
            this.beginBargeInCutover();
          }
        }

        this.opts.onTranscript?.(msg.text, speaker);
      } else if (msg.type === "timeout") {
        this.opts.onTimeout?.();
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  private handleAudioFrame(buffer: ArrayBuffer): void {
    if (!this.playbackNode) return;

    if (this.droppingStaleAgentAudio) {
      // Fail-open in case transcript markers are delayed.
      if (Date.now() - this.waitingSinceMs > 1600) {
        this.droppingStaleAgentAudio = false;
        this.waitingForFreshAssistantTurn = false;
      } else {
        return;
      }
    }

    const clone = buffer.slice(0);
    this.playbackNode.port.postMessage({ type: "enqueue", data: clone }, [clone]);
  }

  private beginBargeInCutover(): void {
    this.droppingStaleAgentAudio = true;
    this.waitingForFreshAssistantTurn = true;
    this.waitingSinceMs = Date.now();
    this.interruptPlayback();
  }

  private interruptPlayback(): void {
    if (!this.playbackNode) return;
    try {
      this.playbackNode.port.postMessage({ type: "clear" });
    } catch {
      // ignore
    }
    this.queuedPlaybackSec = 0;
  }

  private updateSpeechStateAndBargeIn(chunk: Uint8Array): void {
    const nowMs = Date.now();
    const speakingNow = this.isLikelyUserSpeech(chunk);

    if (speakingNow) {
      this.userSpeaking = true;
      this.lastSpeechAtMs = nowMs;
      this.consecutiveSpeechChunks += 1;

      const hasQueuedAgentAudio = this.queuedPlaybackSec > 0.08;
      if (hasQueuedAgentAudio && this.consecutiveSpeechChunks >= 6 && nowMs - this.lastBargeInAtMs > 700) {
        this.beginBargeInCutover();
        this.lastBargeInAtMs = nowMs;
      }
      return;
    }

    this.consecutiveSpeechChunks = 0;
    if (!this.userSpeaking) return;

    if (nowMs - this.lastSpeechAtMs >= 500) {
      this.userSpeaking = false;
      this.sendAudioEndSignal(nowMs);
    }
  }

  private sendAudioEndSignal(nowMs: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (nowMs - this.lastAudioEndSignalAtMs < 600) return;
    try {
      this.ws.send(JSON.stringify({ type: "audio_end" }));
      this.lastAudioEndSignalAtMs = nowMs;
      this.waitingForFreshAssistantTurn = true;
      this.waitingSinceMs = nowMs;
    } catch {
      // ignore
    }
  }

  private isLikelyUserSpeech(chunk: Uint8Array): boolean {
    const int16 = new Int16Array(chunk.buffer, chunk.byteOffset, Math.floor(chunk.byteLength / 2));
    if (int16.length === 0) return false;

    let energy = 0;
    let count = 0;
    for (let i = 0; i < int16.length; i += 2) {
      const x = int16[i] / 0x7fff;
      energy += x * x;
      count += 1;
    }

    const rms = Math.sqrt(energy / Math.max(1, count));
    const playbackActive = this.queuedPlaybackSec > 0.08;
    return playbackActive ? rms > 0.11 : rms > 0.035;
  }

  private shouldForwardMicChunk(): boolean {
    // During assistant playback, suppress non-speech uplink to prevent echo loops.
    const playbackActive = this.queuedPlaybackSec > 0.08 || this.droppingStaleAgentAudio;
    if (!playbackActive) return true;
    return this.userSpeaking;
  }

  private startAudioLevelLoop(): void {
    if (!this.analyser || !this.opts.onAudioLevel) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const tick = () => {
      if (!this.analyser) return;

      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const level = Math.min(1, avg / 255);

      this.opts.onAudioLevel?.(level);
      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);
  }

  private startLocalRecognition(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API has no standard TS types
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;

    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "ne-NP";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SpeechRecognitionEvent not in standard TS DOM types
      rec.onresult = (ev: any) => {
        let interim = "";
        let finalText = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const result = ev.results[i];
          const text = String(result?.[0]?.transcript ?? "").trim();
          if (!text) continue;
          if (result.isFinal) {
            finalText += (finalText ? " " : "") + text;
          } else {
            interim += (interim ? " " : "") + text;
          }
        }
        if (interim) this.opts.onLocalTranscript?.(interim, false);
        if (finalText) this.opts.onLocalTranscript?.(finalText, true);
      };

      rec.onerror = () => {
        // Keep silent; fallback is server-side transcripts.
      };

      rec.onend = () => {
        if (this.state === "active") {
          try {
            rec.start();
          } catch {
            // ignore
          }
        }
      };

      rec.start();
      this.speechRecognition = rec;
    } catch {
      // ignore unsupported/runtime failures
    }
  }

  private stopLocalRecognition(): void {
    if (!this.speechRecognition) return;
    try {
      this.speechRecognition.onend = null;
      this.speechRecognition.stop();
    } catch {
      // ignore
    }
    this.speechRecognition = null;
  }
}
