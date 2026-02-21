import type { Edge, Node } from "@xyflow/react";

export type FlowNodeKind =
  | "trigger_manual"
  | "trigger_schedule"
  | "trigger_event"
  | "source_manual_table"
  | "source_csv"
  | "source_xlsx"
  | "source_url_json"
  | "source_url_csv"
  | "source_numbers"
  | "source_google_contacts"
  | "source_file"
  | "enrich_columns"
  | "validation"
  | "deduplicate"
  | "normalize_phone"
  | "condition"
  | "loop"
  | "wait"
  | "business_hours"
  | "rate_limit"
  | "sender_number"
  | "agent_sms"
  | "agent_voice"
  | "agent_voice_interactive"
  | "agent_whatsapp"
  | "lookup_kb"
  | "survey_ai"
  | "dtmf_menu"
  | "response_capture"
  | "action_webhook"
  | "merge"
  | "error_handler"
  | "end_success"
  | "end_failure";

export type FlowNodeData = {
  label: string;
  kind: FlowNodeKind;
  description?: string;
  config: Record<string, string | number | boolean>;
  columns?: ColumnDef[];
};

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

export type ValidationIssue = {
  id: string;
  severity: "error" | "warning";
  nodeId?: string;
  message: string;
  detail?: string;
};

export type Template = {
  id: string;
  name: string;
  description: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export type ConditionRule = {
  field: string;
  operator: string;
  value: string;
};

export type ColumnType =
  | "text" | "number" | "phone" | "email" | "date"
  | "boolean" | "url" | "array" | "object" | "datetime" | "binary";

export type ColumnDef = { name: string; type: ColumnType };

export function columnNames(columns?: ColumnDef[]): string[] {
  return columns?.map((c) => c.name) ?? [];
}

/** Migrate old string[] columns (from localStorage) to ColumnDef[]. */
export function migrateColumns(columns?: (string | ColumnDef)[]): ColumnDef[] | undefined {
  if (!columns || columns.length === 0) return undefined;
  return columns.map((c) =>
    typeof c === "string" ? { name: c, type: "text" as ColumnType } : c,
  );
}
