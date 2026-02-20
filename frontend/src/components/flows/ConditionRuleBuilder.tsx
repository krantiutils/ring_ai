"use client";

import { useState } from "react";

type ConditionRuleBuilderProps = {
  field: string;
  operator: string;
  value: string;
  columns: string[];
  onChange: (key: string, val: string) => void;
  sampleRows?: Record<string, unknown>[];
};

const OPERATORS = [
  { value: "==", label: "equals" },
  { value: "!=", label: "not equals" },
  { value: ">", label: "greater than" },
  { value: "<", label: "less than" },
  { value: ">=", label: "≥" },
  { value: "<=", label: "≤" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
];

export default function ConditionRuleBuilder({
  field,
  operator,
  value,
  columns,
  onChange,
  sampleRows,
}: ConditionRuleBuilderProps) {
  const [mode, setMode] = useState<"visual" | "expression">("visual");

  // Compute preview counts from sample rows
  let trueCount = 0;
  let falseCount = 0;
  if (sampleRows && field) {
    for (const row of sampleRows) {
      const rv = String(row[field] ?? "");
      const match = evaluateCondition(rv, operator, value);
      if (match) trueCount++;
      else falseCount++;
    }
  }

  if (mode === "expression") {
    const expr = field && operator && value ? `${field} ${operator} ${value}` : "";
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--muted-foreground)]">Expression</span>
          <button
            type="button"
            onClick={() => setMode("visual")}
            className="text-[10px] text-[var(--accent)] hover:underline"
          >
            Switch to visual
          </button>
        </div>
        <input
          value={expr}
          readOnly
          className="input-modern h-9 w-full px-3 text-sm font-mono"
        />
        {field && (
          <div className="flex gap-3 text-xs">
            <span className="text-green-600">TRUE: {trueCount}</span>
            <span className="text-red-500">FALSE: {falseCount}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">Condition Rule</span>
        <button
          type="button"
          onClick={() => setMode("expression")}
          className="text-[10px] text-[var(--accent)] hover:underline"
        >
          Switch to expression
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Field */}
        <select
          value={field}
          onChange={(e) => onChange("field", e.target.value)}
          className="input-modern h-9 flex-1 px-2 text-sm"
        >
          <option value="">field…</option>
          {columns.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>

        {/* Operator */}
        <select
          value={operator}
          onChange={(e) => onChange("operator", e.target.value)}
          className="input-modern h-9 w-28 px-2 text-sm"
        >
          {OPERATORS.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>

        {/* Value */}
        <input
          value={value}
          onChange={(e) => onChange("value", e.target.value)}
          placeholder="value"
          className="input-modern h-9 flex-1 px-2 text-sm"
        />
      </div>

      {/* Preview */}
      {field && sampleRows && sampleRows.length > 0 && (
        <div className="flex gap-3 text-xs">
          <span className="text-green-600">TRUE: {trueCount}</span>
          <span className="text-red-500">FALSE: {falseCount}</span>
        </div>
      )}
    </div>
  );
}

function evaluateCondition(rowValue: string, op: string, target: string): boolean {
  const numRow = parseFloat(rowValue);
  const numTarget = parseFloat(target);
  const bothNumeric = !isNaN(numRow) && !isNaN(numTarget);

  switch (op) {
    case "==":
      return rowValue === target;
    case "!=":
      return rowValue !== target;
    case ">":
      return bothNumeric ? numRow > numTarget : rowValue > target;
    case "<":
      return bothNumeric ? numRow < numTarget : rowValue < target;
    case ">=":
      return bothNumeric ? numRow >= numTarget : rowValue >= target;
    case "<=":
      return bothNumeric ? numRow <= numTarget : rowValue <= target;
    case "contains":
      return rowValue.includes(target);
    case "startsWith":
      return rowValue.startsWith(target);
    default:
      return false;
  }
}
