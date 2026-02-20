"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import type { FlowNode } from "@/features/flows/builderTypes";
import { NODE_ICON, getNodeColor } from "@/features/flows/nodeRegistry";
import ConditionRuleBuilder from "./ConditionRuleBuilder";

type NodeInspectorProps = {
  node: FlowNode;
  columns: string[];
  onUpdate: (key: string, value: string) => void;
  onClose: () => void;
  onDelete: () => void;
};

export default function NodeInspector({
  node,
  columns,
  onUpdate,
  onClose,
  onDelete,
}: NodeInspectorProps) {
  const { data } = node;
  const color = getNodeColor(data.kind);
  const Icon = NODE_ICON[data.kind];

  // Parse sample rows for condition preview
  const sampleRows = React.useMemo(() => {
    // Find sample_csv from config (injected by orchestrator or wizard)
    // This is a simplification — in production, it would come from upstream node data
    return [];
  }, []);

  return (
    <div className="flex h-full flex-col border-l border-[var(--border)] bg-[var(--card)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        {Icon && <Icon className="h-4 w-4" style={{ color }} />}
        <span className="flex-1 text-sm font-semibold text-[var(--foreground)]">{data.label}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Variable Chips */}
        {columns.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Available Variables
            </p>
            <div className="flex flex-wrap gap-1">
              {columns.map((col) => (
                <span
                  key={col}
                  className="inline-block rounded-md bg-[var(--muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--foreground)] cursor-default"
                  title={`{{${col}}}`}
                >
                  {col}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── SMS / WhatsApp Inspector ──────────────── */}
        {(data.kind === "agent_sms" || data.kind === "agent_whatsapp") && (
          <div className="space-y-3">
            <AutocompleteTextarea
              label="Message"
              value={String(data.config.message ?? "")}
              onChange={(v) => onUpdate("message", v)}
              columns={columns}
              placeholder="Hi {{name}}, your appointment is..."
            />
            {data.kind === "agent_whatsapp" && (
              <LabeledInput
                label="Template Name"
                value={String(data.config.template_name ?? "")}
                onChange={(v) => onUpdate("template_name", v)}
                placeholder="Optional template"
              />
            )}
            <MessagePreview template={String(data.config.message ?? "")} columns={columns} />
          </div>
        )}

        {/* ── Voice Inspector ──────────────────────── */}
        {data.kind === "agent_voice" && (
          <div className="space-y-3">
            <AutocompleteTextarea
              label="Script (TTS)"
              value={String(data.config.script ?? "")}
              onChange={(v) => onUpdate("script", v)}
              columns={columns}
              placeholder="Namaste {{name}}, ..."
            />
            <MessagePreview template={String(data.config.script ?? "")} columns={columns} />
          </div>
        )}

        {/* ── Condition Inspector ──────────────────── */}
        {data.kind === "condition" && (
          <ConditionRuleBuilder
            field={String(data.config.field ?? "")}
            operator={String(data.config.operator ?? "==")}
            value={String(data.config.value ?? "")}
            columns={columns}
            onChange={onUpdate}
            sampleRows={sampleRows}
          />
        )}

        {/* ── Validation Inspector ─────────────────── */}
        {data.kind === "validation" && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-[var(--muted-foreground)]">Required Columns</p>
            {columns.length > 0 ? (
              <div className="space-y-1">
                {columns.map((col) => {
                  const required = String(data.config.required_columns ?? "")
                    .split(",")
                    .map((c) => c.trim());
                  const checked = required.includes(col);
                  return (
                    <label key={col} className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? required.filter((c) => c !== col)
                            : [...required, col];
                          onUpdate("required_columns", next.filter(Boolean).join(","));
                        }}
                        className="rounded"
                      />
                      {col}
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--muted-foreground)]">No upstream columns available.</p>
            )}
          </div>
        )}

        {/* ── Deduplicate Inspector ────────────────── */}
        {data.kind === "deduplicate" && (
          <div className="space-y-3">
            <ColumnSelect
              label="Deduplicate By"
              columns={columns}
              value={String(data.config.dedup_column ?? "")}
              onChange={(v) => onUpdate("dedup_column", v)}
            />
            <LabeledSelect
              label="Keep"
              value={String(data.config.keep ?? "first")}
              onChange={(v) => onUpdate("keep", v)}
              options={[
                { value: "first", label: "First occurrence" },
                { value: "last", label: "Last occurrence" },
              ]}
            />
          </div>
        )}

        {/* ── Normalize Phone Inspector ────────────── */}
        {data.kind === "normalize_phone" && (
          <div className="space-y-3">
            <ColumnSelect
              label="Phone Column"
              columns={columns}
              value={String(data.config.phone_column ?? "")}
              onChange={(v) => onUpdate("phone_column", v)}
            />
            <LabeledInput
              label="Country Code"
              value={String(data.config.country_code ?? "+977")}
              onChange={(v) => onUpdate("country_code", v)}
              placeholder="+977"
            />
          </div>
        )}

        {/* ── Wait Inspector ───────────────────────── */}
        {data.kind === "wait" && (
          <LabeledInput
            label="Duration (minutes)"
            value={String(data.config.duration_minutes ?? "")}
            onChange={(v) => onUpdate("duration_minutes", v)}
            placeholder="30"
            type="number"
          />
        )}

        {/* ── Rate Limit Inspector ─────────────────── */}
        {data.kind === "rate_limit" && (
          <LabeledInput
            label="Per Minute"
            value={String(data.config.per_minute ?? "")}
            onChange={(v) => onUpdate("per_minute", v)}
            placeholder="20"
            type="number"
          />
        )}

        {/* ── Generic Config (fallback) ────────────── */}
        {![
          "agent_sms",
          "agent_voice",
          "agent_whatsapp",
          "condition",
          "validation",
          "deduplicate",
          "normalize_phone",
          "wait",
          "rate_limit",
        ].includes(data.kind) && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Configuration
            </p>
            {Object.entries(data.config).map(([key, val]) => (
              <LabeledInput
                key={key}
                label={key}
                value={String(val ?? "")}
                onChange={(v) => onUpdate(key, v)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer — Delete */}
      <div className="border-t border-[var(--border)] p-4">
        <button
          type="button"
          onClick={onDelete}
          className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
        >
          Delete Node
        </button>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function AutocompleteTextarea({
  label,
  value,
  onChange,
  columns,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  columns: string[];
  placeholder?: string;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    const pos = e.target.selectionStart || 0;
    onChange(v);
    setCursorPos(pos);
    setShowPopup(v.slice(0, pos).endsWith("{{"));
  }

  function insertColumn(col: string) {
    const before = value.slice(0, cursorPos);
    const after = value.slice(cursorPos);
    onChange(`${before}${col}}}${after}`);
    setShowPopup(false);
    setTimeout(() => ref.current?.focus(), 0);
  }

  return (
    <label className="relative block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
      </span>
      <textarea
        ref={ref}
        value={value}
        onChange={handleInput}
        className="input-modern min-h-[80px] w-full resize-y px-3 py-2 text-sm"
        placeholder={placeholder}
      />
      {showPopup && columns.length > 0 && (
        <div className="absolute left-0 z-50 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {columns.map((col) => (
            <button
              key={col}
              type="button"
              onClick={() => insertColumn(col)}
              className="block w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              {`{{${col}}}`}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

function MessagePreview({
  template,
  columns,
}: {
  template: string;
  columns: string[];
}) {
  if (!template || columns.length === 0) return null;
  // Generate a sample preview by replacing {{var}} with placeholder values
  const preview = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, col) => {
    if (col === "name") return "Ram";
    if (col === "phone") return "+977…";
    if (col === "age") return "34";
    return col;
  });
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
        Preview (sample)
      </p>
      <p className="mt-1 rounded-lg bg-[var(--muted)] px-3 py-2 text-xs text-[var(--foreground)] italic">
        {preview}
      </p>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-modern h-9 w-full px-3 text-sm"
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-modern h-9 w-full px-3 text-sm"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ColumnSelect({
  label,
  columns,
  value,
  onChange,
}: {
  label: string;
  columns: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-modern h-9 w-full px-3 text-sm"
      >
        <option value="">Select column…</option>
        {columns.map((col) => (
          <option key={col} value={col}>
            {col}
          </option>
        ))}
      </select>
    </label>
  );
}
