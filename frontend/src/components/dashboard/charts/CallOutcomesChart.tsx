"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Phone } from "lucide-react";

interface CallOutcomesChartProps {
  data: Record<string, number>;
}

const OUTCOME_COLORS: Record<string, string> = {
  Completed: "#4D7CFF",
  Unanswered: "#94a3b8",
  HungUp: "#1D4ED8",
  Failed: "#0052FF",
  Terminated: "#4D7CFF",
};

export default function CallOutcomesChart({ data }: CallOutcomesChartProps) {
  const chartData = Object.entries(data).map(([name, value]) => ({
    name,
    value,
    fill: OUTCOME_COLORS[name] || "#0052FF",
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
        <h3 className="text-sm font-semibold text-[#0F172A] mb-4">Call Outcomes</h3>
        <div className="h-[250px] flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#FAFAFA] flex items-center justify-center">
            <Phone className="w-6 h-6 text-[#0052FF]/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#0F172A]/60">No call data yet</p>
            <p className="text-xs text-[#0F172A]/40 mt-1">Outcomes will appear after calls are placed</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
      <h3 className="text-sm font-semibold text-[#0F172A] mb-4">Call Outcomes</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} barSize={36}>
          <CartesianGrid strokeDasharray="3 3" stroke="#0052FF15" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #0052FF26", fontSize: "13px" }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
