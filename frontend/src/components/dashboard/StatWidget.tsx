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
  iconColor = "text-[#FF6B6B]",
  className,
}: StatWidgetProps) {
  return (
    <div className={cn("bg-white rounded-xl border border-[#FF6B6B]/15 p-5", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-[#2D2D2D]/60 font-medium">{title}</p>
          <p className="text-2xl font-bold text-[#2D2D2D]">{value}</p>
          {subtitle && (
            <p className="text-xs text-[#2D2D2D]/40">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={cn("p-2 rounded-lg bg-[#FFF8F0]", iconColor)}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
