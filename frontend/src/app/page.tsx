"use client";

import dynamic from "next/dynamic";
import Navbar from "@/components/sections/Navbar";
import Hero from "@/components/sections/Hero";
import CTAFooter from "@/components/sections/CTAFooter";

const Products = dynamic(() => import("@/components/sections/Products"), {
  ssr: false,
});
const HowItWorks = dynamic(() => import("@/components/sections/HowItWorks"), {
  ssr: false,
});
const UseCases = dynamic(() => import("@/components/sections/UseCases"), {
  ssr: false,
});
const Pricing = dynamic(() => import("@/components/sections/Pricing"), {
  ssr: false,
});

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Products />
        <HowItWorks />
        <UseCases />
        <Pricing />
      </main>
      <CTAFooter />
    </>
  );
}
