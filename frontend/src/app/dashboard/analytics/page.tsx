"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  CreditCard,
  Download,
  Phone,
  MessageSquare,
  Headphones,
  Clock,
  TrendingUp,
  Search,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  getOverviewAnalytics,
  getCarrierBreakdown,
  listCampaigns,
  getCampaignAnalytics,
} from "@/lib/api";
import type {
  OverviewAnalytics,
  CarrierBreakdown,
  Campaign,
  CampaignAnalytics,
} from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  Answered: "#22c55e",
  Unanswered: "#f59e0b",
  HungUp: "#ef4444",
  Failed: "#dc2626",
  Terminated: "#64748b",
  Completed: "#3b82f6",
};

function StatBox({
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
    <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className="text-blue-400" />
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<OverviewAnalytics | null>(null);
  const [carriers, setCarriers] = useState<CarrierBreakdown[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [campAnalytics, setCampAnalytics] = useState<CampaignAnalytics | null>(null);
  const [searchName, setSearchName] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const orgId = user.id;
    Promise.allSettled([
      getOverviewAnalytics(orgId),
      getCarrierBreakdown(),
      listCampaigns({ page_size: 100 }),
    ]).then(([ovRes, carrRes, campRes]) => {
      if (ovRes.status === "fulfilled") setOverview(ovRes.value);
      if (carrRes.status === "fulfilled") setCarriers(carrRes.value);
      if (campRes.status === "fulfilled") setCampaigns(campRes.value.items);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!selectedCampaign) {
      setCampAnalytics(null);
      return;
    }
    getCampaignAnalytics(selectedCampaign)
      .then(setCampAnalytics)
      .catch(() => setCampAnalytics(null));
  }, [selectedCampaign]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Loading analytics...
      </div>
    );
  }

  // Call status for bar chart
  const statusData = campAnalytics
    ? Object.entries(campAnalytics.status_breakdown).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }))
    : overview
      ? Object.entries(overview.campaigns_by_status).map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          value,
        }))
      : [];

  const totalCalls = overview?.total_calls ?? 0;
  const totalSms = overview?.total_sms ?? 0;
  const creditsUsed = overview?.credits_consumed ?? 0;
  const avgDuration = overview?.avg_call_duration_seconds ?? 0;
  const durationHrs = Math.floor(avgDuration / 3600);
  const durationMin = Math.floor((avgDuration % 3600) / 60);
  const deliveryRate = overview?.overall_delivery_rate;

  return (
    <div className="space-y-6">
      {/* Search and export controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            type="text"
            placeholder="Search by campaign name"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#1a1d29] border border-gray-800 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="relative min-w-[180px] max-w-xs">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            type="text"
            placeholder="Search by phone number"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#1a1d29] border border-gray-800 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={selectedCampaign}
          onChange={(e) => setSelectedCampaign(e.target.value)}
          className="px-3 py-2 bg-[#1a1d29] border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Campaigns</option>
          {campaigns
            .filter((c) =>
              searchName
                ? c.name.toLowerCase().includes(searchName.toLowerCase())
                : true,
            )
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>

        <button className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Download size={16} />
          Export as PDF
        </button>
      </div>

      {/* Call Status Breakdown chart */}
      <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">
          Call Status Breakdown
        </h3>
        {statusData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={statusData}>
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
                {statusData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      STATUS_COLORS[entry.name] ??
                      ["#6366f1", "#f59e0b", "#ef4444", "#22c55e", "#64748b"][
                        i % 5
                      ]
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-600">
            No data available
          </div>
        )}
      </div>

      {/* Carrier Summary Table */}
      <div className="bg-[#1a1d29] rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-medium text-gray-400">Carrier Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Carrier
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Success
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Fail
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Pickup %
                </th>
              </tr>
            </thead>
            <tbody>
              {carriers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-500">
                    No carrier data
                  </td>
                </tr>
              ) : (
                carriers.map((c) => (
                  <tr
                    key={c.carrier}
                    className="border-b border-gray-800/50 hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3 text-white">{c.carrier}</td>
                    <td className="px-5 py-3 text-green-400">{c.success}</td>
                    <td className="px-5 py-3 text-red-400">{c.fail}</td>
                    <td className="px-5 py-3 text-gray-300">{c.pickup_pct}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatBox
          icon={CreditCard}
          label="Total Credits Used"
          value={creditsUsed.toFixed(1)}
        />
        <StatBox
          icon={Phone}
          label="Current Attempted Calls"
          value={totalCalls}
          sub={`Successful: ${overview?.campaigns_by_status?.completed ?? 0}, Failed: ${overview?.campaigns_by_status?.failed ?? 0}`}
        />
        <StatBox icon={MessageSquare} label="Total SMS Sent" value={totalSms} />
        <StatBox
          icon={Headphones}
          label="Current Playback %"
          value={
            campAnalytics?.completion_rate != null
              ? `${campAnalytics.completion_rate.toFixed(1)}%`
              : "--"
          }
          sub="Voice message listen time"
        />
        <StatBox
          icon={TrendingUp}
          label="Current Pickup Rate %"
          value={
            deliveryRate != null ? `${(deliveryRate * 100).toFixed(1)}%` : "--"
          }
          sub="Percentage of successful call pickups"
        />
        <StatBox
          icon={Clock}
          label="Current Call Duration"
          value={`${durationHrs} Hrs, ${durationMin} min`}
        />
      </div>
    </div>
  );
}
