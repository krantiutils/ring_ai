"use client";

import type { LandingLanguage } from "@/app/page";

type UseCasesProps = {
  language: LandingLanguage;
};

const cases = {
  en: {
    title: "INDUSTRY USE CASES",
    subtitle: "Same engine, different workflows.",
    items: [
      ["BANKING", "Loan reminder calls + payment follow-up SMS in one queue."],
      ["HEALTHCARE", "Appointment reminders, missed-call callbacks, and survey capture."],
      ["TELECOM", "Plan renewal outreach, support triage, and churn recovery handoff."],
    ],
  },
  ne: {
    title: "उद्योग अनुसार प्रयोग",
    subtitle: "उही इन्जिन, फरक workflow.",
    items: [
      ["BANKING", "ऋण सम्झौता कल र भुक्तानी SMS फलो-अप एउटै क्युमै।"],
      ["HEALTHCARE", "अपोइन्टमेन्ट रिमाइन्डर, मिस-कल कलब्याक र सर्वे क्याप्चर।"],
      ["TELECOM", "प्लान नवीकरण अभियान, सपोर्ट ट्रायाज र churn recovery handoff।"],
    ],
  },
};

export default function UseCases({ language }: UseCasesProps) {
  const t = cases[language];

  return (
    <section id="use-cases" className="border-b border-[#1f521f] py-10">
      <div className="mx-auto max-w-screen-xl px-4">
        <p className="terminal-caps text-[11px] text-[#ffb000]">workload --industry</p>
        <h2 className="terminal-display mt-3 text-4xl uppercase lg:text-5xl">{t.title}</h2>
        <p className="mt-3 text-sm text-[#7bd96a]">{t.subtitle}</p>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {t.items.map(([title, desc]) => (
            <article key={title} className="terminal-pane p-5 transition-all duration-200 hover:border-[#33ff00]">
              <p className="terminal-caps text-[11px] text-[#ffb000]">{title}</p>
              <p className="mt-3 text-sm leading-relaxed text-[#7bd96a]">{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
