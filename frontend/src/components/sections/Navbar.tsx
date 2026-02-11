"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ClayButton from "@/components/ui/ClayButton";

const navLinks = [
  { label: "Products", href: "#products" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Pricing", href: "#pricing" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/80 backdrop-blur-lg shadow-[0_2px_12px_rgba(120,80,60,0.08)]"
          : "bg-transparent"
      }`}
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="mx-auto max-w-7xl px-6 md:px-8 flex items-center justify-between h-16">
        {/* Logo */}
        <a href="#hero" className="text-xl font-bold text-clay-dark">
          <span className="text-clay-coral">Ring</span> AI
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-clay-dark/70 hover:text-clay-coral transition-colors font-medium"
            >
              {link.label}
            </a>
          ))}
          <ClayButton variant="primary" size="sm" href="#pricing">
            Get Started
          </ClayButton>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 text-clay-dark"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {mobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="md:hidden bg-white/95 backdrop-blur-lg border-t border-clay-coral/10"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="px-6 py-4 flex flex-col gap-3">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-clay-dark/70 hover:text-clay-coral transition-colors font-medium py-2"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <ClayButton
                variant="primary"
                size="sm"
                href="#pricing"
                className="mt-2"
              >
                Get Started
              </ClayButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
