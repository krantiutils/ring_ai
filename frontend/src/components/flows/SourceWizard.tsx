"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Table2,
  UsersRound,
} from "lucide-react";
import type { ColumnDef, FlowNodeKind } from "@/features/flows/builderTypes";
import { SOURCE_CHOICES } from "@/features/flows/nodeRegistry";
import { NODE_ICON } from "@/features/flows/nodeRegistry";
import { api } from "@/lib/api";

import ManualTableEditor from "./source-editors/ManualTableEditor";
import UrlSourceEditor from "./source-editors/UrlSourceEditor";
import FileUploadEditor from "./source-editors/FileUploadEditor";
import NumberPasteEditor from "./source-editors/NumberPasteEditor";

type SourceWizardProps = {
  onComplete: (
    sourceKind: FlowNodeKind,
    config: Record<string, string>,
    columns: ColumnDef[],
  ) => void;
};

export default function SourceWizard({ onComplete }: SourceWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [sourceKind, setSourceKind] = useState<FlowNodeKind | null>(null);

  // Manual table state
  const [headers, setHeaders] = useState<ColumnDef[]>([
    { name: "name", type: "text" },
    { name: "phone", type: "phone" },
  ]);
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
      const safeHeaders = headers.filter((h) => h.name.trim());
      if (safeHeaders.length === 0) return;
      const names = safeHeaders.map((h) => h.name.trim());
      const csv = [
        names.join(","),
        ...rows.map((r) => names.map((_, i) => (r[i] || "").trim()).join(",")),
      ].join("\n");
      onComplete(
        sourceKind,
        { table_columns: names.join(","), sample_csv: csv },
        safeHeaders,
      );
      return;
    }

    if (sourceKind === "source_url_json" || sourceKind === "source_url_csv") {
      if (!urlPreview) return;
      onComplete(
        sourceKind,
        {
          url,
          mapping: urlPreview.mapping,
          estimated_rows: String(urlPreview.totalRows),
          sample_csv: urlPreview.sampleCsv,
        },
        urlPreview.headers.map((h): ColumnDef => ({ name: h, type: "text" })),
      );
      return;
    }

    if (sourceKind === "source_csv" || sourceKind === "source_xlsx") {
      if (!filePreview) return;
      onComplete(
        sourceKind,
        {
          file_id: filePreview.fileId,
          file_headers: filePreview.headers.join(","),
          total_rows: String(filePreview.totalRows),
          sample_csv: [
            filePreview.headers.join(","),
            ...filePreview.rows.map((r) => r.join(",")),
          ].join("\n"),
        },
        filePreview.headers.map((h): ColumnDef => ({ name: h, type: "text" })),
      );
      return;
    }

    if (sourceKind === "source_numbers") {
      const nums = numbersText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (nums.length === 0) return;
      onComplete(
        sourceKind,
        { numbers: nums.join(",") },
        [{ name: "phone", type: "phone" }],
      );
      return;
    }

    if (sourceKind === "source_google_contacts") {
      onComplete(
        sourceKind,
        { sync_mode: "labels:customers", estimated_contacts: "0" },
        [
          { name: "name", type: "text" },
          { name: "phone", type: "phone" },
          { name: "email", type: "email" },
        ],
      );
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
    (sourceKind === "source_manual_table" && headers.some((h) => h.name.trim())) ||
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
          <ManualTableEditor
            headers={headers}
            rows={rows}
            onHeadersChange={setHeaders}
            onRowsChange={setRows}
          />
        )}

        {/* ── URL Source ────────────────────────────── */}
        {(sourceKind === "source_url_json" || sourceKind === "source_url_csv") && (
          <UrlSourceEditor
            url={url}
            onUrlChange={setUrl}
            loading={urlLoading}
            error={urlError}
            preview={
              urlPreview
                ? { headers: urlPreview.headers, rows: urlPreview.rows, totalRows: urlPreview.totalRows }
                : null
            }
            onFetch={fetchUrlPreview}
            sourceLabel={sourceKind === "source_url_json" ? "JSON" : "CSV"}
          />
        )}

        {/* ── File Upload ───────────────────────────── */}
        {(sourceKind === "source_csv" || sourceKind === "source_xlsx") && (
          <FileUploadEditor
            sourceKind={sourceKind}
            loading={fileLoading}
            error={fileError}
            preview={
              filePreview
                ? { headers: filePreview.headers, rows: filePreview.rows, totalRows: filePreview.totalRows }
                : null
            }
            onUpload={uploadFile}
          />
        )}

        {/* ── Paste Numbers ─────────────────────────── */}
        {sourceKind === "source_numbers" && (
          <NumberPasteEditor
            numbersText={numbersText}
            onNumbersChange={setNumbersText}
          />
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
