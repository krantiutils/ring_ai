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
      <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
        <h3 className="text-sm font-semibold text-[#0F172A] mb-4">Credit Usage Over Time</h3>
        <div className="h-[250px] flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#FAFAFA] flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-[#0052FF]/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#0F172A]/60">No usage data yet</p>
            <p className="text-xs text-[#0F172A]/40 mt-1">Credit trends will appear as you use credits</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
      <h3 className="text-sm font-semibold text-[#0F172A] mb-4">Credit Usage Over Time</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#0052FF15" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #0052FF26", fontSize: "13px" }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
          <Line
            type="monotone"
            dataKey="message_credits"
            name="Message"
            stroke="#0052FF"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="call_credits"
            name="Call"
            stroke="#4D7CFF"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
