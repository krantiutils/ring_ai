"use client";

import { Loader2 } from "lucide-react";

type StatusBarProps = {
  nodeCount: number;
  contactCount: number;
  errorCount: number;
  warningCount: number;
  runStatus?: string | null;
  runMode?: string | null;
  runProgress?: { current_node: string | null; steps_done: number; steps_total: number } | null;
};

export default function StatusBar({
  nodeCount,
  contactCount,
  errorCount,
  warningCount,
  runStatus,
  runMode,
  runProgress,
}: StatusBarProps) {
  const valid = errorCount === 0;
  return (
    <div className="flex h-8 items-center gap-4 border-t border-[var(--border)] bg-[var(--card)] px-4 text-[11px] text-[var(--muted-foreground)]">
      <span className="flex items-center gap-1">
        <span
          className={`inline-block h-2 w-2 rounded-full ${valid ? "bg-green-500" : "bg-red-500"}`}
        />
        {valid ? "Valid" : `${errorCount} errors`}
      </span>
      <span>{nodeCount} nodes</span>
      <span>{contactCount} contacts</span>
      {warningCount > 0 && <span className="text-yellow-600">{warningCount} warnings</span>}
      {runStatus && (
        <span className={`ml-auto flex items-center gap-1.5 ${runStatus === "error" || runStatus === "failed" ? "text-red-500" : "text-[var(--accent)]"}`}>
          {runMode === "dry_run" && (
            <span className="rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] font-medium">TEST</span>
          )}
          {(runStatus === "running" || runStatus === "pending") && (
            <Loader2 className="h-3 w-3 animate-spin" />
          )}
          Run: {runStatus}
          {runProgress && runProgress.steps_total > 0 && (
            <span className="text-[var(--muted-foreground)]">
              ({runProgress.steps_done}/{runProgress.steps_total})
            </span>
          )}
        </span>
      )}
    </div>
  );
}
