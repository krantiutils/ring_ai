"use client";

import { motion } from "framer-motion";
import type { LandingLanguage } from "@/app/page";

type HowItWorksProps = {
  language: LandingLanguage;
};

const content = {
  en: {
    label: "Workflow",
    title: "How AgentShakti Operates End to End",
    intro: "The flow is designed for clarity: trigger, automate, escalate, and measure.",
    steps: [
      ["Connect channels and upload campaign context"],
      ["AI handles first response via call or SMS"],
      ["Rule-based follow-up keeps conversations active"],
      ["Complex cases hand off to human agents"],
      ["Dashboard closes loop with insights and outcomes"],
    ],
  },
  ne: {
    label: "कार्यप्रवाह",
    title: "AgentShakti को end-to-end सञ्चालन",
    intro: "Flow स्पष्ट छ: trigger, automate, escalate, अनि measure।",
    steps: [
      ["च्यानल जोड्नुहोस् र अभियान सन्दर्भ राख्नुहोस्"],
      ["AI ले कल वा SMS बाट पहिलो प्रतिक्रिया दिन्छ"],
      ["Rule-based follow-up ले संवाद सक्रिय राख्छ"],
      ["जटिल केस मानव एजेन्टमा handoff हुन्छ"],
      ["ड्यासबोर्डले नतिजा र insights देखाउँछ"],
    ],
  },
};

export default function HowItWorks({ language }: HowItWorksProps) {
  const t = content[language];
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-[#0F172A] py-28 text-white">
      <div className="absolute inset-0 dot-grid-dark" />
      <div className="soft-glow -right-24 top-10 h-64 w-64 bg-[#4D7CFF]/25" />
      <div className="mx-auto relative max-w-6xl px-4 md:px-6">
        <div className="label-badge bg-[#1E293B]/70 border-[#4D7CFF]/40 text-[#93C5FD]">
          <span className="pulse-dot" />
          {t.label}
        </div>
        <h2 className="font-display mt-5 text-4xl leading-tight md:text-5xl">{t.title}</h2>
        <p className="mt-3 max-w-3xl text-white/75">{t.intro}</p>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-5">
          {t.steps.map((step, i) => (
            <motion.div
              key={step[0]}
              className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ delay: i * 0.08 }}
            >
              <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[#93C5FD]">Step 0{i + 1}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/90">{step[0]}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
