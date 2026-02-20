"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
} from "@xyflow/react";
import type { FlowEdge, FlowNode, FlowNodeKind } from "@/features/flows/builderTypes";
import { validateFlow, simulateContactsCount, reachableNodeCount } from "@/features/flows/validation";
import { useVariableContext } from "@/features/flows/useVariableContext";
import { PALETTE_NODES } from "@/features/flows/nodeRegistry";
import { api } from "@/lib/api";

import SourceWizard from "./SourceWizard";
import NodeCard from "./NodeCard";
import AddNodeMenu from "./AddNodeMenu";
import NodeInspector from "./NodeInspector";
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
  if (kind === "agent_sms") return { message: "" };
  if (kind === "agent_voice") return { script: "" };
  if (kind === "agent_whatsapp") return { message: "", template_name: "" };
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

export default function FlowBuilder() {
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

  // Computed values
  const variableContext = useVariableContext(nodes, edges);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const issues = useMemo(() => validateFlow(nodes as FlowNode[], edges), [nodes, edges]);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const contactEstimate = useMemo(() => simulateContactsCount(nodes as FlowNode[]), [nodes]);

  // Load saved draft on mount
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { nodes: FlowNode[]; edges: FlowEdge[]; flowName?: string; flowDefinitionId?: string };
      if (parsed.nodes?.length) {
        setNodes(parsed.nodes);
        setEdges(parsed.edges ?? []);
        if (parsed.flowName) setFlowName(parsed.flowName);
        if (parsed.flowDefinitionId) setFlowDefinitionId(parsed.flowDefinitionId);
        setMode("canvas");
      }
    } catch {
      // ignore
    }
  }, []);

  // ── Handlers ──────────────────────────────────────────

  function handleWizardComplete(
    sourceKind: FlowNodeKind,
    config: Record<string, string>,
    columns: string[],
  ) {
    const trigger = makeNode("trigger_manual", 80, 200);
    const source = makeNode(sourceKind, 300, 200);
    source.data.config = { ...source.data.config, ...config };
    source.data.columns = columns;
    const end = makeNode("end_success", 520, 200);
    setNodes([trigger, source, end]);
    setEdges([
      { id: `e-${trigger.id}-${source.id}`, source: trigger.id, target: source.id, animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: `e-${source.id}-${end.id}`, source: source.id, target: end.id, animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
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
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
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

  async function saveDraft() {
    setSaving(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges, flowName, flowDefinitionId }));
    }
    try {
      const payload = { name: flowName, nodes: nodes as unknown[], edges: edges as unknown[], status: "draft" };
      if (flowDefinitionId) {
        await api.updateFlowDefinition(flowDefinitionId, payload);
      } else {
        const res = await api.createFlowDefinition(payload);
        setFlowDefinitionId(res.id);
      }
      setSavedAt(new Date().toLocaleTimeString());
    } catch {
      setSavedAt(new Date().toLocaleTimeString() + " (local only)");
    } finally {
      setSaving(false);
    }
  }

  async function runFlow() {
    if (!flowDefinitionId) {
      await saveDraft();
    }
    if (!flowDefinitionId) return;
    setRunning(true);
    setBackendRunStatus(null);
    try {
      const res = await api.triggerFlowRun(flowDefinitionId);
      setBackendRunStatus(res.status);
    } catch (err) {
      setBackendRunStatus("error");
    } finally {
      setRunning(false);
    }
  }

  function handleBack() {
    // Reset to wizard for a new flow
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
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls position="bottom-right" />
          </ReactFlow>
        </div>

        {/* Inspector */}
        {selectedNode && (
          <div className="w-80 shrink-0">
            <NodeInspector
              node={selectedNode}
              columns={variableContext[selectedNode.id] ?? []}
              onUpdate={updateNodeConfig}
              onClose={() => setSelectedNodeId(null)}
              onDelete={() => deleteNode(selectedNode.id)}
            />
          </div>
        )}
      </div>

      <StatusBar
        nodeCount={nodes.length}
        contactCount={contactEstimate}
        errorCount={errorCount}
        warningCount={warningCount}
      />
    </div>
  );
}
