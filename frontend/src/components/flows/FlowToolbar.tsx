"use client";

import { ArrowLeft, Check, FlaskConical, Loader2, Play, Save } from "lucide-react";

type FlowToolbarProps = {
  flowName: string;
  onNameChange: (name: string) => void;
  onBack: () => void;
  onSave: () => void;
  onRun: () => void;
  onTestRun: () => void;
  saving: boolean;
  running: boolean;
  savedAt: string | null;
};

export default function FlowToolbar({
  flowName,
  onNameChange,
  onBack,
  onSave,
  onRun,
  onTestRun,
  saving,
  running,
  savedAt,
}: FlowToolbarProps) {
  return (
    <div className="flex h-12 items-center gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4">
      <button
        type="button"
        onClick={onBack}
        className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
        title="Back to flows"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <input
        value={flowName}
        onChange={(e) => onNameChange(e.target.value)}
        className="h-8 w-60 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
      />

      {savedAt && (
        <span className="flex items-center gap-1 whitespace-nowrap text-[10px] text-[var(--muted-foreground)]">
          <Check className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[120px]">Saved {savedAt.replace(" (local only)", "")}</span>
        </span>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--muted)] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>

        <button
          type="button"
          onClick={onTestRun}
          disabled={running}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] transition hover:bg-[var(--muted)] disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
          Test Run
        </button>

        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run
        </button>
      </div>
    </div>
  );
}
