"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import type { LandingLanguage } from "@/app/page";

type ExperienceDemoProps = {
  language: LandingLanguage;
};

const copy = {
  en: {
    label: "Interactive Demo",
    title: "Try Ring AI Before Signup",
    desc: "Run a quick flow: type text, hear Nepali TTS, request OTP, verify, and queue a demo call.",
    message: "Ring AI ले तपाईंको व्यवसायिक संवादलाई छिटो, स्पष्ट र प्रभावकारी बनाउँछ।",
    callMessage: "यो Ring AI को डेमो कल हो। हामी तपाईंलाई हाम्रो प्लेटफर्म छोटकरीमा देखाउँछौं।",
    textToSpeech: "Text to Speech",
    callDemo: "Request Demo Call",
    sendOtp: "Send OTP",
    verifyOtp: "Verify OTP",
    speak: "Generate Voice",
    name: "Name",
    phone: "Phone Number",
    callScript: "Call Script",
    otp: "OTP",
  },
  ne: {
    label: "इण्टरएक्टिभ डेमो",
    title: "साइनअप अघि Ring AI चलाएर हेर्नुहोस्",
    desc: "छोटो flow चलाउनुहोस्: टेक्स्ट टाइप गर्नुहोस्, Nepali TTS सुन्नुहोस्, OTP माग्नुहोस्, verify गर्नुहोस् र डेमो कल queue गर्नुहोस्।",
    message: "Ring AI ले तपाईंको व्यवसायिक संवादलाई छिटो, स्पष्ट र प्रभावकारी बनाउँछ।",
    callMessage: "यो Ring AI को डेमो कल हो। हामी तपाईंलाई हाम्रो प्लेटफर्म छोटकरीमा देखाउँछौं।",
    textToSpeech: "टेक्स्ट टु स्पीच",
    callDemo: "डेमो कल अनुरोध",
    sendOtp: "OTP पठाउनुहोस्",
    verifyOtp: "OTP पुष्टि गर्नुहोस्",
    speak: "भ्वाइस बनाउनुहोस्",
    name: "नाम",
    phone: "फोन नम्बर",
    callScript: "कल स्क्रिप्ट",
    otp: "OTP",
  },
};

export default function ExperienceDemo({ language }: ExperienceDemoProps) {
  const t = copy[language];
  const [demoText, setDemoText] = useState(t.message);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [callMessage, setCallMessage] = useState(t.callMessage);
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState("");

  const canSpeak = useMemo(() => demoText.trim().length > 0, [demoText]);
  const canCall = useMemo(
    () => name.trim().length > 0 && phone.trim().length > 0 && callMessage.trim().length > 0,
    [name, phone, callMessage],
  );
  const canVerifyOtp = useMemo(() => (otpRequestId ? otpValue.trim().length >= 4 : false), [otpRequestId, otpValue]);

  async function handleSpeak() {
    if (!canSpeak) return;
    setTtsLoading(true);
    setTtsError(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    try {
      const result = await api.synthesizeTTS({
        text: demoText.trim(),
        provider: "edge_tts",
        voice: "ne-NP-HemkalaNeural",
      });
      setAudioUrl(URL.createObjectURL(result.audioBlob));
    } catch {
      setTtsError("TTS failed. Please try again.");
    } finally {
      setTtsLoading(false);
    }
  }

  async function handleCall() {
    if (!canCall) return;
    setCallLoading(true);
    setCallError(null);
    try {
      const result = await api.sendDemoCallOtp({
        name: name.trim(),
        phone: phone.trim(),
        message: callMessage.trim(),
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

  async function handleVerify() {
    if (!otpRequestId || !canVerifyOtp) return;
    setCallLoading(true);
    setCallError(null);
    try {
      await api.verifyDemoCallOtp({ request_id: otpRequestId, otp: otpValue.trim() });
      setOtpRequestId(null);
      setOtpValue("");
    } catch (err) {
      if (err instanceof ApiError) setCallError(`OTP verification failed (${err.status}).`);
      else setCallError("OTP verification failed.");
    } finally {
      setCallLoading(false);
    }
  }

  return (
    <section id="demo" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="label-badge">
          <span className="pulse-dot" />
          {t.label}
        </div>
        <h2 className="font-display mt-5 text-4xl leading-tight text-[var(--foreground)] md:text-5xl">{t.title}</h2>
        <p className="mt-3 max-w-3xl text-[var(--muted-foreground)]">{t.desc}</p>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <motion.article
            className="surface-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6 }}
          >
            <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">{t.textToSpeech}</p>
            <textarea
              value={demoText}
              onChange={(e) => setDemoText(e.target.value)}
              rows={7}
              className="input-modern mt-4 w-full px-4 py-3 text-sm"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={handleSpeak}
                disabled={!canSpeak || ttsLoading}
                className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
              >
                {ttsLoading ? "Working..." : t.speak}
              </button>
              <a href="/login" className="btn-outline-modern inline-flex h-11 items-center px-5 text-sm font-medium">
                Login
              </a>
            </div>
            {ttsError && <p className="mt-3 text-sm text-[var(--terminal-error,#DC2626)]">{ttsError}</p>}
            {audioUrl && (
              <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
                <audio controls autoPlay className="w-full">
                  <source src={audioUrl} type="audio/mpeg" />
                </audio>
              </div>
            )}
          </motion.article>

          <motion.article
            className="surface-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6, delay: 0.08 }}
          >
            <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">{t.callDemo}</p>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.name}
                className="input-modern h-11 px-4 text-sm"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+97798XXXXXXXX"
                className="input-modern h-11 px-4 text-sm"
              />
              <textarea
                value={callMessage}
                onChange={(e) => setCallMessage(e.target.value)}
                rows={4}
                placeholder={t.callScript}
                className="input-modern px-4 py-3 text-sm"
              />
              {otpRequestId && (
                <input
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value)}
                  placeholder={t.otp}
                  className="input-modern h-11 px-4 text-sm"
                />
              )}
            </div>

            {!otpRequestId ? (
              <button
                onClick={handleCall}
                disabled={!canCall || callLoading}
                className="btn-primary-modern mt-4 inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
              >
                {callLoading ? "Working..." : t.sendOtp}
              </button>
            ) : (
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={handleVerify}
                  disabled={!canVerifyOtp || callLoading}
                  className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
                >
                  {callLoading ? "Working..." : t.verifyOtp}
                </button>
                <button
                  onClick={handleCall}
                  disabled={!canCall || callLoading}
                  className="btn-outline-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
                >
                  {t.sendOtp}
                </button>
              </div>
            )}
            {callError && <p className="mt-3 text-sm text-[var(--terminal-error,#DC2626)]">{callError}</p>}
          </motion.article>
        </div>
      </div>
    </section>
  );
}
