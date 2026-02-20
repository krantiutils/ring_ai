"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNode } from "@/features/flows/builderTypes";
import { getCategoryForKind, getNodeColor, NODE_ICON } from "@/features/flows/nodeRegistry";

function hasNonDefaultConfig(data: FlowNode["data"]): boolean {
  const cfg = data.config;
  if (!cfg || typeof cfg !== "object") return false;
  return Object.values(cfg).some((v) => typeof v === "string" && v.length > 0);
}

function getConfigPreview(data: FlowNode["data"]): string {
  const cfg = data.config;
  if (cfg.message && typeof cfg.message === "string") return cfg.message;
  if (cfg.script && typeof cfg.script === "string") return cfg.script;
  if (cfg.field && cfg.operator && cfg.value) return `${cfg.field} ${cfg.operator} ${cfg.value}`;
  if (cfg.required_columns && typeof cfg.required_columns === "string") return `require: ${cfg.required_columns}`;
  if (cfg.duration_minutes) return `wait ${cfg.duration_minutes}m`;
  if (cfg.per_minute) return `${cfg.per_minute}/min`;
  return "";
}

export default function NodeCard({ data, selected }: NodeProps<FlowNode>) {
  const color = getNodeColor(data.kind);
  const category = getCategoryForKind(data.kind);
  const Icon = NODE_ICON[data.kind];
  const isBranching = data.kind === "condition" || data.kind === "validation";
  const configured = hasNonDefaultConfig(data);
  const preview = configured ? getConfigPreview(data) : "";

  const trueLabel = data.kind === "validation" ? "valid" : "true";
  const falseLabel = data.kind === "validation" ? "invalid" : "false";

  const base = `border bg-[var(--card)] shadow-sm transition-shadow ${
    selected ? "ring-2 ring-[var(--accent)] shadow-md" : ""
  }`;

  return (
    <div
      className={`${base} w-[200px] rounded-xl border-l-4 px-3 py-2`}
      style={{ borderLeftColor: color, backgroundColor: `${color}08` }}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-[var(--border)] !bg-[var(--card)]" />
      <div className="flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full shrink-0"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {Icon && <Icon className="h-3 w-3" />}
        </div>
        <div className="min-w-0">
          <span className="text-xs font-semibold text-[var(--foreground)] truncate block">{data.label}</span>
          <span
            className="mt-0.5 inline-block rounded-full px-1.5 py-0 text-[9px] font-medium"
            style={{ backgroundColor: `${color}15`, color }}
          >
            {category}
          </span>
        </div>
      </div>
      {preview && (
        <p className="mt-1 truncate text-[10px] text-[var(--muted-foreground)] leading-tight">
          {preview.length > 50 ? preview.slice(0, 50) + "\u2026" : preview}
        </p>
      )}
      {data.columns && data.columns.length > 0 && (
        <p className="mt-1 text-[9px] text-[var(--muted-foreground)]">
          {data.columns.length} vars
        </p>
      )}
      {isBranching ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id={trueLabel}
            className="!h-3 !w-3 !border-2 !border-[#16A34A] !bg-[#22C55E]"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id={falseLabel}
            className="!h-3 !w-3 !border-2 !border-[#DC2626] !bg-[#EF4444]"
          />
        </>
      ) : (
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-[var(--border)] !bg-[var(--card)]" />
      )}
    </div>
  );
}
