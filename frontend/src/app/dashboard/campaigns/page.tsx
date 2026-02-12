"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { listCampaigns } from "@/lib/api";
import type { Campaign, PaginatedResponse } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-600",
  scheduled: "bg-yellow-600",
  active: "bg-green-600",
  paused: "bg-orange-600",
  completed: "bg-blue-600",
};

const TYPE_LABELS: Record<string, string> = {
  voice: "Phone",
  text: "SMS",
  form: "Survey",
};

export default function CampaignsPage() {
  const [data, setData] = useState<PaginatedResponse<Campaign> | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showDraft, setShowDraft] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listCampaigns({
      page,
      page_size: 20,
      status: statusFilter || undefined,
    })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, statusFilter]);

  const campaigns = (data?.items ?? []).filter((c) => {
    if (!showDraft && c.status === "draft") return false;
    if (search) {
      return c.name.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#1a1d29] border border-gray-800 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showDraft}
            onChange={(e) => setShowDraft(e.target.checked)}
            className="rounded bg-[#1a1d29] border-gray-700"
          />
          Show Draft
        </label>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 bg-[#1a1d29] border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>

        <button className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus size={16} />
          Add New Campaign
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#1a1d29] rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Campaign Name
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Status
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Progress
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Type
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Category
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Modified at
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500">
                    No data found
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-800/50 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-3 text-white font-medium">
                      {c.name}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white ${
                          STATUS_COLORS[c.status] ?? "bg-gray-600"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400">--</td>
                    <td className="px-5 py-3 text-gray-400">
                      {TYPE_LABELS[c.type] ?? c.type}
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {c.category
                        ? c.category.charAt(0).toUpperCase() +
                          c.category.slice(1)
                        : "--"}
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {new Date(c.updated_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} ({data?.total ?? 0} total)
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 text-sm bg-[#0f1117] border border-gray-800 rounded text-gray-400 hover:text-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 text-sm bg-[#0f1117] border border-gray-800 rounded text-gray-400 hover:text-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
