import type { FlowEdge, FlowNode, ValidationIssue } from "@/features/flows/builderTypes";
import { columnNames } from "@/features/flows/builderTypes";

function getIncoming(nodeId: string, edges: FlowEdge[], nodes: FlowNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edges.map((e) => e.target === nodeId ? byId.get(e.source) : undefined).filter(Boolean) as FlowNode[];
}

function getOutgoing(nodeId: string, edges: FlowEdge[], nodes: FlowNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edges.map((e) => e.source === nodeId ? byId.get(e.target) : undefined).filter(Boolean) as FlowNode[];
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const split = (line: string) => line.split(",").map((c) => c.trim());
  return { headers: split(lines[0]), rows: lines.slice(1).map(split) };
}

function isReachableFromTriggers(nodes: FlowNode[], edges: FlowEdge[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const triggerIds = nodes.filter((n) => n.data.kind.startsWith("trigger_")).map((n) => n.id);
  const visited = new Set<string>();
  const queue = [...triggerIds];
  while (queue.length) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    for (const edge of edges) {
      if (edge.source === id && byId.has(edge.target)) queue.push(edge.target);
    }
  }
  return visited;
}

export function validateFlow(nodes: FlowNode[], edges: FlowEdge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const triggers = nodes.filter((n) => n.data.kind.startsWith("trigger_"));
  const ends = nodes.filter((n) => n.data.kind === "end_success" || n.data.kind === "end_failure");

  if (!triggers.length) issues.push({ id: "missing-trigger", severity: "error", message: "Flow must contain at least one trigger node." });
  if (triggers.length > 1) issues.push({ id: "multi-trigger", severity: "warning", message: "Multiple triggers present. Ensure this is intentional." });
  if (!ends.length) issues.push({ id: "missing-end", severity: "error", message: "Flow should include at least one end node." });

  const reachable = isReachableFromTriggers(nodes, edges);
  for (const node of nodes) {
    if (!reachable.has(node.id) && !node.data.kind.startsWith("trigger_")) {
      issues.push({
        id: `unreachable-${node.id}`,
        severity: "warning",
        nodeId: node.id,
        message: `${node.data.label} is unreachable from trigger.`,
      });
    }
  }

  for (const node of nodes) {
    const cfg = node.data.config;
    if ((node.data.kind === "source_url_json" || node.data.kind === "source_url_csv") && !cfg.url) {
      issues.push({
        id: `missing-url-${node.id}`,
        severity: "error",
        nodeId: node.id,
        message: "URL source nodes require a source URL.",
      });
    }
    if (node.data.kind === "action_webhook" && !cfg.webhook_url) {
      issues.push({
        id: `missing-webhook-${node.id}`,
        severity: "error",
        nodeId: node.id,
        message: "Action Hook node requires webhook URL.",
      });
    }
    if (node.data.kind === "enrich_columns" && !cfg.columns) {
      issues.push({
        id: `missing-columns-${node.id}`,
        severity: "warning",
        nodeId: node.id,
        message: "Enrich Columns should define new columns to append.",
      });
    }
    if (node.data.kind === "survey_ai" && !cfg.model) {
      issues.push({
        id: `missing-model-${node.id}`,
        severity: "warning",
        nodeId: node.id,
        message: "Survey AI should set model (e.g. gemini-2.5-flash-native-audio).",
      });
    }
    if (node.data.kind === "condition" && (!cfg.field || !cfg.operator || !cfg.value)) {
      issues.push({
        id: `missing-condition-${node.id}`,
        severity: "error",
        nodeId: node.id,
        message: "Condition node needs field, operator, and value.",
      });
    }
    if (node.data.kind === "condition" && cfg.field) {
      const sourceNode = nodes.find((n) =>
        n.data.kind === "source_csv" ||
        n.data.kind === "source_xlsx" ||
        n.data.kind === "source_file" ||
        n.data.kind === "source_numbers" ||
        n.data.kind === "source_manual_table" ||
        n.data.kind === "source_google_contacts" ||
        n.data.kind === "source_url_json" ||
        n.data.kind === "source_url_csv",
      );
      if (sourceNode?.data.columns && sourceNode.data.columns.length > 0) {
        if (!columnNames(sourceNode.data.columns).includes(String(cfg.field))) {
          issues.push({
            id: `condition-bad-field-${node.id}`,
            severity: "warning",
            nodeId: node.id,
            message: `Condition field "${cfg.field}" is not in source columns: ${columnNames(sourceNode.data.columns).join(", ")}`,
          });
        }
      }
    }
    if (node.data.kind === "wait" && !cfg.duration_minutes) {
      issues.push({
        id: `missing-wait-${node.id}`,
        severity: "error",
        nodeId: node.id,
        message: "Wait node requires duration in minutes.",
      });
    }
    if (node.data.kind === "business_hours" && !cfg.timezone) {
      issues.push({
        id: `missing-bh-${node.id}`,
        severity: "error",
        nodeId: node.id,
        message: "Business Hours node requires timezone.",
      });
    }
    if ((node.data.kind === "agent_sms" || node.data.kind === "agent_whatsapp") && !cfg.message) {
      issues.push({
        id: `missing-msg-${node.id}`,
        severity: "error",
        nodeId: node.id,
        message: "Message is required for text agents.",
      });
    }
    if (node.data.kind === "agent_voice" && !cfg.script) {
      issues.push({
        id: `missing-script-${node.id}`,
        severity: "error",
        nodeId: node.id,
        message: "Voice script is required.",
      });
    }
  }

  for (const node of nodes.filter((n) => n.data.kind === "validation")) {
    const incoming = getIncoming(node.id, edges, nodes);
    const source = incoming.find((n) =>
      n.data.kind === "source_csv" ||
      n.data.kind === "source_xlsx" ||
      n.data.kind === "source_file" ||
      n.data.kind === "source_numbers" ||
      n.data.kind === "source_manual_table" ||
      n.data.kind === "source_google_contacts" ||
      n.data.kind === "source_url_json" ||
      n.data.kind === "source_url_csv",
    );
    if (!source) {
      issues.push({
        id: `val-no-source-${node.id}`,
        severity: "error",
        nodeId: node.id,
        message: "Validation node must be connected to a data source node.",
      });
      continue;
    }

    const required = String(node.data.config.required_columns || "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const sampleCsv = String(source.data.config.sample_csv || "");
    const parsed = parseCsv(sampleCsv);

    if (required.length && parsed.headers.length) {
      const missing = required.filter((r) => !parsed.headers.includes(r));
      if (missing.length) {
        issues.push({
          id: `val-missing-cols-${node.id}`,
          severity: "error",
          nodeId: node.id,
          message: `Missing required columns: ${missing.join(", ")}`,
        });
      }
    }

    if (parsed.headers.includes("phone")) {
      const phoneIndex = parsed.headers.indexOf("phone");
      parsed.rows.forEach((row, i) => {
        const value = (row[phoneIndex] || "").trim();
        if (value && !/^\+?\d{10,15}$/.test(value.replace(/\s|-/g, ""))) {
          issues.push({
            id: `val-phone-${node.id}-${i}`,
            severity: "warning",
            nodeId: node.id,
            message: `Row ${i + 2}: invalid phone format`,
            detail: value,
          });
        }
      });
    } else if (source.data.kind !== "source_numbers") {
      issues.push({
        id: `val-phone-col-${node.id}`,
        severity: "warning",
        nodeId: node.id,
        message: "No `phone` column found in sample CSV for format validation.",
      });
    }
  }

  for (const edge of edges) {
    const source = nodes.find((n) => n.id === edge.source);
    const target = nodes.find((n) => n.id === edge.target);
    if (!source || !target) continue;
    if (source.data.kind.startsWith("agent_") && target.data.kind.startsWith("source_")) {
      issues.push({
        id: `bad-edge-${edge.id}`,
        severity: "error",
        message: "Agent nodes cannot feed source nodes.",
      });
    }
  }

  return issues;
}

export function simulateContactsCount(nodes: FlowNode[]): number {
  const source = nodes.find(
    (n) =>
      n.data.kind === "source_numbers" ||
      n.data.kind === "source_csv" ||
      n.data.kind === "source_xlsx" ||
      n.data.kind === "source_manual_table" ||
      n.data.kind === "source_google_contacts" ||
      n.data.kind === "source_url_json" ||
      n.data.kind === "source_url_csv",
  );
  if (!source) return 0;
  if (source.data.kind === "source_numbers") {
    return String(source.data.config.numbers || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean).length;
  }
  if (source.data.kind === "source_google_contacts") {
    return Number(source.data.config.estimated_contacts || 0);
  }
  if (source.data.kind === "source_url_json" || source.data.kind === "source_url_csv") {
    return Number(source.data.config.estimated_rows || 0);
  }
  const sampleCsv = String(source.data.config.sample_csv || "");
  const parsed = parseCsv(sampleCsv);
  return parsed.rows.length;
}

export function reachableNodeCount(nodes: FlowNode[], edges: FlowEdge[]): number {
  return isReachableFromTriggers(nodes, edges).size;
}

export function nextNodes(nodeId: string, nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  return getOutgoing(nodeId, edges, nodes);
}
