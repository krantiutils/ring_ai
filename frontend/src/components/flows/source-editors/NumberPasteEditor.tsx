"use client";

import React from "react";

type NumberPasteEditorProps = {
  numbersText: string;
  onNumbersChange: (text: string) => void;
  compact?: boolean;
};

export default function NumberPasteEditor({
  numbersText,
  onNumbersChange,
  compact,
}: NumberPasteEditorProps) {
  const count = numbersText
    .split(/[\n,]+/)
    .filter((s) => s.trim()).length;

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          Phone numbers (one per line or comma-separated)
        </span>
        <textarea
          value={numbersText}
          onChange={(e) => onNumbersChange(e.target.value)}
          placeholder={"+9779800000000\n+9779811111111"}
          className={
            "input-modern w-full resize-y px-3 py-2 text-sm" +
            (compact ? " min-h-[80px]" : " min-h-[120px]")
          }
        />
      </label>
      <p className="text-xs text-[var(--muted-foreground)]">
        {count} numbers parsed
      </p>
    </div>
  );
}
