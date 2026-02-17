"use client";

import { usePathname } from "next/navigation";
import { Bell, Coins, User } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/campaigns": "Campaigns",
  "/dashboard/analytics": "Analytics",
  "/dashboard/credit-purchase": "Credit Purchase History",
  "/dashboard/credit-usage": "Credit Usage History",
  "/dashboard/templates": "Message Templates",
  "/dashboard/knowledge-bases": "Knowledge Base",
  "/dashboard/tts-providers": "TTS Providers",
  "/dashboard/insights": "Conversation Insights",
  "/dashboard/integrations": "Integrations",
  "/dashboard/settings": "Settings",
};

export default function TopBar() {
  const pathname = usePathname();
  const title = pageTitles[pathname] || "Dashboard";
  const [credits, setCredits] = useState<{ balance: number; total_purchased: number } | null>(null);

  useEffect(() => {
    api.getCreditBalance().then(setCredits).catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-[#E2E8F0] bg-[#FAFAFA]/95 px-4 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-[#0F172A] md:text-xl">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm md:flex">
          <Coins className="h-4 w-4 text-[#0052FF]" />
          <span className="font-mono-label text-[11px] uppercase tracking-[0.12em] text-[#0F172A]">
            {credits ? `${credits.balance} | ${credits.total_purchased} Credits` : "0 Credits"}
          </span>
        </div>

        <button className="relative rounded-xl p-2 transition-colors hover:bg-[#F1F5F9]">
          <Bell className="h-5 w-5 text-[#0F172A]/50" />
        </button>

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0052FF]/15">
          <User className="h-4 w-4 text-[#0052FF]" />
        </div>
      </div>
    </header>
  );
}
