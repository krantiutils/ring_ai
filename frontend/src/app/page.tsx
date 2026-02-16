"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/sections/Navbar";
import Hero from "@/components/sections/Hero";
import Products from "@/components/sections/Products";
import HowItWorks from "@/components/sections/HowItWorks";
import UseCases from "@/components/sections/UseCases";
import Pricing from "@/components/sections/Pricing";
import CTAFooter from "@/components/sections/CTAFooter";
import { hasAccessToken } from "@/lib/auth";

export type LandingLanguage = "en" | "ne";

export default function Home() {
  const router = useRouter();
  const [language, setLanguage] = useState<LandingLanguage>("en");
  const ticker =
    language === "en"
      ? ["[OK] VOICE ROUTING", "[OK] SMS FOLLOW-UP", "[OK] HUMAN HANDOFF", "[OK] LIVE ANALYTICS", "[OK] NEPALI-FIRST AI"]
      : ["[OK] VOICE ROUTING", "[OK] SMS FOLLOW-UP", "[OK] HUMAN HANDOFF", "[OK] LIVE ANALYTICS", "[OK] नेपाली AI"];

  useEffect(() => {
    if (hasAccessToken()) {
      router.replace("/dashboard");
    }
  }, [router]);

  return (
    <>
      <Navbar language={language} onToggleLanguage={() => setLanguage((prev) => (prev === "en" ? "ne" : "en"))} />
      <main>
        <Hero language={language} />
        <section className="overflow-hidden border-y border-[#1f521f]">
          <div className="terminal-ticker-track whitespace-nowrap border-b border-[#1f521f] py-3 text-xs">
            {[...ticker, ...ticker].map((item, i) => (
              <span key={`${item}-${i}`} className="mx-6 text-[#33ff00]">
                <span className="text-[#ffb000]">{">"}</span> {item}
              </span>
            ))}
          </div>
        </section>
        <Products language={language} />
        <HowItWorks language={language} />
        <UseCases language={language} />
        <Pricing language={language} />
      </main>
      <CTAFooter language={language} />
    </>
  );
}
