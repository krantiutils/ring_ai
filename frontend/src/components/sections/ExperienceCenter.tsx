"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, PhoneCall, Play, Volume2 } from "lucide-react";
import ClayButton from "@/components/ui/ClayButton";
import { api, ApiError } from "@/lib/api";

export default function ExperienceCenter() {
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
  const [callResult, setCallResult] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const canSpeak = useMemo(() => demoText.trim().length > 0, [demoText]);
  const canCall = useMemo(
    () => name.trim().length > 0 && phone.trim().length > 0 && callMessage.trim().length > 0,
    [name, phone, callMessage],
  );

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
      const nextUrl = URL.createObjectURL(result.audioBlob);
      setAudioUrl(nextUrl);
    } catch (err) {
      if (err instanceof ApiError) {
        setTtsError(`TTS failed (${err.status}). Please try again.`);
      } else {
        setTtsError("TTS failed. Please try again.");
      }
    } finally {
      setTtsLoading(false);
    }
  }

  async function handleCall() {
    if (!canCall) return;
    setCallLoading(true);
    setCallError(null);
    setCallResult(null);
    try {
      const result = await api.initiateDemoCall({
        name: name.trim(),
        phone: phone.trim(),
        message: callMessage.trim(),
        tts_config: {
          provider: "edge_tts",
          voice: "ne-NP-HemkalaNeural",
        },
      });
      setCallResult(`Call queued. Call ID: ${result.call_id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setCallError(`Call request failed (${err.status}). Check number format and Twilio config.`);
      } else {
        setCallError("Call request failed. Please try again.");
      }
    } finally {
      setCallLoading(false);
    }
  }

  return (
    <section
      id="experience-center"
      className="relative py-24 bg-[radial-gradient(circle_at_15%_5%,#2a194f_0%,#12081f_48%,#06040c_100%)]"
    >
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-[#b8a8ff]">Experience Center</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-white">Type, Listen, and Request a Call</h2>
          <p className="mt-3 text-white/70 max-w-3xl">
            Type your own text and listen to Ring AI voice output instantly. Then request a live demo call by
            entering your name and phone number.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.4 }}
            className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-md p-6"
          >
            <div className="flex items-center gap-2 mb-4 text-white">
              <Volume2 className="w-5 h-5 text-[#17E8C6]" />
              <h3 className="text-lg font-semibold">Text to Speech Demo</h3>
            </div>
            <label className="block text-sm text-white/80 mb-2">Type message</label>
            <textarea
              value={demoText}
              onChange={(e) => setDemoText(e.target.value)}
              rows={6}
              className="w-full rounded-2xl border border-white/20 bg-black/20 text-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#7B6BFF]/50"
            />
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSpeak}
                disabled={!canSpeak || ttsLoading}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#7B6BFF] text-white text-sm font-semibold hover:bg-[#6958f0] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {ttsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {ttsLoading ? "Synthesizing..." : "Speak"}
              </button>
              <ClayButton variant="outline" size="md" href="/login" className="!bg-white/10 !text-white !border-white/25">
                Login
              </ClayButton>
            </div>
            {ttsError && <p className="mt-3 text-sm text-[#ff9ea8]">{ttsError}</p>}
            {audioUrl && (
              <div className="mt-4">
                <audio controls autoPlay className="w-full">
                  <source src={audioUrl} type="audio/mpeg" />
                </audio>
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.4, delay: 0.08 }}
            className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-md p-6"
          >
            <div className="flex items-center gap-2 mb-4 text-white">
              <PhoneCall className="w-5 h-5 text-[#ffd166]" />
              <h3 className="text-lg font-semibold">Request a Demo Call</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-white/80 mb-1">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl border border-white/20 bg-black/20 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7B6BFF]/50"
                />
              </div>
              <div>
                <label className="block text-sm text-white/80 mb-1">Phone Number</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+97798XXXXXXXX"
                  className="w-full rounded-xl border border-white/20 bg-black/20 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7B6BFF]/50"
                />
              </div>
              <div>
                <label className="block text-sm text-white/80 mb-1">Message to speak in call</label>
                <textarea
                  value={callMessage}
                  onChange={(e) => setCallMessage(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-white/20 bg-black/20 text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7B6BFF]/50"
                />
              </div>
              <button
                onClick={handleCall}
                disabled={!canCall || callLoading}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#17E8C6] text-[#091014] text-sm font-semibold hover:bg-[#14d8b8] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {callLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                {callLoading ? "Requesting Call..." : "Call Me"}
              </button>
            </div>

            {callError && <p className="mt-3 text-sm text-[#ff9ea8]">{callError}</p>}
            {callResult && <p className="mt-3 text-sm text-[#8bf0de]">{callResult}</p>}
            <p className="mt-4 text-xs text-white/55">
              For best results use E.164 format (example: +97798XXXXXXXX). Twilio configuration is required.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
