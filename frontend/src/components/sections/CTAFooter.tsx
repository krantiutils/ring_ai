"use client";

import { motion } from "framer-motion";
import ClayButton from "@/components/ui/ClayButton";

export default function CTAFooter() {
  return (
    <>
      {/* CTA Section */}
      <section className="bg-clay-coral clay-texture py-24 md:py-32">
        <div className="mx-auto max-w-4xl px-6 md:px-8 text-center">
          <motion.h2
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Ready to Transform Your
            <br />
            Business Communication?
          </motion.h2>
          <motion.p
            className="text-white/80 text-lg mb-10 max-w-xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            Join hundreds of Nepali businesses already using Ring AI to talk to
            their customers smarter, faster, and in their own language.
          </motion.p>
          <motion.div
            className="flex flex-wrap gap-4 justify-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <ClayButton
              variant="secondary"
              size="lg"
              className="bg-white text-clay-coral shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
            >
              Start Building
            </ClayButton>
            <ClayButton
              variant="outline"
              size="lg"
              className="border-white/30 text-white bg-transparent hover:bg-white/10"
            >
              Talk to Sales
            </ClayButton>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-clay-dark py-16">
        <div className="mx-auto max-w-7xl px-6 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="text-2xl font-bold text-white mb-3">
                <span className="text-clay-coral">Ring</span> AI
              </div>
              <p className="text-white/50 text-sm leading-relaxed mb-4">
                AI-powered business communication platform.
                <br />
                Powered by AI, spoken in नेपाली.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
                Product
              </h4>
              <ul className="space-y-2.5">
                {["Voice AI", "SMS Platform", "Smart Surveys", "Analytics"].map(
                  (item) => (
                    <li key={item}>
                      <a
                        href="#products"
                        className="text-white/50 hover:text-white transition-colors text-sm"
                      >
                        {item}
                      </a>
                    </li>
                  )
                )}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
                Company
              </h4>
              <ul className="space-y-2.5">
                {["About", "Careers", "Blog", "Contact"].map((item) => (
                  <li key={item}>
                    <a
                      href="#"
                      className="text-white/50 hover:text-white transition-colors text-sm"
                    >
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm uppercase tracking-wider">
                Contact
              </h4>
              <ul className="space-y-2.5 text-sm text-white/50">
                <li>hello@ring.ai</li>
                <li>+977 1-XXXXXXX</li>
                <li>Kathmandu, Nepal</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-white/30 text-sm">
              &copy; {new Date().getFullYear()} Ring AI. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-white/30">
              <a href="#" className="hover:text-white/60 transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-white/60 transition-colors">
                Terms
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
