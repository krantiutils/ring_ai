"use client";

import React, { useState } from "react";
import type { ColumnDef, ColumnType } from "@/features/flows/builderTypes";
import { COLUMN_TYPE_META, validateCellValue, getValueHint } from "@/features/flows/columnTypes";
import { X } from "lucide-react";

const ALL_COLUMN_TYPES = Object.keys(COLUMN_TYPE_META) as ColumnType[];

type ManualTableEditorProps = {
  headers: ColumnDef[];
  rows: string[][];
  onHeadersChange: (headers: ColumnDef[]) => void;
  onRowsChange: (rows: string[][]) => void;
  compact?: boolean;
};

export default function ManualTableEditor({
  headers,
  rows,
  onHeadersChange,
  onRowsChange,
  compact,
}: ManualTableEditorProps) {
  function updateHeaderName(ci: number, name: string) {
    const next = headers.map((h, i) => (i === ci ? { ...h, name } : h));
    onHeadersChange(next);
  }

  function updateHeaderType(ci: number, type: ColumnType) {
    const next = headers.map((h, i) => (i === ci ? { ...h, type } : h));
    onHeadersChange(next);
  }

  function updateCell(ri: number, ci: number, value: string) {
    const next = rows.map((r) => [...r]);
    next[ri][ci] = value;
    onRowsChange(next);
  }

  function addColumn() {
    onHeadersChange([...headers, { name: `col${headers.length + 1}`, type: "text" }]);
    onRowsChange(rows.map((r) => [...r, ""]));
  }

  function removeColumn(ci: number) {
    if (headers.length <= 1) return;
    onHeadersChange(headers.filter((_, i) => i !== ci));
    onRowsChange(rows.map((r) => r.filter((_, i) => i !== ci)));
  }

  function addRow() {
    onRowsChange([...rows, headers.map(() => "")]);
  }

  function removeRow(ri: number) {
    onRowsChange(rows.filter((_, i) => i !== ri));
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {headers.map((h, ci) => (
                <th key={ci} className="border-b border-[var(--border)] px-2 py-1 relative group">
                  <div className="flex items-center gap-1">
                    <input
                      value={h.name}
                      onChange={(e) => updateHeaderName(ci, e.target.value)}
                      className="w-full bg-transparent text-center text-xs font-bold uppercase text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--accent)] rounded px-1 py-0.5"
                      placeholder="column"
                    />
                    {headers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeColumn(ci)}
                        className="opacity-0 group-hover:opacity-100 shrink-0 rounded p-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition"
                        title="Remove column"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <select
                    value={h.type}
                    onChange={(e) => updateHeaderType(ci, e.target.value as ColumnType)}
                    title={COLUMN_TYPE_META[h.type].hint}
                    className={
                      "mt-1 w-full rounded bg-[var(--muted)] text-[var(--muted-foreground)] outline-none focus:ring-1 focus:ring-[var(--accent)] " +
                      (compact ? "px-0.5 py-0 text-[10px]" : "px-1 py-0.5 text-xs")
                    }
                  >
                    {ALL_COLUMN_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {COLUMN_TYPE_META[t].label} — {COLUMN_TYPE_META[t].hint}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {headers.map((h, ci) => (
                  <td key={ci} className="border-b border-[var(--border)] px-2 py-1">
                    <CellInput
                      type={h.type}
                      value={row[ci] ?? ""}
                      onChange={(v) => updateCell(ri, ci, v)}
                      compact={compact}
                    />
                  </td>
                ))}
                <td className="w-8 text-center">
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(ri)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      x
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
          onClick={addColumn}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          + Column
        </button>
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--foreground)] hover:bg-[var(--muted)]"
        >
          + Row
        </button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        {headers.filter((h) => h.name.trim()).length} columns &middot; {rows.length} rows
      </p>
    </div>
  );
}

/* ── Type-aware cell input ─────────────────────────────── */

function CellInput({
  type,
  value,
  onChange,
  compact,
}: {
  type: ColumnType;
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const [showError, setShowError] = useState(false);
  const validation = value ? validateCellValue(value, type) : { valid: true };
  const hint = getValueHint(value, type);

  const baseClass = `w-full bg-transparent text-xs text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--accent)] rounded px-1 py-0.5 ${
    !validation.valid ? "ring-1 ring-red-400" : ""
  }`;

  const hintEl = hint && validation.valid ? (
    <p className="text-[9px] text-[var(--accent)] mt-0.5 opacity-70">{hint}</p>
  ) : null;

  switch (type) {
    case "boolean":
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={baseClass}>
          <option value="">—</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );

    case "number":
      return (
        <div>
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={COLUMN_TYPE_META.number.placeholder}
            className={baseClass}
          />
          {!validation.valid ? <p className="text-[9px] text-red-400 mt-0.5">{validation.message}</p> : hintEl}
        </div>
      );

    case "phone":
      return (
        <div>
          <input
            type="tel"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={COLUMN_TYPE_META.phone.placeholder}
            className={baseClass}
          />
          {!validation.valid ? <p className="text-[9px] text-red-400 mt-0.5">{validation.message}</p> : hintEl}
        </div>
      );

    case "email":
      return (
        <div>
          <input
            type="email"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={COLUMN_TYPE_META.email.placeholder}
            className={baseClass}
          />
          {!validation.valid ? <p className="text-[9px] text-red-400 mt-0.5">{validation.message}</p> : hintEl}
        </div>
      );

    case "url":
      return (
        <div>
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={COLUMN_TYPE_META.url.placeholder}
            className={baseClass}
          />
          {!validation.valid ? <p className="text-[9px] text-red-400 mt-0.5">{validation.message}</p> : hintEl}
        </div>
      );

    case "date":
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass}
        />
      );

    case "datetime":
      return (
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass}
        />
      );

    case "array":
    case "object":
      return (
        <div className="relative" onBlur={() => setShowError(true)} onFocus={() => setShowError(false)}>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={COLUMN_TYPE_META[type].placeholder}
            rows={compact ? 2 : 3}
            className={`${baseClass} resize-y font-mono text-[10px]`}
          />
          {showError && !validation.valid && (
            <p className="text-[9px] text-red-400 mt-0.5">{validation.message}</p>
          )}
        </div>
      );

    case "binary":
      return (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={COLUMN_TYPE_META.binary.placeholder}
          className={`${baseClass} font-mono text-[10px]`}
        />
      );

    default: // text
      return (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          className={baseClass}
        />
      );
  }
}
