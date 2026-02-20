"use client";

import React from "react";

type PreviewTableProps = {
  headers: string[];
  rows: string[][];
  totalRows?: number;
};

export default function PreviewTable({ headers, rows, totalRows }: PreviewTableProps) {
  return (
    <div className="space-y-1">
      {totalRows !== undefined && (
        <p className="text-xs text-[var(--muted-foreground)]">
          {headers.length} columns &middot; {totalRows} total rows (showing {rows.length})
        </p>
      )}
      <div className="max-h-[200px] overflow-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--muted)]">
            <tr>
              {headers.map((h, ci) => (
                <th
                  key={ci}
                  className="px-2 py-1.5 text-left font-bold uppercase text-[var(--muted-foreground)]"
                >
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
