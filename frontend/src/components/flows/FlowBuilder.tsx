"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
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
import { PALETTE_NODES } from "@/features/flows/nodeRegistry";
import { api } from "@/lib/api";

import SourceWizard from "./SourceWizard";
import NodeCard from "./NodeCard";
import DeletableEdge from "./DeletableEdge";
import AddNodeMenu from "./AddNodeMenu";
import CanvasContextMenu from "./CanvasContextMenu";
import type { ContextMenuTarget } from "./CanvasContextMenu";
import NodeInspector from "./NodeInspector";
import RunResultsPanel from "./RunResultsPanel";
import type { RunData } from "./RunResultsPanel";
import FlowToolbar from "./FlowToolbar";
import StatusBar from "./StatusBar";

/* ── Constants ──────────────────────────────────────────── */

const STORAGE_KEY = "agentshakti_flow_builder_v1";

const SOURCE_KINDS: FlowNodeKind[] = [
  "source_manual_table",
  "source_csv",
  "source_xlsx",
  "source_url_json",
  "source_url_csv",
  "source_google_contacts",
  "source_numbers",
];

const NODE_TYPES = { flowNode: NodeCard };
const EDGE_TYPES = { deletable: DeletableEdge };
const DEFAULT_EDGE_OPTIONS = {
  type: "deletable" as const,
  selectable: true,
  deletable: true,
  animated: true,
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
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
  if (kind === "wait") return { duration_minutes: "30" };
  if (kind === "rate_limit") return { per_minute: "20" };
  if (kind === "sender_number") return { number: "" };
  if (kind === "agent_sms") return { message: "" };
  if (kind === "agent_voice") return { script: "", tts_provider: "edge_tts", tts_voice: "" };
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

/* ── Main Component ─────────────────────────────────────── */

function FlowBuilderInner({ initialFlowId, onBack: onBackToLibrary }: { initialFlowId?: string; onBack?: () => void }) {
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

  const { fitView, screenToFlowPosition } = useReactFlow();

  // Computed values
  const variableContext = useVariableContext(nodes, edges);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const issues = useMemo(() => validateFlow(nodes as FlowNode[], edges), [nodes, edges]);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const contactEstimate = useMemo(() => simulateContactsCount(nodes as FlowNode[]), [nodes]);

  // Load flow on mount — from backend if initialFlowId, from localStorage only if no library callback
  React.useEffect(() => {
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
  }, [initialFlowId]);

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
    const x = 120 + (nodes.length % 5) * 240;
    const y = 120 + Math.floor(nodes.length / 5) * 150;
    const n = makeNode(kind, x, y);
    setNodes((prev) => [...prev, n]);
    setSelectedNodeId(n.id);
  }

  function deleteNode(nodeId: string) {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
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
      const isBranching = srcNode.data.kind === "condition" || srcNode.data.kind === "validation";
      let sourceHandle = params.sourceHandle || undefined;

      if (isBranching && !sourceHandle) {
        const trueLabel = srcNode.data.kind === "validation" ? "valid" : "true";
        const falseLabel = srcNode.data.kind === "validation" ? "invalid" : "false";
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
            sourceHandle,
            style: isLoopback ? { strokeDasharray: "6 4", strokeWidth: 2 } : undefined,
            label: isBranching ? sourceHandle : isLoopback ? "loopback" : branchLabel,
            labelStyle: isBranching
              ? {
                  fill: sourceHandle === "true" || sourceHandle === "valid" ? "#16A34A" : "#DC2626",
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
        {/* Left Rail */}
        <div className="flex w-12 flex-col items-center gap-1 border-r border-[var(--border)] bg-[var(--card)] py-2">
          <AddNodeMenu onAdd={addNode} />
        </div>

        {/* Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => { setSelectedNodeId(null); setContextMenu(null); }}
            onPaneContextMenu={handlePaneContextMenu}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeContextMenu={handleEdgeContextMenu}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            {showGrid && <Background variant={BackgroundVariant.Dots} gap={16} size={1} />}
            <Controls position="bottom-right" />
          </ReactFlow>
        </div>

        {/* Inspector / Run Results */}
        {showRunResults && runResultsData ? (
          <RunResultsPanel
            run={runResultsData}
            onClose={() => {
              setShowRunResults(false);
              setActiveRunId(null);
            }}
            nodeLabels={nodeLabels}
          />
        ) : selectedNodeId && selectedNode ? (
          <div className="w-80 shrink-0">
            <NodeInspector
              node={selectedNode}
              columns={variableContext[selectedNode.id] ?? []}
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
    </div>
  );
}

export default function FlowBuilder({ initialFlowId, onBack }: { initialFlowId?: string; onBack?: () => void } = {}) {
  return (
    <ReactFlowProvider>
      <FlowBuilderInner initialFlowId={initialFlowId} onBack={onBack} />
    </ReactFlowProvider>
  );
}
