"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getCreditHistory } from "@/lib/api";
import type { CreditTransaction, PaginatedResponse } from "@/lib/api";

export default function CreditPurchasePage() {
  const { user } = useAuth();
  const [data, setData] = useState<PaginatedResponse<CreditTransaction> | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getCreditHistory(user.id, page)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, page]);

  const purchases = (data?.items ?? []).filter(
    (t) => t.type === "purchase" || t.type === "refund",
  );

  const filtered = purchases.filter((t) => {
    if (!search) return true;
    return (
      t.description?.toLowerCase().includes(search.toLowerCase()) ||
      t.reference_id?.toLowerCase().includes(search.toLowerCase())
    );
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
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#1a1d29] border border-gray-800 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <input
          type="date"
          className="px-3 py-2 bg-[#1a1d29] border border-gray-800 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-[#1a1d29] rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  S.N.
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  From
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Credit Type
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Credit Rate
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Credit Added
                </th>
                <th className="text-left px-5 py-3 text-gray-400 font-medium">
                  Time Stamp
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
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500">
                    No purchase history found
                  </td>
                </tr>
              ) : (
                filtered.map((t, idx) => (
                  <tr
                    key={t.id}
                    className="border-b border-gray-800/50 hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3 text-gray-400">{idx + 1}</td>
                    <td className="px-5 py-3 text-white">
                      {t.description || "System"}
                    </td>
                    <td className="px-5 py-3 text-gray-300">
                      {t.type.charAt(0).toUpperCase() + t.type.slice(1)}
                    </td>
                    <td className="px-5 py-3 text-gray-300">1.0</td>
                    <td className="px-5 py-3 text-green-400">
                      +{t.amount.toFixed(1)}
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {new Date(t.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-800">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
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
