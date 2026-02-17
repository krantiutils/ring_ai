"use client";

import type { LandingLanguage } from "@/app/page";
import ThemeToggle from "@/components/ui/ThemeToggle";

type NavbarProps = {
  language: LandingLanguage;
  onToggleLanguage: () => void;
};

const navText = {
  en: {
    demo: "Live Demo",
    products: "Products",
    flow: "How It Works",
    useCases: "Use Cases",
    pricing: "Pricing",
    login: "Login",
    language: "नेपाली",
  },
  ne: {
    demo: "लाइभ डेमो",
    products: "उत्पादन",
    flow: "कसरी काम गर्छ",
    useCases: "उद्योग प्रयोग",
    pricing: "मूल्य",
    login: "लगइन",
    language: "English",
  },
};

export default function Navbar({ language, onToggleLanguage }: NavbarProps) {
  const t = navText[language];

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_86%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <a href="#hero" className="font-display text-2xl tracking-tight">
          <span className="gradient-text">AgentShakti</span>
        </a>

        <nav className="hidden items-center gap-5 font-mono-label text-[11px] uppercase tracking-[0.13em] text-[var(--muted-foreground)] md:flex">
          <a href="#demo" className="transition-colors hover:text-[var(--accent)]">{t.demo}</a>
          <a href="#products" className="transition-colors hover:text-[var(--accent)]">{t.products}</a>
          <a href="#how-it-works" className="transition-colors hover:text-[var(--accent)]">{t.flow}</a>
          <a href="#use-cases" className="transition-colors hover:text-[var(--accent)]">{t.useCases}</a>
          <a href="#pricing" className="transition-colors hover:text-[var(--accent)]">{t.pricing}</a>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={onToggleLanguage}
            className="btn-outline-modern inline-flex h-10 items-center px-3 text-xs font-medium"
          >
            {t.language}
          </button>
          <a href="/login" className="btn-primary-modern inline-flex h-10 items-center px-4 text-sm font-medium">
            {t.login}
          </a>
        </div>
      </div>
    </header>
  );
}
