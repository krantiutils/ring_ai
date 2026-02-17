"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { LandingLanguage } from "@/app/page";
import { api } from "@/lib/api";
import HeroFlowCanvas from "@/components/illustrations/HeroFlowCanvas";

type HeroProps = {
  language: LandingLanguage;
};

const copy = {
  en: {
    titleA: "One Platform.",
    titleB: "Every Conversation",
    titleC: "Understood.",
    body: "AgentShakti unifies outbound voice calls, two-way SMS, and agent handoff into one operational timeline. Teams execute faster, with full context and measurable outcomes.",
    primaryCta: "Try Live Demo",
    secondaryCta: "Go to Login",
    listen: "Click to Hear Welcome",
    listening: "Generating voice...",
    heard: "Playing welcome message",
    failed: "Voice playback failed.",
  },
  ne: {
    titleA: "एउटै प्लेटफर्म।",
    titleB: "हरेक संवाद",
    titleC: "बुझिनेगरी।",
    body: "AgentShakti ले आउटबाउन्ड कल, दुई-तर्फी SMS र एजेन्ट ह्यान्डअफलाई एउटै अपरेसन टाइमलाइनमा जोड्छ। टिमले छिटो काम गर्छ, सन्दर्भ हराउँदैन, र नतिजा मापन गर्न सक्छ।",
    primaryCta: "लाइभ डेमो हेर्नुहोस्",
    secondaryCta: "लगइनमा जानुहोस्",
    listen: "स्वागत सन्देश सुन्न क्लिक गर्नुहोस्",
    listening: "भ्वाइस तयार हुँदैछ...",
    heard: "स्वागत सन्देश बज्दैछ",
    failed: "भ्वाइस प्लेब्याक असफल भयो।",
  },
};

const easeOut = [0.16, 1, 0.3, 1] as const;

export default function Hero({ language }: HeroProps) {
  const t = copy[language];
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function handlePlayWelcome() {
    setVoiceLoading(true);
    setVoiceStatus(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    try {
      const welcomeText =
        "नमस्ते, AgentShakti मा तपाईंलाई स्वागत छ। AgentShakti ले तपाईंको व्यवसायका लागि आउटबाउन्ड कल, दुई तर्फी एसएमएस, र मानव ह्यान्डअफलाई एउटै प्लेटफर्ममा एकीकृत गर्छ। तपाईं डेमो चलाएर टेक्स्ट टु स्पीच, ओटिपी भेरिफिकेसन, र डेमो कल फ्लो तुरुन्त परीक्षण गर्न सक्नुहुन्छ। ड्यासबोर्डमा गएपछि तपाईं अभियान सञ्चालन, नतिजा ट्र्याक, र ग्राहक संवादको पूर्ण सन्दर्भ एकै ठाउँमा व्यवस्थापन गर्न सक्नुहुन्छ।";
      const result = await api.synthesizeTTS({
        text: welcomeText,
        provider: "edge_tts",
        voice: "ne-NP-HemkalaNeural",
      });
      const url = URL.createObjectURL(result.audioBlob);
      setAudioUrl(url);
      const audio = new Audio(url);
      await audio.play();
      setVoiceStatus(t.heard);
    } catch {
      setVoiceStatus(t.failed);
    } finally {
      setVoiceLoading(false);
    }
  }

  return (
    <section id="hero" className="relative overflow-hidden py-20 md:py-28">
      <div className="soft-glow -left-28 top-10 h-64 w-64 bg-[#0052FF]/20" />
      <div className="soft-glow -right-28 top-40 h-72 w-72 bg-[#4D7CFF]/20" />

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 md:px-6 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: easeOut }}
        >
          <h1 className="font-display text-[2.85rem] leading-[1.05] tracking-[-0.02em] text-[#0F172A] sm:text-6xl lg:text-[5.25rem]">
            {t.titleA}
            <br />
            {t.titleB}
            <br />
            <span className="relative inline-block gradient-text">
              {t.titleC}
              <span className="gradient-underline" />
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[#64748B] sm:text-lg">
            {t.body}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#demo" className="btn-primary-modern inline-flex h-12 items-center px-6 text-sm font-semibold">
              {t.primaryCta}
            </a>
            <a href="/login" className="btn-outline-modern inline-flex h-12 items-center px-6 text-sm font-semibold">
              {t.secondaryCta}
            </a>
          </div>
        </motion.div>

        <motion.div
          className="relative h-[420px] overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--card)] shadow-[0_20px_25px_rgba(0,0,0,0.08)]"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: easeOut }}
        >
          <HeroFlowCanvas />
          <button
            type="button"
            onClick={handlePlayWelcome}
            className="absolute left-1/2 top-[52%] z-10 w-[270px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-4 text-left shadow-lg transition hover:-translate-y-[53%] hover:shadow-[0_18px_30px_rgba(0,82,255,0.2)]"
          >
            <div className="flex items-center gap-3">
              <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0">
                <defs>
                  <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#0052FF" />
                    <stop offset="100%" stopColor="#4D7CFF" />
                  </linearGradient>
                </defs>
                <circle cx="28" cy="28" r="24" fill="none" stroke="url(#ring-grad)" strokeWidth="4" />
                <circle cx="28" cy="28" r="14" fill="url(#ring-grad)" opacity="0.12" />
                <polygon points="25,21 36,28 25,35" fill="#0052FF" />
              </svg>
              <div>
                <p className="font-mono-label text-[11px] uppercase tracking-[0.15em] text-[#0052FF]">AgentShakti Voice</p>
                <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                  {voiceLoading ? t.listening : t.listen}
                </p>
              </div>
            </div>
          </button>
          {voiceStatus && (
            <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-[var(--muted-foreground)]">{voiceStatus}</p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
