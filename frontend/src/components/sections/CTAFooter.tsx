"use client";

import type { LandingLanguage } from "@/app/page";

type CTAFooterProps = {
  language: LandingLanguage;
};

const content = {
  en: {
    title: "READY TO RUN COMMUNICATION OPS IN ONE PLACE?",
    body: "Start with login, run campaigns, and monitor conversation outcomes from one dashboard.",
    cta: "[ open dashboard ]",
    routes: "CONNECTED ROUTES",
  },
  ne: {
    title: "सबै कम्युनिकेशन अप्स एउटै ठाउँबाट चलाउन तयार?",
    body: "लगइनबाट सुरु गर्नुहोस्, अभियान चलाउनुहोस्, र एउटै ड्यासबोर्डबाट नतिजा हेर्नुहोस्।",
    cta: "[ ड्यासबोर्ड खोल्नुहोस् ]",
    routes: "CONNECTED ROUTES",
  },
};

export default function CTAFooter({ language }: CTAFooterProps) {
  const t = content[language];

  return (
    <>
      <section className="border-b border-[#1f521f] bg-[#081108] py-12">
        <div className="mx-auto grid max-w-screen-xl grid-cols-12 gap-4 px-4">
          <div className="col-span-12 lg:col-span-8">
            <p className="terminal-caps text-[11px] text-[#ffb000]">root@ring-ai:~$ next-step</p>
            <h2 className="terminal-display mt-3 text-4xl uppercase leading-tight lg:text-5xl">{t.title}</h2>
            <p className="mt-3 max-w-3xl text-sm text-[#7bd96a]">{t.body}</p>
          </div>
          <div className="terminal-pane col-span-12 p-5 lg:col-span-4">
            <a href="/login" className="terminal-btn sharp-corners inline-flex min-h-[44px] items-center px-4 text-xs">
              {t.cta}
            </a>
            <div className="terminal-line mt-5 border-t pt-3 text-xs text-[#7bd96a]">
              <p className="terminal-caps text-[#ffb000]">{t.routes}</p>
              <div className="mt-2 flex flex-col gap-1">
                <a href="/login" className="hover:text-[#ffb000]">$ /login</a>
                <a href="/dashboard" className="hover:text-[#ffb000]">$ /dashboard</a>
                <a href="/dashboard/campaigns" className="hover:text-[#ffb000]">$ /dashboard/campaigns</a>
                <a href="/dashboard/analytics" className="hover:text-[#ffb000]">$ /dashboard/analytics</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="py-6">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-2 px-4 text-[11px] md:flex-row md:items-center md:justify-between">
          <p className="terminal-caps text-[#7bd96a]">ring ai cli interface | node: kathmandu</p>
          <p className="terminal-caps text-[#ffb000]">build: v1.1 | shell: production</p>
        </div>
      </footer>
    </>
  );
}
