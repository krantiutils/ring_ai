"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  BarChart3,
  CreditCard,
  Receipt,
  FileText,
  Puzzle,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/credit-purchase", label: "Credit Purchase History", icon: CreditCard },
  { href: "/dashboard/credit-usage", label: "Credit Usage History", icon: Receipt },
  { href: "/dashboard/templates", label: "Message Templates", icon: FileText },
  { href: "/dashboard/integrations", label: "Integrations", icon: Puzzle },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col bg-[#1a1a2e] text-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#4ECDC4] to-[#44a8a0] text-sm font-bold">
          R
        </div>
        <span className="text-lg font-semibold tracking-tight">Ring AI</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
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
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white/90",
                  )}
                >
                  <Icon size={18} />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User / Logout */}
      <div className="border-t border-white/10 px-4 py-3">
        {user && (
          <p className="mb-2 truncate text-xs text-white/50">{user.email}</p>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
