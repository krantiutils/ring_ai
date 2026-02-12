"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { CreditUsagePoint } from "@/types/dashboard";

interface CreditUsageChartProps {
  data: CreditUsagePoint[];
}

export default function CreditUsageChart({ data }: CreditUsageChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Credit Usage Over Time</h3>
        <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Credit Usage Over Time</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
          <Line
            type="monotone"
            dataKey="message_credits"
            name="Message"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="call_credits"
            name="Call"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
