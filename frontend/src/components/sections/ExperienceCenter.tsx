"use client";

import { useMemo, useState } from "react";
import { Loader2, PhoneCall, Play, Volume2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";

type ExperienceCenterProps = {
  embedded?: boolean;
};

export default function ExperienceCenter({ embedded = false }: ExperienceCenterProps) {
  const [demoText, setDemoText] = useState(
    "AgentShakti ले तपाईंको व्यवसायिक संवादलाई छिटो, स्पष्ट र प्रभावकारी बनाउँछ।",
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [callMessage, setCallMessage] = useState(
    "यो AgentShakti को डेमो कल हो। हामी तपाईंलाई हाम्रो प्लेटफर्म कसरी काम गर्छ भनेर छोटकरीमा बताउँछौं।",
  );
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
    } catch (err) {
      if (err instanceof ApiError) {
        setTtsError(`TTS failed (${err.status}).`);
      } else {
        setTtsError("TTS failed.");
      }
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
        tts_config: {
          provider: "edge_tts",
          voice: "ne-NP-HemkalaNeural",
        },
      });
      setOtpRequestId(result.request_id);
    } catch (err) {
      if (err instanceof ApiError) {
        setCallError(`OTP request failed (${err.status}).`);
      } else {
        setCallError("OTP request failed.");
      }
    } finally {
      setCallLoading(false);
    }
  }

  async function handleVerifyAndCall() {
    if (!canVerifyOtp || !otpRequestId) return;
    setCallLoading(true);
    setCallError(null);
    try {
      await api.verifyDemoCallOtp({
        request_id: otpRequestId,
        otp: otpValue.trim(),
      });
      setOtpValue("");
      setOtpRequestId(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setCallError(`OTP verification failed (${err.status}).`);
      } else {
        setCallError("OTP verification failed.");
      }
    } finally {
      setCallLoading(false);
    }
  }

  const content = (
    <>
      <div className="mb-6">
        <p className="terminal-caps text-[11px] text-[#ffb000]">root@ring-ai:~$ ./run-demo --index</p>
        <h2 className="terminal-display mt-3 text-4xl uppercase leading-tight lg:text-5xl">INTERACTIVE DEMO FLOW</h2>
        <p className="mt-3 text-sm text-[#7bd96a] lg:text-base">
          Input text, synthesize voice, request OTP, verify, and queue a controlled call without leaving the index page.
        </p>
      </div>

      <div className="grid grid-cols-1 border border-[#1f521f] xl:grid-cols-2">
        <article className="terminal-pane border-b border-[#1f521f] p-5 lg:border-r lg:border-b-0 lg:p-6">
          <div className="terminal-titlebar sharp-corners -mx-5 -mt-5 mb-4 px-5 py-2 text-[11px] terminal-caps lg:-mx-6 lg:-mt-6 lg:px-6">
            +-- TTS WINDOW --+
          </div>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-10 w-10 border border-[#1f521f] flex items-center justify-center sharp-corners text-[#ffb000]">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <p className="terminal-caps text-[11px] text-[#ffb000]">lane_a</p>
              <h3 className="terminal-display text-2xl uppercase">text_to_speech</h3>
            </div>
          </div>

          <label className="terminal-caps block mb-2 text-[11px] text-[#ffb000]">prompt_text</label>
          <textarea
            value={demoText}
            onChange={(e) => setDemoText(e.target.value)}
            rows={7}
            className="terminal-input sharp-corners w-full px-3 py-3 text-sm"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSpeak}
              disabled={!canSpeak || ttsLoading}
              className="terminal-btn sharp-corners inline-flex min-h-[44px] items-center gap-2 px-4 text-xs disabled:opacity-60"
            >
              {ttsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {ttsLoading ? "[ running ]" : "[ speak ]"}
            </button>
            <a
              href="/login"
              className="terminal-btn terminal-btn-secondary sharp-corners inline-flex min-h-[44px] items-center px-4 text-xs"
            >
              [ login ]
            </a>
          </div>

          {ttsError && <p className="terminal-caps mt-3 text-[11px] text-[#ff3333]">[err] {ttsError}</p>}

          {audioUrl && (
            <div className="mt-4 border border-[#1f521f] p-3">
              <audio controls autoPlay className="w-full sharp-corners">
                <source src={audioUrl} type="audio/mpeg" />
              </audio>
            </div>
          )}
        </article>

        <article className="terminal-pane p-5 lg:p-6">
          <div className="terminal-titlebar sharp-corners -mx-5 -mt-5 mb-4 px-5 py-2 text-[11px] terminal-caps lg:-mx-6 lg:-mt-6 lg:px-6">
            +-- CALL WINDOW --+
          </div>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-10 w-10 border border-[#1f521f] flex items-center justify-center sharp-corners text-[#ffb000]">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div>
              <p className="terminal-caps text-[11px] text-[#ffb000]">lane_b</p>
              <h3 className="terminal-display text-2xl uppercase">otp_confirmed_call</h3>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="terminal-caps block mb-2 text-[11px] text-[#ffb000]">name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="terminal-input sharp-corners w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="terminal-caps block mb-2 text-[11px] text-[#ffb000]">phone_number</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="terminal-input sharp-corners w-full px-3 py-2 text-sm"
                placeholder="+97798XXXXXXXX"
              />
            </div>
            <div>
              <label className="terminal-caps block mb-2 text-[11px] text-[#ffb000]">call_message</label>
              <textarea
                value={callMessage}
                onChange={(e) => setCallMessage(e.target.value)}
                rows={4}
                className="terminal-input sharp-corners w-full px-3 py-2 text-sm"
              />
            </div>

            {otpRequestId && (
              <div>
                <label className="terminal-caps block mb-2 text-[11px] text-[#ffb000]">otp_code</label>
                <input
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value)}
                  className="terminal-input sharp-corners w-full px-3 py-2 text-sm"
                />
              </div>
            )}

            {!otpRequestId ? (
              <button
                onClick={handleCall}
                disabled={!canCall || callLoading}
                className="terminal-btn sharp-corners inline-flex min-h-[44px] items-center gap-2 px-4 text-xs disabled:opacity-60"
              >
                {callLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                {callLoading ? "[ running ]" : "[ send otp ]"}
              </button>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleVerifyAndCall}
                  disabled={!canVerifyOtp || callLoading}
                  className="terminal-btn sharp-corners inline-flex min-h-[44px] items-center gap-2 px-4 text-xs disabled:opacity-60"
                >
                  {callLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                  [ verify otp ]
                </button>
                <button
                  onClick={handleCall}
                  disabled={!canCall || callLoading}
                  className="terminal-btn terminal-btn-secondary sharp-corners inline-flex min-h-[44px] items-center px-4 text-xs disabled:opacity-60"
                >
                  [ resend ]
                </button>
              </div>
            )}
          </div>

          {callError && <p className="terminal-caps mt-3 text-[11px] text-[#ff3333]">[err] {callError}</p>}
        </article>
      </div>
    </>
  );

  if (embedded) {
    return <div id="experience-center" className="terminal-cursor">{content}</div>;
  }

  return (
    <section id="experience-center" className="border-y border-[#1f521f] py-16">
      <div className="mx-auto max-w-screen-xl px-4">{content}</div>
    </section>
  );
}
