"use client";

import { motion } from "framer-motion";
import type { LandingLanguage } from "@/app/page";

type ProductsProps = {
  language: LandingLanguage;
};

const content = {
  en: {
    label: "Core Products",
    title: "Everything Needed for Business Communication",
    subtitle: "Voice, text, and handoff are built as one system, not disconnected tools.",
    items: [
      {
        title: "Voice Automation",
        description: "Run outbound call campaigns in Nepali and English with configurable scripts, TTS, and tracking.",
      },
      {
        title: "SMS Continuity",
        description: "Auto-follow up missed calls or intents through contextual SMS to maintain customer momentum.",
      },
      {
        title: "Unified Handoff",
        description: "Escalate to human agents with complete transcript and intent context preserved.",
      },
    ],
  },
  ne: {
    label: "मुख्य उत्पादन",
    title: "व्यवसायिक कम्युनिकेशनका लागि आवश्यक सबै कुरा",
    subtitle: "Voice, text र handoff छुट्टाछुट्टै टुल होइन, एउटै प्रणालीको रूपमा बनाइएको छ।",
    items: [
      {
        title: "Voice Automation",
        description: "नेपाली र अंग्रेजीमा स्क्रिप्ट, TTS र ट्र्याकिङ सहित आउटबाउन्ड कल अभियान चलाउनुहोस्।",
      },
      {
        title: "SMS Continuity",
        description: "मिस कल वा intent पछि सन्दर्भयुक्त SMS पठाएर ग्राहक प्रवाह जारी राख्नुहोस्।",
      },
      {
        title: "Unified Handoff",
        description: "पूर्ण ट्रान्सक्रिप्ट र intent सँगै मानव एजेन्टमा एस्कलेट गर्नुहोस्।",
      },
    ],
  },
};

export default function Products({ language }: ProductsProps) {
  const t = content[language];
  return (
    <section id="products" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="label-badge">
          <span className="pulse-dot" />
          {t.label}
        </div>
        <h2 className="font-display mt-5 text-4xl leading-tight md:text-5xl">{t.title}</h2>
        <p className="mt-3 max-w-3xl text-[#64748B]">{t.subtitle}</p>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {t.items.map((item, i) => (
            <motion.article
              key={item.title}
              className="surface-card rounded-2xl p-6"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
              whileHover={{ y: -4 }}
            >
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl accent-gradient text-sm font-semibold text-white shadow-[0_4px_14px_rgba(0,82,255,0.28)]">
                0{i + 1}
              </div>
              <h3 className="mt-4 text-xl font-semibold text-[#0F172A]">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#64748B]">{item.description}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
