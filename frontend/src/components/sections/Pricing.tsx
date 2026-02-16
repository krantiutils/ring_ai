"use client";

import { motion } from "framer-motion";
import type { LandingLanguage } from "@/app/page";

type PricingProps = {
  language: LandingLanguage;
};

const pricing = {
  en: {
    label: "Pricing",
    title: "Simple Pricing, Scales with Volume",
    subtitle: "No hidden fees. Upgrade only when your conversation load grows.",
    plans: [
      ["Starter", "NPR 5,000/mo", "500 call minutes · 2,000 SMS · basic analytics"],
      ["Business", "NPR 25,000/mo", "5,000 call minutes · 20,000 SMS · advanced analytics"],
      ["Enterprise", "Custom", "Unlimited scale · dedicated support · custom integrations"],
    ],
  },
  ne: {
    label: "मूल्य",
    title: "साधारण मूल्य, भोल्युम अनुसार स्केल",
    subtitle: "लुकेका शुल्क छैनन्। संवादको भोल्युम बढेपछि मात्रै अपग्रेड गर्नुहोस्।",
    plans: [
      ["Starter", "NPR 5,000/महिना", "500 कल मिनेट · 2,000 SMS · आधारभूत analytics"],
      ["Business", "NPR 25,000/महिना", "5,000 कल मिनेट · 20,000 SMS · advanced analytics"],
      ["Enterprise", "Custom", "असीमित scale · dedicated support · custom integrations"],
    ],
  },
};

export default function Pricing({ language }: PricingProps) {
  const t = pricing[language];
  return (
    <section id="pricing" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="label-badge">
          <span className="pulse-dot" />
          {t.label}
        </div>
        <h2 className="font-display mt-5 text-4xl leading-tight md:text-5xl">{t.title}</h2>
        <p className="mt-3 max-w-3xl text-[#64748B]">{t.subtitle}</p>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {t.plans.map(([name, amount, detail], i) => {
            const featured = i === 1;
            return (
              <motion.article
                key={name}
                className={featured ? "rounded-2xl accent-gradient p-[2px] md:-mt-4" : ""}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.6, delay: i * 0.08 }}
              >
                <div className={`h-full rounded-2xl p-6 ${featured ? "bg-white shadow-xl" : "surface-card"}`}>
                  {featured && (
                    <span className="font-mono-label text-xs uppercase tracking-[0.15em] text-[#0052FF]">Most Popular</span>
                  )}
                  <h3 className="mt-2 text-xl font-semibold text-[#0F172A]">{name}</h3>
                  <p className="mt-1 text-3xl font-semibold text-[#0F172A]">{amount}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[#64748B]">{detail}</p>
                  <a
                    href="/login"
                    className={`mt-6 inline-flex h-11 items-center px-5 text-sm font-semibold ${featured ? "btn-primary-modern" : "btn-outline-modern"}`}
                  >
                    Get Started
                  </a>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
