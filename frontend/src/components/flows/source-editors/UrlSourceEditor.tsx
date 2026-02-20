"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import PreviewTable from "./PreviewTable";

type UrlPreview = {
  headers: string[];
  rows: string[][];
  totalRows: number;
};

type UrlSourceEditorProps = {
  url: string;
  onUrlChange: (url: string) => void;
  loading: boolean;
  error: string | null;
  preview: UrlPreview | null;
  onFetch: () => void;
  /** Label hint: "JSON" or "CSV" */
  sourceLabel?: string;
  compact?: boolean;
};

export default function UrlSourceEditor({
  url,
  onUrlChange,
  loading,
  error,
  preview,
  onFetch,
  sourceLabel,
  compact,
}: UrlSourceEditorProps) {
  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          {sourceLabel ?? "Data"} URL
        </span>
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://example.com/contacts.json"
            className={
              "input-modern flex-1 px-3 text-sm" +
              (compact ? " h-8" : " h-10")
            }
          />
          <button
            type="button"
            onClick={onFetch}
            disabled={loading || !url.trim()}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
          </button>
        </div>
      </label>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {preview && (
        <PreviewTable
          headers={preview.headers}
          rows={preview.rows}
          totalRows={preview.totalRows}
        />
      )}
    </div>
  );
}
