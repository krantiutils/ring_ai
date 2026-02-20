import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CopyX,
  FileSpreadsheet,
  GitBranch,
  GitMerge,
  MessageCircle,
  MessageSquare,
  PhoneCall,
  PhoneForwarded,
  PlayCircle,
  Smartphone,
  Table2,
  TimerReset,
  Upload,
  UsersRound,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import type { FlowNodeKind } from "./builderTypes";

/* ── Categories ─────────────────────────────────────────── */

export type NodeCategory = "processing" | "actions" | "control" | "end";

export const CATEGORY_META: Record<NodeCategory, { label: string }> = {
  processing: { label: "Processing" },
  actions: { label: "Actions" },
  control: { label: "Control" },
  end: { label: "End" },
};

/* ── Palette (12 nodes, down from 31) ───────────────────── */

export type PaletteNode = {
  kind: FlowNodeKind;
  label: string;
  description: string;
  category: NodeCategory;
};

export const PALETTE_NODES: PaletteNode[] = [
  { kind: "validation", label: "Validation", description: "Schema + row checks", category: "processing" },
  { kind: "deduplicate", label: "Deduplicate", description: "Remove duplicates", category: "processing" },
  { kind: "normalize_phone", label: "Normalize Phone", description: "Standardize format", category: "processing" },
  { kind: "condition", label: "Condition", description: "If/else routing", category: "processing" },
  { kind: "agent_sms", label: "SMS Agent", description: "Send SMS message", category: "actions" },
  { kind: "agent_voice", label: "Voice Agent", description: "Place voice call", category: "actions" },
  { kind: "agent_whatsapp", label: "WhatsApp Agent", description: "Send WhatsApp", category: "actions" },
  { kind: "wait", label: "Wait", description: "Delay execution", category: "control" },
  { kind: "rate_limit", label: "Rate Limit", description: "Throttle throughput", category: "control" },
  { kind: "merge", label: "Merge", description: "Combine branches", category: "control" },
  { kind: "end_success", label: "Success", description: "Flow completed", category: "end" },
  { kind: "end_failure", label: "Failure", description: "Flow failed", category: "end" },
];

/* ── Icons ──────────────────────────────────────────────── */

export const NODE_ICON: Record<string, LucideIcon> = {
  trigger_manual: PlayCircle,
  trigger_schedule: CalendarClock,
  trigger_event: Zap,
  source_manual_table: Table2,
  source_csv: FileSpreadsheet,
  source_xlsx: FileSpreadsheet,
  source_url_json: Upload,
  source_url_csv: Upload,
  source_numbers: UsersRound,
  source_google_contacts: UsersRound,
  source_file: Upload,
  validation: CheckCircle2,
  deduplicate: CopyX,
  normalize_phone: PhoneForwarded,
  condition: GitBranch,
  agent_sms: MessageSquare,
  agent_voice: PhoneCall,
  agent_whatsapp: MessageCircle,
  wait: Clock3,
  rate_limit: TimerReset,
  merge: GitMerge,
  end_success: CheckCircle2,
  end_failure: XCircle,
  enrich_columns: Workflow,
  sender_number: Smartphone,
  error_handler: AlertTriangle,
  loop: Workflow,
  business_hours: CalendarClock,
  survey_ai: MessageSquare,
  dtmf_menu: GitBranch,
  response_capture: MessageSquare,
  action_webhook: Workflow,
};

/* ── Colors ─────────────────────────────────────────────── */

const CATEGORY_COLORS: Record<string, string> = {
  trigger: "#3B82F6",
  source: "#22C55E",
  processing: "#F59E0B",
  actions: "#8B5CF6",
  control: "#6B7280",
  condition: "#F97316",
  end_success: "#22C55E",
  end_failure: "#EF4444",
};

export function getNodeColor(kind: FlowNodeKind): string {
  if (kind.startsWith("trigger_")) return CATEGORY_COLORS.trigger;
  if (kind.startsWith("source_")) return CATEGORY_COLORS.source;
  if (kind === "condition") return CATEGORY_COLORS.condition;
  if (kind === "end_success") return CATEGORY_COLORS.end_success;
  if (kind === "end_failure") return CATEGORY_COLORS.end_failure;
  const found = PALETTE_NODES.find((n) => n.kind === kind);
  if (found) return CATEGORY_COLORS[found.category] ?? CATEGORY_COLORS.processing;
  return CATEGORY_COLORS.processing;
}

export function getCategoryForKind(kind: FlowNodeKind): string {
  if (kind.startsWith("trigger_")) return "Trigger";
  if (kind.startsWith("source_")) return "Source";
  if (kind === "end_success" || kind === "end_failure") return "End";
  const found = PALETTE_NODES.find((n) => n.kind === kind);
  return found ? CATEGORY_META[found.category].label : "Other";
}

/* ── Source choices (for wizard) ─────────────────────────── */

export type SourceChoice = {
  kind: FlowNodeKind;
  title: string;
  description: string;
};

export const SOURCE_CHOICES: SourceChoice[] = [
  { kind: "source_manual_table", title: "Manual Table", description: "Build a contact table directly in the builder." },
  { kind: "source_csv", title: "Import CSV", description: "Upload and parse a CSV file as contacts." },
  { kind: "source_xlsx", title: "Import XLSX", description: "Upload Excel sheets and validate columns." },
  { kind: "source_url_json", title: "JSON URL Hook", description: "Load contact records from JSON endpoint URL." },
  { kind: "source_url_csv", title: "CSV URL Hook", description: "Load contact rows from CSV endpoint URL." },
  { kind: "source_google_contacts", title: "Google Contacts", description: "Sync contacts from Google account labels." },
  { kind: "source_numbers", title: "Paste Numbers", description: "Use manual phone list as a quick source." },
];
