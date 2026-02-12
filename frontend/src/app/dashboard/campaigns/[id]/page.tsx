"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, Pause, RotateCcw, Trash2, Users } from "lucide-react";
import { cn, formatDateTime, formatDuration, formatNumber, formatPercent } from "@/lib/utils";
import type { CampaignWithStats } from "@/lib/api";
import * as api from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-blue-100 text-blue-700",
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<CampaignWithStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setCampaign(await api.getCampaign(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async (action: "start" | "pause" | "resume" | "delete") => {
    setActionLoading(true);
    try {
      if (action === "start") await api.startCampaign(id);
      else if (action === "pause") await api.pauseCampaign(id);
      else if (action === "resume") await api.resumeCampaign(id);
      else if (action === "delete") {
        await api.deleteCampaign(id);
        router.push("/dashboard/campaigns");
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4ECDC4] border-t-transparent" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="rounded-xl bg-red-50 p-6 text-center text-red-600">
        {error || "Campaign not found"}
      </div>
    );
  }

  const s = campaign.stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/campaigns" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                STATUS_COLORS[campaign.status],
              )}
            >
              {campaign.status}
            </span>
            <span>{campaign.type === "voice" ? "Phone" : campaign.type === "text" ? "SMS" : "Survey"}</span>
            <span>Created {formatDateTime(campaign.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {campaign.status === "draft" && (
          <>
            <button
              onClick={() => handleAction("start")}
              disabled={actionLoading}
              className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
            >
              <Play size={14} /> Start
            </button>
            <button
              onClick={() => handleAction("delete")}
              disabled={actionLoading}
              className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              <Trash2 size={14} /> Delete
            </button>
          </>
        )}
        {campaign.status === "active" && (
          <button
            onClick={() => handleAction("pause")}
            disabled={actionLoading}
            className="flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-600 disabled:opacity-50"
          >
            <Pause size={14} /> Pause
          </button>
        )}
        {campaign.status === "paused" && (
          <button
            onClick={() => handleAction("resume")}
            disabled={actionLoading}
            className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
          >
            <RotateCcw size={14} /> Resume
          </button>
        )}
        <Link
          href={`/dashboard/campaigns/${id}/contacts`}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Users size={14} /> Manage Contacts
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Total Contacts", value: formatNumber(s.total_contacts) },
          { label: "Completed", value: formatNumber(s.completed) },
          { label: "Failed", value: formatNumber(s.failed) },
          { label: "Pending", value: formatNumber(s.pending) },
          { label: "In Progress", value: formatNumber(s.in_progress) },
          { label: "Delivery Rate", value: formatPercent(s.delivery_rate) },
          { label: "Avg Duration", value: s.avg_duration_seconds ? formatDuration(s.avg_duration_seconds) : "N/A" },
          { label: "Cost Estimate", value: s.cost_estimate != null ? `NPR ${s.cost_estimate.toFixed(2)}` : "N/A" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{item.label}</p>
            <p className="mt-1 text-xl font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
