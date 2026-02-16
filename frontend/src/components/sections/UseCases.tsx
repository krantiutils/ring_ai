"use client";

import { motion } from "framer-motion";
import type { LandingLanguage } from "@/app/page";

type UseCasesProps = {
  language: LandingLanguage;
};

const content = {
  en: {
    label: "Industry Fit",
    title: "Built for High-Volume Teams",
    intro: "Designed for operations where every missed follow-up costs real revenue.",
    cases: [
      ["Banking & Finance", "Loan reminders, payment nudges, and account verification calls with measurable closure rates."],
      ["Healthcare", "Appointment reminders, missed-call callbacks, and patient surveys through voice and SMS."],
      ["Telecom", "Renewal campaigns, plan migration outreach, and churn recovery with human fallback."],
    ],
  },
  ne: {
    label: "उद्योग मिलान",
    title: "High-volume टिमका लागि तयार",
    intro: "त्यस्ता अपरेसनका लागि डिजाइन गरिएको, जहाँ फलो-अप छुट्दा वास्तविक राजस्व नोक्सान हुन्छ।",
    cases: [
      ["Banking & Finance", "ऋण सम्झौता, भुक्तानी रिमाइन्डर र अकाउन्ट verify कलहरू मापनयोग्य क्लोजर रेटसहित।"],
      ["Healthcare", "अपोइन्टमेन्ट रिमाइन्डर, मिस-कल callback, र आवाज + SMS बाट बिरामी सर्वे।"],
      ["Telecom", "renewal अभियान, प्लान migration outreach र human fallback सहित churn recovery।"],
    ],
  },
};

export default function UseCases({ language }: UseCasesProps) {
  const t = content[language];
  return (
    <section id="use-cases" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="label-badge">
          <span className="pulse-dot" />
          {t.label}
        </div>
        <h2 className="font-display mt-5 text-4xl leading-tight md:text-5xl">{t.title}</h2>
        <p className="mt-3 max-w-3xl text-[#64748B]">{t.intro}</p>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {t.cases.map(([title, desc], i) => (
            <motion.article
              key={title}
              className="surface-card rounded-2xl p-6"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
            >
              <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[#0052FF]">Use Case</p>
              <h3 className="mt-3 text-xl font-semibold text-[#0F172A]">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#64748B]">{desc}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
