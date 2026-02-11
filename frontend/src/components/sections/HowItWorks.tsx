"use client";

import { motion } from "framer-motion";
import SectionWrapper from "@/components/ui/SectionWrapper";
import ClayScene from "@/components/three/ClayScene";
import PipelineVisualization from "@/components/three/PipelineVisualization";

const steps = [
  {
    number: "01",
    title: "Connect",
    description:
      "Integrate Ring AI with your existing phone system, CRM, or database. Setup takes minutes, not weeks.",
  },
  {
    number: "02",
    title: "Configure",
    description:
      "Define your conversation flows, survey questions, and broadcast templates. Our AI handles the rest.",
  },
  {
    number: "03",
    title: "Communicate",
    description:
      "Launch campaigns, answer calls, and collect data — simultaneously across voice, SMS, and forms.",
  },
  {
    number: "04",
    title: "Analyze",
    description:
      "Real-time dashboards show conversation outcomes, sentiment trends, and response rates.",
  },
];

export default function HowItWorks() {
  return (
    <SectionWrapper id="how-it-works" bg="bg-clay-mint/30">
      <div className="text-center mb-16">
        <motion.h2
          className="text-3xl sm:text-4xl font-bold text-clay-dark mb-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          How It Works
        </motion.h2>
        <motion.p
          className="text-lg text-clay-dark/60 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          Two parallel pipelines — interactive conversations and mass broadcast
          — working together seamlessly.
        </motion.p>
      </div>

      {/* Pipeline 3D visualization */}
      <motion.div
        className="h-[300px] md:h-[350px] mb-16 rounded-3xl overflow-hidden bg-clay-cream/30"
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <ClayScene camera={{ position: [0, 1, 6], fov: 40 }}>
          <PipelineVisualization />
        </ClayScene>
      </motion.div>

      {/* Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {steps.map((step, i) => (
          <motion.div
            key={step.number}
            className="relative"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.5 }}
          >
            <span className="text-5xl font-bold text-clay-coral/15 absolute -top-6 -left-2">
              {step.number}
            </span>
            <div className="pt-8">
              <h3 className="text-xl font-bold text-clay-dark mb-2">
                {step.title}
              </h3>
              <p className="text-clay-dark/60 leading-relaxed text-sm">
                {step.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  );
}
