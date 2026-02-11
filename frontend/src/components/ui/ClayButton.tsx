"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface ClayButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

const variantStyles = {
  primary:
    "bg-clay-coral text-white shadow-[0_4px_16px_rgba(255,107,107,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]",
  secondary:
    "bg-clay-teal text-white shadow-[0_4px_16px_rgba(78,205,196,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]",
  outline:
    "bg-white/80 text-clay-dark border-2 border-clay-coral/20 shadow-[0_4px_16px_rgba(120,80,60,0.1),inset_0_1px_0_rgba(255,255,255,0.6)]",
};

const sizeStyles = {
  sm: "px-5 py-2.5 text-sm rounded-2xl",
  md: "px-7 py-3.5 text-base rounded-2xl",
  lg: "px-9 py-4.5 text-lg rounded-3xl",
};

export default function ClayButton({
  children,
  variant = "primary",
  size = "md",
  href,
  className = "",
  onClick,
  disabled,
  type: buttonType,
}: ClayButtonProps) {
  const classes = `${variantStyles[variant]} ${sizeStyles[size]} font-semibold cursor-pointer inline-flex items-center justify-center gap-2 transition-shadow ${className}`;

  if (href) {
    return (
      <motion.a
        href={href}
        className={classes}
        whileHover={{ scale: 1.03, y: -1 }}
        whileTap={{ scale: 0.93, y: 2 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button
      className={classes}
      whileHover={{ scale: 1.03, y: -1 }}
      whileTap={{ scale: 0.93, y: 2 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      onClick={onClick}
      disabled={disabled}
      type={buttonType}
    >
      {children}
    </motion.button>
  );
}
