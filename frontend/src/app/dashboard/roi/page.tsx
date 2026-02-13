"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp,
  DollarSign,
  BarChart3,
  Calculator,
  FlaskConical,
  ChevronDown,
  Check,
  X,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import StatWidget from "@/components/dashboard/StatWidget";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import type {
  Campaign,
  CampaignROI,
  CampaignComparison,
  CampaignComparisonEntry,
  ROICalculatorResult,
} from "@/types/dashboard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(n: number): string {
  return `NPR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(n: number | null): string {
  if (n === null || n === undefined) return "N/A";
  return `${(n * 100).toFixed(1)}%`;
}

function formatDurationShort(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "N/A";
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = "overview" | "compare" | "calculator";

const TABS: { key: Tab; label: string; icon: typeof TrendingUp }[] = [
  { key: "overview", label: "Campaign ROI", icon: TrendingUp },
  { key: "compare", label: "Compare", icon: BarChart3 },
  { key: "calculator", label: "ROI Calculator", icon: Calculator },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ROIAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  useEffect(() => {
    async function loadCampaigns() {
      try {
        const data = await api.getCampaigns("per_page=200");
        setCampaigns(data.campaigns);
      } catch {
        setCampaigns([]);
      } finally {
        setLoadingCampaigns(false);
      }
    }
    loadCampaigns();
  }, []);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-[#2D2D2D]">ROI Analytics</h1>
        <p className="text-sm text-[#2D2D2D]/50 mt-1">
          Track campaign costs, compare performance, and calculate ROI
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-white rounded-lg border border-[#FF6B6B]/15 p-1 w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-[#FF6B6B] text-white"
                  : "text-[#2D2D2D]/50 hover:text-[#2D2D2D] hover:bg-[#FFF8F0]",
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {loadingCampaigns ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-[#FF6B6B]" />
        </div>
      ) : (
        <>
          {activeTab === "overview" && <CampaignROITab campaigns={campaigns} />}
          {activeTab === "compare" && <CompareTab campaigns={campaigns} />}
          {activeTab === "calculator" && <CalculatorTab campaigns={campaigns} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign ROI Tab
// ---------------------------------------------------------------------------

function CampaignROITab({ campaigns }: { campaigns: Campaign[] }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [roi, setRoi] = useState<CampaignROI | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadROI = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getCampaignROI(id);
      setRoi(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ROI data");
      setRoi(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadROI(selectedId);
  }, [selectedId, loadROI]);

  const costPieData = roi
    ? [
        { name: "TTS", value: roi.cost_breakdown.tts_cost, fill: "#FF6B6B" },
        { name: "Telephony", value: roi.cost_breakdown.telephony_cost, fill: "#4ECDC4" },
      ].filter((d) => d.value > 0)
    : [];

  const statusBarData = roi
    ? [
        { name: "Completed", value: roi.completed_interactions, fill: "#4ECDC4" },
        { name: "Failed", value: roi.failed_interactions, fill: "#FF6B6B" },
        {
          name: "Other",
          value: roi.total_interactions - roi.completed_interactions - roi.failed_interactions,
          fill: "#94a3b8",
        },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-6">
      {/* Campaign selector */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <label className="block text-sm font-medium text-[#2D2D2D]/60 mb-2">
          Select Campaign
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full max-w-md border border-[#FF6B6B]/15 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40"
        >
          <option value="">Choose a campaign...</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.type} / {c.status})
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-[#FF6B6B]" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {roi && !loading && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatWidget
              title="Total Cost"
              value={formatCurrency(roi.total_cost)}
              icon={DollarSign}
              iconColor="text-[#FF6B6B]"
            />
            <StatWidget
              title="Conversion Rate"
              value={formatPct(roi.conversion_rate)}
              subtitle={`${roi.completed_interactions} of ${roi.total_interactions}`}
              icon={TrendingUp}
              iconColor="text-[#4ECDC4]"
            />
            <StatWidget
              title="Cost per Conversion"
              value={roi.cost_per_conversion !== null ? formatCurrency(roi.cost_per_conversion) : "N/A"}
              icon={Calculator}
              iconColor="text-[#FFD93D]"
            />
            <StatWidget
              title="Avg Duration"
              value={formatDurationShort(roi.avg_duration_seconds)}
              subtitle={roi.avg_sentiment_score !== null ? `Sentiment: ${roi.avg_sentiment_score}` : undefined}
              icon={BarChart3}
              iconColor="text-[#FF6B6B]"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cost breakdown pie */}
            <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
              <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">Cost Breakdown</h3>
              {costPieData.length > 0 ? (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width="50%" height={180}>
                    <PieChart>
                      <Pie
                        data={costPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        strokeWidth={2}
                        stroke="#fff"
                      >
                        {costPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #FF6B6B26",
                          fontSize: "13px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-3">
                    {costPieData.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: entry.fill }}
                        />
                        <span className="text-sm text-[#2D2D2D]/60">{entry.name}</span>
                        <span className="text-sm font-medium text-[#2D2D2D] ml-auto">
                          {formatCurrency(entry.value)}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-[#FF6B6B]/10">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#2D2D2D]">Total</span>
                        <span className="text-sm font-bold text-[#2D2D2D] ml-auto">
                          {formatCurrency(roi.total_cost)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[#2D2D2D]/40 text-center py-8">No cost data</p>
              )}
            </div>

            {/* Interaction status bar */}
            <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
              <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">Interaction Outcomes</h3>
              {statusBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={statusBarData} barSize={48}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#FF6B6B15" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #FF6B6B26",
                        fontSize: "13px",
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {statusBarData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-[#2D2D2D]/40 text-center py-8">
                  No interaction data
                </p>
              )}
            </div>
          </div>

          {/* Detailed metrics table */}
          <div className="bg-white rounded-xl border border-[#FF6B6B]/15 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#FF6B6B]/10">
              <h3 className="text-sm font-semibold text-[#2D2D2D]">Detailed Metrics</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-[#FF6B6B]/10">
              {[
                { label: "Campaign Type", value: roi.campaign_type },
                { label: "Status", value: roi.campaign_status },
                { label: "Total Interactions", value: roi.total_interactions.toString() },
                { label: "Completed", value: roi.completed_interactions.toString() },
                { label: "Failed", value: roi.failed_interactions.toString() },
                { label: "Conversion Rate", value: formatPct(roi.conversion_rate) },
                { label: "TTS Cost", value: formatCurrency(roi.cost_breakdown.tts_cost) },
                { label: "Telephony Cost", value: formatCurrency(roi.cost_breakdown.telephony_cost) },
                { label: "Total Cost", value: formatCurrency(roi.total_cost) },
                { label: "Cost per Interaction", value: roi.cost_per_interaction !== null ? formatCurrency(roi.cost_per_interaction) : "N/A" },
                { label: "Cost per Conversion", value: roi.cost_per_conversion !== null ? formatCurrency(roi.cost_per_conversion) : "N/A" },
                { label: "Avg Duration", value: formatDurationShort(roi.avg_duration_seconds) },
                { label: "Total Duration", value: formatDurationShort(roi.total_duration_seconds) },
                { label: "Avg Sentiment", value: roi.avg_sentiment_score !== null ? roi.avg_sentiment_score.toString() : "N/A" },
              ].map((item) => (
                <div key={item.label} className="bg-white p-4">
                  <p className="text-xs text-[#2D2D2D]/40 mb-1">{item.label}</p>
                  <p className="text-sm font-semibold text-[#2D2D2D]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!selectedId && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-[#FFF8F0] flex items-center justify-center mb-4">
            <TrendingUp className="w-7 h-7 text-[#FF6B6B]/40" />
          </div>
          <p className="text-sm font-medium text-[#2D2D2D]/60">
            Select a campaign to view ROI metrics
          </p>
          <p className="text-xs text-[#2D2D2D]/40 mt-1">
            Cost breakdowns, conversion rates, and performance insights
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compare Tab
// ---------------------------------------------------------------------------

function CompareTab({ campaigns }: { campaigns: Campaign[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [comparison, setComparison] = useState<CampaignComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCampaign(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function runComparison() {
    const ids = Array.from(selectedIds);
    if (ids.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.compareCampaigns(ids);
      setComparison(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
      setComparison(null);
    } finally {
      setLoading(false);
    }
  }

  // Find best/worst for highlighting
  function bestValue(
    entries: CampaignComparisonEntry[],
    key: keyof CampaignComparisonEntry,
    higher: boolean,
  ): string | null {
    const valid = entries.filter((e) => e[key] !== null && e[key] !== undefined);
    if (valid.length === 0) return null;
    const sorted = [...valid].sort((a, b) => {
      const va = a[key] as number;
      const vb = b[key] as number;
      return higher ? vb - va : va - vb;
    });
    return sorted[0].campaign_id;
  }

  const comparisonBarData =
    comparison?.campaigns.map((c) => ({
      name: c.campaign_name.length > 15 ? c.campaign_name.slice(0, 15) + "..." : c.campaign_name,
      conversion: c.conversion_rate !== null ? +(c.conversion_rate * 100).toFixed(1) : 0,
      cost: c.total_cost,
    })) || [];

  return (
    <div className="space-y-6">
      {/* Campaign multi-select */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-[#2D2D2D]">Select Campaigns to Compare</h3>
            <p className="text-xs text-[#2D2D2D]/40 mt-0.5">
              Choose at least 2 campaigns ({selectedIds.size} selected)
            </p>
          </div>
          <button
            onClick={runComparison}
            disabled={selectedIds.size < 2 || loading}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              selectedIds.size >= 2
                ? "bg-[#FF6B6B] text-white hover:bg-[#ff5252]"
                : "bg-[#FF6B6B]/20 text-[#FF6B6B]/40 cursor-not-allowed",
            )}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <BarChart3 className="w-4 h-4" />
            )}
            Compare
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
          {campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => toggleCampaign(c.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors border",
                selectedIds.has(c.id)
                  ? "border-[#FF6B6B] bg-[#FF6B6B]/5 text-[#2D2D2D]"
                  : "border-[#FF6B6B]/10 hover:border-[#FF6B6B]/30 text-[#2D2D2D]/60",
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                  selectedIds.has(c.id)
                    ? "bg-[#FF6B6B] border-[#FF6B6B]"
                    : "border-[#FF6B6B]/30",
                )}
              >
                {selectedIds.has(c.id) && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="truncate">{c.name}</span>
              <span className="text-xs text-[#2D2D2D]/30 ml-auto capitalize shrink-0">
                {c.type}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {comparison && !loading && (
        <>
          {/* Comparison chart */}
          {comparisonBarData.length > 0 && (
            <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
              <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">
                Conversion Rate Comparison
              </h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={comparisonBarData} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#FF6B6B15" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #FF6B6B26",
                      fontSize: "13px",
                    }}
                    formatter={(value) => [`${Number(value)}%`, "Conversion"]}
                  />
                  <Bar dataKey="conversion" fill="#FF6B6B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Comparison table */}
          <div className="bg-white rounded-xl border border-[#FF6B6B]/15 overflow-hidden">
            <div className="px-5 py-4 border-b border-[#FF6B6B]/10">
              <h3 className="text-sm font-semibold text-[#2D2D2D]">Side-by-Side Comparison</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#FF6B6B]/10 bg-[#FFF8F0]/50">
                    <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-5 py-3">
                      Campaign
                    </th>
                    <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-5 py-3">
                      Type
                    </th>
                    <th className="text-right text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-5 py-3">
                      Interactions
                    </th>
                    <th className="text-right text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-5 py-3">
                      Completed
                    </th>
                    <th className="text-right text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-5 py-3">
                      Conv. Rate
                    </th>
                    <th className="text-right text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-5 py-3">
                      Total Cost
                    </th>
                    <th className="text-right text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-5 py-3">
                      Cost/Conv.
                    </th>
                    <th className="text-right text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-5 py-3">
                      Avg Duration
                    </th>
                    <th className="text-right text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-5 py-3">
                      Sentiment
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#FF6B6B]/10">
                  {comparison.campaigns.map((c) => {
                    const bestConv = bestValue(comparison.campaigns, "conversion_rate", true);
                    const bestCostConv = bestValue(comparison.campaigns, "cost_per_conversion", false);
                    return (
                      <tr key={c.campaign_id} className="hover:bg-[#FFF8F0]/50">
                        <td className="px-5 py-3 text-sm font-medium text-[#2D2D2D]">
                          {c.campaign_name}
                        </td>
                        <td className="px-5 py-3 text-sm text-[#2D2D2D]/60 capitalize">
                          {c.campaign_type}
                        </td>
                        <td className="px-5 py-3 text-sm text-[#2D2D2D]/60 text-right">
                          {c.total_interactions}
                        </td>
                        <td className="px-5 py-3 text-sm text-[#2D2D2D]/60 text-right">
                          {c.completed}
                        </td>
                        <td
                          className={cn(
                            "px-5 py-3 text-sm text-right font-medium",
                            bestConv === c.campaign_id
                              ? "text-[#4ECDC4]"
                              : "text-[#2D2D2D]/60",
                          )}
                        >
                          {formatPct(c.conversion_rate)}
                        </td>
                        <td className="px-5 py-3 text-sm text-[#2D2D2D]/60 text-right">
                          {formatCurrency(c.total_cost)}
                        </td>
                        <td
                          className={cn(
                            "px-5 py-3 text-sm text-right font-medium",
                            bestCostConv === c.campaign_id
                              ? "text-[#4ECDC4]"
                              : "text-[#2D2D2D]/60",
                          )}
                        >
                          {c.cost_per_conversion !== null
                            ? formatCurrency(c.cost_per_conversion)
                            : "N/A"}
                        </td>
                        <td className="px-5 py-3 text-sm text-[#2D2D2D]/60 text-right">
                          {formatDurationShort(c.avg_duration_seconds)}
                        </td>
                        <td className="px-5 py-3 text-sm text-[#2D2D2D]/60 text-right">
                          {c.avg_sentiment_score !== null
                            ? c.avg_sentiment_score.toFixed(2)
                            : "N/A"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!comparison && !loading && selectedIds.size < 2 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-[#FFF8F0] flex items-center justify-center mb-4">
            <BarChart3 className="w-7 h-7 text-[#FF6B6B]/40" />
          </div>
          <p className="text-sm font-medium text-[#2D2D2D]/60">
            Select at least 2 campaigns to compare
          </p>
          <p className="text-xs text-[#2D2D2D]/40 mt-1">
            See conversion rates, costs, and performance side by side
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ROI Calculator Tab
// ---------------------------------------------------------------------------

function CalculatorTab({ campaigns }: { campaigns: Campaign[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [manualCost, setManualCost] = useState("15");
  const [result, setResult] = useState<ROICalculatorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCampaign(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function calculate() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.calculateROI({
        campaign_ids: ids,
        manual_cost_per_call: parseFloat(manualCost) || 15,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calculation failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const savingsPositive = result ? result.cost_savings > 0 : false;

  return (
    <div className="space-y-6">
      {/* Input section */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <h3 className="text-sm font-semibold text-[#2D2D2D] mb-1">ROI Calculator</h3>
        <p className="text-xs text-[#2D2D2D]/40 mb-4">
          Compare automated campaign costs against manual calling estimates
        </p>

        <div className="space-y-4">
          {/* Manual cost input */}
          <div>
            <label className="block text-sm font-medium text-[#2D2D2D]/60 mb-1">
              Manual cost per call (NPR)
            </label>
            <input
              type="number"
              value={manualCost}
              onChange={(e) => setManualCost(e.target.value)}
              min="0"
              step="0.5"
              className="w-full max-w-[200px] border border-[#FF6B6B]/15 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40"
            />
          </div>

          {/* Campaign select */}
          <div>
            <label className="block text-sm font-medium text-[#2D2D2D]/60 mb-2">
              Campaigns to analyze ({selectedIds.size} selected)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleCampaign(c.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors border",
                    selectedIds.has(c.id)
                      ? "border-[#FF6B6B] bg-[#FF6B6B]/5 text-[#2D2D2D]"
                      : "border-[#FF6B6B]/10 hover:border-[#FF6B6B]/30 text-[#2D2D2D]/60",
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                      selectedIds.has(c.id)
                        ? "bg-[#FF6B6B] border-[#FF6B6B]"
                        : "border-[#FF6B6B]/30",
                    )}
                  >
                    {selectedIds.has(c.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="truncate">{c.name}</span>
                  <span className="text-xs text-[#2D2D2D]/30 ml-auto capitalize shrink-0">
                    {c.type}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={calculate}
            disabled={selectedIds.size === 0 || loading}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors",
              selectedIds.size > 0
                ? "bg-[#FF6B6B] text-white hover:bg-[#ff5252]"
                : "bg-[#FF6B6B]/20 text-[#FF6B6B]/40 cursor-not-allowed",
            )}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Calculator className="w-4 h-4" />
            )}
            Calculate ROI
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && !loading && (
        <>
          {/* Savings highlight */}
          <div
            className={cn(
              "rounded-xl border p-6",
              savingsPositive
                ? "bg-[#4ECDC4]/5 border-[#4ECDC4]/20"
                : "bg-[#FF6B6B]/5 border-[#FF6B6B]/20",
            )}
          >
            <div className="flex items-center gap-3 mb-2">
              {savingsPositive ? (
                <ArrowUpRight className="w-6 h-6 text-[#4ECDC4]" />
              ) : result.cost_savings < 0 ? (
                <ArrowDownRight className="w-6 h-6 text-[#FF6B6B]" />
              ) : (
                <Minus className="w-6 h-6 text-[#94a3b8]" />
              )}
              <div>
                <p className="text-sm font-medium text-[#2D2D2D]/60">Estimated Savings</p>
                <p
                  className={cn(
                    "text-2xl font-bold",
                    savingsPositive ? "text-[#4ECDC4]" : "text-[#FF6B6B]",
                  )}
                >
                  {formatCurrency(result.cost_savings)}
                  {result.cost_savings_percentage !== null && (
                    <span className="text-base font-medium ml-2">
                      ({result.cost_savings_percentage.toFixed(1)}%)
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Result stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatWidget
              title="Automated Cost"
              value={formatCurrency(result.total_automated_cost)}
              icon={DollarSign}
              iconColor="text-[#4ECDC4]"
            />
            <StatWidget
              title="Manual Cost (Est.)"
              value={formatCurrency(result.total_manual_cost_estimate)}
              icon={DollarSign}
              iconColor="text-[#FFD93D]"
            />
            <StatWidget
              title="Conversion Rate"
              value={formatPct(result.overall_conversion_rate)}
              subtitle={`${result.total_completed} of ${result.total_interactions}`}
              icon={TrendingUp}
              iconColor="text-[#FF6B6B]"
            />
            <StatWidget
              title="Campaigns Analyzed"
              value={result.campaigns_analyzed.toString()}
              subtitle={
                result.cost_per_conversion !== null
                  ? `Cost/conv: ${formatCurrency(result.cost_per_conversion)}`
                  : undefined
              }
              icon={BarChart3}
              iconColor="text-[#FF6B6B]"
            />
          </div>
        </>
      )}

      {!result && !loading && selectedIds.size === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-[#FFF8F0] flex items-center justify-center mb-4">
            <Calculator className="w-7 h-7 text-[#FF6B6B]/40" />
          </div>
          <p className="text-sm font-medium text-[#2D2D2D]/60">
            Select campaigns and set manual cost to calculate ROI
          </p>
          <p className="text-xs text-[#2D2D2D]/40 mt-1">
            See how much you save with automated calling vs manual outreach
          </p>
        </div>
      )}
    </div>
  );
}
