"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Megaphone } from "lucide-react";

const COLORS = ["#FF6B6B", "#4ECDC4", "#FFD93D", "#ff8787"];

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
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">Campaign Types</h3>
        <div className="h-[250px] flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#FFF8F0] flex items-center justify-center">
            <Megaphone className="w-6 h-6 text-[#FF6B6B]/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#2D2D2D]/60">No campaign data yet</p>
            <p className="text-xs text-[#2D2D2D]/40 mt-1">Create your first campaign to see analytics</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
      <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">Campaign Types</h3>
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
            contentStyle={{ borderRadius: "8px", border: "1px solid #FF6B6B26", fontSize: "13px" }}
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
