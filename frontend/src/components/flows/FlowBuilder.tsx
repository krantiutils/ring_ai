"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
} from "@xyflow/react";
import { migrateColumns, type FlowEdge, type FlowNode, type FlowNodeData, type FlowNodeKind, type ColumnDef } from "@/features/flows/builderTypes";
import { validateFlow, simulateContactsCount } from "@/features/flows/validation";
import { useVariableContext } from "@/features/flows/useVariableContext";
import { NODE_ICON, PALETTE_NODES } from "@/features/flows/nodeRegistry";
import { api } from "@/lib/api";

import SourceWizard from "./SourceWizard";
import NodeCard from "./NodeCard";
import DeletableEdge from "./DeletableEdge";
import CanvasContextMenu from "./CanvasContextMenu";
import type { ContextMenuTarget } from "./CanvasContextMenu";
import type { FlowTemplate } from "./FlowLibrary";
import NodeInspector from "./NodeInspector";
import RunResultsPanel from "./RunResultsPanel";
import type { RunData } from "./RunResultsPanel";
import FlowToolbar from "./FlowToolbar";
import StatusBar from "./StatusBar";

/* ── Constants ──────────────────────────────────────────── */

const STORAGE_KEY = "agentshakti_flow_builder_v1";
const NODE_USAGE_KEY = "agentshakti_flow_builder_node_usage_v1";

const NODE_TYPES = { flowNode: NodeCard };
const EDGE_TYPES = { deletable: DeletableEdge };
const DEFAULT_EDGE_OPTIONS = {
  type: "deletable" as const,
  selectable: true,
  deletable: true,
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
};

const DEFAULT_NODE_USAGE_WEIGHT: Partial<Record<FlowNodeKind, number>> = {
  source_manual_table: 20,
  source_csv: 18,
  validation: 16,
  condition: 16,
  sender_number: 20,
  agent_sms: 24,
  agent_voice: 24,
  agent_voice_interactive: 28,
  lookup_kb: 14,
  end_success: 16,
};

/* ── Helpers (preserved from original) ──────────────────── */

const palette: Array<{ kind: FlowNodeKind; label: string; description: string }> = [
  { kind: "trigger_manual", label: "Manual Trigger", description: "Start manually" },
  { kind: "trigger_schedule", label: "Schedule Trigger", description: "Cron/timed trigger" },
  { kind: "trigger_event", label: "Event Trigger", description: "Triggered by external event/webhook" },
  { kind: "source_manual_table", label: "Manual Table", description: "Build contacts table manually" },
  { kind: "source_csv", label: "CSV Source", description: "Read CSV contacts" },
  { kind: "source_xlsx", label: "XLSX Source", description: "Read Excel contacts" },
  { kind: "source_url_json", label: "JSON URL Hook", description: "Read JSON contacts from URL" },
  { kind: "source_url_csv", label: "CSV URL Hook", description: "Read CSV contacts from URL" },
  { kind: "source_google_contacts", label: "Google Contacts", description: "Import from Google contacts" },
  { kind: "source_numbers", label: "Number Source", description: "Manual numbers" },
  ...PALETTE_NODES.map((n) => ({ kind: n.kind, label: n.label, description: n.description })),
];

function getPaletteGroup(kind: FlowNodeKind): string {
  if (kind.startsWith("trigger_")) return "Trigger";
  if (kind.startsWith("source_")) return "Source";
  if (kind === "end_success" || kind === "end_failure") return "End";
  const match = PALETTE_NODES.find((n) => n.kind === kind);
  if (match?.category === "actions") return "Actions";
  if (match?.category === "processing") return "Processing";
  if (match?.category === "control") return "Control";
  if (match?.category === "end") return "End";
  return "Other";
}

const PALETTE_GROUP_ORDER = ["Trigger", "Source", "Actions", "Processing", "Control", "End", "Other"];

function defaultConfig(kind: FlowNodeKind): Record<string, string> {
  if (kind === "source_manual_table") return { table_columns: "name,phone,age,gender", sample_csv: "name,phone,age,gender\nRam,+9779800000000,34,male" };
  if (kind === "source_csv" || kind === "source_xlsx") return { required_columns: "name,phone", sample_csv: "name,phone\nRam,+9779800000000" };
  if (kind === "source_url_json") return { url: "", mapping: "", estimated_rows: "0" };
  if (kind === "source_url_csv") return { url: "", mapping: "", estimated_rows: "0" };
  if (kind === "source_google_contacts") return { sync_mode: "labels:customers", estimated_contacts: "0" };
  if (kind === "source_numbers") return { numbers: "" };
  if (kind === "validation") return { required_columns: "name,phone" };
  if (kind === "deduplicate") return { dedup_column: "phone", keep: "first" };
  if (kind === "normalize_phone") return { country_code: "+977", format: "e164" };
  if (kind === "condition") return { field: "", operator: "==", value: "" };
  if (kind === "enrich_columns") return { columns: "row_number_copy = row_number\nfield_count_copy = field_count\ndelivery_status = _dispatch_status" };
  if (kind === "response_capture") return { channel: "sms", wait_minutes: "15", output_column: "response_text", status_column: "response_status" };
  if (kind === "dtmf_menu") return { digit_field: "dtmf_digit", fallback_handle: "no_input" };
  if (kind === "wait") return { duration_minutes: "30" };
  if (kind === "rate_limit") return { per_minute: "20" };
  if (kind === "sender_number") return { number: "" };
  if (kind === "agent_sms") return { message: "" };
  if (kind === "agent_voice") return { script: "", tts_provider: "edge_tts", tts_voice: "", capture_dtmf: "false", dtmf_field: "dtmf_digit", dtmf_routes: "" };
  if (kind === "agent_voice_interactive") return { system_prompt: "", output_mode: "native_audio", tts_provider: "edge_tts", tts_voice: "", knowledge_base_id: "", max_duration_minutes: "10" };
  if (kind === "agent_whatsapp") return { message: "", template_name: "" };
  if (kind === "lookup_kb") return { knowledge_base_id: "", query_template: "", top_k: "5", output_variable: "_kb_context" };
  if (kind === "merge") return {};
  if (kind === "error_handler") return { retries: "2" };
  return {};
}

function makeNode(kind: FlowNodeKind, x: number, y: number): FlowNode {
  const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const item = palette.find((p) => p.kind === kind);
  return {
    id,
    type: "flowNode",
    position: { x, y },
    data: {
      kind,
      label: item?.label || kind,
      description: item?.description,
      config: defaultConfig(kind),
    },
  };
}

function wouldCreateCycle(sourceId: string, targetId: string, edges: Array<{ source: string; target: string }>): boolean {
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, []);
    adjacency.get(e.source)?.push(e.target);
  }
  if (!adjacency.has(sourceId)) adjacency.set(sourceId, []);
  adjacency.get(sourceId)?.push(targetId);
  const visited = new Set<string>();
  const stack: string[] = [targetId];
  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    if (current === sourceId) return true;
    for (const next of adjacency.get(current) || []) stack.push(next);
  }
  return false;
}

type BuilderSnapshot = {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
};

function cloneSnapshot(snapshot: BuilderSnapshot): BuilderSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as BuilderSnapshot;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

/* ── Main Component ─────────────────────────────────────── */

function FlowBuilderInner({ initialFlowId, templateData, onBack: onBackToLibrary }: { initialFlowId?: string; templateData?: FlowTemplate; onBack?: () => void }) {
  const [mode, setMode] = useState<"wizard" | "canvas">("wizard");
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("Untitled Flow");
  const [flowDefinitionId, setFlowDefinitionId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [backendRunStatus, setBackendRunStatus] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const [clipboard, setClipboard] = useState<FlowNode | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runResultsData, setRunResultsData] = useState<RunData | null>(null);
  const [showRunResults, setShowRunResults] = useState(false);
  const [nodeUsage, setNodeUsage] = useState<Partial<Record<FlowNodeKind, number>>>({});
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const historyPastRef = useRef<BuilderSnapshot[]>([]);
  const historyFutureRef = useRef<BuilderSnapshot[]>([]);
  const historyIgnoreRef = useRef(false);
  const historyLastRef = useRef<BuilderSnapshot | null>(null);
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  const runFlowRef = useRef<() => Promise<void>>(async () => {});
  const runningRef = useRef(false);

  const { fitView, screenToFlowPosition } = useReactFlow();

  // Computed values
  const { columns: variableContext, columnDefs: columnDefsContext } = useVariableContext(nodes, edges);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const issues = useMemo(() => validateFlow(nodes as FlowNode[], edges), [nodes, edges]);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const contactEstimate = useMemo(() => simulateContactsCount(nodes as FlowNode[]), [nodes]);
  const currentFlowUsage = useMemo(() => {
    const counts: Partial<Record<FlowNodeKind, number>> = {};
    for (const node of nodes) {
      const kind = node.data.kind;
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    return counts;
  }, [nodes]);

  const rankedPalette = useMemo(() => {
    return [...palette].sort((a, b) => {
      const scoreA = (nodeUsage[a.kind] ?? 0) + (currentFlowUsage[a.kind] ?? 0) * 3 + (DEFAULT_NODE_USAGE_WEIGHT[a.kind] ?? 0);
      const scoreB = (nodeUsage[b.kind] ?? 0) + (currentFlowUsage[b.kind] ?? 0) * 3 + (DEFAULT_NODE_USAGE_WEIGHT[b.kind] ?? 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.label.localeCompare(b.label);
    });
  }, [currentFlowUsage, nodeUsage]);

  const groupedPalette = useMemo(() => {
    const grouped = new Map<string, Array<{ kind: FlowNodeKind; label: string; description: string }>>();
    for (const item of rankedPalette) {
      const group = getPaletteGroup(item.kind);
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group)?.push(item);
    }
    return PALETTE_GROUP_ORDER
      .filter((group) => (grouped.get(group)?.length ?? 0) > 0)
      .map((group) => ({ group, nodes: grouped.get(group)! }));
  }, [rankedPalette]);

  // Load flow on mount — from backend if initialFlowId, from localStorage only if no library callback
  React.useEffect(() => {
    if (templateData) {
      setNodes(templateData.nodes);
      setEdges(templateData.edges.map((e) => ({ ...e, type: e.type || "deletable" })));
      setFlowName(templateData.name);
      setMode("canvas");
      return;
    }
    if (initialFlowId) {
      api.getFlowDefinition(initialFlowId)
        .then((flow) => {
          const rawNodes = flow.nodes as FlowNode[];
          const migratedNodes = rawNodes.map((n) => ({
            ...n,
            data: { ...n.data, columns: migrateColumns(n.data.columns as unknown as (string | ColumnDef)[]) },
          }));
          setNodes(migratedNodes as FlowNode[]);
          setEdges(((flow.edges ?? []) as FlowEdge[]).map((e) => ({ ...e, type: e.type || "deletable" })));
          setFlowName(flow.name);
          setFlowDefinitionId(flow.id);
          setMode("canvas");
        })
        .catch(() => {
          // Fall back to wizard if flow can't be loaded
        });
      return;
    }
    // When opened from library with no flowId, start fresh wizard (skip localStorage)
    if (onBackToLibrary) return;
    // Standalone mode: try loading from localStorage
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { nodes: FlowNode[]; edges: FlowEdge[]; flowName?: string; flowDefinitionId?: string };
      if (parsed.nodes?.length) {
        const migratedNodes = parsed.nodes.map((n) => ({
          ...n,
          data: { ...n.data, columns: migrateColumns(n.data.columns as unknown as (string | ColumnDef)[]) },
        }));
        setNodes(migratedNodes as FlowNode[]);
        setEdges((parsed.edges ?? []).map((e: FlowEdge) => ({ ...e, type: e.type || "deletable" })));
        if (parsed.flowName) setFlowName(parsed.flowName);
        if (parsed.flowDefinitionId) setFlowDefinitionId(parsed.flowDefinitionId);
        setMode("canvas");
      }
    } catch {
      // ignore
    }
  }, [initialFlowId, templateData]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(NODE_USAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<Record<FlowNodeKind, number>>;
      setNodeUsage(parsed);
    } catch {
      // ignore
    }
  }, []);

  // Poll active run for results
  React.useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await api.getFlowRun(activeRunId!);
        if (cancelled) return;
        setRunResultsData(data as RunData);
        setShowRunResults(true);
        setBackendRunStatus(data.status);

        if (data.status === "running" || data.status === "pending") {
          setTimeout(poll, 2000);
        } else {
          setRunning(false);
        }
      } catch {
        if (!cancelled) setRunning(false);
      }
    }

    poll();
    return () => { cancelled = true; };
  }, [activeRunId]);

  React.useEffect(() => {
    const current: BuilderSnapshot = { nodes, edges, selectedNodeId };
    if (historyIgnoreRef.current) {
      historyLastRef.current = cloneSnapshot(current);
      historyIgnoreRef.current = false;
      return;
    }
    const last = historyLastRef.current;
    if (!last) {
      historyLastRef.current = cloneSnapshot(current);
      return;
    }
    const changed = JSON.stringify(last.nodes) !== JSON.stringify(nodes) || JSON.stringify(last.edges) !== JSON.stringify(edges);
    if (!changed) return;
    historyPastRef.current.push(cloneSnapshot(last));
    if (historyPastRef.current.length > 100) historyPastRef.current.shift();
    historyFutureRef.current = [];
    historyLastRef.current = cloneSnapshot(current);
  }, [nodes, edges, selectedNodeId]);

  const nodeLabels = useMemo(() => {
    const map: Record<string, string> = {};
    nodes.forEach((n) => {
      map[n.id] = n.data.label || n.data.kind;
    });
    return map;
  }, [nodes]);

  const runProgress = useMemo(() => {
    if (!runResultsData) return null;
    return {
      current_node: runResultsData.current_node_id,
      steps_done: runResultsData.steps.length,
      steps_total: nodes.length,
    };
  }, [runResultsData, nodes.length]);

  const upstreamNodeOptions = useMemo(() => {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const incoming: Record<string, Array<{ id: string; label: string }>> = {};
    for (const edge of edges) {
      const sourceNode = nodeMap.get(edge.source);
      if (!sourceNode) continue;
      if (!incoming[edge.target]) incoming[edge.target] = [];
      if (incoming[edge.target].some((n) => n.id === edge.source)) continue;
      incoming[edge.target].push({
        id: edge.source,
        label: sourceNode.data.label || sourceNode.data.kind,
      });
    }
    return incoming;
  }, [edges, nodes]);

  // ── Handlers ──────────────────────────────────────────

  function handleWizardComplete(
    sourceKind: FlowNodeKind,
    config: Record<string, string>,
    columns: ColumnDef[],
  ) {
    const trigger = makeNode("trigger_manual", 80, 200);
    const source = makeNode(sourceKind, 300, 200);
    source.data.config = { ...source.data.config, ...config };
    source.data.columns = columns;
    const end = makeNode("end_success", 520, 200);
    setNodes([trigger, source, end]);
    setEdges([
      { id: `e-${trigger.id}-${source.id}`, source: trigger.id, target: source.id, type: "deletable" },
      { id: `e-${source.id}-${end.id}`, source: source.id, target: end.id, type: "deletable" },
    ]);
    setMode("canvas");
  }

  function addNode(kind: FlowNodeKind) {
    let x = 120 + (nodes.length % 5) * 240;
    let y = 120 + Math.floor(nodes.length / 5) * 150;
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const center = screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      const offset = (nodes.length % 4) * 24;
      x = center.x - 90 + offset;
      y = center.y - 30 + offset;
    }
    const n = makeNode(kind, x, y);
    setNodes((prev) => [
      ...prev.map((node) => ({ ...node, selected: false })),
      { ...n, selected: true },
    ]);
    setSelectedNodeId(n.id);
    setNodeUsage((prev) => {
      const next = { ...prev, [kind]: (prev[kind] ?? 0) + 1 };
      if (typeof window !== "undefined") {
        localStorage.setItem(NODE_USAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }

  function deleteNode(nodeId: string) {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }

  function selectNode(nodeId: string | null) {
    setSelectedNodeId(nodeId);
    setNodes((prev) => prev.map((node) => ({ ...node, selected: nodeId !== null && node.id === nodeId })));
  }

  function updateNodeConfig(key: string, value: string) {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === selectedNodeId
          ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } }
          : n,
      ),
    );
  }

  function updateNodeData(nodeId: string, partial: Partial<FlowNodeData>) {
    setNodes((prev) =>
      prev.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...partial } } : n),
    );
  }

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      const srcNode = nodes.find((n) => n.id === params.source);
      const tgtNode = nodes.find((n) => n.id === params.target);
      if (!srcNode || !tgtNode) return;
      if (srcNode.data.kind.startsWith("agent_") && tgtNode.data.kind.startsWith("source_")) return;

      const isLoopback = wouldCreateCycle(params.source, params.target, edges);
      const isBranching =
        srcNode.data.kind === "condition" ||
        srcNode.data.kind === "validation" ||
        srcNode.data.kind === "response_capture";
      let sourceHandle = params.sourceHandle || undefined;

      if (isBranching && !sourceHandle) {
        const trueLabel =
          srcNode.data.kind === "validation"
            ? "valid"
            : srcNode.data.kind === "response_capture"
              ? "received"
              : "true";
        const falseLabel =
          srcNode.data.kind === "validation"
            ? "invalid"
            : srcNode.data.kind === "response_capture"
              ? "timeout"
              : "false";
        const used = new Set(edges.filter((e) => e.source === params.source).map((e) => e.sourceHandle).filter(Boolean));
        sourceHandle = !used.has(trueLabel) ? trueLabel : !used.has(falseLabel) ? falseLabel : undefined;
      }

      // Auto-label edges for multi-output non-branching nodes (dtmf_menu, etc.)
      let branchLabel: string | undefined;
      if (!isBranching) {
        const existingLabels = new Set(
          edges.filter((e) => e.source === params.source).map((e) => e.label).filter(Boolean),
        );
        if (srcNode.data.kind === "dtmf_menu") {
          for (let i = 1; i <= existingLabels.size + 1; i++) {
            if (!existingLabels.has(`press_${i}`)) { branchLabel = `press_${i}`; break; }
          }
        } else if (existingLabels.size >= 1) {
          for (let i = 1; i <= existingLabels.size + 1; i++) {
            const label = `path_${String.fromCharCode(96 + i)}`;
            if (!existingLabels.has(label)) { branchLabel = label; break; }
          }
        }
      }

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            sourceHandle: srcNode.data.kind === "dtmf_menu" && branchLabel ? branchLabel : sourceHandle,
            style: isLoopback ? { strokeDasharray: "6 4", strokeWidth: 2 } : undefined,
            label: isBranching ? sourceHandle : isLoopback ? "loopback" : branchLabel,
            labelStyle: isBranching
              ? {
                  fill:
                    sourceHandle === "true" || sourceHandle === "valid" || sourceHandle === "received"
                      ? "#16A34A"
                      : "#DC2626",
                  fontWeight: 700,
                  fontSize: 11,
                }
              : undefined,
          } as FlowEdge | Connection,
          eds,
        ),
      );
    },
    [nodes, edges],
  );

  async function saveDraft(): Promise<string | null> {
    setSaving(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges, flowName, flowDefinitionId }));
    }
    try {
      const payload = { name: flowName, nodes: nodes as unknown[], edges: edges as unknown[], status: "draft" };
      if (flowDefinitionId) {
        await api.updateFlowDefinition(flowDefinitionId, payload);
        setSavedAt(new Date().toLocaleTimeString());
        return flowDefinitionId;
      } else {
        const res = await api.createFlowDefinition(payload);
        setFlowDefinitionId(res.id);
        setSavedAt(new Date().toLocaleTimeString());
        return res.id;
      }
    } catch {
      setSavedAt(new Date().toLocaleTimeString() + " (local only)");
      return flowDefinitionId;
    } finally {
      setSaving(false);
    }
  }

  async function runFlow() {
    let id = flowDefinitionId;
    if (!id) {
      id = await saveDraft();
    }
    if (!id) return;
    setRunning(true);
    setBackendRunStatus(null);
    try {
      const res = await api.triggerFlowRun(id, "live");
      setActiveRunId(res.id);
      setBackendRunStatus(res.status);
    } catch {
      setBackendRunStatus("error");
      setRunning(false);
    }
  }

  async function testRunFlow() {
    let id = flowDefinitionId;
    if (!id) {
      id = await saveDraft();
    }
    if (!id) return;
    setRunning(true);
    setBackendRunStatus(null);
    try {
      const res = await api.triggerFlowRun(id, "dry_run");
      setActiveRunId(res.id);
      setBackendRunStatus(res.status);
    } catch {
      setBackendRunStatus("error");
      setRunning(false);
    }
  }

  function undo() {
    const prev = historyPastRef.current.pop();
    if (!prev) return;
    historyFutureRef.current.push(cloneSnapshot({ nodes, edges, selectedNodeId }));
    historyIgnoreRef.current = true;
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setSelectedNodeId(prev.selectedNodeId);
  }

  function redo() {
    const next = historyFutureRef.current.pop();
    if (!next) return;
    historyPastRef.current.push(cloneSnapshot({ nodes, edges, selectedNodeId }));
    historyIgnoreRef.current = true;
    setNodes(next.nodes);
    setEdges(next.edges);
    setSelectedNodeId(next.selectedNodeId);
  }

  React.useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
    runFlowRef.current = runFlow;
    runningRef.current = running;
  });

  function handleBack() {
    if (onBackToLibrary) {
      // Navigate back to library — clear localStorage draft
      if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
      onBackToLibrary();
      return;
    }
    // Fallback: reset to wizard for a new flow
    setMode("wizard");
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setFlowDefinitionId(null);
    setSavedAt(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // ── Context menu handlers ────────────────────────────

  function handlePaneContextMenu(event: MouseEvent | React.MouseEvent) {
    event.preventDefault();
    setContextMenu({ type: "pane", x: event.clientX, y: event.clientY });
  }

  function handleNodeContextMenu(event: React.MouseEvent, node: FlowNode) {
    event.preventDefault();
    setContextMenu({ type: "node", nodeId: node.id, x: event.clientX, y: event.clientY });
  }

  function handleEdgeContextMenu(event: React.MouseEvent, edge: FlowEdge) {
    event.preventDefault();
    setContextMenu({ type: "edge", edgeId: edge.id, x: event.clientX, y: event.clientY });
  }

  function handleContextMenuAction(action: string) {
    if (!contextMenu) return;
    switch (action) {
      case "fit-view":
        fitView();
        break;
      case "toggle-grid":
        setShowGrid((prev) => !prev);
        break;
      case "select-all": {
        setNodes((prev) =>
          prev.map((n) => ({ ...n, selected: true })),
        );
        break;
      }
      case "paste": {
        if (clipboard && contextMenu.type === "pane") {
          const flowPos = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y });
          const copy = makeNode(clipboard.data.kind, flowPos.x, flowPos.y);
          copy.data.config = { ...clipboard.data.config };
          copy.data.label = clipboard.data.label;
          copy.data.description = clipboard.data.description;
          if (clipboard.data.columns) copy.data.columns = [...clipboard.data.columns];
          setNodes((prev) => [...prev, copy]);
          setSelectedNodeId(copy.id);
        }
        break;
      }
      case "delete-node": {
        if (contextMenu.type === "node") deleteNode(contextMenu.nodeId);
        break;
      }
      case "duplicate-node": {
        if (contextMenu.type === "node") {
          const orig = nodes.find((n) => n.id === contextMenu.nodeId);
          if (orig) {
            const dup = makeNode(orig.data.kind, orig.position.x + 40, orig.position.y + 40);
            dup.data.config = { ...orig.data.config };
            dup.data.label = orig.data.label;
            dup.data.description = orig.data.description;
            if (orig.data.columns) dup.data.columns = [...orig.data.columns];
            setNodes((prev) => [...prev, dup]);
            setSelectedNodeId(dup.id);
          }
        }
        break;
      }
      case "disconnect-node": {
        if (contextMenu.type === "node") {
          setEdges((prev) =>
            prev.filter((e) => e.source !== contextMenu.nodeId && e.target !== contextMenu.nodeId),
          );
        }
        break;
      }
      case "copy-node": {
        if (contextMenu.type === "node") {
          const orig = nodes.find((n) => n.id === contextMenu.nodeId);
          if (orig) setClipboard(orig);
        }
        break;
      }
      case "delete-edge": {
        if (contextMenu.type === "edge") {
          setEdges((prev) => prev.filter((e) => e.id !== contextMenu.edgeId));
        }
        break;
      }
    }
    setContextMenu(null);
  }

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undoRef.current();
        return;
      }
      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redoRef.current();
        return;
      }
      if (key === "r") {
        event.preventDefault();
        if (!runningRef.current) void runFlowRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Render ────────────────────────────────────────────

  if (mode === "wizard") {
    return <SourceWizard onComplete={handleWizardComplete} />;
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 7rem)" }}>
      <FlowToolbar
        flowName={flowName}
        onNameChange={setFlowName}
        onBack={handleBack}
        onSave={saveDraft}
        onRun={runFlow}
        onTestRun={testRunFlow}
        saving={saving}
        running={running}
        savedAt={savedAt}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Palette */}
        <div className="w-[22rem] shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--card)]">
          <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--card)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">Node Library</p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Ordered by your usage and current flow context.</p>
          </div>

          <div className="space-y-5 p-4">
            {groupedPalette.map((group) => (
              <section key={group.group}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                  {group.group}
                </h3>
                <div className="space-y-1.5">
                  {group.nodes.map((item) => {
                    const Icon = NODE_ICON[item.kind];
                    return (
                      <button
                        key={item.kind}
                        type="button"
                        onClick={() => addNode(item.kind)}
                        title="Click to add node to canvas"
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--muted)]"
                      >
                        <span className="rounded-md bg-[var(--muted)] p-1 text-[var(--muted-foreground)]">
                          {Icon ? <Icon size={13} /> : null}
                        </span>
                        <span>
                          <span className="block text-sm text-[var(--foreground)]">{item.label}</span>
                          <span className="block text-xs text-[var(--muted-foreground)]">{item.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1" ref={canvasRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => selectNode(node.id)}
            onPaneClick={() => { selectNode(null); setContextMenu(null); }}
            onPaneContextMenu={handlePaneContextMenu}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeContextMenu={handleEdgeContextMenu}
            connectionLineType={ConnectionLineType.SmoothStep}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            {showGrid && <Background variant={BackgroundVariant.Dots} gap={16} size={1} />}
            <Controls position="bottom-right" />
          </ReactFlow>
        </div>

        {/* Inspector */}
        {selectedNodeId && selectedNode ? (
          <div className="w-80 shrink-0">
            <NodeInspector
              node={selectedNode}
              columns={variableContext[selectedNode.id] ?? []}
              columnDefs={columnDefsContext[selectedNode.id] ?? []}
              upstreamNodes={upstreamNodeOptions[selectedNode.id] ?? []}
              onUpdate={updateNodeConfig}
              onUpdateData={updateNodeData}
              onClose={() => setSelectedNodeId(null)}
              onDelete={() => deleteNode(selectedNode.id)}
            />
          </div>
        ) : null}
      </div>

      <StatusBar
        nodeCount={nodes.length}
        contactCount={contactEstimate}
        errorCount={errorCount}
        warningCount={warningCount}
        runStatus={backendRunStatus}
        runMode={runResultsData?.mode}
        runProgress={runProgress}
      />

      {contextMenu && (
        <CanvasContextMenu
          target={contextMenu}
          onClose={() => setContextMenu(null)}
          onAction={handleContextMenuAction}
        />
      )}

      {showRunResults && runResultsData && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
          onClick={() => {
            setShowRunResults(false);
            setActiveRunId(null);
          }}
        >
          <div
            className="max-h-[86vh] w-[min(96vw,34rem)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <RunResultsPanel
              run={runResultsData}
              onClose={() => {
                setShowRunResults(false);
                setActiveRunId(null);
              }}
              nodeLabels={nodeLabels}
              className="max-h-[86vh] w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlowBuilder({ initialFlowId, templateData, onBack }: { initialFlowId?: string; templateData?: FlowTemplate; onBack?: () => void } = {}) {
  return (
    <ReactFlowProvider>
      <FlowBuilderInner initialFlowId={initialFlowId} templateData={templateData} onBack={onBack} />
    </ReactFlowProvider>
  );
}
