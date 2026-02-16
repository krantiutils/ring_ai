"use client";

import { useMemo, useState } from "react";
import { Loader2, PhoneCall, Play, Volume2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";

type ExperienceCenterProps = {
  embedded?: boolean;
};

export default function ExperienceCenter({ embedded = false }: ExperienceCenterProps) {
  const [demoText, setDemoText] = useState(
    "Ring AI ले तपाईंको व्यवसायिक संवादलाई छिटो, स्पष्ट र प्रभावकारी बनाउँछ।",
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [callMessage, setCallMessage] = useState(
    "यो Ring AI को डेमो कल हो। हामी तपाईंलाई हाम्रो प्लेटफर्म कसरी काम गर्छ भनेर छोटकरीमा बताउँछौं।",
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
        <p className="font-data text-xs uppercase tracking-[0.2em] text-[#525252]">Try Ring AI on Index</p>
        <h2 className="font-display mt-3 text-4xl lg:text-5xl leading-tight">Run Demo Before Signup</h2>
        <p className="mt-3 text-sm lg:text-base text-[#404040]">
          Type message, preview voice, request OTP, verify, and trigger demo call handoff in one flow.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 border-l border-t border-[#111111]">
        <article className="border-r border-b border-[#111111] p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-10 w-10 border border-[#111111] flex items-center justify-center sharp-corners">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <p className="font-data text-[11px] uppercase tracking-[0.2em] text-[#525252]">Audio Lane</p>
              <h3 className="font-display text-2xl">Text to Speech</h3>
            </div>
          </div>

          <label className="font-ui text-xs uppercase tracking-[0.2em] block mb-2">Message</label>
          <textarea
            value={demoText}
            onChange={(e) => setDemoText(e.target.value)}
            rows={7}
            className="w-full sharp-corners border border-[#111111] bg-transparent px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSpeak}
              disabled={!canSpeak || ttsLoading}
              className="min-h-[44px] sharp-corners inline-flex items-center gap-2 px-4 border border-[#111111] bg-[#111111] text-[#F9F9F7] font-ui text-xs uppercase tracking-[0.2em] hover:bg-[#F9F9F7] hover:text-[#111111] transition-all disabled:opacity-60"
            >
              {ttsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {ttsLoading ? "Working" : "Speak"}
            </button>
            <a
              href="/login"
              className="min-h-[44px] sharp-corners inline-flex items-center px-4 border border-[#111111] font-ui text-xs uppercase tracking-[0.2em] hover:bg-[#111111] hover:text-[#F9F9F7] transition-all"
            >
              Login
            </a>
          </div>

          {ttsError && <p className="mt-3 text-xs font-ui text-[#CC0000] uppercase tracking-[0.1em]">{ttsError}</p>}

          {audioUrl && (
            <div className="mt-4 border border-[#111111] p-3">
              <audio controls autoPlay className="w-full sharp-corners">
                <source src={audioUrl} type="audio/mpeg" />
              </audio>
            </div>
          )}
        </article>

        <article className="border-b border-[#111111] p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-10 w-10 border border-[#111111] flex items-center justify-center sharp-corners">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div>
              <p className="font-data text-[11px] uppercase tracking-[0.2em] text-[#525252]">Call Lane</p>
              <h3 className="font-display text-2xl">OTP Confirmed Demo Call</h3>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="font-ui text-xs uppercase tracking-[0.2em] block mb-2">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full sharp-corners border border-[#111111] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
              />
            </div>
            <div>
              <label className="font-ui text-xs uppercase tracking-[0.2em] block mb-2">Phone Number</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full sharp-corners border border-[#111111] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
                placeholder="+97798XXXXXXXX"
              />
            </div>
            <div>
              <label className="font-ui text-xs uppercase tracking-[0.2em] block mb-2">Call Message</label>
              <textarea
                value={callMessage}
                onChange={(e) => setCallMessage(e.target.value)}
                rows={4}
                className="w-full sharp-corners border border-[#111111] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
              />
            </div>

            {otpRequestId && (
              <div>
                <label className="font-ui text-xs uppercase tracking-[0.2em] block mb-2">OTP</label>
                <input
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value)}
                  className="w-full sharp-corners border border-[#111111] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2"
                />
              </div>
            )}

            {!otpRequestId ? (
              <button
                onClick={handleCall}
                disabled={!canCall || callLoading}
                className="min-h-[44px] sharp-corners inline-flex items-center gap-2 px-4 border border-[#111111] bg-[#111111] text-[#F9F9F7] font-ui text-xs uppercase tracking-[0.2em] hover:bg-[#F9F9F7] hover:text-[#111111] transition-all disabled:opacity-60"
              >
                {callLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                {callLoading ? "Working" : "Send OTP"}
              </button>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleVerifyAndCall}
                  disabled={!canVerifyOtp || callLoading}
                  className="min-h-[44px] sharp-corners inline-flex items-center gap-2 px-4 border border-[#111111] bg-[#111111] text-[#F9F9F7] font-ui text-xs uppercase tracking-[0.2em] hover:bg-[#F9F9F7] hover:text-[#111111] transition-all disabled:opacity-60"
                >
                  {callLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                  Verify OTP
                </button>
                <button
                  onClick={handleCall}
                  disabled={!canCall || callLoading}
                  className="min-h-[44px] sharp-corners inline-flex items-center px-4 border border-[#111111] font-ui text-xs uppercase tracking-[0.2em] hover:bg-[#111111] hover:text-[#F9F9F7] transition-all disabled:opacity-60"
                >
                  Resend
                </button>
              </div>
            )}
          </div>

          {callError && <p className="mt-3 text-xs font-ui text-[#CC0000] uppercase tracking-[0.1em]">{callError}</p>}
        </article>
      </div>
    </>
  );

  if (embedded) {
    return <div id="experience-center">{content}</div>;
  }

  return (
    <section id="experience-center" className="py-16 border-y border-[#111111]">
      <div className="mx-auto max-w-screen-xl px-4">{content}</div>
    </section>
  );
}
