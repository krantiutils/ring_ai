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
  iconColor = "text-indigo-500",
  className,
}: StatWidgetProps) {
  return (
    <div className={cn("bg-white rounded-xl border border-gray-200 p-5", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-400">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={cn("p-2 rounded-lg bg-gray-50", iconColor)}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
