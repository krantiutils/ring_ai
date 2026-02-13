"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  BarChart3,
  TrendingUp,
  CreditCard,
  Receipt,
  MessageSquare,
  Plug,
  Settings,
  ChevronLeft,
  ChevronRight,
  Mic,
  BookOpen,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/roi", label: "ROI Analytics", icon: TrendingUp },
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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-[#FFF8F0] text-[#2D2D2D] flex flex-col z-50 transition-all duration-300 border-r border-[#FF6B6B]/20",
        collapsed ? "w-[72px]" : "w-[260px]",
      )}
    >
      <div className="flex items-center gap-3 px-5 h-16 border-b border-[#FF6B6B]/15">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF6B6B] to-[#ff8787] flex items-center justify-center font-bold text-sm text-white shrink-0">
          R
        </div>
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight text-[#2D2D2D]">Ring AI</span>
        )}
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
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[#FF6B6B] text-white"
                      : "text-[#2D2D2D]/60 hover:text-[#2D2D2D] hover:bg-[#FF6B6B]/10",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-12 border-t border-[#FF6B6B]/15 text-[#2D2D2D]/40 hover:text-[#FF6B6B] transition-colors"
      >
        {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
      </button>
    </aside>
  );
}
