"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DollarSign } from "lucide-react";
import type { CreditUsagePoint } from "@/types/dashboard";

interface CreditUsageChartProps {
  data: CreditUsagePoint[];
}

export default function CreditUsageChart({ data }: CreditUsageChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">Credit Usage Over Time</h3>
        <div className="h-[250px] flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#FFF8F0] flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-[#FF6B6B]/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#2D2D2D]/60">No usage data yet</p>
            <p className="text-xs text-[#2D2D2D]/40 mt-1">Credit trends will appear as you use credits</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
      <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">Credit Usage Over Time</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#FF6B6B15" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #FF6B6B26", fontSize: "13px" }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
          <Line
            type="monotone"
            dataKey="message_credits"
            name="Message"
            stroke="#FF6B6B"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="call_credits"
            name="Call"
            stroke="#4ECDC4"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
