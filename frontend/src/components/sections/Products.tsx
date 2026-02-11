"use client";

import { motion } from "framer-motion";
import SectionWrapper from "@/components/ui/SectionWrapper";
import ClayCard from "@/components/ui/ClayCard";
import ClayScene from "@/components/three/ClayScene";
import ProductDiorama from "@/components/three/ProductDiorama";

const products = [
  {
    title: "Voice",
    subtitle: "AI-Powered Calls",
    description:
      "Automated outbound calls with natural Nepali voice AI. Real-time transcription, sentiment analysis, and intelligent routing.",
    color: "#FF6B6B",
    icon: "voice" as const,
    features: ["नेपाली भाषामा बोल्नुहोस्", "Live transcription", "Smart routing"],
  },
  {
    title: "Text",
    subtitle: "SMS Campaigns",
    description:
      "Broadcast messages, two-way conversations, and automated follow-ups. Reach thousands in seconds.",
    color: "#4ECDC4",
    icon: "text" as const,
    features: ["Bulk broadcast", "Two-way chat", "Auto follow-up"],
  },
  {
    title: "Forms",
    subtitle: "Smart Surveys",
    description:
      "Voice-driven and SMS-based surveys with real-time analytics. Collect structured data at scale.",
    color: "#FFD93D",
    icon: "forms" as const,
    features: ["Voice surveys", "SMS forms", "Live analytics"],
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

export default function Products() {
  return (
    <SectionWrapper id="products" bg="bg-clay-lavender/30">
      <div className="text-center mb-16">
        <motion.h2
          className="text-3xl sm:text-4xl font-bold text-clay-dark mb-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Three Products. One Platform.
        </motion.h2>
        <motion.p
          className="text-lg text-clay-dark/60 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          Everything you need to communicate with your customers — voice, text,
          and surveys — unified under one roof.
        </motion.p>
      </div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-8"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
      >
        {products.map((product) => (
          <motion.div key={product.title} variants={cardVariants}>
            <ClayCard className="h-full flex flex-col">
              {/* Mini 3D diorama */}
              <div className="h-48 mb-6 rounded-2xl overflow-hidden bg-clay-cream/50">
                <ClayScene camera={{ position: [0, 0, 4], fov: 40 }}>
                  <ProductDiorama type={product.icon} color={product.color} />
                </ClayScene>
              </div>

              <div
                className="text-xs font-bold uppercase tracking-widest mb-2"
                style={{ color: product.color }}
              >
                {product.subtitle}
              </div>
              <h3 className="text-2xl font-bold text-clay-dark mb-3">
                {product.title}
              </h3>
              <p className="text-clay-dark/60 mb-5 flex-1 leading-relaxed">
                {product.description}
              </p>

              <ul className="space-y-2">
                {product.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2 text-sm text-clay-dark/70"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: product.color }}
                    />
                    {f}
                  </li>
                ))}
              </ul>
            </ClayCard>
          </motion.div>
        ))}
      </motion.div>
    </SectionWrapper>
  );
}
