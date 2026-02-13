"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Brain } from "lucide-react";
import type { IntentBucket } from "@/types/dashboard";

const INTENT_COLORS: Record<string, string> = {
  payment: "#4ECDC4",
  complaint: "#FF6B6B",
  inquiry: "#FFD93D",
  confirmation: "#45B7D1",
  "opt-out": "#ff8787",
  "transfer-request": "#96CEB4",
  greeting: "#FFEAA7",
  "follow-up": "#DDA0DD",
  other: "#94a3b8",
};

interface IntentDistributionChartProps {
  buckets: IntentBucket[];
  totalClassified: number;
}

function formatIntentLabel(intent: string): string {
  return intent
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function IntentDistributionChart({ buckets, totalClassified }: IntentDistributionChartProps) {
  const chartData = buckets.map((b) => ({
    name: formatIntentLabel(b.intent),
    intent: b.intent,
    count: b.count,
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">Intent Distribution</h3>
        <div className="h-[250px] flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#FFF8F0] flex items-center justify-center">
            <Brain className="w-6 h-6 text-[#FF6B6B]/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#2D2D2D]/60">No intent data yet</p>
            <p className="text-xs text-[#2D2D2D]/40 mt-1">Run intent backfill to classify caller intents</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#2D2D2D]">Intent Distribution</h3>
        <span className="text-xs text-[#2D2D2D]/50">{totalClassified} classified</span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} barSize={36}>
          <CartesianGrid strokeDasharray="3 3" stroke="#FF6B6B15" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} angle={-25} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #FF6B6B26", fontSize: "13px" }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={INTENT_COLORS[entry.intent] || "#94a3b8"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
