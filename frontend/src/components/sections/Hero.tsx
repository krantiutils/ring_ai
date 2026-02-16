"use client";

import { motion } from "framer-motion";
import type { LandingLanguage } from "@/app/page";

type HeroProps = {
  language: LandingLanguage;
};

const copy = {
  en: {
    label: "Communication OS",
    titleA: "One Platform.",
    titleB: "Every Conversation",
    titleC: "Understood.",
    body: "Ring AI unifies outbound voice calls, two-way SMS, and agent handoff into one operational timeline. Teams execute faster, with full context and measurable outcomes.",
    primaryCta: "Try Live Demo",
    secondaryCta: "Go to Login",
    statA: "98.4% Delivery",
    statB: "3x Faster Follow-up",
    statC: "24/7 Automation",
  },
  ne: {
    label: "कम्युनिकेशन OS",
    titleA: "एउटै प्लेटफर्म।",
    titleB: "हरेक संवाद",
    titleC: "बुझिनेगरी।",
    body: "Ring AI ले आउटबाउन्ड कल, दुई-तर्फी SMS र एजेन्ट ह्यान्डअफलाई एउटै अपरेसन टाइमलाइनमा जोड्छ। टिमले छिटो काम गर्छ, सन्दर्भ हराउँदैन, र नतिजा मापन गर्न सक्छ।",
    primaryCta: "लाइभ डेमो हेर्नुहोस्",
    secondaryCta: "लगइनमा जानुहोस्",
    statA: "98.4% डेलिभरी",
    statB: "3x छिटो फलो-अप",
    statC: "24/7 अटोमेसन",
  },
};

const easeOut = [0.16, 1, 0.3, 1] as const;

export default function Hero({ language }: HeroProps) {
  const t = copy[language];

  return (
    <section id="hero" className="relative overflow-hidden py-28 md:py-36">
      <div className="soft-glow -left-28 top-10 h-64 w-64 bg-[#0052FF]/20" />
      <div className="soft-glow -right-28 top-40 h-72 w-72 bg-[#4D7CFF]/20" />

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 md:px-6 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: easeOut }}
        >
          <div className="label-badge">
            <span className="pulse-dot" />
            {t.label}
          </div>

          <h1 className="font-display mt-6 text-[2.85rem] leading-[1.05] tracking-[-0.02em] text-[#0F172A] sm:text-6xl lg:text-[5.25rem]">
            {t.titleA}
            <br />
            {t.titleB}
            <br />
            <span className="relative inline-block gradient-text">{t.titleC}</span>
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

          <div className="mt-8 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
            {[t.statA, t.statB, t.statC].map((item) => (
              <div key={item} className="surface-card rounded-xl px-4 py-3 text-sm text-[#334155]">
                {item}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="relative h-[420px]"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: easeOut }}
        >
          <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-[#0052FF]/10 to-[#4D7CFF]/10" />
          <div className="absolute right-8 top-8 h-52 w-52 rounded-full border border-[#CBD5E1] hero-ring-spin" />
          <div className="absolute left-10 top-14 h-36 w-36 rounded-3xl bg-white shadow-xl hero-float-a" />
          <div className="absolute bottom-10 right-12 h-40 w-48 rounded-3xl accent-gradient shadow-[0_8px_24px_rgba(0,82,255,0.35)] hero-float-b" />
          <div className="absolute bottom-16 left-8 rounded-2xl bg-white p-4 shadow-lg">
            <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[#0052FF]">Live Metrics</p>
            <p className="mt-2 text-2xl font-semibold text-[#0F172A]">+42%</p>
            <p className="text-sm text-[#64748B]">response rate uplift</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
