"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface ClayCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export default function ClayCard({
  children,
  className = "",
  hover = true,
}: ClayCardProps) {
  return (
    <motion.div
      className={`clay-surface p-6 md:p-8 ${className}`}
      whileHover={
        hover
          ? {
              y: -4,
              rotate: 0.5,
              transition: { type: "spring", stiffness: 300, damping: 20 },
            }
          : undefined
      }
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
