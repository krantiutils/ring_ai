"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  MessageSquare,
  Download,
  ChevronDown,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Zap,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { api } from "@/lib/api";
import type {
  Campaign,
  InsightsResponse,
  ConversationHighlight,
  TopicCluster,
} from "@/types/dashboard";

const REASON_LABELS: Record<string, { label: string; color: string; icon: typeof ThumbsUp }> = {
  extremely_negative_sentiment: { label: "Negative Sentiment", color: "#0052FF", icon: ThumbsDown },
  highly_positive_sentiment: { label: "Positive Sentiment", color: "#4D7CFF", icon: ThumbsUp },
  unusually_long_duration: { label: "Long Duration", color: "#1D4ED8", icon: Clock },
  very_short_duration: { label: "Short Duration", color: "#94a3b8", icon: Zap },
};

const INTENT_COLORS = [
  "#0052FF", "#4D7CFF", "#1D4ED8", "#94a3b8", "#4D7CFF",
  "#6366f1", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899",
];

export default function InsightsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "highlights" | "topics" | "trends" | "export">("summary");

  useEffect(() => {
    api
      .getCampaigns()
      .then((res) => setCampaigns(res.campaigns))
      .catch(() => {})
      .finally(() => setLoadingCampaigns(false));
  }, []);

  const fetchInsights = useCallback(async (campaignId: string) => {
    setLoading(true);
    setError(null);
    setInsights(null);
    try {
      const data = await api.getCampaignInsights(campaignId);
      setInsights(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCampaignChange = (id: string) => {
    setSelectedCampaignId(id);
    if (id) fetchInsights(id);
  };

  const handleExportCSV = () => {
    if (!insights) return;
    const headers = [
      "Interaction ID", "Phone", "Name", "Status", "Started At",
      "Duration (s)", "Sentiment", "Intent", "Transcript",
    ];
    const rows = insights.interactions.map((i) => [
      i.interaction_id,
      i.contact_phone,
      i.contact_name || "",
      i.status,
      i.started_at || "",
      i.duration_seconds?.toString() || "",
      i.sentiment_score?.toString() || "",
      i.detected_intent || "",
      `"${(i.transcript || "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `insights-${insights.campaign_name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Build intent trend chart data
  const intentTrendData = insights?.intent_trend.map((point) => ({
    date: point.date,
    ...point.intents,
  })) || [];

  const allIntents = new Set<string>();
  insights?.intent_trend.forEach((p) => {
    Object.keys(p.intents).forEach((k) => allIntents.add(k));
  });
  const intentKeys = Array.from(allIntents);

  const tabs = [
    { key: "summary" as const, label: "Summary", icon: Sparkles },
    { key: "highlights" as const, label: "Highlights", icon: AlertTriangle },
    { key: "topics" as const, label: "Topics", icon: MessageSquare },
    { key: "trends" as const, label: "Trends", icon: TrendingUp },
    { key: "export" as const, label: "Export", icon: Download },
  ];

  if (loadingCampaigns) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0052FF]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Campaign Selector */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <select
            value={selectedCampaignId}
            onChange={(e) => handleCampaignChange(e.target.value)}
            className="w-full appearance-none px-4 py-2.5 pr-10 text-sm border border-[#0052FF]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0052FF]/40 focus:border-transparent"
          >
            <option value="">Select a campaign...</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type} / {c.status})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0F172A]/40 pointer-events-none" />
        </div>
        {insights && (
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-[#0052FF] text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-[#0048D9] transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        )}
      </div>

      {/* Loading / Error / Empty states */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0052FF]" />
            <p className="text-sm text-[#0F172A]/60">Generating insights...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-[#0052FF]/10 border border-[#0052FF]/20 rounded-lg p-4 text-sm text-[#0052FF]">
          {error}
        </div>
      )}

      {!selectedCampaignId && !loading && (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="w-16 h-16 rounded-full bg-[#FAFAFA] flex items-center justify-center">
            <Lightbulb className="w-8 h-8 text-[#0052FF]/40" />
          </div>
          <p className="text-sm font-medium text-[#0F172A]/60">Select a campaign to view insights</p>
          <p className="text-xs text-[#0F172A]/40">Deep analytics with LLM-generated summaries</p>
        </div>
      )}

      {/* Insights Content */}
      {insights && !loading && (
        <>
          {/* Tab Navigation */}
          <div className="flex gap-1 bg-white rounded-lg border border-[#0052FF]/15 p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? "bg-[#0052FF] text-white"
                      : "text-[#0F172A]/60 hover:text-[#0F172A] hover:bg-[#0052FF]/10"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Summary Tab */}
          {activeTab === "summary" && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-[#0052FF]/15 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-[#1D4ED8]" />
                  <h3 className="text-sm font-semibold text-[#0F172A]">AI-Generated Summary</h3>
                </div>
                <p className="text-sm text-[#0F172A]/80 leading-relaxed">{insights.summary}</p>
              </div>

              <div className="bg-white rounded-xl border border-[#0052FF]/15 p-6">
                <h3 className="text-sm font-semibold text-[#0F172A] mb-3">Common Themes</h3>
                <div className="flex flex-wrap gap-2">
                  {insights.common_themes.map((theme, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 bg-[#0052FF]/10 text-[#0052FF] rounded-full text-xs font-medium"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-[#0052FF]/15 p-4">
                  <p className="text-xs text-[#0F172A]/50 mb-1">Total Interactions</p>
                  <p className="text-xl font-bold text-[#0F172A]">{insights.interactions.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-[#0052FF]/15 p-4">
                  <p className="text-xs text-[#0F172A]/50 mb-1">Highlights Found</p>
                  <p className="text-xl font-bold text-[#0052FF]">{insights.highlights.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-[#0052FF]/15 p-4">
                  <p className="text-xs text-[#0F172A]/50 mb-1">Topic Clusters</p>
                  <p className="text-xl font-bold text-[#4D7CFF]">{insights.topic_clusters.length}</p>
                </div>
                <div className="bg-white rounded-xl border border-[#0052FF]/15 p-4">
                  <p className="text-xs text-[#0F172A]/50 mb-1">Trend Data Points</p>
                  <p className="text-xl font-bold text-[#1D4ED8]">{insights.sentiment_trend.length}</p>
                </div>
              </div>
            </div>
          )}

          {/* Highlights Tab */}
          {activeTab === "highlights" && (
            <div className="space-y-3">
              {insights.highlights.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <AlertTriangle className="w-8 h-8 text-[#0F172A]/20" />
                  <p className="text-sm text-[#0F172A]/50">No notable interactions detected</p>
                </div>
              ) : (
                insights.highlights.map((h) => (
                  <HighlightCard key={h.interaction_id} highlight={h} />
                ))
              )}
            </div>
          )}

          {/* Topics Tab */}
          {activeTab === "topics" && (
            <div className="space-y-4">
              {insights.topic_clusters.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <MessageSquare className="w-8 h-8 text-[#0F172A]/20" />
                  <p className="text-sm text-[#0F172A]/50">No topic clusters detected</p>
                  <p className="text-xs text-[#0F172A]/40">Run intent backfill to classify conversations</p>
                </div>
              ) : (
                <>
                  {/* Topic distribution bar chart */}
                  <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
                    <h3 className="text-sm font-semibold text-[#0F172A] mb-4">Topic Distribution</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={insights.topic_clusters} barSize={44}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#0052FF15" />
                        <XAxis dataKey="topic" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "8px",
                            border: "1px solid #0052FF26",
                            fontSize: "13px",
                          }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {insights.topic_clusters.map((_, i) => (
                            <Cell key={i} fill={INTENT_COLORS[i % INTENT_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Topic cluster cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {insights.topic_clusters.map((cluster) => (
                      <TopicCard key={cluster.topic} cluster={cluster} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Trends Tab */}
          {activeTab === "trends" && (
            <div className="space-y-4">
              {/* Sentiment trend */}
              <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
                <h3 className="text-sm font-semibold text-[#0F172A] mb-4">Sentiment Trend Over Time</h3>
                {insights.sentiment_trend.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-sm text-[#0F172A]/50">
                    No sentiment data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={insights.sentiment_trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0052FF15" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis
                        domain={[-1, 1]}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => v.toFixed(1)}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #0052FF26",
                          fontSize: "13px",
                        }}
                        formatter={(value: number | undefined) => [value != null ? value.toFixed(2) : "-", "Avg Sentiment"]}
                      />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
                      <Line
                        type="monotone"
                        dataKey="avg_sentiment"
                        stroke="#4D7CFF"
                        strokeWidth={2}
                        dot={{ r: 4, fill: "#4D7CFF" }}
                        name="Avg Sentiment"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Intent trend */}
              <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
                <h3 className="text-sm font-semibold text-[#0F172A] mb-4">Intent Distribution Over Time</h3>
                {intentTrendData.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-sm text-[#0F172A]/50">
                    No intent data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={intentTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0052FF15" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #0052FF26",
                          fontSize: "13px",
                        }}
                      />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px" }} />
                      {intentKeys.map((intent, i) => (
                        <Bar
                          key={intent}
                          dataKey={intent}
                          stackId="intents"
                          fill={INTENT_COLORS[i % INTENT_COLORS.length]}
                          radius={i === intentKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* Export Tab */}
          {activeTab === "export" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#0F172A]/60">
                  {insights.interactions.length} interactions with full transcript, sentiment, and intent data
                </p>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 bg-[#0052FF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#0048D9] transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download CSV
                </button>
              </div>

              <div className="bg-white rounded-xl border border-[#0052FF]/15 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#0052FF]/10 bg-[#FAFAFA]/50">
                        <th className="text-left text-xs font-medium text-[#0F172A]/50 uppercase tracking-wider px-4 py-3">Phone</th>
                        <th className="text-left text-xs font-medium text-[#0F172A]/50 uppercase tracking-wider px-4 py-3">Status</th>
                        <th className="text-left text-xs font-medium text-[#0F172A]/50 uppercase tracking-wider px-4 py-3">Duration</th>
                        <th className="text-left text-xs font-medium text-[#0F172A]/50 uppercase tracking-wider px-4 py-3">Sentiment</th>
                        <th className="text-left text-xs font-medium text-[#0F172A]/50 uppercase tracking-wider px-4 py-3">Intent</th>
                        <th className="text-left text-xs font-medium text-[#0F172A]/50 uppercase tracking-wider px-4 py-3">Transcript</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#0052FF]/10">
                      {insights.interactions.slice(0, 50).map((ix) => (
                        <tr key={ix.interaction_id} className="hover:bg-[#FAFAFA]/50">
                          <td className="px-4 py-3 text-sm text-[#0F172A]">{ix.contact_phone}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                ix.status === "completed"
                                  ? "bg-[#4D7CFF]/15 text-[#4D7CFF]"
                                  : ix.status === "failed"
                                    ? "bg-[#0052FF]/15 text-[#0052FF]"
                                    : "bg-[#94a3b8]/15 text-[#94a3b8]"
                              }`}
                            >
                              {ix.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-[#0F172A]/60">
                            {ix.duration_seconds != null ? `${ix.duration_seconds}s` : "-"}
                          </td>
                          <td className="px-4 py-3">
                            {ix.sentiment_score != null ? (
                              <span
                                className={`text-xs font-medium ${
                                  ix.sentiment_score > 0.3
                                    ? "text-[#4D7CFF]"
                                    : ix.sentiment_score < -0.3
                                      ? "text-[#0052FF]"
                                      : "text-[#94a3b8]"
                                }`}
                              >
                                {ix.sentiment_score.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-xs text-[#0F172A]/30">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#0F172A]/60">{ix.detected_intent || "-"}</td>
                          <td className="px-4 py-3 text-xs text-[#0F172A]/60 max-w-[200px] truncate">
                            {ix.transcript || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {insights.interactions.length > 50 && (
                  <div className="px-4 py-3 text-xs text-[#0F172A]/50 border-t border-[#0052FF]/10 bg-[#FAFAFA]/30">
                    Showing 50 of {insights.interactions.length} interactions. Download CSV for full data.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HighlightCard({ highlight }: { highlight: ConversationHighlight }) {
  const info = REASON_LABELS[highlight.reason] || {
    label: highlight.reason,
    color: "#94a3b8",
    icon: AlertTriangle,
  };
  const Icon = info.icon;

  return (
    <div className="bg-white rounded-xl border border-[#0052FF]/15 p-4">
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${info.color}15` }}
        >
          <Icon className="w-4 h-4" style={{ color: info.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${info.color}15`, color: info.color }}>
              {info.label}
            </span>
            <span className="text-xs text-[#0F172A]/40">{highlight.contact_phone}</span>
          </div>
          <div className="flex gap-4 text-xs text-[#0F172A]/60 mb-2">
            {highlight.sentiment_score != null && (
              <span>Sentiment: <strong>{highlight.sentiment_score.toFixed(2)}</strong></span>
            )}
            {highlight.duration_seconds != null && (
              <span>Duration: <strong>{highlight.duration_seconds}s</strong></span>
            )}
          </div>
          {highlight.transcript_preview && (
            <p className="text-xs text-[#0F172A]/50 line-clamp-2">{highlight.transcript_preview}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TopicCard({ cluster }: { cluster: TopicCluster }) {
  return (
    <div className="bg-white rounded-xl border border-[#0052FF]/15 p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-[#0F172A] capitalize">{cluster.topic}</h4>
        <span className="text-xs font-medium px-2 py-0.5 bg-[#4D7CFF]/15 text-[#4D7CFF] rounded-full">
          {cluster.count} conversations
        </span>
      </div>
      {cluster.avg_sentiment != null && (
        <p className="text-xs text-[#0F172A]/60 mb-2">
          Avg sentiment:{" "}
          <span
            className={`font-medium ${
              cluster.avg_sentiment > 0.3
                ? "text-[#4D7CFF]"
                : cluster.avg_sentiment < -0.3
                  ? "text-[#0052FF]"
                  : "text-[#94a3b8]"
            }`}
          >
            {cluster.avg_sentiment.toFixed(2)}
          </span>
        </p>
      )}
      {cluster.sample_transcripts.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#0F172A]/40">Sample transcripts:</p>
          {cluster.sample_transcripts.map((t, i) => (
            <p key={i} className="text-xs text-[#0F172A]/50 line-clamp-1">{t}</p>
          ))}
        </div>
      )}
    </div>
  );
}
