"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { PlaybackDistribution } from "@/types/dashboard";

interface PlaybackDistributionChartProps {
  data: PlaybackDistribution | null;
}

export default function PlaybackDistributionChart({ data }: PlaybackDistributionChartProps) {
  const chartData = data
    ? [
        { range: "0-25%", count: data.bucket_0_25 },
        { range: "26-50%", count: data.bucket_26_50 },
        { range: "51-75%", count: data.bucket_51_75 },
        { range: "76-100%", count: data.bucket_76_100 },
      ]
    : [];

  if (!data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Playback Distribution</h3>
        <p className="text-xs text-gray-400 mb-4">How long users listen to voice message</p>
        <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Playback Distribution</h3>
      <p className="text-xs text-gray-400 mb-4">How long users listen to voice message</p>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} barSize={40}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="range" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" }}
          />
          <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
