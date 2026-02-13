"use client";

import { useEffect, useState } from "react";
import { Search, FileDown, Phone, MessageSquare, Headphones, Clock, DollarSign, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import StatWidget from "@/components/dashboard/StatWidget";
import IntentDistributionChart from "@/components/dashboard/charts/IntentDistributionChart";
import { api } from "@/lib/api";
import { formatNumber, formatDuration } from "@/lib/utils";
import type { OverviewAnalytics, CarrierStat, IntentDistribution } from "@/types/dashboard";

const STATUS_COLORS: Record<string, string> = {
  Answered: "#4ECDC4",
  Unanswered: "#94a3b8",
  HungUp: "#FFD93D",
  Failed: "#FF6B6B",
  Terminated: "#ff8787",
  Completed: "#4ECDC4",
};

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewAnalytics | null>(null);
  const [carriers, setCarriers] = useState<CarrierStat[]>([]);
  const [intents, setIntents] = useState<IntentDistribution | null>(null);
  const [searchCampaign, setSearchCampaign] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [overviewData, carrierData, intentData] = await Promise.allSettled([
          api.getOverview(),
          api.getCarrierBreakdown(),
          api.getIntentDistribution(),
        ]);
        if (overviewData.status === "fulfilled") setOverview(overviewData.value);
        if (carrierData.status === "fulfilled") setCarriers(carrierData.value);
        if (intentData.status === "fulfilled") setIntents(intentData.value);
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF6B6B]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D]/40" />
          <input
            type="text"
            placeholder="Search by campaign name"
            value={searchCampaign}
            onChange={(e) => setSearchCampaign(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-transparent"
          />
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D]/40" />
          <input
            type="text"
            placeholder="Search by phone number"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-transparent"
          />
        </div>
        <button className="ml-auto flex items-center gap-2 bg-[#FF6B6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#ff5252] transition-colors">
          <FileDown className="w-4 h-4" />
          Export as PDF
        </button>
      </div>

      {/* Call Status Breakdown Chart */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">Call Status Breakdown</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={callStatusData} barSize={44}>
            <CartesianGrid strokeDasharray="3 3" stroke="#FF6B6B15" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #FF6B6B26", fontSize: "13px" }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {callStatusData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || "#FF6B6B"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Intent Distribution */}
      <IntentDistributionChart
        buckets={intents?.buckets || []}
        totalClassified={intents?.total_classified || 0}
      />

      {/* Carrier Summary */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#FF6B6B]/10">
          <h3 className="text-sm font-semibold text-[#2D2D2D]">Carrier Summary</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#FF6B6B]/10 bg-[#FFF8F0]/50">
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Carrier</th>
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Success</th>
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Fail</th>
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Pickup %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FF6B6B]/10">
            {carriers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-[#FFF8F0] flex items-center justify-center">
                      <Phone className="w-6 h-6 text-[#FF6B6B]/40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#2D2D2D]/60">No carrier data yet</p>
                      <p className="text-xs text-[#2D2D2D]/40 mt-1">Carrier stats will appear after your first campaign</p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              carriers.map((c) => (
                <tr key={c.carrier} className="hover:bg-[#FFF8F0]/50">
                  <td className="px-6 py-3 text-sm font-medium text-[#2D2D2D]">{c.carrier}</td>
                  <td className="px-6 py-3 text-sm text-[#4ECDC4]">{c.successful}</td>
                  <td className="px-6 py-3 text-sm text-[#FF6B6B]">{c.failed}</td>
                  <td className="px-6 py-3 text-sm text-[#2D2D2D]/60">{c.pickup_rate.toFixed(1)}%</td>
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
          iconColor="text-[#FF6B6B]"
        />
        <StatWidget
          title="Current Attempted Calls"
          value={formatNumber(overview?.total_reach || 0)}
          subtitle={`Successful: ${statusBreakdown["completed"] || 0} / Failed: ${statusBreakdown["failed"] || 0}`}
          icon={Phone}
          iconColor="text-[#4ECDC4]"
        />
        <StatWidget
          title="Total SMS Sent"
          value="0"
          icon={MessageSquare}
          iconColor="text-[#FFD93D]"
        />
        <StatWidget
          title="Current Playback %"
          value="0%"
          subtitle="Voice message listen time"
          icon={Headphones}
          iconColor="text-[#FF6B6B]"
        />
        <StatWidget
          title="Current Pickup Rate %"
          value={overview ? `${overview.delivery_rate.toFixed(1)}%` : "0%"}
          subtitle="Percentage of successful call pickups"
          icon={Target}
          iconColor="text-[#4ECDC4]"
        />
        <StatWidget
          title="Current Call Duration"
          value={formatDuration(0)}
          icon={Clock}
          iconColor="text-[#FFD93D]"
        />
      </div>
    </div>
  );
}
