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
  TimerReset,
  Upload,
  UsersRound,
  Volume2,
  Workflow,
  XCircle,
} from "lucide-react";
import type { FlowNode, FlowNodeData, FlowNodeKind } from "@/features/flows/builderTypes";
import { DEFAULT_FLOW, FLOW_TEMPLATES } from "@/features/flows/templates";
import { reachableNodeCount, simulateContactsCount, validateFlow } from "@/features/flows/validation";

const STORAGE_KEY = "agentshakti_flow_builder_v1";

const nodeIcon: Record<FlowNodeKind, React.ReactNode> = {
  trigger_manual: <PlayCircle className="h-4 w-4" />,
  trigger_schedule: <CalendarClock className="h-4 w-4" />,
  source_csv: <FileSpreadsheet className="h-4 w-4" />,
  source_xlsx: <FileSpreadsheet className="h-4 w-4" />,
  source_numbers: <UsersRound className="h-4 w-4" />,
  source_file: <Upload className="h-4 w-4" />,
  validation: <CheckCircle2 className="h-4 w-4" />,
  condition: <GitBranch className="h-4 w-4" />,
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

function FlowNodeCard({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div
      className={`min-w-[190px] rounded-2xl border bg-[var(--card)] px-3 py-2 shadow-sm transition ${
        selected ? "border-[var(--accent)] shadow-[0_8px_22px_rgba(0,82,255,0.18)]" : "border-[var(--border)]"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border !border-[var(--border)] !bg-[var(--card)]" />
      <div className="flex items-center gap-2 text-[var(--foreground)]">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)]">
          {nodeIcon[data.kind]}
        </span>
        <div>
          <p className="text-sm font-semibold">{data.label}</p>
          <p className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{data.kind.replaceAll("_", " ")}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border !border-[var(--border)] !bg-[var(--card)]" />
    </div>
  );
}

const NODE_TYPES = { flowNode: FlowNodeCard };

const palette: Array<{ kind: FlowNodeKind; label: string; description: string }> = [
  { kind: "trigger_manual", label: "Manual Trigger", description: "Start manually" },
  { kind: "trigger_schedule", label: "Schedule Trigger", description: "Cron/timed trigger" },
  { kind: "source_csv", label: "CSV Source", description: "Read CSV contacts" },
  { kind: "source_xlsx", label: "XLSX Source", description: "Read Excel contacts" },
  { kind: "source_numbers", label: "Number Source", description: "Manual numbers" },
  { kind: "source_file", label: "File Upload", description: "Attach reusable file" },
  { kind: "validation", label: "Validation", description: "Schema + row checks" },
  { kind: "condition", label: "Condition", description: "if / else routing" },
  { kind: "wait", label: "Wait", description: "Delay execution" },
  { kind: "business_hours", label: "Business Hours", description: "Time-window guard" },
  { kind: "rate_limit", label: "Rate Limit", description: "Throttle throughput" },
  { kind: "sender_number", label: "Sender Number", description: "Pick outbound number" },
  { kind: "agent_sms", label: "SMS Agent", description: "Send SMS" },
  { kind: "agent_voice", label: "Voice Agent", description: "Place voice call" },
  { kind: "agent_whatsapp", label: "WhatsApp Agent", description: "Send WhatsApp message" },
  { kind: "merge", label: "Merge", description: "Merge branches" },
  { kind: "error_handler", label: "Error Handler", description: "Retries/fail lane" },
  { kind: "end_success", label: "End Success", description: "Successful end" },
  { kind: "end_failure", label: "End Failure", description: "Failure end" },
];

function defaultConfig(kind: FlowNodeKind): Record<string, string> {
  if (kind === "source_csv" || kind === "source_xlsx") return { required_columns: "name,phone", sample_csv: "name,phone\nRam,+9779800000000" };
  if (kind === "source_numbers") return { numbers: "+9779800000000,+9779811111111" };
  if (kind === "validation") return { required_columns: "name,phone" };
  if (kind === "condition") return { field: "age", operator: ">", value: "30" };
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

export default function FlowBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState(DEFAULT_FLOW.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_FLOW.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(DEFAULT_FLOW.nodes[0]?.id || null);
  const [runState, setRunState] = useState<"idle" | "running" | "finished">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const issues = useMemo(() => validateFlow(nodes as FlowNode[], edges), [nodes, edges]);
  const fatalIssues = issues.filter((i) => i.severity === "error");
  const contactEstimate = useMemo(() => simulateContactsCount(nodes as FlowNode[]), [nodes]);
  const reachableCount = useMemo(() => reachableNodeCount(nodes as FlowNode[], edges), [nodes, edges]);

  function onConnect(params: Connection) {
    if (!params.source || !params.target) return;
    const source = nodes.find((n) => n.id === params.source);
    const target = nodes.find((n) => n.id === params.target);
    if (!source || !target) return;
    if (source.data.kind.startsWith("agent_") && target.data.kind.startsWith("source_")) return;
    setEdges((eds) =>
      addEdge(
        { ...params, animated: true, markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 } },
        eds,
      ),
    );
  }

  function addNode(kind: FlowNodeKind) {
    const x = 120 + (nodes.length % 6) * 210;
    const y = 120 + Math.floor(nodes.length / 6) * 150;
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
    const stamp = new Date().toLocaleString();
    setSavedAt(stamp);
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

        <div className="space-y-2 overflow-y-auto pr-1 max-h-[48vh]">
          {palette.map((item) => (
            <button
              key={item.kind}
              type="button"
              onClick={() => addNode(item.kind)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:bg-[var(--muted)]"
            >
              <p className="text-sm font-semibold text-[var(--foreground)]">{item.label}</p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.description}</p>
            </button>
          ))}
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
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
          <button onClick={saveDraft} className="btn-outline-modern inline-flex h-10 items-center gap-2 px-4 text-sm">
            <Save className="h-4 w-4" /> Save Draft
          </button>
          <button onClick={loadDraft} className="btn-outline-modern inline-flex h-10 items-center gap-2 px-4 text-sm">
            <Upload className="h-4 w-4" /> Load Draft
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
              Preflight blocks run when fatal validation errors exist.
            </li>
            <li className="flex items-start gap-2">
              <Clock3 className="mt-0.5 h-4 w-4 text-[var(--accent)]" />
              Time nodes enforce delays, business windows, and schedule constraints.
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
