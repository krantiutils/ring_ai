"use client";

import type { LandingLanguage } from "@/app/page";

type PricingProps = {
  language: LandingLanguage;
};

const plans = {
  en: {
    title: "PRICING PLANS",
    subtitle: "Choose based on monthly communication volume.",
    data: [
      ["STARTER", "NPR 5,000/mo", "500 call minutes, 2,000 SMS, basic dashboard"],
      ["BUSINESS", "NPR 25,000/mo", "5,000 call minutes, 20,000 SMS, advanced analytics"],
      ["ENTERPRISE", "Custom", "Dedicated routing, SLA, custom integrations"],
    ],
    cta: "[ open account ]",
  },
  ne: {
    title: "मूल्य योजना",
    subtitle: "मासिक कम्युनिकेशन भोल्युम अनुसार योजना छान्नुहोस्।",
    data: [
      ["STARTER", "NPR 5,000/महिना", "500 कल मिनेट, 2,000 SMS, आधारभूत ड्यासबोर्ड"],
      ["BUSINESS", "NPR 25,000/महिना", "5,000 कल मिनेट, 20,000 SMS, advanced analytics"],
      ["ENTERPRISE", "Custom", "Dedicated routing, SLA, custom integration"],
    ],
    cta: "[ खाता खोल्नुहोस् ]",
  },
};

export default function Pricing({ language }: PricingProps) {
  const t = plans[language];

  return (
    <section id="pricing" className="border-b border-[#1f521f] py-10">
      <div className="mx-auto max-w-screen-xl px-4">
        <p className="terminal-caps text-[11px] text-[#ffb000]">plans --monthly</p>
        <h2 className="terminal-display mt-3 text-4xl uppercase lg:text-5xl">{t.title}</h2>
        <p className="mt-3 text-sm text-[#7bd96a]">{t.subtitle}</p>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {t.data.map(([name, price, desc], idx) => (
            <article
              key={name}
              className={`terminal-pane p-5 ${idx === 1 ? "border-[#33ff00]" : ""}`}
            >
              <p className="terminal-caps text-[11px] text-[#ffb000]">{name}</p>
              <p className="terminal-display mt-2 text-3xl">{price}</p>
              <p className="mt-3 text-sm text-[#7bd96a]">{desc}</p>
              <a href="/login" className="terminal-btn sharp-corners mt-5 inline-flex min-h-[42px] items-center px-4 text-xs">
                {t.cta}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
