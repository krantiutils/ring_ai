"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import { LiveAudioSession } from "@/lib/audioWebSocket";
import type { LandingLanguage } from "@/app/page";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type LiveAgentState =
  | "idle"
  | "otp_sent"
  | "verified"
  | "connecting"
  | "active"
  | "ended";

type TranscriptMessage = {
  id: number;
  text: string;
  speaker: "agent" | "user";
};

type ScenarioId = "cart_recovery" | "appointment_booking" | "payment_reminder";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SCENARIOS: {
  id: ScenarioId;
  icon: string;
  agentName: string;
  en: { label: string; desc: string };
  ne: { label: string; desc: string };
}[] = [
  {
    id: "cart_recovery",
    icon: "\u{1F6D2}",
    agentName: "Sita",
    en: { label: "Cart Recovery", desc: "Help recover an abandoned cart" },
    ne: {
      label: "\u0915\u093E\u0930\u094D\u091F \u0930\u093F\u0915\u092D\u0930\u0940",
      desc: "\u091B\u094B\u0921\u093F\u090F\u0915\u094B \u0915\u093E\u0930\u094D\u091F \u0930\u093F\u0915\u092D\u0930 \u0917\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D",
    },
  },
  {
    id: "appointment_booking",
    icon: "\u{1F4C5}",
    agentName: "Rina",
    en: { label: "Appointment", desc: "Book a clinic appointment" },
    ne: {
      label: "\u0905\u092A\u094B\u0907\u0928\u094D\u091F\u092E\u0947\u0928\u094D\u091F",
      desc: "\u0915\u094D\u0932\u093F\u0928\u093F\u0915 \u0905\u092A\u094B\u0907\u0928\u094D\u091F\u092E\u0947\u0928\u094D\u091F \u092C\u0941\u0915 \u0917\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D",
    },
  },
  {
    id: "payment_reminder",
    icon: "\u{1F4B0}",
    agentName: "Ram",
    en: { label: "Payment Reminder", desc: "Overdue bill reminder call" },
    ne: {
      label: "\u092D\u0941\u0915\u094D\u0924\u093E\u0928\u0940 \u0938\u092E\u094D\u091D\u093E\u0909\u0928\u0947",
      desc: "\u092C\u0915\u094D\u092F\u094C\u0924\u093E \u092C\u093F\u0932 \u0938\u092E\u094D\u091D\u093E\u0909\u0928\u0947 \u0915\u0932",
    },
  },
];

const STORAGE_KEY = "live_agent_verified";
const OTP_VALIDITY_MS = 60 * 60 * 1000; // 1 hour
const NUM_WAVEFORM_BARS = 7;

const copy = {
  en: {
    scenarioTitle: "Choose a Scenario",
    scenarioDesc: "Pick a demo scenario to talk with our AI agent.",
    nameLabel: "Your Name",
    phoneLabel: "Phone (+977...)",
    sendOtp: "Send OTP",
    otpLabel: "Enter OTP",
    verify: "Verify",
    connecting: "Connecting...",
    endCall: "End Call",
    callEnded: "Call ended",
    callEndedAfter: "Call ended after",
    seconds: "seconds",
    tryAnother: "Try Another Scenario",
    startNew: "Start New Call",
    micError: "Microphone access denied. Please allow mic access and try again.",
    otpSendFail: "Failed to send OTP.",
    otpVerifyFail: "OTP verification failed.",
    working: "Working...",
    agent: "Agent",
  },
  ne: {
    scenarioTitle: "\u0938\u093F\u0928\u093E\u0930\u093F\u092F\u094B \u091B\u093E\u0928\u094D\u0928\u0941\u0939\u094B\u0938\u094D",
    scenarioDesc: "\u0939\u093E\u092E\u094D\u0930\u094B AI \u090F\u091C\u0947\u0928\u094D\u091F\u0938\u0901\u0917 \u0915\u0941\u0930\u093E \u0917\u0930\u094D\u0928 \u0921\u0947\u092E\u094B \u0938\u093F\u0928\u093E\u0930\u093F\u092F\u094B \u091B\u093E\u0928\u094D\u0928\u0941\u0939\u094B\u0938\u094D\u0964",
    nameLabel: "\u0924\u092A\u093E\u0908\u0902\u0915\u094B \u0928\u093E\u092E",
    phoneLabel: "\u092B\u094B\u0928 (+977...)",
    sendOtp: "OTP \u092A\u0920\u093E\u0909\u0928\u0941\u0939\u094B\u0938\u094D",
    otpLabel: "OTP \u0939\u093E\u0932\u094D\u0928\u0941\u0939\u094B\u0938\u094D",
    verify: "\u092D\u0947\u0930\u093F\u092B\u093E\u0907",
    connecting: "\u091C\u094B\u0921\u094D\u0928\u0947...",
    endCall: "\u0915\u0932 \u0938\u092E\u093E\u092A\u094D\u0924",
    callEnded: "\u0915\u0932 \u0938\u092E\u093E\u092A\u094D\u0924 \u092D\u092F\u094B",
    callEndedAfter: "\u0915\u0932 \u0938\u092E\u093E\u092A\u094D\u0924 \u092D\u092F\u094B",
    seconds: "\u0938\u0947\u0915\u0947\u0928\u094D\u0921",
    tryAnother: "\u0905\u0930\u094D\u0915\u094B \u0938\u093F\u0928\u093E\u0930\u093F\u092F\u094B",
    startNew: "\u0928\u092F\u093E\u0901 \u0915\u0932",
    micError: "\u092E\u093E\u0907\u0915\u094D\u0930\u094B\u092B\u094B\u0928 \u0905\u0928\u0941\u092E\u0924\u093F \u0905\u0938\u094D\u0935\u0940\u0915\u093E\u0930\u0964 \u0915\u0943\u092A\u092F\u093E \u092E\u093E\u0907\u0915 \u0905\u0928\u0941\u092E\u0924\u093F \u0926\u093F\u0928\u0941\u0939\u094B\u0938\u094D\u0964",
    otpSendFail: "OTP \u092A\u0920\u093E\u0909\u0928 \u0905\u0938\u092B\u0932\u0964",
    otpVerifyFail: "OTP \u092D\u0947\u0930\u093F\u092B\u093F\u0915\u0947\u0936\u0928 \u0905\u0938\u092B\u0932\u0964",
    working: "\u0915\u093E\u092E \u092D\u0907\u0930\u0939\u0947\u0915\u094B...",
    agent: "\u090F\u091C\u0947\u0928\u094D\u091F",
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getStoredVerification(): { phone: string; verifiedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { phone: string; verifiedAt: number };
    if (Date.now() - parsed.verifiedAt > OTP_VALIDITY_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeVerification(phone: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ phone, verifiedAt: Date.now() }),
  );
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function WaveformBars({ level }: { level: number }) {
  // Deterministic per-bar offsets for visual variety
  const offsets = useMemo(
    () =>
      Array.from({ length: NUM_WAVEFORM_BARS }, (_, i) => {
        const base = Math.sin(i * 1.8 + 0.5) * 0.3;
        return base;
      }),
    [],
  );

  return (
    <div className="flex items-center justify-center gap-1">
      {offsets.map((offset, i) => {
        const barLevel = Math.max(0.1, Math.min(1, level + offset));
        return (
          <motion.div
            key={i}
            className="w-1 rounded-full bg-[var(--accent)]"
            animate={{ scaleY: barLevel, height: 32 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{ originY: 0.5 }}
          />
        );
      })}
    </div>
  );
}

function PulsingRings() {
  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border-2 border-[var(--accent)]"
          initial={{ scale: 0.6, opacity: 0.6 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            delay: i * 0.6,
            ease: "easeOut",
          }}
        />
      ))}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-2xl text-white">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
          />
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

type LiveAgentProps = {
  language: LandingLanguage;
};

export default function LiveAgent({ language }: LiveAgentProps) {
  const t = copy[language];

  // State machine
  const [phase, setPhase] = useState<LiveAgentState>("idle");

  // Form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  // Scenario
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId | null>(
    null,
  );

  // Session
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionRef = useRef<LiveAudioSession | null>(null);

  // Call state
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [callSeconds, setCallSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);

  // UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- On mount: check localStorage for verified phone ----
  useEffect(() => {
    const stored = getStoredVerification();
    if (stored) {
      setPhone(stored.phone);
      setPhase("verified");
    }
  }, []);

  // ---- Auto-scroll transcript ----
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop =
        transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  // ---- Call timer ----
  useEffect(() => {
    if (phase === "active") {
      setCallSeconds(0);
      timerRef.current = setInterval(() => {
        setCallSeconds((prev) => {
          if (prev >= 59) {
            // 60s auto-end is handled by onTimeout from LiveAudioSession
            return prev + 1;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase]);

  // ---- Cleanup session on unmount ----
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
        sessionRef.current = null;
      }
    };
  }, []);

  // Derived
  const canSendOtp = useMemo(
    () => name.trim().length > 0 && phone.trim().length > 0,
    [name, phone],
  );
  const canVerify = useMemo(
    () => otpCode.trim().length >= 4 && requestId !== null && selectedScenario !== null,
    [otpCode, requestId, selectedScenario],
  );

  const activeScenario = useMemo(
    () => SCENARIOS.find((s) => s.id === selectedScenario) ?? null,
    [selectedScenario],
  );

  // ---- Handlers ----

  const handleSendOtp = useCallback(async () => {
    if (!canSendOtp) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.sendDemoCallOtp({
        name: name.trim(),
        phone: phone.trim(),
        message: "Live agent demo",
        otp_channel: "sms",
        tts_config: {
          provider: "edge_tts",
          voice: "ne-NP-HemkalaNeural",
        },
      });
      setRequestId(result.request_id);
      setPhase("otp_sent");
    } catch (err) {
      if (err instanceof ApiError)
        setError(`${t.otpSendFail} (${err.status})`);
      else setError(t.otpSendFail);
    } finally {
      setLoading(false);
    }
  }, [canSendOtp, name, phone, t]);

  const handleVerify = useCallback(async () => {
    if (!canVerify || !requestId || !selectedScenario) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.verifyLiveAgentOtp({
        request_id: requestId,
        otp: otpCode.trim(),
        scenario: selectedScenario,
      });
      setSessionId(result.session_id);
      storeVerification(phone.trim());
      setPhase("connecting");

      // Start audio session
      await startAudioSession(result.session_id);
    } catch (err) {
      if (err instanceof ApiError)
        setError(`${t.otpVerifyFail} (${err.status})`);
      else setError(t.otpVerifyFail);
    } finally {
      setLoading(false);
    }
  }, [canVerify, requestId, selectedScenario, otpCode, phone, t]);

  const startAudioSession = useCallback(
    async (sid: string) => {
      const session = new LiveAudioSession(sid, {
        onTranscript: (text, speaker) => {
          msgIdRef.current += 1;
          setTranscript((prev) => [
            ...prev,
            { id: msgIdRef.current, text, speaker },
          ]);
        },
        onTimeout: () => {
          setPhase("ended");
        },
        onStateChange: (state) => {
          if (state === "active") setPhase("active");
          if (state === "ended") setPhase("ended");
        },
        onAudioLevel: (level) => {
          setAudioLevel(level);
        },
      });

      sessionRef.current = session;

      try {
        await session.connect();
      } catch {
        setError(t.micError);
        setPhase("verified");
      }
    },
    [t],
  );

  const handleEndCall = useCallback(async () => {
    if (sessionRef.current) {
      sessionRef.current.disconnect();
      sessionRef.current = null;
    }
    if (sessionId) {
      try {
        await api.endLiveAgentSession(sessionId);
      } catch {
        // best effort
      }
    }
    setPhase("ended");
  }, [sessionId]);

  const handleTryAnother = useCallback(() => {
    setSelectedScenario(null);
    setTranscript([]);
    setCallSeconds(0);
    setAudioLevel(0);
    setSessionId(null);
    setError(null);
    setOtpCode("");
    setRequestId(null);
    // If phone is still verified, go to verified state (scenario pick)
    const stored = getStoredVerification();
    if (stored) {
      setPhase("verified");
    } else {
      setPhase("idle");
    }
  }, []);

  const handleStartNewFromVerified = useCallback(async () => {
    if (!selectedScenario) return;
    setLoading(true);
    setError(null);
    setTranscript([]);
    setCallSeconds(0);
    setAudioLevel(0);
    try {
      // Re-send OTP for verified flow — user already has phone stored
      const result = await api.sendDemoCallOtp({
        name: name.trim() || "User",
        phone: phone.trim(),
        message: "Live agent demo",
        otp_channel: "sms",
        tts_config: {
          provider: "edge_tts",
          voice: "ne-NP-HemkalaNeural",
        },
      });
      setRequestId(result.request_id);
      setPhase("otp_sent");
    } catch (err) {
      if (err instanceof ApiError)
        setError(`${t.otpSendFail} (${err.status})`);
      else setError(t.otpSendFail);
    } finally {
      setLoading(false);
    }
  }, [selectedScenario, name, phone, t]);

  // ---- Render helpers ----

  const renderScenarioCards = () => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {SCENARIOS.map((s) => {
        const sLabel = s[language];
        const isSelected = selectedScenario === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedScenario(s.id)}
            className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition ${
              isSelected
                ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-sm"
                : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50"
            }`}
          >
            <span className="text-3xl">{s.icon}</span>
            <span className="text-sm font-semibold text-[var(--foreground)]">
              {sLabel.label}
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {sLabel.desc}
            </span>
          </button>
        );
      })}
    </div>
  );

  const renderCallerIdCard = () => {
    if (!activeScenario) return null;
    const sLabel = activeScenario[language];
    return (
      <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <span className="text-3xl">{activeScenario.icon}</span>
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {sLabel.label}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {t.agent}: {activeScenario.agentName}
          </p>
        </div>
      </div>
    );
  };

  // ---- Phase renders ----

  // idle + otp_sent: Scenario pick, name/phone, OTP
  if (phase === "idle" || phase === "otp_sent") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">
            {t.scenarioTitle}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {t.scenarioDesc}
          </p>
        </div>

        {renderScenarioCards()}

        <AnimatePresence>
          {selectedScenario && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.nameLabel}
                  className="input-modern h-11 px-4 text-sm"
                  disabled={phase === "otp_sent"}
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t.phoneLabel}
                  className="input-modern h-11 px-4 text-sm"
                  disabled={phase === "otp_sent"}
                />
              </div>

              {phase === "otp_sent" && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder={t.otpLabel}
                    className="input-modern h-11 w-full px-4 text-sm"
                    maxLength={6}
                  />
                </motion.div>
              )}

              <div className="flex gap-3">
                {phase === "idle" && (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={!canSendOtp || loading}
                    className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
                  >
                    {loading ? t.working : t.sendOtp}
                  </button>
                )}
                {phase === "otp_sent" && (
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={!canVerify || loading}
                    className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
                  >
                    {loading ? t.working : t.verify}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p className="text-sm text-[var(--terminal-error,#DC2626)]">
            {error}
          </p>
        )}
      </motion.div>
    );
  }

  // verified: Scenario picker + "Start call" button (phone already verified)
  if (phase === "verified") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">
            {t.scenarioTitle}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {t.scenarioDesc}
          </p>
        </div>

        {renderScenarioCards()}

        {selectedScenario && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <button
              type="button"
              onClick={handleStartNewFromVerified}
              disabled={loading}
              className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
            >
              {loading ? t.working : t.startNew}
            </button>
          </motion.div>
        )}

        {error && (
          <p className="text-sm text-[var(--terminal-error,#DC2626)]">
            {error}
          </p>
        )}
      </motion.div>
    );
  }

  // connecting: Pulsing rings + caller ID
  if (phase === "connecting") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6 py-8"
      >
        {renderCallerIdCard()}
        <PulsingRings />
        <p className="text-sm font-medium text-[var(--muted-foreground)]">
          {t.connecting}
        </p>
        {error && (
          <p className="text-sm text-[var(--terminal-error,#DC2626)]">
            {error}
          </p>
        )}
      </motion.div>
    );
  }

  // active: Caller ID, timer, waveform, transcript, end button
  if (phase === "active") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {renderCallerIdCard()}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <WaveformBars level={audioLevel} />
            <span className="font-mono text-lg font-semibold text-[var(--foreground)]">
              {formatTime(callSeconds)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleEndCall}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-red-600 px-5 text-sm font-medium text-white transition hover:bg-red-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.516l2.257-1.13a1 1 0 00.502-1.21L8.228 3.684A1 1 0 007.28 3H5z"
              />
            </svg>
            {t.endCall}
          </button>
        </div>

        {/* Transcript panel */}
        <div
          ref={transcriptContainerRef}
          className="h-56 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
        >
          <AnimatePresence initial={false}>
            {transcript.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${
                  msg.speaker === "agent" ? "justify-start" : "justify-end"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    msg.speaker === "agent"
                      ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                      : "bg-[var(--muted)] text-[var(--foreground)]"
                  }`}
                >
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {transcript.length === 0 && (
            <p className="py-8 text-center text-xs text-[var(--muted-foreground)]">
              ...
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  // ended: Summary + try another
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-6 py-8"
    >
      {renderCallerIdCard()}

      <div className="text-center">
        <p className="text-lg font-semibold text-[var(--foreground)]">
          {t.callEnded}
        </p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {t.callEndedAfter} {callSeconds} {t.seconds}
        </p>
      </div>

      {/* Transcript summary (read-only) */}
      {transcript.length > 0 && (
        <div className="max-h-40 w-full space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          {transcript.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.speaker === "agent" ? "justify-start" : "justify-end"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  msg.speaker === "agent"
                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    : "bg-[var(--muted)] text-[var(--foreground)]"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleTryAnother}
        className="btn-outline-modern inline-flex h-11 items-center px-5 text-sm font-medium"
      >
        {t.tryAnother}
      </button>
    </motion.div>
  );
}
