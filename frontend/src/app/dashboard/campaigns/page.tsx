"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import type { Campaign, Paginated } from "@/lib/api";
import * as api from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-blue-100 text-blue-700",
};

const TYPE_LABELS: Record<string, string> = {
  voice: "Phone",
  text: "SMS",
  form: "Survey",
};

const STATUS_TABS = ["All", "draft", "active", "paused", "completed"];
const SORT_OPTIONS = ["All", "Name A-Z", "Name Z-A", "Newest", "Oldest"];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [status, setStatus] = useState("All");
  const [search, setSearch] = useState("");
  const [showDraft, setShowDraft] = useState(true);
  const [sort, setSort] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { page: number; page_size: number; status?: string } = {
        page,
        page_size: pageSize,
      };
      if (status !== "All") {
        params.status = status;
      }
      const resp = await api.listCampaigns(params);
      let items = resp.items;

      // Client-side filtering
      if (!showDraft) {
        items = items.filter((c) => c.status !== "draft");
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        items = items.filter((c) => c.name.toLowerCase().includes(q));
      }
      if (dateFrom) {
        items = items.filter((c) => c.updated_at >= dateFrom);
      }
      if (dateTo) {
        items = items.filter((c) => c.updated_at <= dateTo + "T23:59:59");
      }

      // Sort
      if (sort === "Name A-Z") items.sort((a, b) => a.name.localeCompare(b.name));
      else if (sort === "Name Z-A") items.sort((a, b) => b.name.localeCompare(a.name));
      else if (sort === "Newest") items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      else if (sort === "Oldest") items.sort((a, b) => a.updated_at.localeCompare(b.updated_at));

      setCampaigns(items);
      setTotal(resp.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, search, showDraft, sort, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
        <Link
          href="/dashboard/campaigns/new"
          className="flex items-center gap-2 rounded-lg bg-[#4ECDC4] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#44a8a0]"
        >
          <Plus size={16} />
          Add New Campaign
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#4ECDC4]"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showDraft}
            onChange={(e) => setShowDraft(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-[#4ECDC4] accent-[#4ECDC4]"
          />
          Show Draft
        </label>

        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
        >
          {STATUS_TABS.map((s) => (
            <option key={s} value={s}>
              {s === "All" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
        />
        <span className="text-gray-400">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="px-5 py-3 font-semibold text-gray-600">Campaign Name</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Status</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Progress</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Type</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Modified at</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                  No data found
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/campaigns/${c.id}`}
                      className="font-medium text-gray-900 hover:text-[#4ECDC4]"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                        STATUS_COLORS[c.status] || "bg-gray-100 text-gray-700",
                      )}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-[#4ECDC4]"
                        style={{
                          width: c.status === "completed" ? "100%" : c.status === "active" ? "50%" : "0%",
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-gray-600">
                      {TYPE_LABELS[c.type] || c.type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {formatDateTime(c.updated_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
