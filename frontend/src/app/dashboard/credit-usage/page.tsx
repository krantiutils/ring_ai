"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Calendar, Receipt } from "lucide-react";
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D]/40" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-transparent"
          />
        </div>
        <button className="flex items-center gap-1 border border-[#FF6B6B]/15 rounded-lg px-3 py-2 text-sm bg-white hover:bg-[#FFF8F0]">
          <Calendar className="w-4 h-4 text-[#2D2D2D]/40" />
          Date
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#FF6B6B]/10 bg-[#FFF8F0]/50">
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">S.N.</th>
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Campaign</th>
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Type</th>
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Credits Used</th>
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Reference</th>
              <th className="text-left text-xs font-medium text-[#2D2D2D]/50 uppercase tracking-wider px-6 py-3">Time Stamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FF6B6B]/10">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FF6B6B]" />
                  </div>
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-[#FFF8F0] flex items-center justify-center">
                      <Receipt className="w-7 h-7 text-[#FF6B6B]/40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#2D2D2D]/60">No usage history yet</p>
                      <p className="text-xs text-[#2D2D2D]/40 mt-1">Credit usage from campaigns will appear here</p>
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              transactions.map((tx, index) => (
                <tr key={tx.id} className="hover:bg-[#FFF8F0]/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-[#2D2D2D]/50">{index + 1}</td>
                  <td className="px-6 py-4 text-sm text-[#2D2D2D]">{tx.description || "--"}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FF6B6B]/15 text-[#FF6B6B]">
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-[#FF6B6B]">-{tx.amount}</td>
                  <td className="px-6 py-4 text-sm text-[#2D2D2D]/50 font-mono text-xs">{tx.reference_id || "--"}</td>
                  <td className="px-6 py-4 text-sm text-[#2D2D2D]/50">{formatDate(tx.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {total > 0 && (
          <div className="px-6 py-3 border-t border-[#FF6B6B]/10 text-xs text-[#2D2D2D]/50">
            Showing {transactions.length} of {total} transactions
          </div>
        )}
      </div>
    </div>
  );
}
