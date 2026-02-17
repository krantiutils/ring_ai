"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import type { LandingLanguage } from "@/app/page";

type ExperienceDemoProps = {
  language: LandingLanguage;
};

type DemoTab = "call" | "survey" | "setup";

const copy = {
  en: {
    label: "Interactive Demo",
    title: "Try AgentShakti Before Signup",
    desc: "Mainly for demo calling, with survey and WhatsApp pairing tools.",
    tabs: {
      call: "Demo Call",
      survey: "Questions for Survey",
      setup: "WhatsApp Pairing",
    },
  },
  ne: {
    label: "इण्टरएक्टिभ डेमो",
    title: "साइनअप अघि AgentShakti चलाएर हेर्नुहोस्",
    desc: "मुख्य रूपमा डेमो कल, साथै survey र WhatsApp pairing tool।",
    tabs: {
      call: "डेमो कल",
      survey: "Survey का प्रश्नहरू",
      setup: "WhatsApp Pairing",
    },
  },
};

const defaultSurveyQuestions = [
  "के हजुरले सेवा प्रयोग गर्दा आवश्यक जानकारी स्पष्ट रूपमा प्राप्त गर्नुभयो? (प्राप्त गर्नुभयो भने १ दबाउनुहोस्, प्राप्त गर्नुभएन भने २ दबाउनुहोस्।)",
  "के हजुरलाई समग्र सेवाको सहजता र गुणस्तर सन्तोषजनक लाग्यो? (सन्तोषजनक लाग्यो भने १ दबाउनुहोस्, लागेन भने २ दबाउनुहोस्।)",
  "तपाईं हाम्रो सेवालाई १ देखि ५ को स्केलमा कति मूल्याङ्कन गर्नुहुन्छ? (१ नराम्रो, ५ धेरै राम्रो)",
];

export default function ExperienceDemo({ language }: ExperienceDemoProps) {
  const t = copy[language];
  const [activeTab, setActiveTab] = useState<DemoTab>("call");

  const [voiceText, setVoiceText] = useState(
    "नमस्ते! AgentShakti मा स्वागत छ। हामी voice call, SMS, र WhatsApp survey flow सजिलो बनाउँछौं।",
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
  const [otpChannel, setOtpChannel] = useState<"sms" | "whatsapp">("whatsapp");
  const [otpWhatsappSender, setOtpWhatsappSender] = useState("");
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const [surveyQuestionsText, setSurveyQuestionsText] = useState(defaultSurveyQuestions.join("\n\n"));
  const [surveyType, setSurveyType] = useState<"DTMF" | "Speech">("DTMF");
  const [surveyContentType, setSurveyContentType] = useState<"Say" | "Text">("Say");
  const [surveySayText, setSurveySayText] = useState(defaultSurveyQuestions[0]);
  const [surveyCallerName, setSurveyCallerName] = useState("");
  const [surveyCallerPhone, setSurveyCallerPhone] = useState("");
  const [surveyCallingNow, setSurveyCallingNow] = useState(false);
  const [surveyCallError, setSurveyCallError] = useState<string | null>(null);
  const [surveyWaFrom, setSurveyWaFrom] = useState("");
  const [surveyRecipients, setSurveyRecipients] = useState("");
  const [surveyOptions, setSurveyOptions] = useState("१ दबाउनुहोस्,२ दबाउनुहोस्,३ दबाउनुहोस्,४ दबाउनुहोस्,५ दबाउनुहोस्");
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [surveyCounts, setSurveyCounts] = useState<Record<string, number> | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);

  const [waBridgeState, setWaBridgeState] = useState<string>("checking");
  const [waBridgeQr, setWaBridgeQr] = useState<string | null>(null);
  const [waBridgeError, setWaBridgeError] = useState<string | null>(null);
  const [waTestFrom, setWaTestFrom] = useState("");
  const [waTestTo, setWaTestTo] = useState("");
  const [waTestLoading, setWaTestLoading] = useState(false);
  const [waTestStatus, setWaTestStatus] = useState<string | null>(null);
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

  async function refreshBridgeStatus(loadQr = false) {
    setWaBridgeError(null);
    try {
      const status = await api.getLinkedWhatsAppStatus();
      setWaBridgeState(status.state || "unknown");
      if (loadQr && status.state !== "ready") {
        try {
          const qr = await api.getLinkedWhatsAppQr();
          setWaBridgeQr(qr.qr_data_url);
        } catch {
          setWaBridgeQr(null);
        }
      }
    } catch (err) {
      setWaBridgeState("offline");
      if (err instanceof ApiError) setWaBridgeError(`Bridge status failed (${err.status}).`);
      else setWaBridgeError("Bridge status failed.");
    }
  }

  useEffect(() => {
    refreshBridgeStatus(true).catch(() => {});
  }, []);

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
        otp_channel: otpChannel,
        whatsapp_from_number: otpChannel === "whatsapp" ? otpWhatsappSender.trim() || undefined : undefined,
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

  async function handleCallMeNowSurvey() {
    if (!surveyCallerName.trim() || !surveyCallerPhone.trim() || !surveySayText.trim()) {
      setSurveyCallError("नाम, फोन र Text to say भर्नुहोस्।");
      return;
    }
    setSurveyCallingNow(true);
    setSurveyCallError(null);
    try {
      await api.initiateDemoCall({
        name: surveyCallerName.trim(),
        phone: surveyCallerPhone.trim(),
        message: surveySayText.trim(),
        tts_config: { provider: "edge_tts", voice: "ne-NP-HemkalaNeural" },
      });
    } catch (err) {
      if (err instanceof ApiError) setSurveyCallError(`Call now failed (${err.status}).`);
      else setSurveyCallError("Call now failed.");
    } finally {
      setSurveyCallingNow(false);
    }
  }

  async function handleStartWhatsAppSurvey() {
    const recipients = surveyRecipients
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const options = surveyOptions
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (!surveyWaFrom.trim() || !recipients.length || !surveySayText.trim() || options.length < 2) {
      setSurveyError("WhatsApp sender, recipients, question, and options चाहिन्छ।");
      return;
    }

    setSurveyLoading(true);
    setSurveyError(null);
    try {
      const started = await api.startWhatsAppSurvey({
        from_number: surveyWaFrom.trim(),
        to_numbers: recipients,
        question: surveySayText.trim(),
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

  async function handleWhatsAppTestSend() {
    if (!waTestFrom.trim() || !waTestTo.trim()) {
      setWaTestStatus("Sender र recipient दुबै चाहिन्छ।");
      return;
    }
    setWaTestLoading(true);
    setWaTestStatus(null);
    try {
      const session = await api.createWhatsAppDemoSession({
        language,
        from_number: waTestFrom.trim(),
        to_number: waTestTo.trim(),
      });
      const result = await api.sendWhatsAppDemoMessage(session.session_id, {
        message: "नमस्ते! यो AgentShakti linked WhatsApp test सन्देश हो।",
        from_number: waTestFrom.trim(),
        to_number: waTestTo.trim(),
      });
      setWaTestStatus(result.delivery_status === "simulated" ? "Simulated send भयो।" : "सन्देश पठाइयो।");
      await api.endWhatsAppDemoSession(session.session_id);
    } catch (err) {
      if (err instanceof ApiError) setWaTestStatus(`WhatsApp test failed (${err.status}).`);
      else setWaTestStatus("WhatsApp test failed.");
    } finally {
      setWaTestLoading(false);
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
          <button type="button" className={tabButtonClass("survey")} onClick={() => setActiveTab("survey")}>
            {t.tabs.survey}
          </button>
          <button type="button" className={tabButtonClass("setup")} onClick={() => setActiveTab("setup")}>
            {t.tabs.setup}
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

                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">OTP delivery</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setOtpChannel("whatsapp")} className={`inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold ${otpChannel === "whatsapp" ? "btn-primary-modern" : "btn-outline-modern"}`}>
                    WhatsApp OTP
                  </button>
                  <button type="button" onClick={() => setOtpChannel("sms")} className={`inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold ${otpChannel === "sms" ? "btn-primary-modern" : "btn-outline-modern"}`}>
                    SMS OTP
                  </button>
                </div>

                {otpChannel === "whatsapp" && (
                  <input
                    value={otpWhatsappSender}
                    onChange={(e) => setOtpWhatsappSender(e.target.value)}
                    placeholder="WhatsApp sender number (+country...)"
                    className="input-modern mt-3 h-11 w-full px-4 text-sm"
                  />
                )}

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

        {activeTab === "survey" && (
          <motion.article className="surface-card rounded-b-2xl rounded-tr-2xl p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">Questions for survey</p>
            <textarea value={surveyQuestionsText} maxLength={MAX_TEXT} onChange={(e) => setSurveyQuestionsText(e.target.value.slice(0, MAX_TEXT))} rows={8} className="input-modern mt-3 w-full px-4 py-3 text-sm" />

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] p-4">
                <p className="text-sm font-semibold text-[var(--foreground)]">Survey Type</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setSurveyType("DTMF")} className={`inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold ${surveyType === "DTMF" ? "btn-primary-modern" : "btn-outline-modern"}`}>DTMF</button>
                  <button type="button" onClick={() => setSurveyType("Speech")} className={`inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold ${surveyType === "Speech" ? "btn-primary-modern" : "btn-outline-modern"}`}>Speech</button>
                </div>

                <p className="mt-4 text-sm font-semibold text-[var(--foreground)]">Content type</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setSurveyContentType("Say")} className={`inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold ${surveyContentType === "Say" ? "btn-primary-modern" : "btn-outline-modern"}`}>Say</button>
                  <button type="button" onClick={() => setSurveyContentType("Text")} className={`inline-flex h-10 items-center rounded-xl border px-3 text-xs font-semibold ${surveyContentType === "Text" ? "btn-primary-modern" : "btn-outline-modern"}`}>Text</button>
                </div>

                <p className="mt-4 text-sm font-semibold text-[var(--foreground)]">Text to say</p>
                <textarea value={surveySayText} maxLength={MAX_TEXT} onChange={(e) => setSurveySayText(e.target.value.slice(0, MAX_TEXT))} rows={4} className="input-modern mt-2 w-full px-4 py-3 text-sm" />
              </div>

              <div className="rounded-xl border border-[var(--border)] p-4">
                <p className="text-sm font-semibold text-[var(--foreground)]">Call me now</p>
                <input value={surveyCallerName} onChange={(e) => setSurveyCallerName(e.target.value)} placeholder="नाम" className="input-modern mt-2 h-11 w-full px-4 text-sm" />
                <input value={surveyCallerPhone} onChange={(e) => setSurveyCallerPhone(e.target.value)} placeholder="फोन नम्बर (+977...)" className="input-modern mt-2 h-11 w-full px-4 text-sm" />
                <button onClick={handleCallMeNowSurvey} disabled={surveyCallingNow} className="btn-primary-modern mt-3 inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50">
                  {surveyCallingNow ? "Working..." : "Call me now"}
                </button>
                {surveyCallError && <p className="mt-2 text-sm text-[var(--terminal-error,#DC2626)]">{surveyCallError}</p>}

                <div className="mt-6 border-t border-[var(--border)] pt-4">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Real-time WhatsApp Survey</p>
                  <input value={surveyWaFrom} onChange={(e) => setSurveyWaFrom(e.target.value)} placeholder="WhatsApp sender (+country...)" className="input-modern mt-2 h-11 w-full px-4 text-sm" />
                  <input value={surveyRecipients} onChange={(e) => setSurveyRecipients(e.target.value)} placeholder="Recipients comma-separated (+977..., +977...)" className="input-modern mt-2 h-11 w-full px-4 text-sm" />
                  <input value={surveyOptions} onChange={(e) => setSurveyOptions(e.target.value)} placeholder="Options comma-separated" className="input-modern mt-2 h-11 w-full px-4 text-sm" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={handleStartWhatsAppSurvey} disabled={surveyLoading} className="btn-primary-modern inline-flex h-11 items-center px-4 text-sm font-medium disabled:opacity-50">
                      {surveyLoading ? "Working..." : "Start Survey"}
                    </button>
                    <button onClick={handleRefreshSurvey} disabled={!surveyId || surveyLoading} className="btn-outline-modern inline-flex h-11 items-center px-4 text-sm font-medium disabled:opacity-50">
                      Refresh Results
                    </button>
                  </div>
                  {surveyId && <p className="mt-2 text-xs text-[var(--muted-foreground)]">Survey ID: {surveyId}</p>}
                  {surveyError && <p className="mt-2 text-sm text-[var(--terminal-error,#DC2626)]">{surveyError}</p>}
                  {surveyCounts && (
                    <div className="mt-2 rounded-xl border border-[var(--border)] p-3">
                      {Object.entries(surveyCounts).map(([label, count]) => (
                        <p key={label} className="text-sm text-[var(--foreground)]">
                          {label}: {count}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.article>
        )}

        {activeTab === "setup" && (
          <motion.article className="surface-card rounded-b-2xl rounded-tr-2xl p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">Linked WhatsApp status</p>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">State: {waBridgeState}</p>
            {waBridgeError && <p className="mt-2 text-sm text-[var(--terminal-error,#DC2626)]">{waBridgeError}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => refreshBridgeStatus(false)} className="btn-outline-modern inline-flex h-11 items-center px-4 text-sm font-medium">Refresh Status</button>
              <button onClick={() => refreshBridgeStatus(true)} className="btn-primary-modern inline-flex h-11 items-center px-4 text-sm font-medium">Load QR</button>
            </div>
            {waBridgeQr && (
              <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
                <img src={waBridgeQr} alt="WhatsApp Pairing QR" className="h-72 w-72 max-w-full rounded-lg border border-[var(--border)]" />
              </div>
            )}

            <div className="mt-6 border-t border-[var(--border)] pt-6">
              <p className="text-sm font-semibold text-[var(--foreground)]">WhatsApp test message</p>
              <input value={waTestFrom} onChange={(e) => setWaTestFrom(e.target.value)} placeholder="Sender (+country...)" className="input-modern mt-2 h-11 w-full px-4 text-sm" />
              <input value={waTestTo} onChange={(e) => setWaTestTo(e.target.value)} placeholder="Recipient (+country...)" className="input-modern mt-2 h-11 w-full px-4 text-sm" />
              <button onClick={handleWhatsAppTestSend} disabled={waTestLoading} className="btn-primary-modern mt-3 inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50">
                {waTestLoading ? "Working..." : "Send WhatsApp test"}
              </button>
              {waTestStatus && <p className="mt-2 text-sm text-[var(--muted-foreground)]">{waTestStatus}</p>}
            </div>
          </motion.article>
        )}
      </div>
    </section>
  );
}
