"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatWidgetProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  className?: string;
}

export default function StatWidget({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-[#0052FF]",
  className,
}: StatWidgetProps) {
  return (
    <div className={cn("surface-card rounded-2xl border border-[#E2E8F0] bg-white p-5", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="font-mono-label text-[11px] uppercase tracking-[0.12em] text-[#64748B]">{title}</p>
          <p className="text-2xl font-semibold text-[#0F172A]">{value}</p>
          {subtitle && (
            <p className="text-xs text-[#64748B]">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={cn("rounded-xl bg-[#F8FAFC] p-2.5", iconColor)}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
