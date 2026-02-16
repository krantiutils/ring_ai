"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Calendar, CreditCard, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { CreditTransaction } from "@/types/dashboard";

export default function CreditPurchasePage() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("type", "purchase");
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#0F172A]/40" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-[#0052FF]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0052FF]/40 focus:border-transparent"
          />
        </div>
        <button className="flex items-center gap-1 border border-[#0052FF]/15 rounded-lg px-3 py-2 text-sm bg-white hover:bg-[#FAFAFA]">
          <Calendar className="w-4 h-4 text-[#0F172A]/40" />
          Date
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#0052FF]/15 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#0052FF]/10 bg-[#FAFAFA]/50">
              <th className="text-left text-xs font-medium text-[#0F172A]/50 uppercase tracking-wider px-6 py-3">S.N.</th>
              <th className="text-left text-xs font-medium text-[#0F172A]/50 uppercase tracking-wider px-6 py-3">From</th>
              <th className="text-left text-xs font-medium text-[#0F172A]/50 uppercase tracking-wider px-6 py-3">Credit Type</th>
              <th className="text-left text-xs font-medium text-[#0F172A]/50 uppercase tracking-wider px-6 py-3">Credit Rate</th>
              <th className="text-left text-xs font-medium text-[#0F172A]/50 uppercase tracking-wider px-6 py-3">Credit Added</th>
              <th className="text-left text-xs font-medium text-[#0F172A]/50 uppercase tracking-wider px-6 py-3">Time Stamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0052FF]/10">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0052FF]" />
                  </div>
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-[#FAFAFA] flex items-center justify-center">
                      <CreditCard className="w-7 h-7 text-[#0052FF]/40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#0F172A]/60">No purchase history yet</p>
                      <p className="text-xs text-[#0F172A]/40 mt-1">Your credit purchases will appear here</p>
                    </div>
                    <button className="mt-2 flex items-center gap-1.5 bg-[#0052FF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#0048D9] transition-colors">
                      <Plus className="w-4 h-4" />
                      Buy Credits
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              transactions.map((tx, index) => (
                <tr key={tx.id} className="hover:bg-[#FAFAFA]/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-[#0F172A]/50">{index + 1}</td>
                  <td className="px-6 py-4 text-sm text-[#0F172A]">{tx.description || "System"}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#4D7CFF]/15 text-[#4D7CFF]">
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-[#0F172A]/60">1.0</td>
                  <td className="px-6 py-4 text-sm font-medium text-[#4D7CFF]">+{tx.amount}</td>
                  <td className="px-6 py-4 text-sm text-[#0F172A]/50">{formatDate(tx.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {total > 0 && (
          <div className="px-6 py-3 border-t border-[#0052FF]/10 text-xs text-[#0F172A]/50">
            Showing {transactions.length} of {total} transactions
          </div>
        )}
      </div>
    </div>
  );
}
