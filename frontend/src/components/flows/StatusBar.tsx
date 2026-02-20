"use client";

type StatusBarProps = {
  nodeCount: number;
  contactCount: number;
  errorCount: number;
  warningCount: number;
};

export default function StatusBar({
  nodeCount,
  contactCount,
  errorCount,
  warningCount,
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
    </div>
  );
}
