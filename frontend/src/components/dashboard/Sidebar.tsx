"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  BarChart3,
  TrendingUp,
  Lightbulb,
  CreditCard,
  Receipt,
  MessageSquare,
  Plug,
  Settings,
  Mic,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/roi", label: "ROI Analytics", icon: TrendingUp },
  { href: "/dashboard/insights", label: "Insights", icon: Lightbulb },
  { href: "/dashboard/credit-purchase", label: "Credit Purchase History", icon: CreditCard },
  { href: "/dashboard/credit-usage", label: "Credit Usage History", icon: Receipt },
  { href: "/dashboard/templates", label: "Message Templates", icon: MessageSquare },
  { href: "/dashboard/knowledge-bases", label: "Knowledge Base", icon: BookOpen },
  { href: "/dashboard/tts-providers", label: "TTS Providers", icon: Mic },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-0 top-0 z-50 hidden h-screen w-[260px] flex-col border-r border-[#E2E8F0] bg-[#FAFAFA] text-[#0F172A] md:flex"
    >
      <div className="flex h-16 items-center gap-3 border-b border-[#E2E8F0] px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-sm font-bold text-white shadow-[0_4px_14px_rgba(0,82,255,0.28)]">
          R
        </div>
        <div>
          <span className="text-lg font-semibold tracking-tight text-[#0F172A]">Ring AI</span>
          <p className="font-mono-label text-[10px] uppercase tracking-[0.15em] text-[#64748B]">Operations</p>
        </div>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.28)]"
                      : "text-[#0F172A]/65 hover:bg-[#F1F5F9] hover:text-[#0F172A]",
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
