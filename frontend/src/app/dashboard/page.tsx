"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Phone,
  MessageSquare,
  Clock,
  Hash,
  TrendingUp,
  CreditCard,
  Activity,
  Headphones,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getCampaignsByCategory,
  getCreditBalance,
  getDashboardPlayback,
  getOverviewAnalytics,
  listCampaigns,
} from "@/lib/api";
import type {
  CategoryCount,
  CreditBalance,
  DashboardPlaybackWidget,
  OverviewAnalytics,
  Campaign,
} from "@/lib/api";

const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444"];
const BAR_COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#64748b", "#22c55e"];

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-blue-600/10 flex items-center justify-center">
          <Icon size={18} className="text-blue-400" />
        </div>
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardHome() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<OverviewAnalytics | null>(null);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [playback, setPlayback] = useState<DashboardPlaybackWidget | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const orgId = user.id; // org_id placeholder

    Promise.allSettled([
      getOverviewAnalytics(orgId),
      getCampaignsByCategory(),
      getCreditBalance(orgId),
      getDashboardPlayback(orgId),
      listCampaigns({ page_size: 100 }),
    ]).then(([ovRes, catRes, credRes, pbRes, campRes]) => {
      if (ovRes.status === "fulfilled") setOverview(ovRes.value);
      if (catRes.status === "fulfilled") setCategories(catRes.value);
      if (credRes.status === "fulfilled") setCredits(credRes.value);
      if (pbRes.status === "fulfilled") setPlayback(pbRes.value);
      if (campRes.status === "fulfilled") setCampaigns(campRes.value.items);
      setLoading(false);
    });
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  // Derive stats
  const totalCampaigns = campaigns.length;
  const smsCampaigns = campaigns.filter((c) => c.category === "text").length;
  const phoneCampaigns = campaigns.filter((c) => c.category === "voice").length;
  const surveyCampaigns = campaigns.filter((c) => c.category === "survey").length;
  const combinedCampaigns = campaigns.filter((c) => c.category === "combined").length;

  const totalCalls = overview?.total_calls ?? 0;
  const totalSms = overview?.total_sms ?? 0;
  const successfulCalls = overview?.campaigns_by_status?.completed ?? 0;
  const failedCalls = overview?.campaigns_by_status?.failed ?? 0;

  const avgDuration = overview?.avg_call_duration_seconds ?? 0;
  const totalDurationHrs = Math.floor(avgDuration / 3600);
  const totalDurationMin = Math.floor((avgDuration % 3600) / 60);

  // Call outcomes for bar chart
  const callOutcomesData = overview
    ? Object.entries(overview.campaigns_by_status).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }))
    : [];

  // Credit usage over time
  const creditOverTime = overview?.credits_by_period?.map((p) => ({
    date: p.period.slice(5), // MM-DD
    credits: p.credits,
  })) ?? [];

  // Playback distribution
  const playbackDistData = playback?.distribution ?? [];

  // Campaign type distribution for pie chart
  const pieData = categories.map((c) => ({
    name: c.category.charAt(0).toUpperCase() + c.category.slice(1),
    value: c.count,
  }));

  // Top performing campaign
  const topCampaign = campaigns.reduce<{ name: string; rate: number } | null>(
    (best, c) => {
      // We don't have per-campaign delivery rate in list, so we skip for now
      return best;
    },
    null,
  );

  return (
    <div className="space-y-6">
      {/* Stat cards row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={CreditCard}
          label="Credits Purchased"
          value={credits?.total_purchased?.toFixed(0) ?? "0"}
        />
        <StatCard
          icon={CreditCard}
          label="Total Credits Used"
          value={credits?.total_consumed?.toFixed(0) ?? "0"}
        />
        <StatCard
          icon={CreditCard}
          label="Remaining Credits"
          value={credits?.balance?.toFixed(0) ?? "0"}
        />
        <StatCard
          icon={TrendingUp}
          label="Credits Top-up"
          value={credits?.total_purchased?.toFixed(0) ?? "0"}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Campaign Types Pie */}
        <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Campaign Types</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1d29",
                    border: "1px solid #374151",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-600">
              No campaign data
            </div>
          )}
        </div>

        {/* Call Outcomes Bar */}
        <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Call Outcomes</h3>
          {callOutcomesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={callOutcomesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  axisLine={{ stroke: "#374151" }}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  axisLine={{ stroke: "#374151" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1d29",
                    border: "1px solid #374151",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {callOutcomesData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-600">
              No call data
            </div>
          )}
        </div>
      </div>

      {/* Stat cards row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Hash}
          label="Total Campaign(s)"
          value={totalCampaigns}
          sub={`SMS: ${smsCampaigns}, Phone: ${phoneCampaigns}, Survey: ${surveyCampaigns}, Combined: ${combinedCampaigns}`}
        />
        <StatCard
          icon={Phone}
          label="Total Outbound Calls"
          value={totalCalls}
          sub={`Successful: ${successfulCalls}, Failed: ${failedCalls}`}
        />
        <StatCard
          icon={MessageSquare}
          label="Total Outbound SMS"
          value={totalSms}
        />
        <StatCard
          icon={Clock}
          label="Total Call Duration"
          value={`${totalDurationHrs} Hrs, ${totalDurationMin} min`}
        />
      </div>

      {/* Row 3: more stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={Activity}
          label="Total Owned Numbers"
          value="--"
          sub="Phone numbers registered"
        />
        <StatCard
          icon={Headphones}
          label="Avg Playback %"
          value={
            playback?.avg_playback_percentage != null
              ? `${playback.avg_playback_percentage.toFixed(1)}%`
              : "--"
          }
          sub="Voice message listen time"
        />
        <StatCard
          icon={TrendingUp}
          label="Top Performing Campaign"
          value={topCampaign?.name ?? "--"}
          sub={topCampaign ? `${topCampaign.rate}% success rate` : ""}
        />
      </div>

      {/* Bottom charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Playback Distribution */}
        <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-1">
            Playback Distribution
          </h3>
          <p className="text-xs text-gray-600 mb-4">
            How long users listen to voice message
          </p>
          {playbackDistData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={playbackDistData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  axisLine={{ stroke: "#374151" }}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  axisLine={{ stroke: "#374151" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1d29",
                    border: "1px solid #374151",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-600">
              No playback data
            </div>
          )}
        </div>

        {/* Credit Usage Over Time */}
        <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-medium text-gray-400 mb-4">
            Credit Usage Over Time
          </h3>
          {creditOverTime.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={creditOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  axisLine={{ stroke: "#374151" }}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  axisLine={{ stroke: "#374151" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1d29",
                    border: "1px solid #374151",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="credits"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Credits"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-gray-600">
              No credit data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
