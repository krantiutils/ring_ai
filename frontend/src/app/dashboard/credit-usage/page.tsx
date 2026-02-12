"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { CreditTransaction } from "@/lib/api";
import * as api from "@/lib/api";

export default function CreditUsageHistoryPage() {
  const { orgId } = useAuth();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    try {
      const resp = await api.listCreditTransactions({
        org_id: orgId,
        type: "usage",
        page,
        page_size: 20,
        start_date: dateFrom || undefined,
        end_date: dateTo || undefined,
      });
      let items = resp.items;
      if (search.trim()) {
        const q = search.toLowerCase();
        items = items.filter(
          (t) =>
            (t.campaign_name || "").toLowerCase().includes(q) ||
            t.description?.toLowerCase().includes(q),
        );
      }
      setTransactions(items);
      setTotal(resp.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [orgId, page, search, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Credit Usage History</h1>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by campaign..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#4ECDC4]"
          />
        </div>
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

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left">
              <th className="px-5 py-3 font-semibold text-gray-600">S.N.</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Campaign</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Type</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Credits Used</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Description</th>
              <th className="px-5 py-3 font-semibold text-gray-600">Time Stamp</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-400">Loading...</td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                  No usage history found
                </td>
              </tr>
            ) : (
              transactions.map((t, i) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-gray-500">{(page - 1) * 20 + i + 1}</td>
                  <td className="px-5 py-3 text-gray-900">{t.campaign_name || "—"}</td>
                  <td className="px-5 py-3 text-gray-600">{t.credit_type}</td>
                  <td className="px-5 py-3 font-medium text-red-600">-{formatNumber(t.amount)}</td>
                  <td className="px-5 py-3 text-gray-500">{t.description || "—"}</td>
                  <td className="px-5 py-3 text-gray-500">{formatDateTime(t.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
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
