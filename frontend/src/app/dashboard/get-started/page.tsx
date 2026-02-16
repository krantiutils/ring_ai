"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Mic, Plug, Megaphone, Coins } from "lucide-react";

const STEPS = [
  {
    title: "Prepare Message Templates",
    description: "Review and manage reusable voice/text scripts before launch.",
    href: "/dashboard/templates",
    icon: BookOpen,
  },
  {
    title: "Configure Voice Providers",
    description: "Pick voices and test synthesis quality for your campaigns.",
    href: "/dashboard/tts-providers",
    icon: Mic,
  },
  {
    title: "Connect Integrations",
    description: "Generate API keys and wire external systems.",
    href: "/dashboard/integrations",
    icon: Plug,
  },
  {
    title: "Review Campaigns",
    description: "Track progress and lifecycle for created campaigns.",
    href: "/dashboard/campaigns",
    icon: Megaphone,
  },
  {
    title: "Monitor Credits",
    description: "Check purchase and usage history to avoid interruptions.",
    href: "/dashboard/credit-purchase",
    icon: Coins,
  },
];

export default function GetStartedPage() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <h2 className="text-base font-semibold text-[#2D2D2D]">Suggested Setup Flow</h2>
        <p className="text-sm text-[#2D2D2D]/60 mt-1">
          Follow this order to keep the campaign flow understandable and avoid dead ends.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <Link
              key={step.title}
              href={step.href}
              className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5 hover:border-[#FF6B6B]/35 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#FF6B6B]/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-[#FF6B6B]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#2D2D2D]">{step.title}</h3>
                    <p className="text-xs text-[#2D2D2D]/50 mt-1">{step.description}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-[#2D2D2D]/40 mt-1 shrink-0" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
