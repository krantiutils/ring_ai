"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Table2,
  Upload,
  UsersRound,
} from "lucide-react";
import type { FlowNodeKind } from "@/features/flows/builderTypes";
import { SOURCE_CHOICES } from "@/features/flows/nodeRegistry";
import { NODE_ICON } from "@/features/flows/nodeRegistry";
import { api } from "@/lib/api";

type SourceWizardProps = {
  onComplete: (
    sourceKind: FlowNodeKind,
    config: Record<string, string>,
    columns: string[],
  ) => void;
};

export default function SourceWizard({ onComplete }: SourceWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [sourceKind, setSourceKind] = useState<FlowNodeKind | null>(null);

  // Manual table state
  const [headers, setHeaders] = useState<string[]>(["name", "phone"]);
  const [rows, setRows] = useState<string[][]>([["", ""]]);

  // URL source state
  const [url, setUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlPreview, setUrlPreview] = useState<{
    headers: string[];
    rows: string[][];
    totalRows: number;
    mapping: string;
    sampleCsv: string;
  } | null>(null);

  // File upload state
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<{
    fileId: string;
    headers: string[];
    rows: string[][];
    totalRows: number;
  } | null>(null);

  // Paste numbers state
  const [numbersText, setNumbersText] = useState("");

  function pickSource(kind: FlowNodeKind) {
    setSourceKind(kind);
    setStep(2);
  }

  function handleComplete() {
    if (!sourceKind) return;

    if (sourceKind === "source_manual_table") {
      const safeHeaders = headers.map((h) => h.trim()).filter(Boolean);
      if (safeHeaders.length === 0) return;
      const csv = [safeHeaders.join(","), ...rows.map((r) => safeHeaders.map((_, i) => (r[i] || "").trim()).join(","))].join("\n");
      onComplete(sourceKind, { table_columns: safeHeaders.join(","), sample_csv: csv }, safeHeaders);
      return;
    }

    if (sourceKind === "source_url_json" || sourceKind === "source_url_csv") {
      if (!urlPreview) return;
      onComplete(sourceKind, {
        url,
        mapping: urlPreview.mapping,
        estimated_rows: String(urlPreview.totalRows),
        sample_csv: urlPreview.sampleCsv,
      }, urlPreview.headers);
      return;
    }

    if (sourceKind === "source_csv" || sourceKind === "source_xlsx") {
      if (!filePreview) return;
      onComplete(sourceKind, {
        file_id: filePreview.fileId,
        file_headers: filePreview.headers.join(","),
        total_rows: String(filePreview.totalRows),
        sample_csv: [filePreview.headers.join(","), ...filePreview.rows.map((r) => r.join(","))].join("\n"),
      }, filePreview.headers);
      return;
    }

    if (sourceKind === "source_numbers") {
      const nums = numbersText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      if (nums.length === 0) return;
      onComplete(sourceKind, { numbers: nums.join(",") }, ["phone"]);
      return;
    }

    if (sourceKind === "source_google_contacts") {
      onComplete(sourceKind, { sync_mode: "labels:customers", estimated_contacts: "0" }, ["name", "phone", "email"]);
      return;
    }
  }

  async function fetchUrlPreview() {
    if (!sourceKind || !url.trim()) return;
    setUrlLoading(true);
    setUrlError(null);
    try {
      const res = await api.previewFlowUrlSource({
        url: url.trim(),
        source_kind: sourceKind as "source_url_json" | "source_url_csv",
        max_preview_rows: 6,
        max_rows: 2000,
      });
      setUrlPreview({
        headers: res.headers,
        rows: res.preview_rows,
        totalRows: res.total_rows,
        mapping: res.mapping,
        sampleCsv: res.sample_csv,
      });
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : "Failed to fetch URL.");
    } finally {
      setUrlLoading(false);
    }
  }

  async function uploadFile(file: File) {
    setFileLoading(true);
    setFileError(null);
    try {
      const res = await api.uploadSourceFile(file);
      setFilePreview({
        fileId: res.file_id,
        headers: res.headers,
        rows: res.preview_rows,
        totalRows: res.total_rows,
      });
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setFileLoading(false);
    }
  }

  // ── Step 1: Pick Source ───────────────────────────────
  if (step === 1) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <h2 className="font-display text-2xl text-[var(--foreground)]">Choose Data Source</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Where are your contacts coming from?
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {SOURCE_CHOICES.map((s) => {
            const Icon = NODE_ICON[s.kind] ?? Table2;
            return (
              <button
                key={s.kind}
                type="button"
                onClick={() => pickSource(s.kind)}
                className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-[var(--accent)] hover:shadow-md"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{s.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{s.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Step 2: Configure + Preview ───────────────────────
  const canContinue =
    (sourceKind === "source_manual_table" && headers.some((h) => h.trim())) ||
    (sourceKind === "source_url_json" && urlPreview !== null) ||
    (sourceKind === "source_url_csv" && urlPreview !== null) ||
    (sourceKind === "source_csv" && filePreview !== null) ||
    (sourceKind === "source_xlsx" && filePreview !== null) ||
    (sourceKind === "source_numbers" && numbersText.trim().length > 0) ||
    sourceKind === "source_google_contacts";

  return (
    <div className="mx-auto max-w-3xl py-8">
      <button
        type="button"
        onClick={() => { setStep(1); setSourceKind(null); }}
        className="mb-4 flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h2 className="font-display text-2xl text-[var(--foreground)]">
        {SOURCE_CHOICES.find((s) => s.kind === sourceKind)?.title ?? "Configure Source"}
      </h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Set up your data, then continue to the canvas.
      </p>

      <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        {/* ── Manual Table ──────────────────────────── */}
        {sourceKind === "source_manual_table" && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {headers.map((h, ci) => (
                      <th key={ci} className="border-b border-[var(--border)] px-2 py-1">
                        <input
                          value={h}
                          onChange={(e) => {
                            const next = [...headers];
                            next[ci] = e.target.value;
                            setHeaders(next);
                          }}
                          className="w-full bg-transparent text-center text-xs font-bold uppercase text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--accent)] rounded px-1 py-0.5"
                          placeholder="column"
                        />
                      </th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri}>
                      {headers.map((_, ci) => (
                        <td key={ci} className="border-b border-[var(--border)] px-2 py-1">
                          <input
                            value={row[ci] ?? ""}
                            onChange={(e) => {
                              const next = rows.map((r) => [...r]);
                              next[ri][ci] = e.target.value;
                              setRows(next);
                            }}
                            className="w-full bg-transparent text-xs text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--accent)] rounded px-1 py-0.5"
                            placeholder="—"
                          />
                        </td>
                      ))}
                      <td className="w-8 text-center">
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setRows(rows.filter((_, i) => i !== ri))}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setHeaders([...headers, `col${headers.length + 1}`]);
                  setRows(rows.map((r) => [...r, ""]));
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                + Column
              </button>
              <button
                type="button"
                onClick={() => setRows([...rows, headers.map(() => "")])}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                + Row
              </button>
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              {headers.filter((h) => h.trim()).length} columns · {rows.length} rows
            </p>
          </div>
        )}

        {/* ── URL Source ────────────────────────────── */}
        {(sourceKind === "source_url_json" || sourceKind === "source_url_csv") && (
          <div className="space-y-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">
                {sourceKind === "source_url_json" ? "JSON" : "CSV"} URL
              </span>
              <div className="flex gap-2">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/contacts.json"
                  className="input-modern h-10 flex-1 px-3 text-sm"
                />
                <button
                  type="button"
                  onClick={fetchUrlPreview}
                  disabled={urlLoading || !url.trim()}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {urlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
                </button>
              </div>
            </label>
            {urlError && <p className="text-xs text-red-500">{urlError}</p>}
            {urlPreview && <PreviewTable headers={urlPreview.headers} rows={urlPreview.rows} totalRows={urlPreview.totalRows} />}
          </div>
        )}

        {/* ── File Upload ───────────────────────────── */}
        {(sourceKind === "source_csv" || sourceKind === "source_xlsx") && (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--muted)] p-8 transition hover:border-[var(--accent)]">
              <Upload className="h-8 w-8 text-[var(--muted-foreground)]" />
              <span className="text-sm text-[var(--muted-foreground)]">
                {fileLoading ? "Uploading..." : `Drop or click to upload ${sourceKind === "source_csv" ? ".csv" : ".xlsx"} file`}
              </span>
              <input
                type="file"
                accept={sourceKind === "source_csv" ? ".csv" : ".xlsx"}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                }}
              />
            </label>
            {fileError && <p className="text-xs text-red-500">{fileError}</p>}
            {filePreview && <PreviewTable headers={filePreview.headers} rows={filePreview.rows} totalRows={filePreview.totalRows} />}
          </div>
        )}

        {/* ── Paste Numbers ─────────────────────────── */}
        {sourceKind === "source_numbers" && (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Phone numbers (one per line or comma-separated)</span>
              <textarea
                value={numbersText}
                onChange={(e) => setNumbersText(e.target.value)}
                placeholder={"+9779800000000\n+9779811111111"}
                className="input-modern min-h-[120px] w-full resize-y px-3 py-2 text-sm"
              />
            </label>
            <p className="text-xs text-[var(--muted-foreground)]">
              {numbersText.split(/[\n,]+/).filter((s) => s.trim()).length} numbers parsed
            </p>
          </div>
        )}

        {/* ── Google Contacts ───────────────────────── */}
        {sourceKind === "source_google_contacts" && (
          <div className="rounded-lg bg-[var(--muted)] p-6 text-center">
            <UsersRound className="mx-auto h-8 w-8 text-[var(--muted-foreground)]" />
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              Google Contacts integration coming soon. Columns: name, phone, email.
            </p>
          </div>
        )}
      </div>

      {/* ── Continue Button ─────────────────────────── */}
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleComplete}
          disabled={!canContinue}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          <CheckCircle2 className="h-4 w-4" />
          Continue to Canvas
        </button>
      </div>
    </div>
  );
}

/* ── Shared Preview Table ───────────────────────────────── */

function PreviewTable({
  headers,
  rows,
  totalRows,
}: {
  headers: string[];
  rows: string[][];
  totalRows: number;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-[var(--muted-foreground)]">
        {headers.length} columns · {totalRows} total rows (showing {rows.length})
      </p>
      <div className="max-h-[200px] overflow-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--muted)]">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-2 py-1.5 text-left font-bold uppercase text-[var(--muted-foreground)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-t border-[var(--border)]">
                {headers.map((_, ci) => (
                  <td key={ci} className="px-2 py-1 text-[var(--foreground)]">
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
