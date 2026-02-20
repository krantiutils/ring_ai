import { useMemo } from "react";
import type { FlowEdge, FlowNode } from "./builderTypes";
import { parseCsv } from "./validation";

/**
 * Computes the available upstream columns for every node in the graph.
 * Returns a map: nodeId → string[] of column names.
 */
export function useVariableContext(
  nodes: FlowNode[],
  edges: FlowEdge[],
): Record<string, string[]> {
  return useMemo(() => {
    // 1. Build reverse adjacency (child → parents)
    const parents = new Map<string, string[]>();
    for (const e of edges) {
      const list = parents.get(e.target) ?? [];
      list.push(e.source);
      parents.set(e.target, list);
    }

    // 2. Extract columns from each source node
    const sourceColumns = new Map<string, string[]>();
    for (const node of nodes) {
      if (!node.data.kind.startsWith("source_")) continue;
      sourceColumns.set(node.id, extractColumns(node));
    }

    // 3. For each node, trace upstream to find all source columns
    const cache = new Map<string, string[]>();

    function resolve(nodeId: string, visited: Set<string>): string[] {
      if (cache.has(nodeId)) return cache.get(nodeId)!;
      if (visited.has(nodeId)) return [];
      visited.add(nodeId);

      // If this IS a source, return its columns
      const src = sourceColumns.get(nodeId);
      if (src) {
        cache.set(nodeId, src);
        return src;
      }

      // Otherwise, union all parent columns
      const cols = new Set<string>();
      for (const pid of parents.get(nodeId) ?? []) {
        for (const c of resolve(pid, visited)) cols.add(c);
      }
      const result = Array.from(cols);
      cache.set(nodeId, result);
      return result;
    }

    const contextMap: Record<string, string[]> = {};
    for (const node of nodes) {
      contextMap[node.id] = resolve(node.id, new Set());
    }
    return contextMap;
  }, [nodes, edges]);
}

function extractColumns(node: FlowNode): string[] {
  const { kind, config, columns } = node.data;
  if (columns && columns.length > 0)
    return (columns as (string | { name: string })[]).map(c => typeof c === 'string' ? c : c.name);

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
