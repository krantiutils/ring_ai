"use client";

import { useMemo, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  Filter,
  GitBranch,
  Loader2,
  MessageSquare,
  PhoneCall,
  PlayCircle,
  Plus,
  Save,
  Smartphone,
  Table2,
  TimerReset,
  Upload,
  UsersRound,
  Volume2,
  Workflow,
  XCircle,
} from "lucide-react";
import type { FlowEdge, FlowNode, FlowNodeData, FlowNodeKind } from "@/features/flows/builderTypes";
import { FLOW_TEMPLATES } from "@/features/flows/templates";
import { reachableNodeCount, simulateContactsCount, validateFlow } from "@/features/flows/validation";

const STORAGE_KEY = "agentshakti_flow_builder_v1";

const SOURCE_KINDS: FlowNodeKind[] = [
  "source_manual_table",
  "source_csv",
  "source_xlsx",
  "source_google_contacts",
  "source_numbers",
];

const nodeIcon: Record<FlowNodeKind, React.ReactNode> = {
  trigger_manual: <PlayCircle className="h-4 w-4" />,
  trigger_schedule: <CalendarClock className="h-4 w-4" />,
  source_manual_table: <Table2 className="h-4 w-4" />,
  source_csv: <FileSpreadsheet className="h-4 w-4" />,
  source_xlsx: <FileSpreadsheet className="h-4 w-4" />,
  source_numbers: <UsersRound className="h-4 w-4" />,
  source_google_contacts: <UsersRound className="h-4 w-4" />,
  source_file: <Upload className="h-4 w-4" />,
  validation: <CheckCircle2 className="h-4 w-4" />,
  condition: <GitBranch className="h-4 w-4" />,
  loop: <Workflow className="h-4 w-4" />,
  wait: <Clock3 className="h-4 w-4" />,
  business_hours: <CalendarClock className="h-4 w-4" />,
  rate_limit: <TimerReset className="h-4 w-4" />,
  sender_number: <Smartphone className="h-4 w-4" />,
  agent_sms: <MessageSquare className="h-4 w-4" />,
  agent_voice: <PhoneCall className="h-4 w-4" />,
  agent_whatsapp: <MessageSquare className="h-4 w-4" />,
  merge: <Workflow className="h-4 w-4" />,
  error_handler: <AlertTriangle className="h-4 w-4" />,
  end_success: <CheckCircle2 className="h-4 w-4" />,
  end_failure: <XCircle className="h-4 w-4" />,
};

const palette: Array<{ kind: FlowNodeKind; label: string; description: string }> = [
  { kind: "trigger_manual", label: "Manual Trigger", description: "Start manually" },
  { kind: "trigger_schedule", label: "Schedule Trigger", description: "Cron/timed trigger" },
  { kind: "source_manual_table", label: "Manual Table", description: "Build contacts table manually" },
  { kind: "source_csv", label: "CSV Source", description: "Read CSV contacts" },
  { kind: "source_xlsx", label: "XLSX Source", description: "Read Excel contacts" },
  { kind: "source_google_contacts", label: "Google Contacts", description: "Import from Google contacts" },
  { kind: "source_numbers", label: "Number Source", description: "Manual numbers" },
  { kind: "source_file", label: "File Upload", description: "Attach reusable file" },
  { kind: "validation", label: "Validation", description: "Schema + row checks" },
  { kind: "condition", label: "Decision", description: "if / else routing (diamond)" },
  { kind: "loop", label: "Loop / For-Each", description: "Iterative branch behavior" },
  { kind: "wait", label: "Wait", description: "Delay execution" },
  { kind: "business_hours", label: "Business Hours", description: "Time-window guard" },
  { kind: "rate_limit", label: "Rate Limit", description: "Throttle throughput" },
  { kind: "sender_number", label: "Sender Number", description: "Pick outbound number" },
  { kind: "agent_sms", label: "SMS Agent", description: "Send SMS" },
  { kind: "agent_voice", label: "Voice Agent", description: "Place voice call" },
  { kind: "agent_whatsapp", label: "WhatsApp Agent", description: "Send WhatsApp message" },
  { kind: "merge", label: "Merge", description: "Merge branches" },
  { kind: "error_handler", label: "Error Handler", description: "Retries/fail lane" },
  { kind: "end_success", label: "End Success", description: "Successful end (oval)" },
  { kind: "end_failure", label: "End Failure", description: "Failure end (oval)" },
];

function defaultConfig(kind: FlowNodeKind): Record<string, string> {
  if (kind === "source_manual_table") return { table_columns: "name,phone,age,gender", sample_csv: "name,phone,age,gender\nRam,+9779800000000,34,male" };
  if (kind === "source_csv" || kind === "source_xlsx") return { required_columns: "name,phone", sample_csv: "name,phone\nRam,+9779800000000" };
  if (kind === "source_google_contacts") return { sync_mode: "labels:customers", estimated_contacts: "150" };
  if (kind === "source_numbers") return { numbers: "+9779800000000,+9779811111111" };
  if (kind === "validation") return { required_columns: "name,phone" };
  if (kind === "condition") return { field: "age", operator: ">", value: "30" };
  if (kind === "loop") return { mode: "for_each_contact", max_iterations: "1" };
  if (kind === "wait") return { duration_minutes: "30" };
  if (kind === "business_hours") return { timezone: "Asia/Kathmandu", window: "09:00-18:00" };
  if (kind === "rate_limit") return { per_minute: "20" };
  if (kind === "sender_number") return { number: "+19704701940" };
  if (kind === "agent_sms" || kind === "agent_whatsapp") return { message: "Namaste {{name}}, यो AgentShakti automation सन्देश हो।" };
  if (kind === "agent_voice") return { script: "नमस्ते, AgentShakti बाट बोल्दैछु।" };
  if (kind === "trigger_schedule") return { cron: "0 10 * * *" };
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

function getNodeShape(kind: FlowNodeKind): "rectangle" | "diamond" | "oval" | "parallelogram" {
  if (kind === "condition") return "diamond";
  if (kind === "trigger_manual" || kind === "trigger_schedule" || kind === "end_success" || kind === "end_failure") return "oval";
  if (kind.startsWith("source_")) return "parallelogram";
  return "rectangle";
}

function shapeClass(shape: ReturnType<typeof getNodeShape>, selected: boolean) {
  const selectedClass = selected ? "border-[var(--accent)] shadow-[0_8px_22px_rgba(0,82,255,0.18)]" : "border-[var(--border)]";
  if (shape === "diamond") return `h-[128px] w-[128px] rotate-45 rounded-xl border bg-[var(--card)] shadow-sm ${selectedClass}`;
  if (shape === "oval") return `min-h-[74px] min-w-[208px] rounded-full border bg-[var(--card)] px-5 py-3 shadow-sm ${selectedClass}`;
  if (shape === "parallelogram") return `min-h-[84px] min-w-[220px] border bg-[var(--card)] px-5 py-3 shadow-sm ${selectedClass}`;
  return `min-h-[86px] min-w-[220px] rounded-xl border bg-[var(--card)] px-5 py-3 shadow-sm ${selectedClass}`;
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

function FlowNodeCard({ data, selected }: NodeProps<FlowNode>) {
  const shape = getNodeShape(data.kind);
  const baseClass = shapeClass(shape, selected);
  const content = (
    <div className="flex items-center gap-2 text-[var(--foreground)]">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)]">
        {nodeIcon[data.kind]}
      </span>
      <div>
        <p className="text-sm font-semibold">{data.label}</p>
        <p className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          {data.kind.replaceAll("_", " ")}
        </p>
      </div>
    </div>
  );

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border !border-[var(--border)] !bg-[var(--card)]" />
      {shape === "diamond" ? (
        <div className={baseClass}>
          <div className="-translate-y-[1px] -rotate-45">{content}</div>
        </div>
      ) : shape === "parallelogram" ? (
        <div className={baseClass} style={{ clipPath: "polygon(12% 0, 100% 0, 88% 100%, 0 100%)" }}>
          {content}
        </div>
      ) : (
        <div className={baseClass}>{content}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border !border-[var(--border)] !bg-[var(--card)]" />
    </div>
  );
}

const NODE_TYPES = { flowNode: FlowNodeCard };

type SourceChoice = {
  kind: FlowNodeKind;
  title: string;
  description: string;
};

const sourceChoices: SourceChoice[] = [
  { kind: "source_manual_table", title: "Manual Table", description: "Build a contact table directly in the builder." },
  { kind: "source_csv", title: "Import CSV", description: "Upload and parse a CSV file as contacts." },
  { kind: "source_xlsx", title: "Import XLSX", description: "Upload Excel sheets and validate columns." },
  { kind: "source_google_contacts", title: "Google Contacts", description: "Sync contacts from Google account labels." },
  { kind: "source_numbers", title: "Paste Numbers", description: "Use manual phone list as a quick source." },
];

export default function FlowBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runState, setRunState] = useState<"idle" | "running" | "finished">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const hasSource = useMemo(() => nodes.some((n) => SOURCE_KINDS.includes(n.data.kind)), [nodes]);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const issues = useMemo(() => validateFlow(nodes as FlowNode[], edges), [nodes, edges]);
  const fatalIssues = issues.filter((i) => i.severity === "error");
  const contactEstimate = useMemo(() => simulateContactsCount(nodes as FlowNode[]), [nodes]);
  const reachableCount = useMemo(() => reachableNodeCount(nodes as FlowNode[], edges), [nodes, edges]);

  function startWithSource(kind: FlowNodeKind) {
    const trigger = makeNode("trigger_manual", 100, 80);
    const source = makeNode(kind, 100, 250);
    const validation = makeNode("validation", 100, 420);
    const end = makeNode("end_success", 420, 420);
    setNodes([trigger, source, validation, end]);
    setEdges([
      { id: "e-start-1", source: trigger.id, target: source.id, animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e-start-2", source: source.id, target: validation.id, animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e-start-3", source: validation.id, target: end.id, animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
    ]);
    setSelectedNodeId(source.id);
  }

  function onConnect(params: Connection) {
    if (!params.source || !params.target) return;
    const source = nodes.find((n) => n.id === params.source);
    const target = nodes.find((n) => n.id === params.target);
    if (!source || !target) return;
    if (source.data.kind.startsWith("agent_") && target.data.kind.startsWith("source_")) return;
    const isLoopback = wouldCreateCycle(params.source, params.target, edges);
    setEdges((eds) =>
      addEdge(
        {
          ...params,
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
          style: isLoopback ? { strokeDasharray: "6 4", strokeWidth: 2 } : undefined,
          label: isLoopback ? "loopback" : undefined,
        },
        eds,
      ),
    );
  }

  function addNode(kind: FlowNodeKind) {
    if (!hasSource && !SOURCE_KINDS.includes(kind) && !kind.startsWith("trigger_")) return;
    const x = 120 + (nodes.length % 6) * 220;
    const y = 120 + Math.floor(nodes.length / 6) * 170;
    const n = makeNode(kind, x, y);
    setNodes((prev) => [...prev, n]);
    setSelectedNodeId(n.id);
  }

  function updateNodeConfig(key: string, value: string) {
    if (!selectedNode) return;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === selectedNode.id
          ? {
              ...n,
              data: {
                ...n.data,
                config: { ...n.data.config, [key]: value },
              },
            }
          : n,
      ),
    );
  }

  function saveDraft() {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges }));
    setSavedAt(new Date().toLocaleString());
  }

  function loadDraft() {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { nodes: FlowNode[]; edges: typeof edges };
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
      setSelectedNodeId(parsed.nodes[0]?.id || null);
    } catch {
      // ignore malformed local draft
    }
  }

  async function runSimulation() {
    setRunState("running");
    await new Promise((r) => setTimeout(r, 900));
    setRunState("finished");
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
      <aside className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl text-[var(--foreground)]">Nodes</h2>
          <span className="font-mono-label text-[11px] uppercase tracking-[0.13em] text-[var(--muted-foreground)]">
            {nodes.length} total
          </span>
        </div>
        {!hasSource ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3 text-sm text-[var(--muted-foreground)]">
            Pick a data source first to start the workflow.
          </div>
        ) : null}

        <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
          {palette.map((item) => {
            const locked = !hasSource && !SOURCE_KINDS.includes(item.kind) && !item.kind.startsWith("trigger_");
            return (
              <button
                key={item.kind}
                type="button"
                disabled={locked}
                onClick={() => addNode(item.kind)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <p className="text-sm font-semibold text-[var(--foreground)]">{item.label}</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.description}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Templates</h3>
          <div className="mt-2 space-y-2">
            {FLOW_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  setNodes(tpl.nodes);
                  setEdges(tpl.edges);
                  setSelectedNodeId(tpl.nodes[0]?.id || null);
                }}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-left hover:border-[var(--accent)]/35"
              >
                <p className="text-sm font-semibold text-[var(--foreground)]">{tpl.name}</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{tpl.description}</p>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
        {!hasSource ? (
          <div className="flex h-[68vh] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)] px-6">
            <h3 className="font-display text-3xl text-[var(--foreground)]">Choose Data Source</h3>
            <p className="mt-2 max-w-2xl text-center text-sm text-[var(--muted-foreground)]">
              User first picks the data source, then the builder flow starts.
            </p>
            <div className="mt-6 grid w-full max-w-4xl grid-cols-1 gap-3 md:grid-cols-2">
              {sourceChoices.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => startWithSource(option.kind)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)]/40"
                >
                  <p className="text-sm font-semibold text-[var(--foreground)]">{option.title}</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{option.description}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
              <button onClick={saveDraft} className="btn-outline-modern inline-flex h-10 items-center gap-2 px-4 text-sm">
                <Save className="h-4 w-4" /> Save Draft
              </button>
              <button onClick={loadDraft} className="btn-outline-modern inline-flex h-10 items-center gap-2 px-4 text-sm">
                <Upload className="h-4 w-4" /> Load Draft
              </button>
              <button
                onClick={() => {
                  setNodes([]);
                  setEdges([]);
                  setSelectedNodeId(null);
                }}
                className="btn-outline-modern inline-flex h-10 items-center gap-2 px-4 text-sm"
              >
                <Plus className="h-4 w-4" /> Change Source
              </button>
              <button
                onClick={runSimulation}
                disabled={runState === "running" || fatalIssues.length > 0}
                className="btn-primary-modern inline-flex h-10 items-center gap-2 px-4 text-sm disabled:opacity-60"
              >
                {runState === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                Simulate Run
              </button>
              <span className="ml-auto font-mono-label text-[11px] uppercase tracking-[0.13em] text-[var(--muted-foreground)]">
                {savedAt ? `saved ${savedAt}` : "unsaved"}
              </span>
            </div>

            <div className="h-[68vh] overflow-hidden rounded-xl border border-[var(--border)]">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={NODE_TYPES}
                fitView
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                colorMode="light"
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#94A3B8" />
                <MiniMap pannable zoomable />
                <Controls />
              </ReactFlow>
            </div>
          </>
        )}
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Flow Health</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-2">
              <p className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Contacts</p>
              <p className="text-lg font-semibold text-[var(--foreground)]">{contactEstimate}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-2">
              <p className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Reachable</p>
              <p className="text-lg font-semibold text-[var(--foreground)]">{reachableCount}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-2">
              <p className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Errors</p>
              <p className="text-lg font-semibold text-[#DC2626]">{fatalIssues.length}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-2">
              <p className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Warnings</p>
              <p className="text-lg font-semibold text-[#D97706]">{issues.length - fatalIssues.length}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 max-h-[210px] overflow-auto">
            {issues.length === 0 ? (
              <p className="text-sm text-[#16A34A]">No issues. Flow is ready for publish/run.</p>
            ) : (
              issues.map((issue) => (
                <div
                  key={issue.id}
                  className={`rounded-xl border p-2 text-sm ${
                    issue.severity === "error"
                      ? "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]"
                      : "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]"
                  }`}
                >
                  <p className="font-medium">{issue.message}</p>
                  {issue.detail ? <p className="mt-1 text-xs opacity-80">{issue.detail}</p> : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Inspector</h3>
          {selectedNode ? (
            <>
              <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                <p className="text-sm font-semibold text-[var(--foreground)]">{selectedNode.data.label}</p>
                <p className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  {selectedNode.data.kind}
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {Object.entries(selectedNode.data.config).length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">No configurable settings for this node.</p>
                ) : (
                  Object.entries(selectedNode.data.config).map(([key, value]) => (
                    <label key={key} className="block space-y-1">
                      <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                        {key.replaceAll("_", " ")}
                      </span>
                      <input
                        value={String(value)}
                        onChange={(e) => updateNodeConfig(key, e.target.value)}
                        className="input-modern h-10 w-full px-3 text-sm"
                      />
                    </label>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => setNodes((prev) => prev.filter((n) => n.id !== selectedNode.id))}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-[#FCA5A5] bg-[#FFF1F2] px-4 text-sm text-[#B91C1C]"
              >
                <XCircle className="h-4 w-4" /> Delete Node
              </button>
            </>
          ) : (
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">Click a node to edit configuration.</p>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Execution Preview</h3>
          <ul className="mt-2 space-y-2 text-sm text-[var(--muted-foreground)]">
            <li className="flex items-start gap-2">
              <Filter className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
              Decision nodes are rendered as diamonds and can branch true/false paths.
            </li>
            <li className="flex items-start gap-2">
              <Clock3 className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
              Time nodes enforce delays, business windows, and schedule constraints.
            </li>
            <li className="flex items-start gap-2">
              <Workflow className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
              Loopback edges are auto-marked with dashed style and `loopback` label.
            </li>
            <li className="flex items-start gap-2">
              <Volume2 className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
              Channel nodes represent SMS/Voice/WhatsApp delivery actions.
            </li>
          </ul>
          <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-2 text-sm">
            {runState === "idle" && "No run yet. Use Simulate Run to test graph readiness."}
            {runState === "running" && "Simulating flow execution..."}
            {runState === "finished" && "Simulation complete. Review warnings before publish."}
          </div>
        </div>
      </aside>
    </div>
  );
}
