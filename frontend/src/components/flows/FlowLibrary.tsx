"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Plus,
  Loader2,
  MoreVertical,
  Trash2,
  Pencil,
  Play,
  Clock,
  Workflow,
  MessageSquare,
  PhoneCall,
  MessageCircle,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FlowNode, FlowEdge, FlowNodeKind, ColumnDef } from "@/features/flows/builderTypes";

/* ── Template Definitions ──────────────────────────────── */

export type FlowTemplate = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
};

function tNode(id: string, kind: FlowNodeKind, label: string, x: number, y: number, config: Record<string, string> = {}, columns?: ColumnDef[]): FlowNode {
  return { id, type: "flowNode", position: { x, y }, data: { kind, label, config, columns } };
}

function tEdge(source: string, target: string, label?: string): FlowEdge {
  return { id: `e-${source}-${target}`, source, target, type: "deletable", ...(label ? { label } : {}) };
}

function tBranchEdge(source: string, target: string, sourceHandle: string, label?: string): FlowEdge {
  return {
    id: `e-${source}-${sourceHandle}-${target}`,
    source,
    target,
    sourceHandle,
    type: "deletable",
    ...(label ? { label } : {}),
  };
}

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "tpl-sms-reply-automation",
    name: "SMS Reply Automation",
    description: "Send SMS, wait for reply, branch by received/timeout, and write outcome columns.",
    icon: MessageSquare,
    color: "#0EA5E9",
    nodes: [
      tNode("t1", "trigger_manual", "Manual Trigger", 80, 260),
      tNode(
        "s1",
        "source_manual_table",
        "Contacts",
        300,
        260,
        {
          table_columns: "name,phone",
          sample_csv: "name,phone\nRam,+9779800000000\nSita,+9779811111111",
        },
        [{ name: "name", type: "text" }, { name: "phone", type: "phone" }],
      ),
      tNode("n1", "normalize_phone", "Normalize", 520, 260, { phone_column: "phone", country_code: "+977" }),
      tNode("a1", "agent_sms", "Send SMS", 740, 260, { message: "Hi {{name}}, please reply YES to confirm." }),
      tNode("r1", "response_capture", "Wait for Reply", 960, 260, {
        channel: "sms",
        wait_minutes: "15",
        output_column: "reply_text",
        status_column: "reply_status",
      }),
      tNode("e1", "enrich_columns", "Set Fields (Received)", 1180, 180, {
        columns: "followup_state = 'received'\nlast_reply = reply_text\nrow_no = row_number",
      }),
      tNode("a2", "agent_voice", "Voice Follow-up", 1400, 180, {
        script: "Namaste {{name}}, we received your reply: {{reply_text}}.",
        tts_provider: "edge_tts",
        tts_voice: "",
      }),
      tNode("e2", "enrich_columns", "Set Fields (Timeout)", 1180, 360, {
        columns: "followup_state = 'timeout'\nretry_needed = 'true'\nrow_no = row_number",
      }),
      tNode("a3", "agent_sms", "Timeout Reminder SMS", 1400, 360, { message: "Hi {{name}}, we did not get your reply yet. Please respond when free." }),
      tNode("ok", "end_success", "Done", 1620, 260),
    ],
    edges: [
      tEdge("t1", "s1"),
      tEdge("s1", "n1"),
      tEdge("n1", "a1"),
      tEdge("a1", "r1"),
      tBranchEdge("r1", "e1", "received", "received"),
      tEdge("e1", "a2"),
      tEdge("a2", "ok"),
      tBranchEdge("r1", "e2", "timeout", "timeout"),
      tEdge("e2", "a3"),
      tEdge("a3", "ok"),
    ],
  },
  {
    id: "tpl-conversational-voice",
    name: "Conversational Voice Agent",
    description: "Interactive two-way AI voice call with response capture columns.",
    icon: PhoneCall,
    color: "#14B8A6",
    nodes: [
      tNode("t1", "trigger_manual", "Manual Trigger", 80, 220),
      tNode("s1", "source_manual_table", "Contacts", 300, 220, { table_columns: "name,phone", sample_csv: "name,phone\nRam,+9779800000000" }, [{ name: "name", type: "text" }, { name: "phone", type: "phone" }]),
      tNode("n1", "normalize_phone", "Normalize", 520, 220, { phone_column: "phone", country_code: "+977" }),
      tNode("a1", "agent_voice_interactive", "Conversational Voice", 740, 220, {
        system_prompt: "You are calling {{name}} to discuss product interest and budget.",
        output_mode: "native_audio",
        max_duration_minutes: "10",
        capture_columns: "intent,budget,next_step",
      }),
      tNode("e1", "end_success", "Done", 980, 220),
    ],
    edges: [
      tEdge("t1", "s1"),
      tEdge("s1", "n1"),
      tEdge("n1", "a1"),
      tEdge("a1", "e1"),
    ],
  },
  {
    id: "tpl-sms-campaign",
    name: "Simple SMS Campaign",
    description: "Upload contacts, validate, normalize phones, and send SMS messages.",
    icon: MessageSquare,
    color: "#8B5CF6",
    nodes: [
      tNode("t1", "trigger_manual", "Manual Trigger", 80, 200),
      tNode("s1", "source_manual_table", "Contacts", 300, 200, { table_columns: "name,phone", sample_csv: "name,phone\nRam,+9779800000000" }, [{ name: "name", type: "text" }, { name: "phone", type: "phone" }]),
      tNode("v1", "validation", "Validate", 520, 200, { required_columns: "name,phone" }),
      tNode("n1", "normalize_phone", "Normalize", 740, 200, { phone_column: "phone", country_code: "+977" }),
      tNode("a1", "agent_sms", "Send SMS", 960, 200, { message: "Hi {{name}}, this is a message from Ring AI." }),
      tNode("e1", "end_success", "Done", 1180, 200),
    ],
    edges: [
      tEdge("t1", "s1"), tEdge("s1", "v1"), tEdge("v1", "n1"), tEdge("n1", "a1"), tEdge("a1", "e1"),
    ],
  },
  {
    id: "tpl-voice-outreach",
    name: "Voice Outreach",
    description: "Call contacts with a TTS script. Includes rate limiting and phone normalization.",
    icon: PhoneCall,
    color: "#3B82F6",
    nodes: [
      tNode("t1", "trigger_manual", "Manual Trigger", 80, 200),
      tNode("s1", "source_manual_table", "Contacts", 300, 200, { table_columns: "name,phone", sample_csv: "name,phone\nRam,+9779800000000" }, [{ name: "name", type: "text" }, { name: "phone", type: "phone" }]),
      tNode("n1", "normalize_phone", "Normalize", 520, 200, { phone_column: "phone", country_code: "+977" }),
      tNode("r1", "rate_limit", "Rate Limit", 740, 200, { per_minute: "10" }),
      tNode("a1", "agent_voice", "Voice Call", 960, 200, { script: "Namaste {{name}}, this is a call from Ring AI.", tts_provider: "edge_tts", tts_voice: "" }),
      tNode("e1", "end_success", "Done", 1180, 200),
    ],
    edges: [
      tEdge("t1", "s1"), tEdge("s1", "n1"), tEdge("n1", "r1"), tEdge("r1", "a1"), tEdge("a1", "e1"),
    ],
  },
  {
    id: "tpl-sms-voice-followup",
    name: "SMS + Voice Follow-up",
    description: "Send SMS first, then follow up with a voice call after a wait period.",
    icon: Zap,
    color: "#F59E0B",
    nodes: [
      tNode("t1", "trigger_manual", "Manual Trigger", 80, 250),
      tNode("s1", "source_manual_table", "Contacts", 300, 250, { table_columns: "name,phone", sample_csv: "name,phone\nRam,+9779800000000" }, [{ name: "name", type: "text" }, { name: "phone", type: "phone" }]),
      tNode("n1", "normalize_phone", "Normalize", 520, 250, { phone_column: "phone", country_code: "+977" }),
      tNode("a1", "agent_sms", "Send SMS", 740, 250, { message: "Hi {{name}}, you have an upcoming appointment." }),
      tNode("w1", "wait", "Wait 30m", 960, 250, { duration_minutes: "30" }),
      tNode("a2", "agent_voice", "Voice Follow-up", 1180, 250, { script: "Namaste {{name}}, we sent you an SMS about your appointment.", tts_provider: "edge_tts", tts_voice: "" }),
      tNode("e1", "end_success", "Done", 1400, 250),
    ],
    edges: [
      tEdge("t1", "s1"), tEdge("s1", "n1"), tEdge("n1", "a1"), tEdge("a1", "w1"), tEdge("w1", "a2"), tEdge("a2", "e1"),
    ],
  },
  {
    id: "tpl-whatsapp-broadcast",
    name: "WhatsApp Broadcast",
    description: "Deduplicate contacts and send WhatsApp messages with rate limiting.",
    icon: MessageCircle,
    color: "#22C55E",
    nodes: [
      tNode("t1", "trigger_manual", "Manual Trigger", 80, 200),
      tNode("s1", "source_manual_table", "Contacts", 300, 200, { table_columns: "name,phone", sample_csv: "name,phone\nRam,+9779800000000" }, [{ name: "name", type: "text" }, { name: "phone", type: "phone" }]),
      tNode("d1", "deduplicate", "Deduplicate", 520, 200, { dedup_column: "phone", keep: "first" }),
      tNode("r1", "rate_limit", "Rate Limit", 740, 200, { per_minute: "20" }),
      tNode("a1", "agent_whatsapp", "Send WhatsApp", 960, 200, { message: "Hi {{name}}, thank you for being a customer!", template_name: "" }),
      tNode("e1", "end_success", "Done", 1180, 200),
    ],
    edges: [
      tEdge("t1", "s1"), tEdge("s1", "d1"), tEdge("d1", "r1"), tEdge("r1", "a1"), tEdge("a1", "e1"),
    ],
  },
];

/* ── Flow Library Component ──────────────────────────────── */

type FlowSummary = {
  id: string;
  name: string;
  status: string;
  updated_at: string;
};

export default function FlowLibrary({
  onNewFlow,
  onOpenFlow,
  onNewFromTemplate,
}: {
  onNewFlow: () => void;
  onOpenFlow: (flowId: string) => void;
  onNewFromTemplate?: (template: FlowTemplate) => void;
}) {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadFlows();
  }, []);

  async function loadFlows() {
    setLoading(true);
    try {
      const data = await api.listFlowDefinitions();
      setFlows(data);
    } catch {
      // API may not be reachable
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(flowId: string) {
    setDeleting(flowId);
    try {
      await api.deleteFlowDefinition(flowId);
      setFlows((prev) => prev.filter((f) => f.id !== flowId));
    } catch {
      // ignore
    } finally {
      setDeleting(null);
      setMenuOpen(null);
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--foreground)]">
            Flow Builder
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Create and manage automated contact workflows
          </p>
        </div>
        <button
          onClick={onNewFlow}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          New Flow
        </button>
      </div>

      {/* Templates */}
      {onNewFromTemplate && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
            Start from a template
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {FLOW_TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <button
                  key={tpl.id}
                  onClick={() => onNewFromTemplate(tpl)}
                  className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-[var(--accent)]/40 hover:shadow-sm"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${tpl.color}15` }}
                  >
                    <Icon className="h-4 w-4" color={tpl.color} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {tpl.name}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)] line-clamp-2">
                      {tpl.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Flow List */}
      {loading ? (
        <div className="flex items-center gap-2 py-20 justify-center text-sm text-[var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading flows...
        </div>
      ) : flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 rounded-full bg-[var(--muted)] p-4">
            <Workflow className="h-8 w-8 text-[var(--muted-foreground)]" />
          </div>
          <h2 className="text-base font-medium text-[var(--foreground)]">
            No flows yet
          </h2>
          <p className="mt-1 max-w-sm text-sm text-[var(--muted-foreground)]">
            Create your first flow or start from a template above.
          </p>
          <button
            onClick={onNewFlow}
            className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Create First Flow
          </button>
        </div>
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
            Your flows
          </h2>
          <div className="grid gap-3">
            {flows.map((flow) => (
              <div
                key={flow.id}
                className="group relative flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)]/40 hover:shadow-sm cursor-pointer"
                onClick={() => onOpenFlow(flow.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10">
                    <Workflow className="h-4 w-4 text-[var(--accent)]" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--foreground)]">
                      {flow.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          flow.status === "active"
                            ? "bg-green-500/10 text-green-500"
                            : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                        }`}
                      >
                        {flow.status === "active" ? (
                          <Play className="h-2.5 w-2.5" />
                        ) : (
                          <Pencil className="h-2.5 w-2.5" />
                        )}
                        {flow.status}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                        <Clock className="h-3 w-3" />
                        {timeAgo(flow.updated_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(menuOpen === flow.id ? null : flow.id);
                    }}
                    className="rounded-lg p-1.5 text-[var(--muted-foreground)] opacity-0 transition hover:bg-[var(--muted)] group-hover:opacity-100"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  {menuOpen === flow.id && (
                    <div className="absolute right-0 top-8 z-50 w-36 rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-xl">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenFlow(flow.id);
                          setMenuOpen(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(flow.id);
                        }}
                        disabled={deleting === flow.id}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-500 hover:bg-[var(--muted)]"
                      >
                        {deleting === flow.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
