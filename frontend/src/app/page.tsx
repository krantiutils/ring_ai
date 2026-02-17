"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/sections/Navbar";
import Hero from "@/components/sections/Hero";
import Products from "@/components/sections/Products";
import ExperienceDemo from "@/components/sections/ExperienceDemo";
import HowItWorks from "@/components/sections/HowItWorks";
import UseCases from "@/components/sections/UseCases";
import Pricing from "@/components/sections/Pricing";
import CTAFooter from "@/components/sections/CTAFooter";
import { hasAccessToken } from "@/lib/auth";

export type LandingLanguage = "en" | "ne";

export default function Home() {
  const router = useRouter();
  const [language, setLanguage] = useState<LandingLanguage>("en");

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
        <ExperienceDemo language={language} />
        <Products language={language} />
        <HowItWorks language={language} />
        <UseCases language={language} />
        <Pricing language={language} />
      </main>
      <CTAFooter language={language} />
    </>
  );
}
