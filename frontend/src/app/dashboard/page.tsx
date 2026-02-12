"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
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
  BarChart3,
  Headphones,
  Zap,
} from "lucide-react";
import { cn, formatDuration, formatNumber, formatPercent } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { DashboardSummary } from "@/lib/api";
import * as api from "@/lib/api";

const PIE_COLORS = ["#4ECDC4", "#FF6B6B", "#FFD93D", "#A78BFA"];
const BAR_COLORS = ["#94a3b8", "#f59e0b", "#ef4444", "#8b5cf6", "#4ECDC4", "#10b981"];

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
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            {label}
          </p>
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

export default function DashboardHomePage() {
  const { orgId } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    try {
      const summary = await api.getDashboardSummary(orgId);
      setData(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4ECDC4] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 p-6 text-center text-red-600">
        {error}
      </div>
    );
  }

  // Default values if no data
  const d = data || {
    campaigns_by_type: {},
    call_outcomes: {},
    credits_purchased: 0,
    credits_topup: 0,
    top_performing_campaign: null,
    total_credits_used: 0,
    remaining_credits: 0,
    total_campaigns: 0,
    campaigns_breakdown: {},
    total_outbound_calls: 0,
    successful_calls: 0,
    failed_calls: 0,
    total_outbound_sms: 0,
    total_call_duration_seconds: 0,
    total_owned_numbers: 0,
    avg_playback_percent: 0,
    avg_credit_spent: {},
    playback_distribution: [],
    credit_usage_over_time: [],
  };

  // Pie chart data
  const campaignTypePie = Object.entries(d.campaigns_by_type).map(
    ([name, value], i) => ({
      name: name === "voice" ? "Phone" : name === "text" ? "SMS" : name === "form" ? "Survey" : name,
      value,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }),
  );

  // Bar chart data for call outcomes
  const callOutcomesBar = Object.entries(d.call_outcomes).map(
    ([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: BAR_COLORS[i % BAR_COLORS.length],
    }),
  );

  // Playback distribution bar
  const playbackBar = (d.playback_distribution || []).map((b) => ({
    name: b.range,
    count: b.count,
  }));

  // Credit usage over time line chart
  const creditLine = (d.credit_usage_over_time || []).map((w) => ({
    week: w.week,
    Message: w.message,
    Call: w.call,
  }));

  // Campaign breakdown string
  const breakdownStr = Object.entries(d.campaigns_breakdown || {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Row 1: Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Campaign Types Pie */}
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Campaign Types</h3>
          {campaignTypePie.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={campaignTypePie}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {campaignTypePie.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-60 items-center justify-center text-sm text-gray-400">
              No campaign data
            </div>
          )}
        </div>

        {/* Call Outcomes Bar */}
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Call Outcomes</h3>
          {callOutcomesBar.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={callOutcomesBar}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {callOutcomesBar.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-60 items-center justify-center text-sm text-gray-400">
              No call data
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Stat Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Credits Purchased"
          value={formatNumber(d.credits_purchased)}
          icon={CreditCard}
        />
        <StatCard
          label="Credits Top-up"
          value={formatNumber(d.credits_topup)}
          icon={Zap}
          accent="#FFD93D"
        />
        <StatCard
          label="Top Performing Campaign"
          value={d.top_performing_campaign?.name || "N/A"}
          sub={d.top_performing_campaign ? formatPercent(d.top_performing_campaign.success_rate) : undefined}
          icon={TrendingUp}
          accent="#10b981"
        />
        <StatCard
          label="Total Credits Used"
          value={formatNumber(d.total_credits_used)}
          icon={Activity}
          accent="#FF6B6B"
        />
        <StatCard
          label="Remaining Credits"
          value={formatNumber(d.remaining_credits)}
          icon={CreditCard}
          accent="#A78BFA"
        />
        <StatCard
          label="Total Campaigns"
          value={d.total_campaigns}
          sub={breakdownStr || undefined}
          icon={BarChart3}
        />
        <StatCard
          label="Total Outbound Calls"
          value={formatNumber(d.total_outbound_calls)}
          sub={`Successful: ${d.successful_calls}, Failed: ${d.failed_calls}`}
          icon={Phone}
        />
        <StatCard
          label="Total Outbound SMS"
          value={formatNumber(d.total_outbound_sms)}
          icon={MessageSquare}
          accent="#f59e0b"
        />
        <StatCard
          label="Total Call Duration"
          value={formatDuration(d.total_call_duration_seconds)}
          icon={Clock}
          accent="#8b5cf6"
        />
        <StatCard
          label="Total Owned Numbers"
          value={d.total_owned_numbers}
          icon={Hash}
          accent="#ec4899"
        />
        <StatCard
          label="Avg Playback %"
          value={`${d.avg_playback_percent}%`}
          sub="Voice message listen time"
          icon={Headphones}
          accent="#06b6d4"
        />
        <StatCard
          label="Avg Credit Spent"
          value={formatNumber(d.total_credits_used)}
          sub={
            Object.entries(d.avg_credit_spent || {})
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ") || undefined
          }
          icon={CreditCard}
          accent="#f97316"
        />
      </div>

      {/* Row 3: More charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Playback Distribution */}
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <h3 className="mb-1 text-sm font-semibold text-gray-700">
            Playback Distribution
          </h3>
          <p className="mb-4 text-xs text-gray-400">
            How long users listen to voice message
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={playbackBar}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#4ECDC4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Credit Usage Over Time */}
        <div className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            Credit Usage Over Time
          </h3>
          {creditLine.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={creditLine}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="Message"
                  stroke="#4ECDC4"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="Call"
                  stroke="#FF6B6B"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-60 items-center justify-center text-sm text-gray-400">
              No usage data yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
