"use client";

import { useState } from "react";
import type { ColumnDef, ColumnType } from "@/features/flows/builderTypes";

type ConditionRuleBuilderProps = {
  field: string;
  operator: string;
  value: string;
  inputFrom: string;
  upstreamNodes: Array<{ id: string; label: string }>;
  columns: string[];
  columnDefs: ColumnDef[];
  onChange: (key: string, val: string) => void;
  sampleRows?: Record<string, unknown>[];
};

type OperatorDef = { value: string; label: string };

const TEXT_OPERATORS: OperatorDef[] = [
  { value: "==", label: "equals" },
  { value: "!=", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
];

const NUMBER_OPERATORS: OperatorDef[] = [
  { value: "==", label: "=" },
  { value: "!=", label: "≠" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: "≥" },
  { value: "<=", label: "≤" },
];

const BOOLEAN_OPERATORS: OperatorDef[] = [
  { value: "==", label: "equals" },
  { value: "!=", label: "not equals" },
];

const DATE_OPERATORS: OperatorDef[] = [
  { value: "==", label: "equals" },
  { value: "!=", label: "not equals" },
  { value: ">", label: "after" },
  { value: "<", label: "before" },
  { value: ">=", label: "on or after" },
  { value: "<=", label: "on or before" },
];

function getOperatorsForType(type: ColumnType | undefined): OperatorDef[] {
  switch (type) {
    case "number":
      return NUMBER_OPERATORS;
    case "boolean":
      return BOOLEAN_OPERATORS;
    case "date":
    case "datetime":
      return DATE_OPERATORS;
    case "phone":
    case "email":
    case "url":
    case "text":
    default:
      return TEXT_OPERATORS;
  }
}

export default function ConditionRuleBuilder({
  field,
  operator,
  value,
  inputFrom,
  upstreamNodes,
  columns,
  columnDefs,
  onChange,
  sampleRows,
}: ConditionRuleBuilderProps) {
  const [mode, setMode] = useState<"visual" | "expression">("visual");

  // Look up the type of the selected field
  const selectedDef = columnDefs.find((d) => d.name === field);
  const fieldType = selectedDef?.type;
  const operators = getOperatorsForType(fieldType);

  // Reset operator when it's not valid for the new type
  const validOperatorValues = operators.map((o) => o.value);
  const effectiveOperator = validOperatorValues.includes(operator) ? operator : operators[0]?.value ?? "==";

  // Compute preview counts from sample rows
  let trueCount = 0;
  let falseCount = 0;
  if (sampleRows && field) {
    for (const row of sampleRows) {
      const rv = String(row[field] ?? "");
      const match = evaluateCondition(rv, effectiveOperator, value);
      if (match) trueCount++;
      else falseCount++;
    }
  }

  function handleFieldChange(newField: string) {
    onChange("field", newField);
    // Reset operator and value when field changes to a different type
    const newDef = columnDefs.find((d) => d.name === newField);
    const newOps = getOperatorsForType(newDef?.type);
    if (!newOps.find((o) => o.value === operator)) {
      onChange("operator", newOps[0]?.value ?? "==");
    }
    // Reset value for boolean fields
    if (newDef?.type === "boolean") {
      onChange("value", "true");
    }
  }

  if (mode === "expression") {
    const expr = field && effectiveOperator && value ? `${field} ${effectiveOperator} ${value}` : "";
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

      {/* Field selector with type badge */}
      {upstreamNodes.length > 1 && (
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            Input Source
          </label>
          <select
            value={inputFrom || "__all__"}
            onChange={(e) => onChange("input_from", e.target.value)}
            className="input-modern h-9 w-full px-2 text-sm"
          >
            <option value="__all__">All upstream sources</option>
            {upstreamNodes.map((src) => (
              <option key={src.id} value={src.id}>{src.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Choose a specific upstream table/branch when multiple sources feed this node.
          </p>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
          Field
        </label>
        <select
          value={field}
          onChange={(e) => handleFieldChange(e.target.value)}
          className="input-modern h-9 w-full px-2 text-sm"
        >
          <option value="">Select field…</option>
          {columns.map((col) => {
            const def = columnDefs.find((d) => d.name === col);
            const typeLabel = def?.type ? ` (${def.type})` : "";
            return (
              <option key={col} value={col}>
                {col}{typeLabel}
              </option>
            );
          })}
        </select>
      </div>

      {field && (
        <>
          {/* Type indicator */}
          {fieldType && (
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-md bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--foreground)]">
                {fieldType}
              </span>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {fieldType === "boolean" ? "true/false values" :
                 fieldType === "number" ? "numeric comparison" :
                 fieldType === "date" || fieldType === "datetime" ? "date comparison" :
                 "text matching"}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Operator */}
            <select
              value={effectiveOperator}
              onChange={(e) => onChange("operator", e.target.value)}
              className="input-modern h-9 w-28 px-2 text-sm"
            >
              {operators.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {/* Value — type-specific input */}
            {fieldType === "boolean" ? (
              <select
                value={value}
                onChange={(e) => onChange("value", e.target.value)}
                className="input-modern h-9 flex-1 px-2 text-sm"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : fieldType === "number" ? (
              <input
                type="number"
                value={value}
                onChange={(e) => onChange("value", e.target.value)}
                placeholder="0"
                className="input-modern h-9 flex-1 px-2 text-sm"
              />
            ) : fieldType === "date" || fieldType === "datetime" ? (
              <input
                type="date"
                value={value}
                onChange={(e) => onChange("value", e.target.value)}
                className="input-modern h-9 flex-1 px-2 text-sm"
              />
            ) : (
              <input
                value={value}
                onChange={(e) => onChange("value", e.target.value)}
                placeholder="value"
                className="input-modern h-9 flex-1 px-2 text-sm"
              />
            )}
          </div>
        </>
      )}

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
