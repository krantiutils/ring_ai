"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import type { LandingLanguage } from "@/app/page";

type ExperienceDemoProps = {
  language: LandingLanguage;
};

type DemoTab = "call" | "chat" | "setup";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const CHAT_TEMPLATES = {
  en: [
    {
      key: "government",
      label: "Government Services",
      prompt:
        "You are a Nepal government service assistant. Help with document status, deadlines, and next steps in plain language.",
    },
    {
      key: "isp",
      label: "ISP Support",
      prompt:
        "You are an ISP support assistant for outage, billing, and router troubleshooting. Keep responses short and step-by-step.",
    },
    {
      key: "insurance",
      label: "Insurance Claims",
      prompt:
        "You are an insurance service assistant for policy queries and claims intake. Ask for required details and summarize next actions.",
    },
  ],
  ne: [
    {
      key: "government",
      label: "सरकारी सेवा",
      prompt:
        "तपाईं नेपाल सरकारी सेवाका सहायक हुनुहुन्छ। कागजात स्थिति, अन्तिम म्याद, र अर्को चरण सरल भाषामा बताउनुहोस्।",
    },
    {
      key: "isp",
      label: "ISP सहायता",
      prompt:
        "तपाईं ISP सहायता सहायक हुनुहुन्छ। outage, bill, र router समस्या छोटो step-by-step मा समाधान गर्नुहोस्।",
    },
    {
      key: "insurance",
      label: "बीमा दावी",
      prompt:
        "तपाईं बीमा सेवा सहायक हुनुहुन्छ। policy query र claim intake को लागि चाहिने विवरण सोधेर अर्को चरण बताउनुहोस्।",
    },
  ],
};

const copy = {
  en: {
    label: "Interactive Demo",
    title: "Try AgentShakti Before Signup",
    desc: "Run call + chatbot flows directly on the index page.",
    tabCall: "Demo Call",
    tabChat: "AI Chatbot",
    tabSetup: "Channel Setup",
    ttsTitle: "Listen to Voice",
    ttsPlaceholder: "Type what the assistant should say...",
    ttsDefault: "Namaste! AgentShakti helps you run voice calls, SMS campaigns, and handoff workflows.",
    generateVoice: "Generate Voice",
    continueCall: "Continue to Call",
    otpMode: "OTP Delivery",
    otpAuto: "Auto",
    otpSms: "SMS",
    otpWhatsapp: "WhatsApp",
    whatsappFrom: "WhatsApp Sender Number",
    callTitle: "Place Demo Call",
    sendOtp: "Send OTP",
    verifyOtp: "Verify OTP & Call",
    name: "Name",
    phone: "Phone Number",
    callScript: "Call Script",
    otp: "OTP",
    chatTitle: "Talk to AI Assistant",
    chatPlaceholder: "Ask anything about outreach, campaigns, and support flow...",
    sendToAi: "Send to AI",
    useReplyForCall: "Use Latest Reply for Call Script",
    setupTitle: "WhatsApp Pairing Test",
    setupDesc: "Validate sender/recipient formatting and send a test message from this demo.",
    waFrom: "Twilio WhatsApp Sender",
    waTo: "Your WhatsApp Number",
    waTestBtn: "Send WhatsApp Test",
    waHint: "Use E.164 format, e.g. +14155238886 and +97798XXXXXXXX.",
    surveyTitle: "Real-time WhatsApp Survey",
    surveyQuestion: "Survey Question",
    surveyOptions: "Options (comma-separated)",
    surveyTargets: "Recipients (comma-separated)",
    surveyStart: "Start Survey",
    surveyRefresh: "Refresh Results",
  },
  ne: {
    label: "इण्टरएक्टिभ डेमो",
    title: "साइनअप अघि AgentShakti चलाएर हेर्नुहोस्",
    desc: "index page मै call + chatbot flow चलाउनुहोस्।",
    tabCall: "डेमो कल",
    tabChat: "AI च्याटबट",
    tabSetup: "च्यानल सेटअप",
    ttsTitle: "पहिले आवाज सुन्नुहोस्",
    ttsPlaceholder: "सहायकले बोल्ने टेक्स्ट लेख्नुहोस्...",
    ttsDefault: "नमस्ते! AgentShakti ले voice call, SMS campaign, र handoff workflow चलाउन मद्दत गर्छ।",
    generateVoice: "आवाज बनाउनुहोस्",
    continueCall: "कल चरणमा जानुहोस्",
    otpMode: "OTP पठाउने माध्यम",
    otpAuto: "अटो",
    otpSms: "SMS",
    otpWhatsapp: "WhatsApp",
    whatsappFrom: "WhatsApp Sender Number",
    callTitle: "डेमो कल गर्नुहोस्",
    sendOtp: "OTP पठाउनुहोस्",
    verifyOtp: "OTP पुष्टि गरेर कल गर्नुहोस्",
    name: "नाम",
    phone: "फोन नम्बर",
    callScript: "कल स्क्रिप्ट",
    otp: "OTP",
    chatTitle: "AI सहायकसँग कुरा गर्नुहोस्",
    chatPlaceholder: "outreach, campaign, support flow बारे सोध्नुहोस्...",
    sendToAi: "AI लाई पठाउनुहोस्",
    useReplyForCall: "अन्तिम जवाफलाई कल स्क्रिप्ट बनाउनुहोस्",
    setupTitle: "WhatsApp Pairing Test",
    setupDesc: "sender/recipient format जाँचेर यहीँबाट test message पठाउनुहोस्।",
    waFrom: "Twilio WhatsApp Sender",
    waTo: "तपाईंको WhatsApp नम्बर",
    waTestBtn: "WhatsApp टेस्ट पठाउनुहोस्",
    waHint: "E.164 format प्रयोग गर्नुहोस्, जस्तै +14155238886 र +97798XXXXXXXX।",
    surveyTitle: "Real-time WhatsApp Survey",
    surveyQuestion: "Survey Question",
    surveyOptions: "Options (comma-separated)",
    surveyTargets: "Recipients (comma-separated)",
    surveyStart: "Survey Start गर्नुहोस्",
    surveyRefresh: "नतिजा Refresh गर्नुहोस्",
  },
};

export default function ExperienceDemo({ language }: ExperienceDemoProps) {
  const t = copy[language];
  const [activeTab, setActiveTab] = useState<DemoTab>("call");

  const [demoText, setDemoText] = useState(t.ttsDefault);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [showCallForm, setShowCallForm] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [callMessage, setCallMessage] = useState(
    "यो AgentShakti को डेमो कल हो। हामी तपाईंलाई हाम्रो प्लेटफर्म छोटकरीमा देखाउँछौं।",
  );
  const [otpChannel, setOtpChannel] = useState<"auto" | "sms" | "whatsapp">("auto");
  const [otpWhatsappFrom, setOtpWhatsappFrom] = useState("");
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState("");

  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [setupWaFrom, setSetupWaFrom] = useState("");
  const [setupWaTo, setSetupWaTo] = useState("");
  const [setupWaSessionId, setSetupWaSessionId] = useState<string | null>(null);
  const [setupWaLoading, setSetupWaLoading] = useState(false);
  const [setupWaStatus, setSetupWaStatus] = useState<string | null>(null);
  const [setupWaError, setSetupWaError] = useState<string | null>(null);
  const [surveyQuestion, setSurveyQuestion] = useState("How satisfied are you with this service?");
  const [surveyOptions, setSurveyOptions] = useState("Very satisfied,Satisfied,Neutral,Unsatisfied");
  const [surveyRecipients, setSurveyRecipients] = useState("");
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [surveyCounts, setSurveyCounts] = useState<Record<string, number> | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);

  const audioUrlRef = useRef<string | null>(null);
  const chatSessionRef = useRef<string | null>(null);
  const setupWaSessionRef = useRef<string | null>(null);

  const canSpeak = useMemo(() => demoText.trim().length > 0, [demoText]);
  const canCall = useMemo(
    () => name.trim().length > 0 && phone.trim().length > 0 && callMessage.trim().length > 0,
    [name, phone, callMessage],
  );
  const canVerifyOtp = useMemo(() => (otpRequestId ? otpValue.trim().length >= 4 : false), [otpRequestId, otpValue]);
  const canSendChat = useMemo(() => chatInput.trim().length > 0, [chatInput]);

  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);
  useEffect(() => {
    chatSessionRef.current = chatSessionId;
  }, [chatSessionId]);
  useEffect(() => {
    setupWaSessionRef.current = setupWaSessionId;
  }, [setupWaSessionId]);

  useEffect(() => {
    return () => {
      const currentAudioUrl = audioUrlRef.current;
      const currentChatSession = chatSessionRef.current;
      const currentWaSession = setupWaSessionRef.current;
      if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
      if (currentChatSession) api.endInteractiveDemoSession(currentChatSession).catch(() => {});
      if (currentWaSession) api.endWhatsAppDemoSession(currentWaSession).catch(() => {});
    };
  }, []);

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

  async function handleCallOtpSend() {
    if (!canCall) return;
    setCallLoading(true);
    setCallError(null);
    try {
      const result = await api.sendDemoCallOtp({
        name: name.trim(),
        phone: phone.trim(),
        message: callMessage.trim(),
        otp_channel: otpChannel,
        whatsapp_from_number: otpChannel === "whatsapp" ? otpWhatsappFrom.trim() || undefined : undefined,
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

  async function handleCallOtpVerify() {
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

  async function ensureChatSession(): Promise<string> {
    if (chatSessionId) return chatSessionId;
    const created = await api.startInteractiveDemoSession({ language, voice_name: "Kore" });
    setChatSessionId(created.session_id);
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
      const activeSessionId = await ensureChatSession();
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

  function applyTemplatePrompt(prompt: string) {
    setChatInput(prompt);
    setActiveTab("chat");
  }

  function useLatestReplyForCall() {
    const latestAssistant = [...chatMessages].reverse().find((msg) => msg.role === "assistant");
    if (!latestAssistant) return;
    setCallMessage(latestAssistant.content);
    setActiveTab("call");
    setShowCallForm(true);
  }

  async function ensureSetupWaSession(): Promise<string> {
    if (setupWaSessionId) return setupWaSessionId;
    const created = await api.createWhatsAppDemoSession({
      language,
      voice_name: "Kore",
      from_number: setupWaFrom.trim() || undefined,
      to_number: setupWaTo.trim() || undefined,
    });
    setSetupWaSessionId(created.session_id);
    return created.session_id;
  }

  async function handleSetupWaTest() {
    if (!setupWaFrom.trim() || !setupWaTo.trim()) {
      setSetupWaError("Enter both WhatsApp sender and recipient numbers.");
      return;
    }
    setSetupWaLoading(true);
    setSetupWaError(null);
    setSetupWaStatus(null);
    try {
      const sid = await ensureSetupWaSession();
      const result = await api.sendWhatsAppDemoMessage(sid, {
        message: "Hello from AgentShakti WhatsApp demo test.",
        from_number: setupWaFrom.trim(),
        to_number: setupWaTo.trim(),
      });
      setSetupWaStatus(
        result.delivery_status === "simulated"
          ? "WhatsApp test sent in simulated mode."
          : `WhatsApp test sent via Twilio (${result.delivery_status}).`,
      );
    } catch (err) {
      if (err instanceof ApiError) setSetupWaError(`WhatsApp test failed (${err.status}).`);
      else setSetupWaError("WhatsApp test failed.");
    } finally {
      setSetupWaLoading(false);
    }
  }

  async function handleStartSurvey() {
    const from = setupWaFrom.trim();
    const targets = surveyRecipients
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const options = surveyOptions
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!from || !targets.length || !surveyQuestion.trim() || options.length < 2) {
      setSurveyError("Fill sender, recipients, question, and at least 2 options.");
      return;
    }
    setSurveyLoading(true);
    setSurveyError(null);
    try {
      const started = await api.startWhatsAppSurvey({
        from_number: from,
        to_numbers: targets,
        question: surveyQuestion.trim(),
        options,
      });
      setSurveyId(started.survey_id);
      const results = await api.getWhatsAppSurveyResults(started.survey_id);
      setSurveyCounts(results.counts);
    } catch (err) {
      if (err instanceof ApiError) setSurveyError(`Survey start failed (${err.status}).`);
      else setSurveyError("Survey start failed.");
    } finally {
      setSurveyLoading(false);
    }
  }

  async function handleRefreshSurvey() {
    if (!surveyId) return;
    setSurveyLoading(true);
    setSurveyError(null);
    try {
      const results = await api.getWhatsAppSurveyResults(surveyId);
      setSurveyCounts(results.counts);
    } catch (err) {
      if (err instanceof ApiError) setSurveyError(`Survey fetch failed (${err.status}).`);
      else setSurveyError("Survey fetch failed.");
    } finally {
      setSurveyLoading(false);
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

        <div className="mt-8 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("call")}
            className={`inline-flex h-11 items-center rounded-xl border px-4 text-sm font-semibold transition ${
              activeTab === "call"
                ? "btn-primary-modern"
                : "btn-outline-modern"
            }`}
          >
            {t.tabCall}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`inline-flex h-11 items-center rounded-xl border px-4 text-sm font-semibold transition ${
              activeTab === "chat"
                ? "btn-primary-modern"
                : "btn-outline-modern"
            }`}
          >
            {t.tabChat}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("setup")}
            className={`inline-flex h-11 items-center rounded-xl border px-4 text-sm font-semibold transition ${
              activeTab === "setup"
                ? "btn-primary-modern"
                : "btn-outline-modern"
            }`}
          >
            {t.tabSetup}
          </button>
        </div>

        {activeTab === "call" && (
          <motion.article
            className="surface-card mt-6 rounded-2xl p-6"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">{t.ttsTitle}</p>
            <textarea
              value={demoText}
              onChange={(e) => setDemoText(e.target.value)}
              rows={4}
              placeholder={t.ttsPlaceholder}
              className="input-modern mt-3 w-full px-4 py-3 text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                onClick={handleSpeak}
                disabled={!canSpeak || ttsLoading}
                className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
              >
                {ttsLoading ? "Working..." : t.generateVoice}
              </button>
              <button
                onClick={() => setShowCallForm(true)}
                className="btn-outline-modern inline-flex h-11 items-center px-5 text-sm font-medium"
              >
                {t.continueCall}
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

            {showCallForm && (
              <div className="mt-6 border-t border-[var(--border)] pt-6">
                <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">{t.callTitle}</p>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
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
                </div>
                <textarea
                  value={callMessage}
                  onChange={(e) => setCallMessage(e.target.value)}
                  rows={4}
                  placeholder={t.callScript}
                  className="input-modern mt-3 w-full px-4 py-3 text-sm"
                />

                <div className="mt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{t.otpMode}</p>
                  <div className="flex flex-wrap gap-2">
                    {(["auto", "sms", "whatsapp"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setOtpChannel(mode)}
                        className={`inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold uppercase tracking-[0.1em] transition ${
                          otpChannel === mode ? "btn-primary-modern" : "btn-outline-modern"
                        }`}
                      >
                        {mode === "auto" ? t.otpAuto : mode === "sms" ? t.otpSms : t.otpWhatsapp}
                      </button>
                    ))}
                  </div>
                </div>

                {otpChannel === "whatsapp" && (
                  <input
                    value={otpWhatsappFrom}
                    onChange={(e) => setOtpWhatsappFrom(e.target.value)}
                    placeholder={`${t.whatsappFrom} (e.g. +14155238886)`}
                    className="input-modern mt-3 h-11 w-full px-4 text-sm"
                  />
                )}

                {otpRequestId && (
                  <input
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value)}
                    placeholder={t.otp}
                    className="input-modern mt-3 h-11 w-full px-4 text-sm"
                  />
                )}

                {!otpRequestId ? (
                  <button
                    onClick={handleCallOtpSend}
                    disabled={!canCall || callLoading}
                    className="btn-primary-modern mt-4 inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
                  >
                    {callLoading ? "Working..." : t.sendOtp}
                  </button>
                ) : (
                  <button
                    onClick={handleCallOtpVerify}
                    disabled={!canVerifyOtp || callLoading}
                    className="btn-primary-modern mt-4 inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
                  >
                    {callLoading ? "Working..." : t.verifyOtp}
                  </button>
                )}

                {callError && <p className="mt-3 text-sm text-[var(--terminal-error,#DC2626)]">{callError}</p>}
              </div>
            )}
          </motion.article>
        )}

        {activeTab === "chat" && (
          <motion.article
            className="surface-card mt-6 rounded-2xl p-6"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">{t.chatTitle}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CHAT_TEMPLATES[language].map((tpl) => (
                <button
                  key={tpl.key}
                  type="button"
                  onClick={() => applyTemplatePrompt(tpl.prompt)}
                  className="btn-outline-modern inline-flex h-10 items-center px-3 text-xs font-semibold"
                >
                  {tpl.label}
                </button>
              ))}
            </div>

            <div className="mt-4 h-[280px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--muted)]/45 p-3">
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
                onClick={useLatestReplyForCall}
                className="btn-outline-modern inline-flex h-11 items-center px-5 text-sm font-medium"
              >
                {t.useReplyForCall}
              </button>
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
        )}

        {activeTab === "setup" && (
          <motion.article
            className="surface-card mt-6 rounded-2xl p-6"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">{t.setupTitle}</p>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">{t.setupDesc}</p>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">{t.waHint}</p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={setupWaFrom}
                onChange={(e) => setSetupWaFrom(e.target.value)}
                placeholder={`${t.waFrom} (+14155238886)`}
                className="input-modern h-11 px-4 text-sm"
              />
              <input
                value={setupWaTo}
                onChange={(e) => setSetupWaTo(e.target.value)}
                placeholder={`${t.waTo} (+97798XXXXXXXX)`}
                className="input-modern h-11 px-4 text-sm"
              />
            </div>

            <button
              onClick={handleSetupWaTest}
              disabled={setupWaLoading}
              className="btn-primary-modern mt-4 inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
            >
              {setupWaLoading ? "Working..." : t.waTestBtn}
            </button>
            {setupWaError && <p className="mt-3 text-sm text-[var(--terminal-error,#DC2626)]">{setupWaError}</p>}
            {setupWaStatus && <p className="mt-3 text-sm text-[var(--muted-foreground)]">{setupWaStatus}</p>}

            <div className="mt-8 border-t border-[var(--border)] pt-6">
              <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">{t.surveyTitle}</p>
              <input
                value={surveyQuestion}
                onChange={(e) => setSurveyQuestion(e.target.value)}
                placeholder={t.surveyQuestion}
                className="input-modern mt-3 h-11 w-full px-4 text-sm"
              />
              <input
                value={surveyOptions}
                onChange={(e) => setSurveyOptions(e.target.value)}
                placeholder={t.surveyOptions}
                className="input-modern mt-3 h-11 w-full px-4 text-sm"
              />
              <input
                value={surveyRecipients}
                onChange={(e) => setSurveyRecipients(e.target.value)}
                placeholder={t.surveyTargets}
                className="input-modern mt-3 h-11 w-full px-4 text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  onClick={handleStartSurvey}
                  disabled={surveyLoading}
                  className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
                >
                  {surveyLoading ? "Working..." : t.surveyStart}
                </button>
                <button
                  onClick={handleRefreshSurvey}
                  disabled={!surveyId || surveyLoading}
                  className="btn-outline-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
                >
                  {t.surveyRefresh}
                </button>
              </div>
              {surveyId && <p className="mt-2 text-xs text-[var(--muted-foreground)]">Survey ID: {surveyId}</p>}
              {surveyError && <p className="mt-2 text-sm text-[var(--terminal-error,#DC2626)]">{surveyError}</p>}
              {surveyCounts && (
                <div className="mt-3 rounded-xl border border-[var(--border)] p-3">
                  {Object.entries(surveyCounts).map(([label, count]) => (
                    <p key={label} className="text-sm text-[var(--foreground)]">
                      {label}: {count}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </motion.article>
        )}
      </div>
    </section>
  );
}
