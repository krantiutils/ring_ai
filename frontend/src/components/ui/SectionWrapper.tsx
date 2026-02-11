"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface SectionWrapperProps {
  id: string;
  children: ReactNode;
  className?: string;
  bg?: string;
}

export default function SectionWrapper({
  id,
  children,
  className = "",
  bg = "bg-clay-cream",
}: SectionWrapperProps) {
  return (
    <section id={id} className={`${bg} clay-texture py-24 md:py-32 ${className}`}>
      <motion.div
        className="mx-auto max-w-7xl px-6 md:px-8"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
      >
        {children}
      </motion.div>
    </section>
  );
}
