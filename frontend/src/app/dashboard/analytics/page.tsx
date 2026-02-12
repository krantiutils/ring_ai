"use client";

import { useEffect, useState } from "react";
import { Search, FileDown, Phone, MessageSquare, Headphones, Clock, DollarSign, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import StatWidget from "@/components/dashboard/StatWidget";
import { api } from "@/lib/api";
import { formatNumber, formatDuration } from "@/lib/utils";
import type { OverviewAnalytics, CarrierStat } from "@/types/dashboard";

const STATUS_COLORS: Record<string, string> = {
  Answered: "#10b981",
  Unanswered: "#94a3b8",
  HungUp: "#f59e0b",
  Failed: "#ef4444",
  Terminated: "#8b5cf6",
  Completed: "#3b82f6",
};

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewAnalytics | null>(null);
  const [carriers, setCarriers] = useState<CarrierStat[]>([]);
  const [searchCampaign, setSearchCampaign] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [overviewData, carrierData] = await Promise.allSettled([
          api.getOverview(),
          api.getCarrierBreakdown(),
        ]);
        if (overviewData.status === "fulfilled") setOverview(overviewData.value);
        if (carrierData.status === "fulfilled") setCarriers(carrierData.value);
      } catch {
        // fallback
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statusBreakdown = overview?.campaigns_by_status || {};
  const callStatusData = [
    { name: "Answered", value: statusBreakdown["answered"] || 0 },
    { name: "Unanswered", value: statusBreakdown["unanswered"] || 0 },
    { name: "HungUp", value: statusBreakdown["hung_up"] || 0 },
    { name: "Failed", value: statusBreakdown["failed"] || 0 },
    { name: "Terminated", value: statusBreakdown["terminated"] || 0 },
    { name: "Completed", value: statusBreakdown["completed"] || 0 },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by campaign name"
            value={searchCampaign}
            onChange={(e) => setSearchCampaign(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by phone number"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <button className="ml-auto flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          <FileDown className="w-4 h-4" />
          Export as PDF
        </button>
      </div>

      {/* Call Status Breakdown Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Call Status Breakdown</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={callStatusData} barSize={44}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "13px" }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {callStatusData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || "#6366f1"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Carrier Summary */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Carrier Summary</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Carrier</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Success</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Fail</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Pickup %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {carriers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-400 text-sm">No carrier data</td>
              </tr>
            ) : (
              carriers.map((c) => (
                <tr key={c.carrier} className="hover:bg-gray-50/50">
                  <td className="px-6 py-3 text-sm font-medium text-gray-900">{c.carrier}</td>
                  <td className="px-6 py-3 text-sm text-green-600">{c.successful}</td>
                  <td className="px-6 py-3 text-sm text-red-500">{c.failed}</td>
                  <td className="px-6 py-3 text-sm text-gray-600">{c.pickup_rate.toFixed(1)}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Stat Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatWidget
          title="Total Credits Used"
          value={formatNumber(overview?.total_credits_consumed || 0)}
          icon={DollarSign}
          iconColor="text-red-500"
        />
        <StatWidget
          title="Current Attempted Calls"
          value={formatNumber(overview?.total_reach || 0)}
          subtitle={`Successful: ${statusBreakdown["completed"] || 0} / Failed: ${statusBreakdown["failed"] || 0}`}
          icon={Phone}
          iconColor="text-blue-500"
        />
        <StatWidget
          title="Total SMS Sent"
          value="0"
          icon={MessageSquare}
          iconColor="text-purple-500"
        />
        <StatWidget
          title="Current Playback %"
          value="0%"
          subtitle="Voice message listen time"
          icon={Headphones}
          iconColor="text-violet-500"
        />
        <StatWidget
          title="Current Pickup Rate %"
          value={overview ? `${overview.delivery_rate.toFixed(1)}%` : "0%"}
          subtitle="Percentage of successful call pickups"
          icon={Target}
          iconColor="text-emerald-500"
        />
        <StatWidget
          title="Current Call Duration"
          value={formatDuration(0)}
          icon={Clock}
          iconColor="text-orange-500"
        />
      </div>
    </div>
  );
}
