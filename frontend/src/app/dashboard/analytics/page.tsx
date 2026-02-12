"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Search,
  Download,
  Phone,
  MessageSquare,
  Clock,
  TrendingUp,
  CreditCard,
  Headphones,
} from "lucide-react";
import { formatDuration, formatNumber, formatPercent } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { OverviewAnalytics, CampaignAnalytics } from "@/lib/api";
import * as api from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  completed: "#10b981",
  failed: "#ef4444",
  pending: "#f59e0b",
  in_progress: "#3b82f6",
};

export default function AnalyticsPage() {
  const { orgId } = useAuth();
  const [overview, setOverview] = useState<OverviewAnalytics | null>(null);
  const [campaignSearch, setCampaignSearch] = useState("");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignAnalytics, setCampaignAnalytics] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    try {
      setOverview(await api.getOverviewAnalytics(orgId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const loadCampaignAnalytics = useCallback(async (id: string) => {
    setSelectedCampaignId(id);
    try {
      setCampaignAnalytics(await api.getCampaignAnalytics(id));
    } catch {
      setCampaignAnalytics(null);
    }
  }, []);

  // Call status breakdown data
  const callStatusData = overview
    ? Object.entries(overview.campaigns_by_status).map(([status, count]) => ({
        name: status.charAt(0).toUpperCase() + status.slice(1),
        value: count,
        fill: STATUS_COLORS[status] || "#94a3b8",
      }))
    : [];

  // Carrier summary from campaign analytics
  const carrierData = campaignAnalytics
    ? Object.entries(campaignAnalytics.carrier_breakdown).map(([carrier, count]) => {
        const total = Object.values(campaignAnalytics.carrier_breakdown).reduce((a, b) => a + b, 0);
        return {
          carrier,
          success: count,
          fail: 0,
          pickupPct: total > 0 ? ((count / total) * 100).toFixed(1) + "%" : "0%",
        };
      })
    : [];

  const handleExportPdf = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4ECDC4] border-t-transparent" />
      </div>
    );
  }

  const o = overview;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <button
          onClick={handleExportPdf}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download size={16} />
          Export as PDF
        </button>
      </div>

      {/* Search bars */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by campaign name..."
            value={campaignSearch}
            onChange={(e) => setCampaignSearch(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#4ECDC4]"
          />
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by phone number..."
            value={phoneSearch}
            onChange={(e) => setPhoneSearch(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#4ECDC4]"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* Call Status Breakdown Chart */}
      <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">Call Status Breakdown</h3>
        {callStatusData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={callStatusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {callStatusData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-60 items-center justify-center text-sm text-gray-400">
            No data available
          </div>
        )}
      </div>

      {/* Carrier Summary Table */}
      {carrierData.length > 0 && (
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Carrier Summary</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-2 font-semibold text-gray-600">Carrier</th>
                <th className="px-4 py-2 font-semibold text-gray-600">Success</th>
                <th className="px-4 py-2 font-semibold text-gray-600">Fail</th>
                <th className="px-4 py-2 font-semibold text-gray-600">Pickup %</th>
              </tr>
            </thead>
            <tbody>
              {carrierData.map((row) => (
                <tr key={row.carrier} className="border-b border-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{row.carrier}</td>
                  <td className="px-4 py-2 text-green-600">{row.success}</td>
                  <td className="px-4 py-2 text-red-600">{row.fail}</td>
                  <td className="px-4 py-2 text-gray-600">{row.pickupPct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Total Credits Used"
          value={o ? formatNumber(o.credits_consumed) : "0"}
          icon={CreditCard}
        />
        <StatCard
          label="Current Attempted Calls"
          value={o ? formatNumber(o.total_calls) : "0"}
          sub={o ? `Successful: ${o.total_contacts_reached}, Failed: ${o.total_calls - o.total_contacts_reached}` : undefined}
          icon={Phone}
        />
        <StatCard
          label="Total SMS Sent"
          value={o ? formatNumber(o.total_sms) : "0"}
          icon={MessageSquare}
          accent="#f59e0b"
        />
        <StatCard
          label="Current Playback %"
          value="0%"
          sub="Voice message listen time"
          icon={Headphones}
          accent="#06b6d4"
        />
        <StatCard
          label="Current Pickup Rate"
          value={o ? formatPercent(o.overall_delivery_rate) : "0%"}
          sub="Percentage of successful call pickups"
          icon={TrendingUp}
          accent="#10b981"
        />
        <StatCard
          label="Current Call Duration"
          value={o?.avg_call_duration_seconds ? formatDuration(o.avg_call_duration_seconds) : "0 minutes"}
          icon={Clock}
          accent="#8b5cf6"
        />
        <StatCard
          label="Current Avg Credit Spent"
          value={o ? formatNumber(o.credits_consumed) : "0"}
          icon={CreditCard}
          accent="#f97316"
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "#4ECDC4",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ size?: number }>;
  accent?: string;
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}20`, color: accent }}
        >
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}
