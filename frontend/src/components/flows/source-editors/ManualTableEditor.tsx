"use client";

import React from "react";
import type { ColumnDef, ColumnType } from "@/features/flows/builderTypes";
import { COLUMN_TYPE_META } from "@/features/flows/columnTypes";

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
                <th key={ci} className="border-b border-[var(--border)] px-2 py-1">
                  <input
                    value={h.name}
                    onChange={(e) => updateHeaderName(ci, e.target.value)}
                    className="w-full bg-transparent text-center text-xs font-bold uppercase text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--accent)] rounded px-1 py-0.5"
                    placeholder="column"
                  />
                  <select
                    value={h.type}
                    onChange={(e) => updateHeaderType(ci, e.target.value as ColumnType)}
                    className={
                      "mt-1 w-full rounded bg-[var(--muted)] text-[var(--muted-foreground)] outline-none focus:ring-1 focus:ring-[var(--accent)] " +
                      (compact ? "px-0.5 py-0 text-[10px]" : "px-1 py-0.5 text-xs")
                    }
                  >
                    {ALL_COLUMN_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {COLUMN_TYPE_META[t].label}
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
                {headers.map((_, ci) => (
                  <td key={ci} className="border-b border-[var(--border)] px-2 py-1">
                    <input
                      value={row[ci] ?? ""}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      className="w-full bg-transparent text-xs text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--accent)] rounded px-1 py-0.5"
                      placeholder="—"
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
