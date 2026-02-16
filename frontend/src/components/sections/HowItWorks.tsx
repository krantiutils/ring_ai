"use client";

import type { LandingLanguage } from "@/app/page";

type HowItWorksProps = {
  language: LandingLanguage;
};

const content = {
  en: {
    title: "HOW THE FLOW WORKS",
    intro: "Each conversation follows one deterministic path so teams can monitor, audit, and improve outcomes.",
    steps: [
      ["01", "Inbound/Outbound trigger enters queue"],
      ["02", "AI handles intent and response"],
      ["03", "SMS or call follow-up runs automatically"],
      ["04", "Human handoff happens with full transcript"],
      ["05", "Analytics closes the loop for teams"],
    ],
  },
  ne: {
    title: "FLOW कसरी काम गर्छ",
    intro: "प्रत्येक संवाद एउटै स्पष्ट मार्गबाट जान्छ, जसले टिमलाई अनुगमन, अडिट र सुधार गर्न सजिलो बनाउँछ।",
    steps: [
      ["01", "इनबाउन्ड/आउटबाउन्ड ट्रिगर क्युमार्फत जान्छ"],
      ["02", "AI ले इन्टेन्ट र प्रतिक्रिया ह्यान्डल गर्छ"],
      ["03", "SMS वा कल फलो-अप स्वचालित हुन्छ"],
      ["04", "पूर्ण ट्रान्सक्रिप्ट सहित मानव ह्यान्डअफ हुन्छ"],
      ["05", "एनालिटिक्सले परिणाम मापन गर्छ"],
    ],
  },
};

export default function HowItWorks({ language }: HowItWorksProps) {
  const t = content[language];

  return (
    <section id="how-it-works" className="border-b border-[#1f521f] bg-[#081108] py-10">
      <div className="mx-auto max-w-screen-xl px-4">
        <p className="terminal-caps text-[11px] text-[#ffb000]">pipeline --status</p>
        <h2 className="terminal-display mt-3 text-4xl uppercase lg:text-5xl">{t.title}</h2>
        <p className="mt-3 max-w-3xl text-sm text-[#7bd96a] lg:text-base">{t.intro}</p>

        <div className="mt-8 terminal-pane p-5">
          <div className="terminal-titlebar sharp-corners -mx-5 -mt-5 px-5 py-2 text-[11px] terminal-caps">
            +-- EXECUTION TIMELINE --+
          </div>
          <div className="mt-5 space-y-3">
            {t.steps.map(([num, step], idx) => (
              <div key={num} className="flex items-start gap-3">
                <p className="terminal-caps min-w-[38px] text-[11px] text-[#ffb000]">{num}</p>
                <p className="text-sm text-[#7bd96a]">{step}</p>
                <p className="ml-auto hidden text-xs text-[#33ff00] md:block">
                  [{`${"|".repeat(idx + 3)}${".".repeat(8 - idx)}`}]
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
