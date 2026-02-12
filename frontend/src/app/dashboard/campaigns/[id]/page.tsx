"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Users,
  Trash2,
} from "lucide-react";
import {
  campaigns,
  type CampaignWithStats,
  type Contact,
  type PaginatedResponse,
  ApiError,
} from "@/lib/api";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    active: "bg-green-100 text-green-700",
    paused: "bg-yellow-100 text-yellow-700",
    completed: "bg-blue-100 text-blue-700",
  };

  return (
    <span
      className={cn(
        "inline-block px-3 py-1 rounded-full text-xs font-medium capitalize",
        styles[status] ?? "bg-gray-100 text-gray-600",
      )}
    >
      {status}
    </span>
  );
}

function StatBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="clay-surface p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<CampaignWithStats | null>(null);
  const [contacts, setContacts] = useState<PaginatedResponse<Contact> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");

  const fetchCampaign = useCallback(async () => {
    try {
      const data = await campaigns.get(id);
      setCampaign(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Campaign not found");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load campaign");
      }
    }
  }, [id]);

  const fetchContacts = useCallback(async () => {
    try {
      const data = await campaigns.listContacts(id, {
        page: 1,
        page_size: 10,
      });
      setContacts(data);
    } catch (err) {
      // 404 means no contacts yet — that's expected
      if (err instanceof ApiError && err.status === 404) return;
      console.error("Failed to load contacts:", err);
    }
  }, [id]);

  useEffect(() => {
    fetchCampaign();
    fetchContacts();
  }, [fetchCampaign, fetchContacts]);

  async function handleAction(
    action: "start" | "pause" | "resume" | "delete",
  ) {
    setActionLoading(action);
    setError("");
    try {
      if (action === "start") {
        await campaigns.start(id);
      } else if (action === "pause") {
        await campaigns.pause(id);
      } else if (action === "resume") {
        await campaigns.resume(id);
      } else if (action === "delete") {
        await campaigns.delete(id);
        router.push("/dashboard/campaigns");
        return;
      }
      await fetchCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActionLoading("");
    }
  }

  if (error && !campaign) {
    return (
      <div>
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to campaigns
        </Link>
        <div className="p-6 rounded-xl bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  const s = campaign.stats;
  const deliveryPct =
    s.delivery_rate != null ? `${(s.delivery_rate * 100).toFixed(1)}%` : "—";

  return (
    <div>
      <Link
        href="/dashboard/campaigns"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to campaigns
      </Link>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusBadge status={campaign.status} />
            <span className="text-sm text-gray-500 capitalize">
              {campaign.type}
            </span>
            <span className="text-sm text-gray-400">
              Created {new Date(campaign.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {campaign.status === "draft" && (
            <>
              <button
                onClick={() => handleAction("start")}
                disabled={!!actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <Play className="w-4 h-4" />
                {actionLoading === "start" ? "Starting…" : "Start"}
              </button>
              <button
                onClick={() => handleAction("delete")}
                disabled={!!actionLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {actionLoading === "delete" ? "Deleting…" : "Delete"}
              </button>
            </>
          )}
          {campaign.status === "active" && (
            <button
              onClick={() => handleAction("pause")}
              disabled={!!actionLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-50 text-yellow-700 text-sm font-medium hover:bg-yellow-100 disabled:opacity-50 transition-colors"
            >
              <Pause className="w-4 h-4" />
              {actionLoading === "pause" ? "Pausing…" : "Pause"}
            </button>
          )}
          {campaign.status === "paused" && (
            <button
              onClick={() => handleAction("resume")}
              disabled={!!actionLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              {actionLoading === "resume" ? "Resuming…" : "Resume"}
            </button>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatBox label="Total Contacts" value={s.total_contacts} />
        <StatBox label="Completed" value={s.completed} />
        <StatBox label="Failed" value={s.failed} />
        <StatBox label="Delivery Rate" value={deliveryPct} />
        <StatBox label="Pending" value={s.pending} />
        <StatBox label="In Progress" value={s.in_progress} />
        <StatBox
          label="Avg Duration"
          value={
            s.avg_duration_seconds != null
              ? `${s.avg_duration_seconds.toFixed(1)}s`
              : "—"
          }
        />
        <StatBox
          label="Est. Cost"
          value={
            s.cost_estimate != null
              ? `NPR ${s.cost_estimate.toFixed(2)}`
              : "—"
          }
        />
      </div>

      {/* Contacts preview */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Contacts</h2>
        <Link
          href={`/dashboard/campaigns/${id}/contacts`}
          className="inline-flex items-center gap-2 text-sm text-[var(--clay-teal)] font-medium hover:underline"
        >
          <Users className="w-4 h-4" />
          Manage contacts ({contacts?.total ?? 0})
        </Link>
      </div>

      <div className="clay-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Phone
              </th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Name
              </th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Added
              </th>
            </tr>
          </thead>
          <tbody>
            {contacts?.items.map((c) => (
              <tr
                key={c.id}
                className="border-b border-gray-50 last:border-0"
              >
                <td className="px-6 py-3 font-mono text-xs">{c.phone}</td>
                <td className="px-6 py-3">{c.name ?? "—"}</td>
                <td className="px-6 py-3 text-gray-500">
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {contacts && contacts.items.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-6 py-8 text-center text-gray-400"
                >
                  No contacts yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
