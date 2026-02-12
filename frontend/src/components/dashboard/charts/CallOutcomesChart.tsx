"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Phone } from "lucide-react";

interface CallOutcomesChartProps {
  data: Record<string, number>;
}

const OUTCOME_COLORS: Record<string, string> = {
  Completed: "#4ECDC4",
  Unanswered: "#94a3b8",
  HungUp: "#FFD93D",
  Failed: "#FF6B6B",
  Terminated: "#ff8787",
};

export default function CallOutcomesChart({ data }: CallOutcomesChartProps) {
  const chartData = Object.entries(data).map(([name, value]) => ({
    name,
    value,
    fill: OUTCOME_COLORS[name] || "#FF6B6B",
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">Call Outcomes</h3>
        <div className="h-[250px] flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#FFF8F0] flex items-center justify-center">
            <Phone className="w-6 h-6 text-[#FF6B6B]/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#2D2D2D]/60">No call data yet</p>
            <p className="text-xs text-[#2D2D2D]/40 mt-1">Outcomes will appear after calls are placed</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
      <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">Call Outcomes</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} barSize={36}>
          <CartesianGrid strokeDasharray="3 3" stroke="#FF6B6B15" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #FF6B6B26", fontSize: "13px" }}
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
