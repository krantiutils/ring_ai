"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { CreditTransaction } from "@/types/dashboard";

export default function CreditUsagePage() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("type", "consume");
      if (search) params.set("search", search);
      const data = await api.getCreditHistory(params.toString());
      setTransactions(data.transactions);
      setTotal(data.total);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <button className="flex items-center gap-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50">
          <Calendar className="w-4 h-4 text-gray-400" />
          Date
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">S.N.</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Campaign</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Type</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Credits Used</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Reference</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Time Stamp</th>
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
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                  No usage history found
                </td>
              </tr>
            ) : (
              transactions.map((tx, index) => (
                <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-500">{index + 1}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{tx.description || "--"}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-red-600">-{tx.amount}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono text-xs">{tx.reference_id || "--"}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(tx.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {total > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-500">
            Showing {transactions.length} of {total} transactions
          </div>
        )}
      </div>
    </div>
  );
}
