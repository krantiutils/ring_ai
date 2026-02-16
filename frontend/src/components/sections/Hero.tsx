"use client";

import { motion } from "framer-motion";
import ClayButton from "@/components/ui/ClayButton";
import ClayScene from "@/components/three/ClayScene";
import ClayPhone from "@/components/three/ClayPhone";
import ExperienceCenter from "@/components/sections/ExperienceCenter";

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative bg-clay-cream clay-texture overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-6 md:px-8 w-full py-20 space-y-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Copy */}
          <motion.div
            className="z-10"
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <motion.p
              className="text-clay-coral font-semibold tracking-wide uppercase text-sm mb-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              Powered by AI, spoken in नेपाली
            </motion.p>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight text-clay-dark mb-6">
              One Platform.
              <br />
              Every Conversation.
              <br />
              <span className="text-clay-coral">Understood.</span>
            </h1>

            <p className="text-lg text-clay-dark/70 max-w-md mb-10 leading-relaxed">
              AI-powered voice calls, SMS campaigns, and smart surveys — all in one platform built for businesses
              that communicate at scale.
            </p>

            <div className="flex flex-wrap gap-4">
              <ClayButton variant="primary" size="lg" href="/login">
                Signup For Free
              </ClayButton>
              <ClayButton variant="outline" size="lg" href="#how-it-works">
                See How It Works
              </ClayButton>
              <ClayButton variant="outline" size="lg" href="/login">
                Login
              </ClayButton>
            </div>
          </motion.div>

          {/* 3D phone */}
          <motion.div
            className="relative h-[400px] sm:h-[500px] lg:h-[600px]"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          >
            <ClayScene camera={{ position: [0, 0, 5], fov: 40 }}>
              <ClayPhone />
            </ClayScene>
          </motion.div>
        </div>
        <div className="relative rounded-3xl overflow-hidden bg-[radial-gradient(circle_at_15%_5%,#2a194f_0%,#12081f_48%,#06040c_100%)] p-6 md:p-8">
          <ExperienceCenter embedded />
        </div>
      </div>

      {/* Gradient fade to next section */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-clay-lavender/50 to-transparent" />
    </section>
  );
}
