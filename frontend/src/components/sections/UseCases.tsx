"use client";

import { motion } from "framer-motion";
import SectionWrapper from "@/components/ui/SectionWrapper";
import ClayCard from "@/components/ui/ClayCard";
import ClayScene from "@/components/three/ClayScene";
import UseCaseDiorama from "@/components/three/UseCaseDiorama";

const useCases = [
  {
    title: "Banking & Finance",
    description:
      "Automated loan follow-ups, payment reminders, and customer verification calls — all in Nepali.",
    type: "banking" as const,
    color: "#FF6B6B",
    stats: "40% faster loan processing",
  },
  {
    title: "Healthcare",
    description:
      "Appointment reminders, patient surveys, health check-in calls, and prescription notifications.",
    type: "healthcare" as const,
    color: "#4ECDC4",
    stats: "3x patient engagement",
  },
  {
    title: "Telecom",
    description:
      "Bulk service alerts, plan upgrade campaigns, satisfaction surveys, and churn prediction calls.",
    type: "telecom" as const,
    color: "#FFD93D",
    stats: "60% reduced churn",
  },
];

export default function UseCases() {
  return (
    <SectionWrapper id="use-cases" bg="bg-clay-cream">
      <div className="text-center mb-16">
        <motion.h2
          className="text-3xl sm:text-4xl font-bold text-clay-dark mb-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Built for Industries That Talk
        </motion.h2>
        <motion.p
          className="text-lg text-clay-dark/60 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          From banking halls to hospital wards to telecom towers — Ring AI
          speaks the language of every industry.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {useCases.map((uc, i) => (
          <motion.div
            key={uc.title}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15, duration: 0.5 }}
          >
            <ClayCard className="h-full flex flex-col">
              {/* 3D diorama */}
              <div className="h-52 mb-6 rounded-2xl overflow-hidden bg-clay-lavender/20">
                <ClayScene camera={{ position: [0, 0.5, 4.5], fov: 35 }}>
                  <UseCaseDiorama type={uc.type} color={uc.color} />
                </ClayScene>
              </div>

              <h3 className="text-xl font-bold text-clay-dark mb-2">
                {uc.title}
              </h3>
              <p className="text-clay-dark/60 leading-relaxed text-sm mb-4 flex-1">
                {uc.description}
              </p>
              <div
                className="text-sm font-semibold px-3 py-1.5 rounded-xl inline-block w-fit"
                style={{
                  backgroundColor: `${uc.color}15`,
                  color: uc.color,
                }}
              >
                {uc.stats}
              </div>
            </ClayCard>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  );
}
