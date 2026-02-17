"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Megaphone } from "lucide-react";

const COLORS = ["#0052FF", "#4D7CFF", "#1D4ED8", "#4D7CFF"];

interface CampaignTypesChartProps {
  data: Record<string, number>;
}

export default function CampaignTypesChart({ data }: CampaignTypesChartProps) {
  const chartData = Object.entries(data).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
        <h3 className="text-sm font-semibold text-[#0F172A] mb-4">Campaign Types</h3>
        <div className="h-[250px] flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#FAFAFA] flex items-center justify-center">
            <Megaphone className="w-6 h-6 text-[#0052FF]/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#0F172A]/60">No campaign data yet</p>
            <p className="text-xs text-[#0F172A]/40 mt-1">Create your first campaign to see analytics</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
      <h3 className="text-sm font-semibold text-[#0F172A] mb-4">Campaign Types</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={4}
            dataKey="value"
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #0052FF26", fontSize: "13px" }}
          />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "12px" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
