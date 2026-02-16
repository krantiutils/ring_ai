"use client";

import type { LandingLanguage } from "@/app/page";
import TerminalSignalIllustration from "@/components/illustrations/TerminalSignalIllustration";

type HeroProps = {
  language: LandingLanguage;
};

const copy = {
  en: {
    pre: "ring-ai runtime v1.0.0",
    title: "ONE PLATFORM.\nEVERY CONVERSATION.",
    command: "$ ringai route --voice --sms --human-handoff --analytics",
    body: "Ring AI helps teams run outbound voice calls, two-way SMS, and human handoff in one shared timeline. Your agents see complete context, and your managers see clear outcomes.",
    ctaPrimary: "[ start demo ]",
    ctaSecondary: "[ login ]",
    bullets: [
      ["[01]", "Run AI calls in Nepali and English"],
      ["[02]", "Trigger SMS follow-ups automatically"],
      ["[03]", "Escalate live to human without losing context"],
      ["[04]", "Track outcomes in one dashboard"],
    ],
  },
  ne: {
    pre: "ring-ai runtime v1.0.0",
    title: "एक प्लेटफर्म।\nसबै संवाद एउटै ठाउँमा।",
    command: "$ ringai route --voice --sms --human-handoff --analytics",
    body: "Ring AI ले आउटबाउन्ड कल, दुई-तर्फी एसएमएस, र मानव ह्यान्डअफ एउटै टाइमलाइनमा चलाउन मद्दत गर्छ। एजेन्टले पूरा सन्दर्भ देख्छन् र म्यानेजरले स्पष्ट नतिजा देख्छन्।",
    ctaPrimary: "[ डेमो सुरु गर्नुहोस् ]",
    ctaSecondary: "[ लगइन ]",
    bullets: [
      ["[01]", "नेपाली र अंग्रेजीमा AI कल चलाउनुहोस्"],
      ["[02]", "स्वचालित SMS फलो-अप पठाउनुहोस्"],
      ["[03]", "सन्दर्भ नहराई मानवमा ह्यान्डअफ गर्नुहोस्"],
      ["[04]", "एउटै ड्यासबोर्डमा नतिजा ट्र्याक गर्नुहोस्"],
    ],
  },
};

export default function Hero({ language }: HeroProps) {
  const t = copy[language];

  return (
    <section id="hero" className="border-b border-[#1f521f] py-8 lg:py-12">
      <div className="mx-auto grid max-w-screen-xl grid-cols-12 px-4">
        <div className="terminal-pane col-span-12 border-b border-[#1f521f] p-5 md:p-7 lg:col-span-8 lg:border-r lg:border-b-0">
          <p className="terminal-caps mb-4 text-[11px] text-[#ffb000]">{t.pre}</p>
          <h1 className="terminal-display terminal-caps whitespace-pre-line text-5xl leading-[0.88] sm:text-6xl lg:text-8xl">
            {t.title}
          </h1>
          <p className="typing-demo mt-5 w-[40ch] max-w-full overflow-hidden text-sm text-[#7bd96a] md:text-base">
            {t.command}
          </p>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-[#7bd96a] md:text-base">{t.body}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#products" className="terminal-btn sharp-corners inline-flex min-h-[44px] items-center px-4 text-xs">
              {t.ctaPrimary}
            </a>
            <a href="/login" className="terminal-btn terminal-btn-secondary sharp-corners inline-flex min-h-[44px] items-center px-4 text-xs">
              {t.ctaSecondary}
            </a>
          </div>
        </div>

        <div className="terminal-pane col-span-12 p-5 md:p-7 lg:col-span-4">
          <div className="terminal-titlebar sharp-corners px-3 py-2 text-[11px] terminal-caps">+-- SIGNAL MAP --+</div>
          <div className="mt-4">
            <TerminalSignalIllustration />
          </div>
          <div className="terminal-line mt-4 border-t pt-4 text-sm">
            {t.bullets.map(([key, value]) => (
              <p key={key} className="mb-2 text-[#7bd96a]">
                <span className="text-[#ffb000]">{key}</span> {value}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
