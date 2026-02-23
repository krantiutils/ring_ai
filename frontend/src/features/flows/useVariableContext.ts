import { useMemo } from "react";
import type { ColumnDef, FlowEdge, FlowNode } from "./builderTypes";
import { columnNames } from "./builderTypes";
import { parseCsv } from "./validation";

export type VariableContextResult = {
  columns: Record<string, string[]>;
  columnDefs: Record<string, ColumnDef[]>;
};

/**
 * Computes the available upstream columns for every node in the graph.
 * Returns columns (string names) and columnDefs (with types) per node.
 */
export function useVariableContext(
  nodes: FlowNode[],
  edges: FlowEdge[],
): VariableContextResult {
  return useMemo(() => {
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    // 1. Build reverse adjacency (child → parents)
    const parents = new Map<string, string[]>();
    for (const e of edges) {
      const list = parents.get(e.target) ?? [];
      list.push(e.source);
      parents.set(e.target, list);
    }

    // 2. Extract columns from each source node
    const sourceColumns = new Map<string, string[]>();
    const sourceColumnDefs = new Map<string, ColumnDef[]>();
    for (const node of nodes) {
      if (!node.data.kind.startsWith("source_")) continue;
      sourceColumns.set(node.id, extractColumns(node));
      sourceColumnDefs.set(node.id, extractColumnDefs(node));
    }

    // 3. For each node, trace upstream to find all source columns
    const cache = new Map<string, string[]>();
    const defCache = new Map<string, ColumnDef[]>();

    function resolve(nodeId: string, visited: Set<string>): string[] {
      if (cache.has(nodeId)) return cache.get(nodeId)!;
      if (visited.has(nodeId)) return [];
      visited.add(nodeId);

      const src = sourceColumns.get(nodeId);
      if (src) {
        cache.set(nodeId, src);
        return src;
      }

      const cols = new Set<string>();
      for (const pid of parents.get(nodeId) ?? []) {
        for (const c of resolve(pid, visited)) cols.add(c);
      }
      const result = _applyDerivedColumns(nodeById.get(nodeId), Array.from(cols));
      cache.set(nodeId, result);
      return result;
    }

    function resolveDefs(nodeId: string, visited: Set<string>): ColumnDef[] {
      if (defCache.has(nodeId)) return defCache.get(nodeId)!;
      if (visited.has(nodeId)) return [];
      visited.add(nodeId);

      const src = sourceColumnDefs.get(nodeId);
      if (src) {
        defCache.set(nodeId, src);
        return src;
      }

      const seen = new Map<string, ColumnDef>();
      for (const pid of parents.get(nodeId) ?? []) {
        for (const d of resolveDefs(pid, visited)) {
          if (!seen.has(d.name)) seen.set(d.name, d);
        }
      }
      const result = _applyDerivedColumnDefs(nodeById.get(nodeId), Array.from(seen.values()));
      defCache.set(nodeId, result);
      return result;
    }

    // 4. Fallbacks for unconnected nodes
    const allSourceCols = new Set<string>();
    for (const cols of sourceColumns.values()) {
      for (const c of cols) allSourceCols.add(c);
    }
    const allSourceColsArray = Array.from(allSourceCols);

    const allSourceDefs = new Map<string, ColumnDef>();
    for (const defs of sourceColumnDefs.values()) {
      for (const d of defs) {
        if (!allSourceDefs.has(d.name)) allSourceDefs.set(d.name, d);
      }
    }
    const allSourceDefsArray = Array.from(allSourceDefs.values());

    const columns: Record<string, string[]> = {};
    const columnDefs: Record<string, ColumnDef[]> = {};
    for (const node of nodes) {
      const resolved = resolve(node.id, new Set());
      const resolvedDefs = resolveDefs(node.id, new Set());
      if (resolved.length === 0 && !node.data.kind.startsWith("source_")) {
        columns[node.id] = allSourceColsArray;
        columnDefs[node.id] = allSourceDefsArray;
      } else {
        columns[node.id] = resolved;
        columnDefs[node.id] = resolvedDefs;
      }
    }
    return { columns, columnDefs };
  }, [nodes, edges]);
}

function _parseCaptureColumns(raw: unknown): string[] {
  const text = String(raw ?? "");
  if (!text.trim()) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const col = part.trim();
    if (!col || seen.has(col)) continue;
    seen.add(col);
    result.push(col);
  }
  return result;
}

function _parseEnrichColumns(raw: unknown): string[] {
  const text = String(raw ?? "");
  if (!text.trim()) return [];
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    cols.push(name);
  }
  return cols;
}

function _applyDerivedColumns(node: FlowNode | undefined, base: string[]): string[] {
  if (!node) return base;
  const merged = new Set(base);

  if (node.data.kind === "agent_voice_interactive") {
    const captureCols = _parseCaptureColumns(node.data.config.capture_columns);
    for (const col of captureCols) merged.add(col);
  }
  if (node.data.kind === "response_capture") {
    const outputCol = String(node.data.config.output_column ?? "").trim();
    const statusCol = String(node.data.config.status_column ?? "").trim();
    if (outputCol) merged.add(outputCol);
    if (statusCol) merged.add(statusCol);
  }
  if (node.data.kind === "enrich_columns") {
    for (const col of _parseEnrichColumns(node.data.config.columns)) merged.add(col);
  }

  return Array.from(merged);
}

function _applyDerivedColumnDefs(node: FlowNode | undefined, base: ColumnDef[]): ColumnDef[] {
  if (!node) return base;
  const seen = new Map(base.map((d) => [d.name, d]));

  if (node.data.kind === "agent_voice_interactive") {
    for (const col of _parseCaptureColumns(node.data.config.capture_columns)) {
      if (!seen.has(col)) seen.set(col, { name: col, type: "text" });
    }
  }
  if (node.data.kind === "response_capture") {
    const outputCol = String(node.data.config.output_column ?? "").trim();
    const statusCol = String(node.data.config.status_column ?? "").trim();
    if (outputCol && !seen.has(outputCol)) seen.set(outputCol, { name: outputCol, type: "text" });
    if (statusCol && !seen.has(statusCol)) seen.set(statusCol, { name: statusCol, type: "text" });
  }
  if (node.data.kind === "enrich_columns") {
    for (const col of _parseEnrichColumns(node.data.config.columns)) {
      if (!seen.has(col)) seen.set(col, { name: col, type: "text" });
    }
  }
  return Array.from(seen.values());
}

function extractColumns(node: FlowNode): string[] {
  const { kind, config, columns } = node.data;
  if (columns && columns.length > 0) return columnNames(columns);

  if (kind === "source_numbers") return ["phone"];
  if (kind === "source_google_contacts") return ["name", "phone", "email"];

  const sampleCsv = String(config.sample_csv || "");
  if (sampleCsv) {
    const parsed = parseCsv(sampleCsv);
    if (parsed.headers.length > 0) return parsed.headers;
  }
  const tableCols = String(config.table_columns || "");
  if (tableCols) return tableCols.split(",").map((c) => c.trim()).filter(Boolean);
  const fileHeaders = String(config.file_headers || "");
  if (fileHeaders) return fileHeaders.split(",").map((c) => c.trim()).filter(Boolean);

  return [];
}

function extractColumnDefs(node: FlowNode): ColumnDef[] {
  const { kind, columns } = node.data;
  if (columns && columns.length > 0) return columns;

  if (kind === "source_numbers") return [{ name: "phone", type: "phone" }];
  if (kind === "source_google_contacts") return [
    { name: "name", type: "text" },
    { name: "phone", type: "phone" },
    { name: "email", type: "email" },
  ];

  // Fallback: derive from column names with "text" type
  const names = extractColumns(node);
  return names.map((n) => ({ name: n, type: "text" as const }));
}
