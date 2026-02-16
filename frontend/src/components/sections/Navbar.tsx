"use client";

import { useState } from "react";
import type { LandingLanguage } from "@/app/page";

type NavbarProps = {
  language: LandingLanguage;
  onToggleLanguage: () => void;
};

const labels = {
  en: {
    products: "modules --products",
    flow: "flow --how",
    cases: "usecases --industry",
    pricing: "pricing --plans",
    login: "[ login ]",
    lang: "नेपाली",
  },
  ne: {
    products: "मोड्युल --उत्पादन",
    flow: "प्रवाह --कसरी",
    cases: "प्रयोग --उद्योग",
    pricing: "मूल्य --योजना",
    login: "[ लगइन ]",
    lang: "English",
  },
};

export default function Navbar({ language, onToggleLanguage }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = labels[language];

  return (
    <header className="sticky top-0 z-50 border-b border-[#1f521f] bg-[#0a0a0a]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4 text-xs">
        <a href="#hero" className="terminal-caps hover:text-[#ffb000]">
          root@ring-ai:~$ ./landing
        </a>

        <nav className="hidden items-center gap-5 md:flex">
          <a href="#products" className="terminal-caps hover:text-[#ffb000]">{t.products}</a>
          <a href="#how-it-works" className="terminal-caps hover:text-[#ffb000]">{t.flow}</a>
          <a href="#use-cases" className="terminal-caps hover:text-[#ffb000]">{t.cases}</a>
          <a href="#pricing" className="terminal-caps hover:text-[#ffb000]">{t.pricing}</a>
          <button type="button" onClick={onToggleLanguage} className="terminal-btn-secondary sharp-corners terminal-btn inline-flex min-h-[36px] items-center px-3 text-[10px]">
            {t.lang}
          </button>
          <a href="/login" className="terminal-btn sharp-corners inline-flex min-h-[40px] items-center px-3 text-[10px]">
            {t.login}
          </a>
        </nav>

        <div className="md:hidden flex items-center gap-2">
          <button type="button" onClick={onToggleLanguage} className="terminal-btn-secondary sharp-corners terminal-btn inline-flex min-h-[36px] items-center px-2 text-[10px]">
            {t.lang}
          </button>
          <button
            type="button"
            className="terminal-btn sharp-corners inline-flex min-h-[36px] items-center px-3 text-[10px]"
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            [ menu ]
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[#1f521f] p-3 md:hidden">
          <div className="flex flex-col gap-2 text-xs">
            <a href="#products" onClick={() => setMobileOpen(false)} className="hover:text-[#ffb000]">{t.products}</a>
            <a href="#how-it-works" onClick={() => setMobileOpen(false)} className="hover:text-[#ffb000]">{t.flow}</a>
            <a href="#use-cases" onClick={() => setMobileOpen(false)} className="hover:text-[#ffb000]">{t.cases}</a>
            <a href="#pricing" onClick={() => setMobileOpen(false)} className="hover:text-[#ffb000]">{t.pricing}</a>
            <a href="/login" onClick={() => setMobileOpen(false)} className="terminal-btn sharp-corners inline-flex min-h-[40px] w-fit items-center px-3 text-[10px]">
              {t.login}
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
