"use client";

import type { LandingLanguage } from "@/app/page";

type ProductsProps = {
  language: LandingLanguage;
};

const content = {
  en: {
    heading: "WHAT RING AI ACTUALLY DOES",
    sub: "Ring AI is not just a chatbot. It is an operations layer for business communication across calls, SMS, and human escalation.",
    cards: [
      {
        id: "VOICE_NODE",
        title: "VOICE CAMPAIGNS",
        desc: "Launch outbound campaigns with Nepali and English TTS voices. Track pickup, duration, and completion in real time.",
      },
      {
        id: "SMS_NODE",
        title: "SMS CONTINUITY",
        desc: "When calls are missed, Ring AI can follow up with contextual messages so the same customer journey continues.",
      },
      {
        id: "HUMAN_NODE",
        title: "UNIFIED HANDOFF",
        desc: "Escalate to live agents when needed and preserve full transcript context so teams do not restart conversations.",
      },
    ],
  },
  ne: {
    heading: "RING AI ले के गर्छ?",
    sub: "Ring AI केवल च्याटबट होइन। यो कल, एसएमएस र मानव एस्कलेसनलाई एउटै अपरेशन तहमा ल्याउने कम्युनिकेशन प्लेटफर्म हो।",
    cards: [
      {
        id: "VOICE_NODE",
        title: "VOICE CAMPAIGNS",
        desc: "नेपाली र अंग्रेजी TTS प्रयोग गरेर आउटबाउन्ड कल अभियान चलाउनुहोस्। पिकअप, अवधि र नतिजा रियल-टाइममा हेर्नुहोस्।",
      },
      {
        id: "SMS_NODE",
        title: "SMS CONTINUITY",
        desc: "कल मिस भएमा सन्दर्भसहित SMS फलो-अप पठाएर ग्राहक यात्रालाई निरन्तर राख्नुहोस्।",
      },
      {
        id: "HUMAN_NODE",
        title: "UNIFIED HANDOFF",
        desc: "आवश्यक परे लाइभ एजेन्टमा एस्कलेट गर्नुहोस् र पूरा ट्रान्सक्रिप्ट सन्दर्भ सुरक्षित राख्नुहोस्।",
      },
    ],
  },
};

export default function Products({ language }: ProductsProps) {
  const t = content[language];

  return (
    <section id="products" className="border-b border-[#1f521f] py-10">
      <div className="mx-auto max-w-screen-xl px-4">
        <p className="terminal-caps text-[11px] text-[#ffb000]">module --explain</p>
        <h2 className="terminal-display mt-3 text-4xl uppercase lg:text-5xl">{t.heading}</h2>
        <p className="mt-3 max-w-4xl text-sm text-[#7bd96a] lg:text-base">{t.sub}</p>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {t.cards.map((card) => (
            <article key={card.id} className="terminal-pane pulse-panel p-5">
              <p className="terminal-caps text-[11px] text-[#ffb000]">{card.id}</p>
              <h3 className="terminal-display mt-3 text-3xl uppercase">{card.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#7bd96a]">{card.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
