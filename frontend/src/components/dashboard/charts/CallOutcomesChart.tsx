"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface CallOutcomesChartProps {
  data: Record<string, number>;
}

const OUTCOME_COLORS: Record<string, string> = {
  Completed: "#10b981",
  Unanswered: "#94a3b8",
  HungUp: "#f59e0b",
  Failed: "#ef4444",
  Terminated: "#8b5cf6",
};

export default function CallOutcomesChart({ data }: CallOutcomesChartProps) {
  const chartData = Object.entries(data).map(([name, value]) => ({
    name,
    value,
    fill: OUTCOME_COLORS[name] || "#6366f1",
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Call Outcomes</h3>
        <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Call Outcomes</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} barSize={36}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" }}
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
