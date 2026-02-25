"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ArrowLeft, CheckCircle, XCircle, Loader2, FlaskConical, Clock } from "lucide-react";
import Link from "next/link";

type RunSummary = {
  id: string;
  flow_id: string;
  status: string;
  mode: string;
  started_at: string | null;
  completed_at: string | null;
  contact_count: number;
  error: string | null;
};

export default function RunsHistoryPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    api.listFlowRuns(filter ? { status: filter } : undefined)
      .then((data) => { if (!cancelled) setRuns(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard/flows" className="rounded p-1.5 hover:bg-[var(--muted)]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Flow Runs</h1>
      </div>

      <div className="mb-4 flex gap-2">
        {["", "completed", "failed", "cancelled", "running"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              filter === s
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-[var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading runs...
        </div>
      ) : runs.length === 0 ? (
        <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">No runs found.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)]">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)]">Status</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)]">Mode</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)]">Contacts</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)]">Started</th>
                <th className="px-4 py-2 text-left font-medium text-[var(--muted-foreground)]">Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-[var(--border)] hover:bg-[var(--muted)]/50">
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-1.5">
                      {run.status === "completed" ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : run.status === "failed" ? (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      ) : run.status === "running" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                      )}
                      <span className="capitalize">{run.status}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {run.mode === "dry_run" ? (
                      <span className="flex items-center gap-1 text-xs text-[var(--accent)]">
                        <FlaskConical className="h-3 w-3" /> Test
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--muted-foreground)]">Live</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-[var(--muted-foreground)]">{run.contact_count}</td>
                  <td className="px-4 py-2 text-[var(--muted-foreground)]">
                    {run.started_at ? new Date(run.started_at).toLocaleString() : "\u2014"}
                  </td>
                  <td className="px-4 py-2 text-[var(--muted-foreground)]">
                    {run.started_at && run.completed_at
                      ? `${Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
                      : run.status === "running"
                        ? "..."
                        : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
