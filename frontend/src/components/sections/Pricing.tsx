"use client";

import { motion } from "framer-motion";
import SectionWrapper from "@/components/ui/SectionWrapper";
import ClayButton from "@/components/ui/ClayButton";
import ClayScene from "@/components/three/ClayScene";
import PricingPedestal from "@/components/three/PricingPedestal";

const tiers = [
  {
    name: "Startup",
    price: "NPR 5,000",
    period: "/mo",
    description: "For small teams getting started with AI communication.",
    features: [
      "500 voice minutes",
      "2,000 SMS messages",
      "1 survey template",
      "Basic analytics",
      "Email support",
    ],
    color: "#4ECDC4",
    height: 0.6,
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Business",
    price: "NPR 25,000",
    period: "/mo",
    description: "For growing businesses that need scale and insights.",
    features: [
      "5,000 voice minutes",
      "20,000 SMS messages",
      "Unlimited surveys",
      "Advanced analytics",
      "Nepali voice AI",
      "API access",
      "Priority support",
    ],
    color: "#FF6B6B",
    height: 0.9,
    cta: "Get Started",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations with custom requirements.",
    features: [
      "Unlimited minutes",
      "Unlimited SMS",
      "Custom AI training",
      "Dedicated account manager",
      "SLA guarantee",
      "On-premise option",
      "24/7 phone support",
    ],
    color: "#FFD93D",
    height: 0.75,
    cta: "Contact Sales",
    popular: false,
  },
];

export default function Pricing() {
  return (
    <SectionWrapper id="pricing" bg="bg-clay-lavender/20">
      <div className="text-center mb-16">
        <motion.h2
          className="text-3xl sm:text-4xl font-bold text-clay-dark mb-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Simple, Transparent Pricing
        </motion.h2>
        <motion.p
          className="text-lg text-clay-dark/60 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          No hidden fees. Scale up or down anytime. Start with a free trial.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end">
        {tiers.map((tier, i) => (
          <motion.div
            key={tier.name}
            className={`clay-surface p-8 flex flex-col relative ${
              tier.popular
                ? "ring-2 ring-clay-coral/30 md:-mt-4 md:pb-10"
                : ""
            }`}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12, duration: 0.5 }}
            whileHover={{
              y: -6,
              transition: { type: "spring", stiffness: 300, damping: 20 },
            }}
          >
            {tier.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-clay-coral text-white text-xs font-bold px-4 py-1 rounded-full">
                Most Popular
              </span>
            )}

            {/* Mini pedestal 3D */}
            <div className="h-28 mb-4 rounded-2xl overflow-hidden">
              <ClayScene camera={{ position: [0, 0.5, 3], fov: 35 }}>
                <PricingPedestal color={tier.color} height={tier.height} />
              </ClayScene>
            </div>

            <h3
              className="text-lg font-bold mb-1"
              style={{ color: tier.color }}
            >
              {tier.name}
            </h3>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold text-clay-dark">
                {tier.price}
              </span>
              {tier.period && (
                <span className="text-clay-dark/50 text-sm">{tier.period}</span>
              )}
            </div>
            <p className="text-sm text-clay-dark/60 mb-6">
              {tier.description}
            </p>

            <ul className="space-y-2.5 mb-8 flex-1">
              {tier.features.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2 text-sm text-clay-dark/70"
                >
                  <svg
                    className="w-4 h-4 mt-0.5 flex-shrink-0"
                    style={{ color: tier.color }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <ClayButton
              variant={tier.popular ? "primary" : "outline"}
              size="md"
              className="w-full"
            >
              {tier.cta}
            </ClayButton>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  );
}
