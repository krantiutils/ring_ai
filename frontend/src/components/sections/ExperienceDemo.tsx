"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import type { LandingLanguage } from "@/app/page";

type ExperienceDemoProps = {
  language: LandingLanguage;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const copy = {
  en: {
    label: "Interactive Demo",
    title: "Try AgentShakti Before Signup",
    desc: "Chat with the AI first, hear its voice response, then hand it off to a real demo call with OTP verification.",
    chatDemo: "AI Message + Voice",
    chatPlaceholder: "Type your question to the AI agent...",
    sendToAi: "Send to AI",
    useReplyForCall: "Use Reply For Call",
    callDemo: "Request Demo Call",
    sendOtp: "Send OTP",
    verifyOtp: "Verify OTP & Call",
    whatsappDemo: "WhatsApp Bridge",
    sendWhatsApp: "Send Latest Reply to WhatsApp",
    whatsappFrom: "WhatsApp From",
    whatsappTo: "WhatsApp To",
    name: "Name",
    phone: "Phone Number",
    callScript: "Call Script",
    otp: "OTP",
  },
  ne: {
    label: "इण्टरएक्टिभ डेमो",
    title: "साइनअप अघि AgentShakti चलाएर हेर्नुहोस्",
    desc: "पहिले AI सँग च्याट गर्नुहोस्, त्यसको आवाज सुन्नुहोस्, अनि OTP पुष्टि गरेर वास्तविक डेमो कलमा handoff गर्नुहोस्।",
    chatDemo: "AI सन्देश + आवाज",
    chatPlaceholder: "AI एजेन्टलाई प्रश्न लेख्नुहोस्...",
    sendToAi: "AI लाई पठाउनुहोस्",
    useReplyForCall: "जवाफलाई कल स्क्रिप्ट बनाउनुहोस्",
    callDemo: "डेमो कल अनुरोध",
    sendOtp: "OTP पठाउनुहोस्",
    verifyOtp: "OTP पुष्टि गरेर कल गर्नुहोस्",
    whatsappDemo: "WhatsApp ब्रिज",
    sendWhatsApp: "अन्तिम जवाफ WhatsApp मा पठाउनुहोस्",
    whatsappFrom: "WhatsApp पठाउने नम्बर",
    whatsappTo: "WhatsApp प्राप्त गर्ने नम्बर",
    name: "नाम",
    phone: "फोन नम्बर",
    callScript: "कल स्क्रिप्ट",
    otp: "OTP",
  },
};

export default function ExperienceDemo({ language }: ExperienceDemoProps) {
  const t = copy[language];
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [callMessage, setCallMessage] = useState(
    "यो AgentShakti को डेमो कल हो। हामी तपाईंलाई हाम्रो प्लेटफर्म छोटकरीमा देखाउँछौं।",
  );
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState("");
  const [whatsAppFrom, setWhatsAppFrom] = useState("");
  const [whatsAppTo, setWhatsAppTo] = useState("");
  const [whatsAppSessionId, setWhatsAppSessionId] = useState<string | null>(null);
  const [whatsAppLoading, setWhatsAppLoading] = useState(false);
  const [whatsAppStatus, setWhatsAppStatus] = useState<string | null>(null);
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);

  const canSendChat = useMemo(() => chatInput.trim().length > 0, [chatInput]);
  const canCall = useMemo(
    () => name.trim().length > 0 && phone.trim().length > 0 && callMessage.trim().length > 0,
    [name, phone, callMessage],
  );
  const canVerifyOtp = useMemo(() => (otpRequestId ? otpValue.trim().length >= 4 : false), [otpRequestId, otpValue]);

  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      const currentAudioUrl = audioUrlRef.current;
      const currentSession = sessionRef.current;
      const currentWaSession = whatsAppSessionId;
      if (currentAudioUrl) {
        URL.revokeObjectURL(currentAudioUrl);
      }
      if (currentSession) {
        api.endInteractiveDemoSession(currentSession).catch(() => {});
      }
      if (currentWaSession) {
        api.endWhatsAppDemoSession(currentWaSession).catch(() => {});
      }
    };
  }, [whatsAppSessionId]);

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;
    const created = await api.startInteractiveDemoSession({ language, voice_name: "Kore" });
    setSessionId(created.session_id);
    return created.session_id;
  }

  async function handleChatSend() {
    if (!canSendChat) return;
    setChatLoading(true);
    setChatError(null);

    const userMessage = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setChatInput("");

    try {
      const activeSessionId = await ensureSession();
      const reply = await api.sendInteractiveDemoMessage(activeSessionId, userMessage);
      const assistantText = reply.assistant_message;
      setChatMessages((prev) => [...prev, { role: "assistant", content: assistantText }]);

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }

      const audio = await api.synthesizeTTS({
        text: assistantText,
        provider: "edge_tts",
        voice: "ne-NP-HemkalaNeural",
      });
      setAudioUrl(URL.createObjectURL(audio.audioBlob));
    } catch (err) {
      if (err instanceof ApiError) setChatError(`Interactive demo failed (${err.status}).`);
      else setChatError("Interactive demo failed. Please try again.");
    } finally {
      setChatLoading(false);
    }
  }

  function handleUseReplyForCall() {
    const latestAssistant = [...chatMessages].reverse().find((msg) => msg.role === "assistant");
    if (!latestAssistant) return;
    setCallMessage(latestAssistant.content);
  }

  async function ensureWhatsAppSession(): Promise<string> {
    if (whatsAppSessionId) return whatsAppSessionId;
    const created = await api.createWhatsAppDemoSession({
      language,
      voice_name: "Kore",
      from_number: whatsAppFrom.trim() || undefined,
      to_number: whatsAppTo.trim() || undefined,
    });
    setWhatsAppSessionId(created.session_id);
    return created.session_id;
  }

  async function handleSendLatestToWhatsApp() {
    const latestAssistant = [...chatMessages].reverse().find((msg) => msg.role === "assistant");
    if (!latestAssistant) {
      setWhatsAppError("No assistant reply yet. Send a chat message first.");
      return;
    }
    if (!whatsAppFrom.trim() || !whatsAppTo.trim()) {
      setWhatsAppError("Enter both WhatsApp From and To numbers.");
      return;
    }
    setWhatsAppLoading(true);
    setWhatsAppError(null);
    setWhatsAppStatus(null);
    try {
      const waSessionId = await ensureWhatsAppSession();
      const result = await api.sendWhatsAppDemoMessage(waSessionId, {
        message: latestAssistant.content,
        from_number: whatsAppFrom.trim(),
        to_number: whatsAppTo.trim(),
      });
      setWhatsAppStatus(
        result.delivery_status === "simulated"
          ? "Delivered in demo mode (simulated)."
          : `Delivered via Twilio (${result.delivery_status}).`,
      );
    } catch (err) {
      if (err instanceof ApiError) setWhatsAppError(`WhatsApp send failed (${err.status}).`);
      else setWhatsAppError("WhatsApp send failed.");
    } finally {
      setWhatsAppLoading(false);
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

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <motion.article
            className="surface-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6 }}
          >
            <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">{t.chatDemo}</p>
            <div className="mt-4 h-[260px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--muted)]/45 p-3">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">{t.chatPlaceholder}</p>
              ) : (
                <div className="space-y-2">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={`${msg.role}-${idx}`}
                      className={`rounded-lg border px-3 py-2 text-sm ${msg.role === "assistant" ? "border-[var(--accent)]/35 bg-[var(--accent)]/5" : "border-[var(--border)] bg-[var(--card)]"}`}
                    >
                      <p className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{msg.role}</p>
                      <p className="mt-1 whitespace-pre-wrap text-[var(--foreground)]">{msg.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              rows={3}
              className="input-modern mt-3 w-full px-4 py-3 text-sm"
              placeholder={t.chatPlaceholder}
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                onClick={handleChatSend}
                disabled={!canSendChat || chatLoading}
                className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
              >
                {chatLoading ? "Working..." : t.sendToAi}
              </button>
              <button
                onClick={handleUseReplyForCall}
                className="btn-outline-modern inline-flex h-11 items-center px-5 text-sm font-medium"
              >
                {t.useReplyForCall}
              </button>
              <a href="/login" className="btn-outline-modern inline-flex h-11 items-center px-5 text-sm font-medium">
                Login
              </a>
            </div>
            {chatError && <p className="mt-3 text-sm text-[var(--terminal-error,#DC2626)]">{chatError}</p>}
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
            <a href="/masterotp" className="mt-3 inline-flex text-xs font-semibold text-[var(--accent)] underline-offset-4 hover:underline">
              Use Master OTP Page
            </a>
          </motion.article>

          <motion.article
            className="surface-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.6, delay: 0.12 }}
          >
            <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">{t.whatsappDemo}</p>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <input
                value={whatsAppFrom}
                onChange={(e) => setWhatsAppFrom(e.target.value)}
                placeholder={`${t.whatsappFrom} (e.g. +14155238886)`}
                className="input-modern h-11 px-4 text-sm"
              />
              <input
                value={whatsAppTo}
                onChange={(e) => setWhatsAppTo(e.target.value)}
                placeholder={`${t.whatsappTo} (e.g. +97798XXXXXXXX)`}
                className="input-modern h-11 px-4 text-sm"
              />
            </div>
            <button
              onClick={handleSendLatestToWhatsApp}
              disabled={whatsAppLoading}
              className="btn-primary-modern mt-4 inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
            >
              {whatsAppLoading ? "Working..." : t.sendWhatsApp}
            </button>
            {whatsAppError && <p className="mt-3 text-sm text-[var(--terminal-error,#DC2626)]">{whatsAppError}</p>}
            {whatsAppStatus && <p className="mt-3 text-sm text-[var(--muted-foreground)]">{whatsAppStatus}</p>}
          </motion.article>
        </div>
      </div>
    </section>
  );
}
