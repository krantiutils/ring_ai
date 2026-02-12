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
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
          <Coins className="w-4 h-4 text-amber-500" />
          <span className="font-medium text-gray-700">
            {credits ? `${credits.balance} | ${credits.total_purchased} Credits` : "-- Credits"}
          </span>
        </div>

        <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5 text-gray-500" />
        </button>

        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
          <User className="w-4 h-4 text-indigo-600" />
        </div>
      </div>
    </header>
  );
}
