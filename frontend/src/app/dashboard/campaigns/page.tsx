"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import {
  campaigns,
  type Campaign,
  type CampaignStatus,
  type CampaignType,
  type PaginatedResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: { label: string; value: CampaignStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Completed", value: "completed" },
];

const PAGE_SIZE = 20;

function StatusBadge({ status }: { status: CampaignStatus }) {
  const styles: Record<CampaignStatus, string> = {
    draft: "bg-gray-100 text-gray-600",
    active: "bg-green-100 text-green-700",
    paused: "bg-yellow-100 text-yellow-700",
    completed: "bg-blue-100 text-blue-700",
  };

  return (
    <span
      className={cn(
        "inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
        styles[status],
      )}
    >
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: CampaignType }) {
  const styles: Record<CampaignType, string> = {
    voice: "bg-purple-100 text-purple-700",
    text: "bg-teal-100 text-teal-700",
    form: "bg-orange-100 text-orange-700",
  };

  return (
    <span
      className={cn(
        "inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
        styles[type],
      )}
    >
      {type}
    </span>
  );
}

export default function CampaignsListPage() {
  const [data, setData] = useState<PaginatedResponse<Campaign> | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "">("");

  useEffect(() => {
    let cancelled = false;

    const params: Parameters<typeof campaigns.list>[0] = {
      page,
      page_size: PAGE_SIZE,
    };
    if (statusFilter) params.status = statusFilter;

    campaigns
      .list(params)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load campaigns",
          );
      });

    return () => {
      cancelled = true;
    };
  }, [page, statusFilter]);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Link
          href="/dashboard/campaigns/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--clay-coral)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setStatusFilter(f.value as CampaignStatus | "");
              setPage(1);
            }}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium transition-colors",
              statusFilter === f.value
                ? "bg-[var(--clay-coral)] text-white"
                : "bg-white text-gray-600 hover:bg-gray-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="clay-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Name
              </th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Status
              </th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Type
              </th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Schedule
              </th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Created
              </th>
              <th className="text-right px-6 py-3 font-medium text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((c) => (
              <tr
                key={c.id}
                className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors"
              >
                <td className="px-6 py-4">
                  <Link
                    href={`/dashboard/campaigns/${c.id}`}
                    className="font-medium text-gray-900 hover:text-[var(--clay-coral)] transition-colors"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-6 py-4">
                  <TypeBadge type={c.type} />
                </td>
                <td className="px-6 py-4 text-gray-500 capitalize">
                  {c.schedule_config?.mode ?? "—"}
                </td>
                <td className="px-6 py-4 text-gray-500">
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    href={`/dashboard/campaigns/${c.id}`}
                    className="text-[var(--clay-teal)] text-sm font-medium hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-gray-400"
                >
                  No campaigns found.{" "}
                  <Link
                    href="/dashboard/campaigns/new"
                    className="text-[var(--clay-coral)] hover:underline"
                  >
                    Create one
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} ({data?.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-xl bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-xl bg-white border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
