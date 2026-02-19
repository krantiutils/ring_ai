"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  CopyX,
  FileSpreadsheet,
  Filter,
  GitBranch,
  Loader2,
  MessageCircle,
  MessageSquare,
  PhoneCall,
  PhoneForwarded,
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
  Zap,
} from "lucide-react";
import type { FlowEdge, FlowNode, FlowNodeKind } from "@/features/flows/builderTypes";
import { FLOW_TEMPLATES } from "@/features/flows/templates";
import { parseCsv, reachableNodeCount, simulateContactsCount, validateFlow } from "@/features/flows/validation";
import { api } from "@/lib/api";

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

const nodeIcon: Record<FlowNodeKind, React.ReactNode> = {
  trigger_manual: <PlayCircle className="h-4 w-4" />,
  trigger_schedule: <CalendarClock className="h-4 w-4" />,
  trigger_event: <Zap className="h-4 w-4" />,
  source_manual_table: <Table2 className="h-4 w-4" />,
  source_csv: <FileSpreadsheet className="h-4 w-4" />,
  source_xlsx: <FileSpreadsheet className="h-4 w-4" />,
  source_url_json: <Upload className="h-4 w-4" />,
  source_url_csv: <Upload className="h-4 w-4" />,
  source_numbers: <UsersRound className="h-4 w-4" />,
  source_google_contacts: <UsersRound className="h-4 w-4" />,
  source_file: <Upload className="h-4 w-4" />,
  enrich_columns: <Plus className="h-4 w-4" />,
  validation: <CheckCircle2 className="h-4 w-4" />,
  deduplicate: <CopyX className="h-4 w-4" />,
  normalize_phone: <PhoneForwarded className="h-4 w-4" />,
  condition: <GitBranch className="h-4 w-4" />,
  loop: <Workflow className="h-4 w-4" />,
  wait: <Clock3 className="h-4 w-4" />,
  business_hours: <CalendarClock className="h-4 w-4" />,
  rate_limit: <TimerReset className="h-4 w-4" />,
  sender_number: <Smartphone className="h-4 w-4" />,
  agent_sms: <MessageSquare className="h-4 w-4" />,
  agent_voice: <PhoneCall className="h-4 w-4" />,
  agent_whatsapp: <MessageCircle className="h-4 w-4" />,
  survey_ai: <Volume2 className="h-4 w-4" />,
  dtmf_menu: <GitBranch className="h-4 w-4" />,
  response_capture: <MessageSquare className="h-4 w-4" />,
  action_webhook: <Workflow className="h-4 w-4" />,
  merge: <Workflow className="h-4 w-4" />,
  error_handler: <AlertTriangle className="h-4 w-4" />,
  end_success: <CheckCircle2 className="h-4 w-4" />,
  end_failure: <XCircle className="h-4 w-4" />,
};

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
  { kind: "source_file", label: "File Upload", description: "Attach reusable file" },
  { kind: "enrich_columns", label: "Enrich Columns", description: "Append extra computed/survey columns" },
  { kind: "validation", label: "Validation", description: "Schema + row checks" },
  { kind: "deduplicate", label: "Deduplicate", description: "Remove duplicate contacts by column" },
  { kind: "normalize_phone", label: "Normalize Phone", description: "Standardize phone format and language" },
  { kind: "condition", label: "Decision", description: "if / else routing (diamond)" },
  { kind: "loop", label: "Loop / For-Each", description: "Iterative branch behavior" },
  { kind: "wait", label: "Wait", description: "Delay execution" },
  { kind: "business_hours", label: "Business Hours", description: "Time-window guard" },
  { kind: "rate_limit", label: "Rate Limit", description: "Throttle throughput" },
  { kind: "sender_number", label: "Sender Number", description: "Pick outbound number" },
  { kind: "agent_sms", label: "SMS Agent", description: "Send SMS" },
  { kind: "agent_voice", label: "Voice Agent", description: "Place voice call" },
  { kind: "agent_whatsapp", label: "WhatsApp Agent", description: "Send WhatsApp message" },
  { kind: "survey_ai", label: "Survey AI", description: "Conversational AI survey (Gemini/voice)" },
  { kind: "dtmf_menu", label: "Press 1/2 Menu", description: "Phone keypad branching during calls" },
  { kind: "response_capture", label: "Response Capture", description: "Capture reply text/intents/survey answers" },
  { kind: "action_webhook", label: "Action Hook", description: "POST results to webhook after action" },
  { kind: "merge", label: "Merge", description: "Merge branches" },
  { kind: "error_handler", label: "Error Handler", description: "Retries/fail lane" },
  { kind: "end_success", label: "End Success", description: "Successful end (oval)" },
  { kind: "end_failure", label: "End Failure", description: "Failure end (oval)" },
];

function defaultConfig(kind: FlowNodeKind): Record<string, string> {
  if (kind === "source_manual_table") return { table_columns: "name,phone,age,gender", sample_csv: "name,phone,age,gender\nRam,+9779800000000,34,male" };
  if (kind === "source_csv" || kind === "source_xlsx") return { required_columns: "name,phone", sample_csv: "name,phone\nRam,+9779800000000" };
  if (kind === "source_url_json") return { url: "https://example.com/contacts.json", mapping: "name,phone,age,gender", estimated_rows: "250" };
  if (kind === "source_url_csv") return { url: "https://example.com/contacts.csv", mapping: "name,phone", estimated_rows: "250" };
  if (kind === "source_google_contacts") return { sync_mode: "labels:customers", estimated_contacts: "150" };
  if (kind === "source_numbers") return { numbers: "+9779800000000,+9779811111111" };
  if (kind === "enrich_columns") return { columns: "survey_score:int,preferred_language:text", strategy: "append" };
  if (kind === "validation") return { required_columns: "name,phone" };
  if (kind === "deduplicate") return { dedup_column: "phone", keep: "first" };
  if (kind === "normalize_phone") return { country_code: "+977", format: "e164" };
  if (kind === "condition") return { field: "age", operator: ">", value: "30" };
  if (kind === "loop") return { mode: "for_each_contact", max_iterations: "1" };
  if (kind === "wait") return { duration_minutes: "30" };
  if (kind === "business_hours") return { timezone: "Asia/Kathmandu", window: "09:00-18:00" };
  if (kind === "rate_limit") return { per_minute: "20" };
  if (kind === "sender_number") return { number: "+19704701940" };
  if (kind === "agent_sms") return { message: "Namaste {{name}}, यो AgentShakti automation सन्देश हो।" };
  if (kind === "agent_voice") return { script: "नमस्ते, AgentShakti बाट बोल्दैछु।" };
  if (kind === "agent_whatsapp") return { message: "Namaste {{name}}, यो AgentShakti WhatsApp सन्देश हो।", template_name: "" };
  if (kind === "survey_ai") return { model: "gemini-2.5-flash-native-audio", mode: "voice+text", survey_id: "default-survey" };
  if (kind === "dtmf_menu") return { option_1: "support", option_2: "sales", fallback: "repeat" };
  if (kind === "response_capture") return { store_columns: "response_text,intent,sentiment,dtmf_choice" };
  if (kind === "action_webhook") return { webhook_url: "https://example.com/hook", method: "POST", payload: "full_event" };
  if (kind === "trigger_schedule") return { cron: "0 10 * * *" };
  if (kind === "trigger_event") return { event_type: "webhook", event_filter: "" };
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
  if (kind === "condition" || kind === "dtmf_menu") return "diamond";
  if (kind === "trigger_manual" || kind === "trigger_schedule" || kind === "trigger_event" || kind === "end_success" || kind === "end_failure") return "oval";
  if (kind.startsWith("source_")) return "parallelogram";
  return "rectangle";
}

function shapeClass(shape: ReturnType<typeof getNodeShape>, selected: boolean) {
  const selectedClass = selected ? "border-[var(--accent)] shadow-[0_8px_22px_rgba(0,82,255,0.18)]" : "border-[var(--border)]";
  if (shape === "diamond") return `h-[128px] w-[128px] rotate-45 rounded-xl border bg-[var(--card)] shadow-sm ${selectedClass}`;
  if (shape === "oval") return `min-h-[74px] min-w-[208px] rounded-full border bg-[var(--card)] px-5 py-3 shadow-sm ${selectedClass}`;
  if (shape === "parallelogram") return `min-h-[84px] min-w-[220px] border bg-[var(--card)] pl-10 pr-8 py-3 shadow-sm ${selectedClass}`;
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
  const isBranching = data.kind === "condition" || data.kind === "validation";

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
      {data.kind.startsWith("source_") && data.columns && data.columns.length > 0 ? (
        <span className="ml-auto rounded-full bg-[var(--accent)] px-2 py-0.5 text-[9px] font-bold text-white">
          {data.columns.length} cols
        </span>
      ) : null}
    </div>
  );

  const trueLabel = data.kind === "validation" ? "valid" : "true";
  const falseLabel = data.kind === "validation" ? "invalid" : "false";

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
      {isBranching ? (
        <>
          <Handle
            type="source"
            position={Position.Left}
            id={trueLabel}
            className="!h-3 !w-3 !border-2 !border-[#16A34A] !bg-[#22C55E]"
          />
          <span className="absolute left-0 top-[calc(50%+12px)] -translate-x-full pr-1 text-[9px] font-bold text-[#16A34A]">
            {trueLabel}
          </span>
          <Handle
            type="source"
            position={Position.Right}
            id={falseLabel}
            className="!h-3 !w-3 !border-2 !border-[#DC2626] !bg-[#EF4444]"
          />
          <span className="absolute right-0 top-[calc(50%+12px)] translate-x-full pl-1 text-[9px] font-bold text-[#DC2626]">
            {falseLabel}
          </span>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border !border-[var(--border)] !bg-[var(--card)]" />
      )}
    </div>
  );
}

const NODE_TYPES = { flowNode: FlowNodeCard };

function ColumnDropdown({
  columns,
  value,
  onChange,
  label,
  placeholder,
}: {
  columns: string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-modern h-10 w-full px-3 text-sm"
      >
        <option value="">{placeholder || "Select column..."}</option>
        {columns.map((col) => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
    </label>
  );
}

function ColumnAutocompleteTextarea({
  columns,
  value,
  onChange,
  label,
  placeholder,
}: {
  columns: string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    const pos = e.target.selectionStart || 0;
    onChange(v);
    setCursorPos(pos);
    const before = v.slice(0, pos);
    setShowPopup(before.endsWith("{{"));
  }

  function insertColumn(col: string) {
    const before = value.slice(0, cursorPos);
    const after = value.slice(cursorPos);
    onChange(`${before}${col}}}${after}`);
    setShowPopup(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  return (
    <label className="relative block space-y-1">
      <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</span>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        className="input-modern min-h-[80px] w-full resize-y px-3 py-2 text-sm"
        placeholder={placeholder}
      />
      {showPopup && columns.length > 0 ? (
        <div className="absolute left-0 z-50 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg">
          {columns.map((col) => (
            <button
              key={col}
              type="button"
              onClick={() => insertColumn(col)}
              className="block w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              {"{{"}
              {col}
              {"}}"}
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

type SourceChoice = {
  kind: FlowNodeKind;
  title: string;
  description: string;
};

const sourceChoices: SourceChoice[] = [
  { kind: "source_manual_table", title: "Manual Table", description: "Build a contact table directly in the builder." },
  { kind: "source_csv", title: "Import CSV", description: "Upload and parse a CSV file as contacts." },
  { kind: "source_xlsx", title: "Import XLSX", description: "Upload Excel sheets and validate columns." },
  { kind: "source_url_json", title: "JSON URL Hook", description: "Load contact records from JSON endpoint URL." },
  { kind: "source_url_csv", title: "CSV URL Hook", description: "Load contact rows from CSV endpoint URL." },
  { kind: "source_google_contacts", title: "Google Contacts", description: "Sync contacts from Google account labels." },
  { kind: "source_numbers", title: "Paste Numbers", description: "Use manual phone list as a quick source." },
];

function toCsvText(headers: string[], rows: string[][]): string {
  const safeHeaders = headers.map((h) => h.trim()).filter(Boolean);
  const body = rows.map((row) => safeHeaders.map((_, i) => (row[i] || "").trim()).join(","));
  return [safeHeaders.join(","), ...body].join("\n");
}

export default function FlowBuilder() {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runState, setRunState] = useState<"idle" | "running" | "finished">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [selectedSourceKind, setSelectedSourceKind] = useState<FlowNodeKind | null>(null);
  const [needsTemplatePick, setNeedsTemplatePick] = useState(false);
  const [urlTestLoading, setUrlTestLoading] = useState(false);
  const [urlTestError, setUrlTestError] = useState<string | null>(null);
  const [urlPreviewHeaders, setUrlPreviewHeaders] = useState<string[]>([]);
  const [urlPreviewRows, setUrlPreviewRows] = useState<string[][]>([]);
  const [manualSourceLoading, setManualSourceLoading] = useState(false);
  const [manualSourceMessage, setManualSourceMessage] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<"light" | "dark">("light");
  const [fileUploadLoading, setFileUploadLoading] = useState(false);
  const [fileUploadError, setFileUploadError] = useState<string | null>(null);
  const [filePreviewHeaders, setFilePreviewHeaders] = useState<string[]>([]);
  const [filePreviewRows, setFilePreviewRows] = useState<string[][]>([]);

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setColorMode(root.classList.contains("dark") ? "dark" : "light");
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const hasSource = useMemo(() => nodes.some((n) => SOURCE_KINDS.includes(n.data.kind)), [nodes]);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const issues = useMemo(() => validateFlow(nodes as FlowNode[], edges), [nodes, edges]);
  const fatalIssues = issues.filter((i) => i.severity === "error");
  const contactEstimate = useMemo(() => simulateContactsCount(nodes as FlowNode[]), [nodes]);
  const reachableCount = useMemo(() => reachableNodeCount(nodes as FlowNode[], edges), [nodes, edges]);

  const sourceColumns = useMemo<string[]>(() => {
    const sourceNode = nodes.find((n) => SOURCE_KINDS.includes(n.data.kind));
    if (!sourceNode) return [];
    const kind = sourceNode.data.kind;

    if (sourceNode.data.columns && sourceNode.data.columns.length > 0) {
      return sourceNode.data.columns;
    }

    if (kind === "source_numbers") return ["phone"];
    if (kind === "source_google_contacts") return ["name", "phone", "email"];

    const sampleCsv = String(sourceNode.data.config.sample_csv || "");
    if (sampleCsv) {
      const parsed = parseCsv(sampleCsv);
      if (parsed.headers.length > 0) return parsed.headers;
    }
    const tableColumns = String(sourceNode.data.config.table_columns || "");
    if (tableColumns) {
      return tableColumns.split(",").map((c) => c.trim()).filter(Boolean);
    }
    const fileHeaders = String(sourceNode.data.config.file_headers || "");
    if (fileHeaders) {
      return fileHeaders.split(",").map((c) => c.trim()).filter(Boolean);
    }
    return [];
  }, [nodes]);

  useEffect(() => {
    if (sourceColumns.length === 0) return;
    const sourceNode = nodes.find((n) => SOURCE_KINDS.includes(n.data.kind));
    if (!sourceNode) return;
    const existing = sourceNode.data.columns;
    if (existing && existing.length === sourceColumns.length && existing.every((c, i) => c === sourceColumns[i])) return;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === sourceNode.id ? { ...n, data: { ...n.data, columns: sourceColumns } } : n,
      ),
    );
  }, [sourceColumns]);

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
    setSelectedSourceKind(kind);
    setNeedsTemplatePick(true);
  }

  function applyTemplate(tplId: string) {
    const tpl = FLOW_TEMPLATES.find((t) => t.id === tplId);
    if (!tpl) return;
    const clonedNodes = tpl.nodes.map((n) => ({ ...n, data: { ...n.data, config: { ...n.data.config } }, position: { ...n.position } }));
    const clonedEdges = tpl.edges.map((e) => ({ ...e }));
    const sourceNode = clonedNodes.find((n) => SOURCE_KINDS.includes(n.data.kind));
    if (sourceNode && selectedSourceKind) {
      sourceNode.data.kind = selectedSourceKind;
      sourceNode.data.config = defaultConfig(selectedSourceKind);
      const paletteItem = palette.find((p) => p.kind === selectedSourceKind);
      if (paletteItem) sourceNode.data.label = paletteItem.label;
    }
    setNodes(clonedNodes);
    setEdges(clonedEdges);
    setSelectedNodeId(clonedNodes[0]?.id || null);
    setNeedsTemplatePick(false);
  }

  function onConnect(params: Connection) {
    if (!params.source || !params.target) return;
    const source = nodes.find((n) => n.id === params.source);
    const target = nodes.find((n) => n.id === params.target);
    if (!source || !target) return;
    if (source.data.kind.startsWith("agent_") && target.data.kind.startsWith("source_")) return;
    const isLoopback = wouldCreateCycle(params.source, params.target, edges);

    const isBranching = source.data.kind === "condition" || source.data.kind === "validation";
    let sourceHandle = params.sourceHandle || undefined;

    if (isBranching && !sourceHandle) {
      const trueLabel = source.data.kind === "validation" ? "valid" : "true";
      const falseLabel = source.data.kind === "validation" ? "invalid" : "false";
      const existingHandles = new Set(
        edges.filter((e) => e.source === params.source).map((e) => e.sourceHandle).filter(Boolean),
      );
      sourceHandle = !existingHandles.has(trueLabel) ? trueLabel : !existingHandles.has(falseLabel) ? falseLabel : undefined;
    }

    let branchLabel: string | undefined;
    if (!isBranching) {
      const existingLabels = new Set(
        edges.filter((e) => e.source === params.source).map((e) => e.label).filter(Boolean),
      );
      if (source.data.kind === "dtmf_menu") {
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
          label: isBranching ? sourceHandle : (isLoopback ? "loopback" : branchLabel),
          labelStyle: isBranching
            ? { fill: sourceHandle === "true" || sourceHandle === "valid" ? "#16A34A" : "#DC2626", fontWeight: 700, fontSize: 11 }
            : undefined,
        } as FlowEdge | Connection,
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
      const foundSource = parsed.nodes.find((n) => SOURCE_KINDS.includes(n.data.kind));
      setSelectedSourceKind(foundSource?.data.kind || null);
      setNeedsTemplatePick(false);
    } catch {
      // ignore malformed local draft
    }
  }

  async function runSimulation() {
    setRunState("running");
    // Run validation checks (brief delay for visual feedback)
    await new Promise((r) => setTimeout(r, 200));
    // Force a re-render so issues/contactEstimate/reachableCount are fresh
    setRunState("finished");
  }

  function applyManualTable(headers: string[], rows: string[][]) {
    const safeHeaders = headers.map((h) => h.trim()).filter(Boolean);
    updateNodeConfig("table_columns", safeHeaders.join(","));
    updateNodeConfig("sample_csv", toCsvText(safeHeaders, rows));
    setManualSourceMessage(null);
  }

  function currentManualTableData(): { name: string; headers: string[]; rows: string[][] } | null {
    if (!selectedNode || selectedNode.data.kind !== "source_manual_table") return null;
    const parsed = parseCsv(String(selectedNode.data.config.sample_csv || ""));
    const headers =
      parsed.headers.length > 0
        ? parsed.headers
        : String(selectedNode.data.config.table_columns || "name,phone")
            .split(",")
            .map((h) => h.trim())
            .filter(Boolean);
    return {
      name: String(selectedNode.data.config.source_name || "Manual Table Source"),
      headers,
      rows: parsed.rows,
    };
  }

  async function saveManualTableSource() {
    const data = currentManualTableData();
    if (!data || data.headers.length === 0) {
      setManualSourceMessage("Add at least one column before saving.");
      return;
    }
    setManualSourceLoading(true);
    setManualSourceMessage(null);
    try {
      const sourceId = String(selectedNode?.data.config.manual_source_id || "");
      const payload = { name: data.name, headers: data.headers, rows: data.rows };
      const saved = sourceId
        ? await api.updateManualTableSource(sourceId, payload)
        : await api.createManualTableSource(payload);
      updateNodeConfig("manual_source_id", saved.id);
      updateNodeConfig("source_name", saved.name);
      setManualSourceMessage("Saved to server.");
    } catch (err) {
      setManualSourceMessage(err instanceof Error ? `Save failed: ${err.message}` : "Save failed.");
    } finally {
      setManualSourceLoading(false);
    }
  }

  async function loadManualTableSource() {
    if (!selectedNode || selectedNode.data.kind !== "source_manual_table") return;
    const sourceId = String(selectedNode.data.config.manual_source_id || "").trim();
    if (!sourceId) {
      setManualSourceMessage("manual_source_id is required to load.");
      return;
    }
    setManualSourceLoading(true);
    setManualSourceMessage(null);
    try {
      const source = await api.getManualTableSource(sourceId);
      applyManualTable(source.headers, source.rows);
      updateNodeConfig("source_name", source.name);
      setManualSourceMessage(`Loaded ${source.row_count} rows from server.`);
    } catch (err) {
      setManualSourceMessage(err instanceof Error ? `Load failed: ${err.message}` : "Load failed.");
    } finally {
      setManualSourceLoading(false);
    }
  }

  async function testUrlSource() {
    if (!selectedNode || (selectedNode.data.kind !== "source_url_json" && selectedNode.data.kind !== "source_url_csv")) return;
    const url = String(selectedNode.data.config.url || "").trim();
    if (!url) {
      setUrlTestError("URL is required.");
      return;
    }
    setUrlTestLoading(true);
    setUrlTestError(null);
    try {
      const preview = await api.previewFlowUrlSource({
        url,
        source_kind: selectedNode.data.kind,
        max_preview_rows: 6,
        max_rows: 2000,
      });
      setUrlPreviewHeaders(preview.headers);
      setUrlPreviewRows(preview.preview_rows);
      updateNodeConfig("mapping", preview.mapping);
      updateNodeConfig("estimated_rows", String(preview.total_rows));
      updateNodeConfig("sample_csv", preview.sample_csv);
    } catch (err) {
      setUrlTestError(err instanceof Error ? err.message : "URL preview failed.");
      setUrlPreviewHeaders([]);
      setUrlPreviewRows([]);
    } finally {
      setUrlTestLoading(false);
    }
  }

  async function handleFileUpload(file: File) {
    setFileUploadLoading(true);
    setFileUploadError(null);
    try {
      const result = await api.uploadSourceFile(file);
      setFilePreviewHeaders(result.headers);
      setFilePreviewRows(result.preview_rows);
      updateNodeConfig("file_id", result.file_id);
      updateNodeConfig("file_headers", result.headers.join(","));
      updateNodeConfig("total_rows", String(result.total_rows));
      updateNodeConfig("sample_csv", [result.headers.join(","), ...result.preview_rows.map((r) => r.join(","))].join("\n"));
    } catch (err) {
      setFileUploadError(err instanceof Error ? err.message : "Upload failed.");
      setFilePreviewHeaders([]);
      setFilePreviewRows([]);
    } finally {
      setFileUploadLoading(false);
    }
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
                onClick={() => applyTemplate(tpl.id)}
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
            {needsTemplatePick ? (
              <div className="mb-3 rounded-xl border border-[var(--accent)]/35 bg-[color-mix(in_srgb,var(--accent)_8%,var(--card))] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Choose a template to continue</p>
                  <button
                    type="button"
                    onClick={() => setNeedsTemplatePick(false)}
                    className="ml-auto rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--muted-foreground)]"
                  >
                    Start Blank
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {FLOW_TEMPLATES.map((tpl) => (
                    <button
                      key={`prompt-${tpl.id}`}
                      type="button"
                      onClick={() => applyTemplate(tpl.id)}
                      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-left hover:border-[var(--accent)]/35"
                    >
                      <p className="text-sm font-semibold text-[var(--foreground)]">{tpl.name}</p>
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{tpl.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
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
                  setSelectedSourceKind(null);
                  setNeedsTemplatePick(false);
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
                colorMode={colorMode}
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
                {selectedNode.data.kind === "condition" ? (
                  <>
                    <ColumnDropdown
                      columns={sourceColumns}
                      value={String(selectedNode.data.config.field || "")}
                      onChange={(v) => updateNodeConfig("field", v)}
                      label="Field"
                    />
                    <label className="block space-y-1">
                      <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Operator</span>
                      <select
                        value={String(selectedNode.data.config.operator || "")}
                        onChange={(e) => updateNodeConfig("operator", e.target.value)}
                        className="input-modern h-10 w-full px-3 text-sm"
                      >
                        <option value="">Select...</option>
                        {[">", "<", "==", "!=", ">=", "<=", "contains", "startsWith"].map((op) => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Value</span>
                      <input
                        value={String(selectedNode.data.config.value || "")}
                        onChange={(e) => updateNodeConfig("value", e.target.value)}
                        className="input-modern h-10 w-full px-3 text-sm"
                        placeholder="e.g. 30"
                      />
                    </label>
                  </>
                ) : selectedNode.data.kind === "validation" ? (
                  <>
                    <div className="space-y-1">
                      <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Required Columns</span>
                      {sourceColumns.length > 0 ? (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {sourceColumns.map((col) => {
                            const required = String(selectedNode.data.config.required_columns || "").split(",").map((c) => c.trim()).filter(Boolean);
                            const isChecked = required.includes(col);
                            return (
                              <label key={col} className="inline-flex items-center gap-1 text-sm text-[var(--foreground)]">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    const next = isChecked ? required.filter((c) => c !== col) : [...required, col];
                                    updateNodeConfig("required_columns", next.join(","));
                                  }}
                                  className="h-4 w-4 rounded border-[var(--border)]"
                                />
                                {col}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <input
                          value={String(selectedNode.data.config.required_columns || "")}
                          onChange={(e) => updateNodeConfig("required_columns", e.target.value)}
                          className="input-modern h-10 w-full px-3 text-sm"
                          placeholder="name,phone"
                        />
                      )}
                    </div>
                  </>
                ) : selectedNode.data.kind === "deduplicate" ? (
                  <>
                    <ColumnDropdown
                      columns={sourceColumns}
                      value={String(selectedNode.data.config.dedup_column || "")}
                      onChange={(v) => updateNodeConfig("dedup_column", v)}
                      label="Dedup Column"
                    />
                    <label className="block space-y-1">
                      <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Keep</span>
                      <select
                        value={String(selectedNode.data.config.keep || "first")}
                        onChange={(e) => updateNodeConfig("keep", e.target.value)}
                        className="input-modern h-10 w-full px-3 text-sm"
                      >
                        <option value="first">first</option>
                        <option value="last">last</option>
                      </select>
                    </label>
                  </>
                ) : selectedNode.data.kind === "normalize_phone" ? (
                  <>
                    <ColumnDropdown
                      columns={sourceColumns}
                      value={String(selectedNode.data.config.phone_column || "phone")}
                      onChange={(v) => updateNodeConfig("phone_column", v)}
                      label="Phone Column"
                    />
                    <label className="block space-y-1">
                      <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Country Code</span>
                      <input
                        value={String(selectedNode.data.config.country_code || "+977")}
                        onChange={(e) => updateNodeConfig("country_code", e.target.value)}
                        className="input-modern h-10 w-full px-3 text-sm"
                        placeholder="+977"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Format</span>
                      <select
                        value={String(selectedNode.data.config.format || "e164")}
                        onChange={(e) => updateNodeConfig("format", e.target.value)}
                        className="input-modern h-10 w-full px-3 text-sm"
                      >
                        <option value="e164">E.164</option>
                        <option value="national">National</option>
                        <option value="international">International</option>
                      </select>
                    </label>
                  </>
                ) : selectedNode.data.kind === "agent_sms" || selectedNode.data.kind === "agent_whatsapp" ? (
                  <>
                    <ColumnAutocompleteTextarea
                      columns={sourceColumns}
                      value={String(selectedNode.data.config.message || "")}
                      onChange={(v) => updateNodeConfig("message", v)}
                      label="Message"
                      placeholder="Namaste {{name}}, type {{ for column autocomplete"
                    />
                    {selectedNode.data.kind === "agent_whatsapp" ? (
                      <label className="block space-y-1">
                        <span className="font-mono-label text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Template Name</span>
                        <input
                          value={String(selectedNode.data.config.template_name || "")}
                          onChange={(e) => updateNodeConfig("template_name", e.target.value)}
                          className="input-modern h-10 w-full px-3 text-sm"
                          placeholder="Optional WhatsApp template"
                        />
                      </label>
                    ) : null}
                  </>
                ) : Object.entries(selectedNode.data.config).length === 0 ? (
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

              {selectedNode.data.kind === "source_manual_table" ? (
                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Manual Table Editor</p>
                  {(() => {
                    const parsed = parseCsv(String(selectedNode.data.config.sample_csv || ""));
                    const headers =
                      parsed.headers.length > 0
                        ? parsed.headers
                        : String(selectedNode.data.config.table_columns || "name,phone")
                            .split(",")
                            .map((h) => h.trim())
                            .filter(Boolean);
                    const rows = parsed.rows.length > 0 ? parsed.rows : [["", ""]];
                    return (
                      <div className="mt-2 space-y-2">
                        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                                {headers.map((h, idx) => (
                                  <th key={idx} className="px-2 py-2">
                                    <input
                                      value={h}
                                      onChange={(e) => {
                                        const nextHeaders = [...headers];
                                        nextHeaders[idx] = e.target.value;
                                        applyManualTable(nextHeaders, rows);
                                      }}
                                      className="input-modern h-8 w-32 px-2 text-xs"
                                    />
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, rIdx) => (
                                <tr key={rIdx} className="border-b border-[var(--border)] last:border-b-0">
                                  {headers.map((_, cIdx) => (
                                    <td key={cIdx} className="px-2 py-1.5">
                                      <input
                                        value={row[cIdx] || ""}
                                        onChange={(e) => {
                                          const nextRows = rows.map((r) => [...r]);
                                          if (!nextRows[rIdx]) nextRows[rIdx] = [];
                                          nextRows[rIdx][cIdx] = e.target.value;
                                          applyManualTable(headers, nextRows);
                                        }}
                                        className="input-modern h-8 w-32 px-2 text-xs"
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => applyManualTable([...headers, `col_${headers.length + 1}`], rows.map((r) => [...r, ""]))}
                            className="btn-outline-modern inline-flex h-9 items-center px-3 text-xs"
                          >
                            Add Column
                          </button>
                          <button
                            type="button"
                            onClick={() => applyManualTable(headers, [...rows, headers.map(() => "")])}
                            className="btn-outline-modern inline-flex h-9 items-center px-3 text-xs"
                          >
                            Add Row
                          </button>
                          <button
                            type="button"
                            onClick={saveManualTableSource}
                            disabled={manualSourceLoading}
                            className="btn-outline-modern inline-flex h-9 items-center px-3 text-xs disabled:opacity-60"
                          >
                            {manualSourceLoading ? "Saving..." : "Save Source"}
                          </button>
                          <button
                            type="button"
                            onClick={loadManualTableSource}
                            disabled={manualSourceLoading}
                            className="btn-outline-modern inline-flex h-9 items-center px-3 text-xs disabled:opacity-60"
                          >
                            {manualSourceLoading ? "Loading..." : "Load Source"}
                          </button>
                        </div>
                        {manualSourceMessage ? (
                          <p className="text-xs text-[var(--muted-foreground)]">{manualSourceMessage}</p>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              {selectedNode.data.kind === "source_url_json" || selectedNode.data.kind === "source_url_csv" ? (
                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--foreground)]">URL Source Tester</p>
                    <button
                      type="button"
                      onClick={testUrlSource}
                      disabled={urlTestLoading}
                      className="btn-outline-modern ml-auto inline-flex h-8 items-center px-3 text-xs disabled:opacity-60"
                    >
                      {urlTestLoading ? "Testing..." : "Fetch & Preview"}
                    </button>
                  </div>
                  {urlTestError ? <p className="mt-2 text-xs text-[#B91C1C]">{urlTestError}</p> : null}
                  {urlPreviewHeaders.length > 0 ? (
                    <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                            {urlPreviewHeaders.map((h) => (
                              <th key={h} className="px-2 py-1.5 text-left font-semibold text-[var(--foreground)]">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {urlPreviewRows.map((row, idx) => (
                            <tr key={idx} className="border-b border-[var(--border)] last:border-b-0">
                              {urlPreviewHeaders.map((_, cIdx) => (
                                <td key={cIdx} className="px-2 py-1.5 text-[var(--muted-foreground)]">
                                  {row[cIdx] || ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedNode.data.kind === "source_csv" || selectedNode.data.kind === "source_xlsx" ? (
                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3">
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {selectedNode.data.kind === "source_csv" ? "CSV" : "XLSX"} File Upload
                  </p>
                  <div
                    className="mt-2 flex min-h-[80px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted-foreground)] transition hover:border-[var(--accent)]/50"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = selectedNode.data.kind === "source_csv" ? ".csv" : ".xlsx";
                      input.onchange = () => {
                        const file = input.files?.[0];
                        if (file) handleFileUpload(file);
                      };
                      input.click();
                    }}
                  >
                    {fileUploadLoading ? (
                      <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</span>
                    ) : (
                      <span>Drop {selectedNode.data.kind === "source_csv" ? ".csv" : ".xlsx"} file here or click to browse</span>
                    )}
                  </div>
                  {fileUploadError ? <p className="mt-2 text-xs text-[#B91C1C]">{fileUploadError}</p> : null}
                  {selectedNode.data.config.total_rows ? (
                    <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                      {selectedNode.data.config.total_rows} rows, {filePreviewHeaders.length || String(selectedNode.data.config.file_headers || "").split(",").filter(Boolean).length} columns
                    </p>
                  ) : null}
                  {filePreviewHeaders.length > 0 ? (
                    <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                            {filePreviewHeaders.map((h) => (
                              <th key={h} className="px-2 py-1.5 text-left font-semibold text-[var(--foreground)]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filePreviewRows.map((row, idx) => (
                            <tr key={idx} className="border-b border-[var(--border)] last:border-b-0">
                              {filePreviewHeaders.map((_, cIdx) => (
                                <td key={cIdx} className="px-2 py-1.5 text-[var(--muted-foreground)]">{row[cIdx] || ""}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  const id = selectedNode.id;
                  setNodes((prev) => prev.filter((n) => n.id !== id));
                  setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
                  setSelectedNodeId(null);
                }}
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
              Channel nodes represent SMS/Voice delivery actions.
            </li>
          </ul>
          <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-2 text-sm">
            {runState === "idle" && "No run yet. Use Simulate Run to test graph readiness."}
            {runState === "running" && "Validating flow graph..."}
            {runState === "finished" && (
              fatalIssues.length > 0
                ? `Blocked: ${fatalIssues.length} error(s) found. Fix before publish.`
                : issues.length > 0
                  ? `Ready with ${issues.length} warning(s). ${contactEstimate} contacts, ${reachableCount} reachable nodes.`
                  : `Ready to publish. ${contactEstimate} contacts, ${reachableCount}/${nodes.length} nodes reachable.`
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
