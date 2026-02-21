"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import type { LandingLanguage } from "@/app/page";
import VoiceCompare from "@/components/sections/VoiceCompare";

type ExperienceDemoProps = {
  language: LandingLanguage;
};

type DemoTab = "call" | "voices" | "agent";

const copy = {
  en: {
    label: "Interactive Demo",
    title: "Try AgentShakti Before Signup",
    desc: "Experience our voice AI: hear different voices, make a demo call, or talk to a live AI agent.",
    tabs: {
      call: "Demo Call",
      voices: "Compare Voices",
      agent: "Live Agent",
    },
  },
  ne: {
    label: "इण्टरएक्टिभ डेमो",
    title: "साइनअप अघि AgentShakti चलाएर हेर्नुहोस्",
    desc: "हाम्रो voice AI अनुभव गर्नुहोस्: विभिन्न आवाज सुन्नुहोस्, डेमो कल गर्नुहोस्, वा AI एजेन्टसँग कुरा गर्नुहोस्।",
    tabs: {
      call: "डेमो कल",
      voices: "आवाज तुलना",
      agent: "लाइभ एजेन्ट",
    },
  },
};

export default function ExperienceDemo({ language }: ExperienceDemoProps) {
  const t = copy[language];
  const [activeTab, setActiveTab] = useState<DemoTab>("call");

  const [voiceText, setVoiceText] = useState(
    "नमस्ते! AgentShakti मा स्वागत छ। हामी voice call र SMS automation सजिलो बनाउँछौं।",
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [showCallFields, setShowCallFields] = useState(false);

  const [callName, setCallName] = useState("");
  const [callPhone, setCallPhone] = useState("");
  const [callScript, setCallScript] = useState(
    "यो AgentShakti को डेमो कल हो। हामी तपाईंलाई हाम्रो प्लेटफर्म छोटकरीमा देखाउँछौं।",
  );
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const MAX_TEXT = 299;

  const canGenerateVoice = useMemo(() => voiceText.trim().length > 0, [voiceText]);
  const canSendOtp = useMemo(
    () => callName.trim().length > 0 && callPhone.trim().length > 0 && callScript.trim().length > 0,
    [callName, callPhone, callScript],
  );
  const canVerifyOtp = useMemo(() => (otpRequestId ? otpCode.trim().length >= 4 : false), [otpRequestId, otpCode]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function handleGenerateVoice() {
    if (!canGenerateVoice) return;
    setTtsLoading(true);
    setTtsError(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    try {
      const result = await api.synthesizeTTS({
        text: voiceText.trim(),
        provider: "edge_tts",
        voice: "ne-NP-HemkalaNeural",
      });
      setAudioUrl(URL.createObjectURL(result.audioBlob));
    } catch {
      setTtsError("TTS failed. फेरि प्रयास गर्नुहोस्।");
    } finally {
      setTtsLoading(false);
    }
  }

  async function handleSendOtp() {
    if (!canSendOtp) return;
    setCallLoading(true);
    setCallError(null);
    try {
      const result = await api.sendDemoCallOtp({
        name: callName.trim(),
        phone: callPhone.trim(),
        message: callScript.trim(),
        otp_channel: "sms",
        tts_config: { provider: "edge_tts", voice: "ne-NP-HemkalaNeural" },
      });
      setOtpRequestId(result.request_id);
    } catch (err) {
      if (err instanceof ApiError) setCallError(`OTP request failed (${err.status}).`);
      else setCallError("OTP request failed.");
    } finally {
      setCallLoading(false);
    }
  }

  async function handleVerifyOtpAndCall() {
    if (!otpRequestId || !canVerifyOtp) return;
    setCallLoading(true);
    setCallError(null);
    try {
      await api.verifyDemoCallOtp({ request_id: otpRequestId, otp: otpCode.trim() });
      setOtpRequestId(null);
      setOtpCode("");
    } catch (err) {
      if (err instanceof ApiError) setCallError(`OTP verification failed (${err.status}).`);
      else setCallError("OTP verification failed.");
    } finally {
      setCallLoading(false);
    }
  }

  const tabButtonClass = (tab: DemoTab) =>
    `relative inline-flex h-11 items-center justify-center rounded-t-xl border px-5 text-sm font-semibold transition ${
      activeTab === tab
        ? "bg-[var(--card)] text-[var(--foreground)] border-[var(--accent)] shadow-[0_-2px_0_0_var(--accent)_inset]"
        : "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]"
    }`;

  return (
    <section id="demo" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="label-badge">
          <span className="pulse-dot" />
          {t.label}
        </div>
        <h2 className="font-display mt-5 text-4xl leading-tight text-[var(--foreground)] md:text-5xl">{t.title}</h2>
        <p className="mt-3 max-w-3xl text-[var(--muted-foreground)]">{t.desc}</p>

        <div className="mt-8 flex flex-wrap gap-2 border-b border-[var(--border)] pb-0">
          <button type="button" className={tabButtonClass("call")} onClick={() => setActiveTab("call")}>
            {t.tabs.call}
          </button>
          <button type="button" className={tabButtonClass("voices")} onClick={() => setActiveTab("voices")}>
            {t.tabs.voices}
          </button>
          <button type="button" className={tabButtonClass("agent")} onClick={() => setActiveTab("agent")}>
            {t.tabs.agent}
          </button>
        </div>

        {activeTab === "call" && (
          <motion.article className="surface-card rounded-b-2xl rounded-tr-2xl p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">पहिले आवाज सुन्नुहोस्</p>
            <textarea value={voiceText} maxLength={MAX_TEXT} onChange={(e) => setVoiceText(e.target.value.slice(0, MAX_TEXT))} rows={4} className="input-modern mt-3 w-full px-4 py-3 text-sm" />
            <div className="mt-3 flex flex-wrap gap-3">
              <button onClick={handleGenerateVoice} disabled={!canGenerateVoice || ttsLoading} className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50">
                {ttsLoading ? "Working..." : "Generate Voice"}
              </button>
              <button onClick={() => setShowCallFields(true)} className="btn-outline-modern inline-flex h-11 items-center px-5 text-sm font-medium">
                Call setup खोल्नुहोस्
              </button>
            </div>
            {ttsError && <p className="mt-3 text-sm text-[var(--terminal-error,#DC2626)]">{ttsError}</p>}
            {audioUrl && (
              <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
                <audio controls autoPlay className="w-full">
                  <source src={audioUrl} type="audio/mpeg" />
                </audio>
              </div>
            )}

            {showCallFields && (
              <div className="mt-6 border-t border-[var(--border)] pt-6">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input value={callName} onChange={(e) => setCallName(e.target.value)} placeholder="नाम" className="input-modern h-11 px-4 text-sm" />
                  <input value={callPhone} onChange={(e) => setCallPhone(e.target.value)} placeholder="फोन नम्बर (+977...)" className="input-modern h-11 px-4 text-sm" />
                </div>
                <textarea value={callScript} maxLength={MAX_TEXT} onChange={(e) => setCallScript(e.target.value.slice(0, MAX_TEXT))} rows={4} className="input-modern mt-3 w-full px-4 py-3 text-sm" />
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  OTP delivery: SMS
                </p>

                {otpRequestId && <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="OTP" className="input-modern mt-3 h-11 w-full px-4 text-sm" />}

                {!otpRequestId ? (
                  <button onClick={handleSendOtp} disabled={!canSendOtp || callLoading} className="btn-primary-modern mt-4 inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50">
                    {callLoading ? "Working..." : "Send OTP"}
                  </button>
                ) : (
                  <button onClick={handleVerifyOtpAndCall} disabled={!canVerifyOtp || callLoading} className="btn-primary-modern mt-4 inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50">
                    {callLoading ? "Working..." : "Verify OTP & Call"}
                  </button>
                )}

                {callError && <p className="mt-3 text-sm text-[var(--terminal-error,#DC2626)]">{callError}</p>}
              </div>
            )}
          </motion.article>
        )}

        {activeTab === "voices" && (
          <motion.article className="surface-card rounded-b-2xl rounded-tr-2xl p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <VoiceCompare language={language} />
          </motion.article>
        )}

        {activeTab === "agent" && (
          <motion.article className="surface-card rounded-b-2xl rounded-tr-2xl p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-center text-[var(--muted-foreground)]">Live Agent — coming soon</p>
          </motion.article>
        )}

      </div>
    </section>
  );
}
