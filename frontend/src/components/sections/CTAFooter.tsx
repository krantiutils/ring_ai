"use client";

import type { LandingLanguage } from "@/app/page";

type CTAFooterProps = {
  language: LandingLanguage;
};

const copy = {
  en: {
    title: "Turn Every Customer Interaction into Actionable Operations",
    body: "Move from disconnected call tools to one unified communication platform with analytics, automation, and reliable handoff.",
    cta: "Start Free",
    secondary: "Talk to Sales",
  },
  ne: {
    title: "हरेक ग्राहक संवादलाई कार्यान्वयनयोग्य अपरेसनमा रूपान्तरण गर्नुहोस्",
    body: "छुट्टाछुट्टै कल टुलबाट एकीकृत कम्युनिकेशन प्लेटफर्ममा जानुहोस्, जहाँ analytics, automation र handoff भरपर्दो छन्।",
    cta: "Free सुरु गर्नुहोस्",
    secondary: "Sales सँग कुरा गर्नुहोस्",
  },
};

export default function CTAFooter({ language }: CTAFooterProps) {
  const t = copy[language];

  return (
    <>
      <section className="relative overflow-hidden bg-[#0F172A] py-28 text-white">
        <div className="absolute inset-0 dot-grid-dark" />
        <div className="soft-glow -right-24 top-10 h-72 w-72 bg-[#4D7CFF]/30" />
        <div className="relative mx-auto max-w-6xl px-4 text-center md:px-6">
          <h2 className="font-display text-4xl leading-tight md:text-5xl">{t.title}</h2>
          <p className="mx-auto mt-4 max-w-3xl text-white/80">{t.body}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="/login" className="btn-primary-modern inline-flex h-12 items-center px-6 text-sm font-semibold">
              {t.cta}
            </a>
            <a href="/login" className="inline-flex h-12 items-center rounded-xl border border-white/30 px-6 text-sm font-semibold text-white transition hover:bg-white/10">
              {t.secondary}
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E2E8F0] bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-sm text-[#64748B] md:flex-row md:items-center md:justify-between md:px-6">
          <p>© {new Date().getFullYear()} AgentShakti. All rights reserved.</p>
          <div className="flex gap-5">
            <a href="#products" className="hover:text-[#0052FF]">Product</a>
            <a href="#pricing" className="hover:text-[#0052FF]">Pricing</a>
            <a href="/login" className="hover:text-[#0052FF]">Login</a>
          </div>
        </div>
      </footer>
    </>
  );
}
