"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Headphones } from "lucide-react";
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
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <h3 className="text-sm font-semibold text-[#2D2D2D] mb-1">Playback Distribution</h3>
        <p className="text-xs text-[#2D2D2D]/40 mb-4">How long users listen to voice message</p>
        <div className="h-[250px] flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#FFF8F0] flex items-center justify-center">
            <Headphones className="w-6 h-6 text-[#FF6B6B]/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-[#2D2D2D]/60">No playback data yet</p>
            <p className="text-xs text-[#2D2D2D]/40 mt-1">Distribution appears after voice campaigns run</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
      <h3 className="text-sm font-semibold text-[#2D2D2D] mb-1">Playback Distribution</h3>
      <p className="text-xs text-[#2D2D2D]/40 mb-4">How long users listen to voice message</p>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} barSize={40}>
          <CartesianGrid strokeDasharray="3 3" stroke="#FF6B6B15" />
          <XAxis dataKey="range" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: "8px", border: "1px solid #FF6B6B26", fontSize: "13px" }}
          />
          <Bar dataKey="count" fill="#FF6B6B" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
