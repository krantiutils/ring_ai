"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Filter, ArrowUpDown, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";
import type { Campaign } from "@/types/dashboard";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-purple-100 text-purple-700",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDrafts, setShowDrafts] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [total, setTotal] = useState(0);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (showDrafts) params.set("status", "draft");
      const data = await api.getCampaigns(params.toString());
      setCampaigns(data.campaigns);
      setTotal(data.total);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, showDrafts]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showDrafts}
            onChange={(e) => setShowDrafts(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          Show Draft
        </label>

        <div className="flex items-center gap-1 text-sm">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div className="flex items-center gap-1 text-sm">
          <ArrowUpDown className="w-4 h-4 text-gray-400" />
          <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option>Sort: All</option>
            <option>Name A-Z</option>
            <option>Name Z-A</option>
            <option>Newest</option>
            <option>Oldest</option>
          </select>
        </div>

        <button className="flex items-center gap-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50">
          <Calendar className="w-4 h-4 text-gray-400" />
          Date
        </button>

        <button className="ml-auto flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" />
          Add New Campaign
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Campaign Name</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Status</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Progress</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Count</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Modified at</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                  </div>
                </td>
              </tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                  No data found
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => {
                const progress =
                  campaign.total_contacts && campaign.total_contacts > 0
                    ? Math.round(((campaign.completed_interactions || 0) / campaign.total_contacts) * 100)
                    : 0;
                return (
                  <tr key={campaign.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{campaign.name}</td>
                    <td className="px-6 py-4">
                      <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[campaign.status] || "bg-gray-100 text-gray-600")}>
                        {campaign.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{progress}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 capitalize">{campaign.category}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{campaign.total_contacts || 0}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(campaign.updated_at)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {total > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-500">
            Showing {campaigns.length} of {total} campaigns
          </div>
        )}
      </div>
    </div>
  );
}
