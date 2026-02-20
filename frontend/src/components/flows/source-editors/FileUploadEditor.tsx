"use client";

import React from "react";
import { Upload } from "lucide-react";
import type { FlowNodeKind } from "@/features/flows/builderTypes";
import PreviewTable from "./PreviewTable";

type FilePreview = {
  headers: string[];
  rows: string[][];
  totalRows: number;
};

type FileUploadEditorProps = {
  sourceKind: FlowNodeKind;
  loading: boolean;
  error: string | null;
  preview: FilePreview | null;
  onUpload: (file: File) => void;
  compact?: boolean;
};

export default function FileUploadEditor({
  sourceKind,
  loading,
  error,
  preview,
  onUpload,
  compact,
}: FileUploadEditorProps) {
  const accept = sourceKind === "source_csv" ? ".csv" : ".xlsx";
  const label = sourceKind === "source_csv" ? ".csv" : ".xlsx";

  return (
    <div className="space-y-4">
      <label
        className={
          "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--muted)] transition hover:border-[var(--accent)]" +
          (compact ? " p-4" : " p-8")
        }
      >
        <Upload className={compact ? "h-5 w-5 text-[var(--muted-foreground)]" : "h-8 w-8 text-[var(--muted-foreground)]"} />
        <span className="text-sm text-[var(--muted-foreground)]">
          {loading ? "Uploading..." : `Drop or click to upload ${label} file`}
        </span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
          }}
        />
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
