"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import {
  X, CheckCircle, XCircle, AlertTriangle, Loader2, FlaskConical,
  ChevronDown, ChevronRight, MessageSquare, PhoneCall, MessageCircle,
} from "lucide-react";

type StepResult = {
  id: string;
  node_id: string;
  node_kind: string;
  status: string;
  input_row_count: number;
  output_row_count: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type RunData = {
  id: string;
  status: string;
  mode: string;
  started_at: string | null;
  completed_at: string | null;
  current_node_id: string | null;
  error: string | null;
  contact_count: number;
  steps: StepResult[];
};

type RunResultsPanelProps = {
  run: RunData;
  onClose: () => void;
  nodeLabels: Record<string, string>;
  className?: string;
};

function extractFailureDetails(
  error: string | null,
  metadata: Record<string, unknown> | null,
): string[] {
  const details: string[] = [];
  if (error) details.push(error);
  if (!metadata) return details;

  const knownKeys = [
    "reason",
    "failure_reason",
    "message",
    "error",
    "error_message",
    "exception",
    "provider_error",
    "http_status",
    "status_code",
    "code",
  ] as const;

  for (const key of knownKeys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) details.push(`${key}: ${value}`);
    if (typeof value === "number" || typeof value === "boolean") details.push(`${key}: ${String(value)}`);
  }

  if (details.length === 0) {
    const compact = Object.entries(metadata)
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${String(v)}`);
    details.push(...compact);
  }

  return [...new Set(details)];
}

/** Credit cost estimates per action type */
const CREDIT_RATES: Record<string, { label: string; rate: number }> = {
  agent_sms: { label: "SMS", rate: 0.5 },
  agent_voice: { label: "Voice Call", rate: 2.0 },
  agent_voice_interactive: { label: "Interactive Voice", rate: 5.0 },
  agent_whatsapp: { label: "WhatsApp", rate: 0.5 },
};

const ACTION_ICONS: Record<string, LucideIcon> = {
  agent_sms: MessageSquare,
  agent_voice: PhoneCall,
  agent_voice_interactive: PhoneCall,
  agent_whatsapp: MessageCircle,
};

export default function RunResultsPanel({ run, onClose, nodeLabels, className }: RunResultsPanelProps) {
  const isRunning = run.status === "running" || run.status === "pending";
  const isDryRun = run.mode === "dry_run";

  const actionSteps = run.steps.filter((s) =>
    ["agent_sms", "agent_voice", "agent_voice_interactive", "agent_whatsapp"].includes(s.node_kind),
  );
  const totalDispatched = actionSteps.reduce((sum, s) => sum + s.output_row_count, 0);
  const failedSteps = run.steps.filter((s) => s.status === "failed");

  // Breakdown by action type
  const actionBreakdown = actionSteps.reduce<Record<string, number>>((acc, s) => {
    acc[s.node_kind] = (acc[s.node_kind] ?? 0) + s.output_row_count;
    return acc;
  }, {});

  // Estimated credit cost
  const estimatedCredits = Object.entries(actionBreakdown).reduce((sum, [kind, count]) => {
    return sum + count * (CREDIT_RATES[kind]?.rate ?? 0);
  }, 0);
  const smsCount = actionBreakdown.agent_sms ?? 0;
  const whatsappCount = actionBreakdown.agent_whatsapp ?? 0;
  const voiceCount = actionBreakdown.agent_voice ?? 0;
  const interactiveVoiceCount = actionBreakdown.agent_voice_interactive ?? 0;

  const smsCredits = smsCount * (CREDIT_RATES.agent_sms?.rate ?? 0);
  const whatsappCredits = whatsappCount * (CREDIT_RATES.agent_whatsapp?.rate ?? 0);
  const voiceCredits = voiceCount * (CREDIT_RATES.agent_voice?.rate ?? 0);
  const interactiveVoiceCredits = interactiveVoiceCount * (CREDIT_RATES.agent_voice_interactive?.rate ?? 0);

  // Processing step counts
  const processingSteps = run.steps.filter(
    (s) => !["agent_sms", "agent_voice", "agent_voice_interactive", "agent_whatsapp"].includes(s.node_kind),
  );
  const filteredOut = processingSteps.reduce((sum, s) => {
    const diff = s.input_row_count - s.output_row_count;
    return sum + (diff > 0 ? diff : 0);
  }, 0);

  return (
    <div className={`flex flex-col bg-[var(--card)] ${className ?? "h-full w-80 border-l border-[var(--border)]"}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          {isDryRun && <FlaskConical className="h-4 w-4 text-[var(--accent)]" />}
          <h3 className="text-sm font-semibold text-[var(--foreground)]">
            {isDryRun ? "Test Run Results" : "Run Results"}
          </h3>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-[var(--muted)]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Summary */}
      <div className="border-b border-[var(--border)] px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
          ) : run.status === "completed" ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="text-sm font-medium text-[var(--foreground)] capitalize">{run.status}</span>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          {run.contact_count} contacts &middot; {run.steps.length} steps
          {filteredOut > 0 && ` · ${filteredOut} filtered out`}
        </p>
        {failedSteps.length > 0 && (
          <p className="text-xs text-red-500">{failedSteps.length} step(s) failed</p>
        )}
        {run.error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 px-2 py-1.5 text-xs text-red-600">
            <p className="font-semibold">Run failed:</p>
            <p>{run.error}</p>
          </div>
        )}
      </div>

      {/* Action Breakdown */}
      {Object.keys(actionBreakdown).length > 0 && (
        <div className="border-b border-[var(--border)] px-4 py-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            {isDryRun ? "Actions (would execute)" : "Actions Executed"}
          </p>
          {Object.entries(actionBreakdown).map(([kind, count]) => {
            const Icon = ACTION_ICONS[kind] ?? MessageSquare;
            const meta = CREDIT_RATES[kind];
            return (
              <div key={kind} className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                <span className="flex-1 text-xs text-[var(--foreground)]">{meta?.label ?? kind}</span>
                <span className="text-xs font-medium text-[var(--foreground)]">{count}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
            <span className="text-xs text-[var(--muted-foreground)]">Total</span>
            <span className="ml-auto text-xs font-semibold text-[var(--foreground)]">{totalDispatched}</span>
          </div>
        </div>
      )}

      {/* Delivery + Cost Summary */}
      {Object.keys(actionBreakdown).length > 0 && (
        <div className="border-b border-[var(--border)] px-4 py-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
            {isDryRun ? "Projected Delivery + Cost" : "Delivery + Cost"}
          </p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between text-[var(--foreground)]">
              <span>SMS</span>
              <span>{smsCount} &middot; {smsCredits.toFixed(1)} credits</span>
            </div>
            <div className="flex items-center justify-between text-[var(--foreground)]">
              <span>Voice Calls</span>
              <span>{voiceCount} &middot; {voiceCredits.toFixed(1)} credits</span>
            </div>
            <div className="flex items-center justify-between text-[var(--foreground)]">
              <span>Interactive Voice</span>
              <span>{interactiveVoiceCount} &middot; {interactiveVoiceCredits.toFixed(1)} credits</span>
            </div>
            <div className="flex items-center justify-between text-[var(--foreground)]">
              <span>WhatsApp</span>
              <span>{whatsappCount} &middot; {whatsappCredits.toFixed(1)} credits</span>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-xs font-semibold text-[var(--foreground)]">
            <span>Total estimated</span>
            <span>{estimatedCredits.toFixed(1)} credits</span>
          </div>
        </div>
      )}

      {/* Step-by-step accordion */}
      <div className="flex-1 overflow-auto">
        {run.steps.map((step) => (
          <StepAccordion
            key={step.id}
            step={step}
            label={nodeLabels[step.node_id] || step.node_kind}
            isDryRun={isDryRun}
          />
        ))}
        {isRunning && run.steps.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-6 text-xs text-[var(--muted-foreground)]">
            <Loader2 className="h-3 w-3 animate-spin" /> Waiting for results...
          </div>
        )}
      </div>
    </div>
  );
}

function StepAccordion({
  step,
  label,
  isDryRun,
}: {
  step: StepResult;
  label: string;
  isDryRun: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const sampleMessages = (step.metadata as Record<string, unknown> | null)?.sample_messages as
    | string[]
    | undefined;
  const captureColumns = (step.metadata as Record<string, unknown> | null)?.capture_columns as
    | string[]
    | undefined;
  const sampleCapturedFields = (step.metadata as Record<string, unknown> | null)?.sample_captured_fields as
    | Array<Record<string, string>>
    | undefined;
  const newFields = (step.metadata as Record<string, unknown> | null)?.new_fields as
    | string[]
    | undefined;
  const sampleNewFields = (step.metadata as Record<string, unknown> | null)?.sample_new_fields as
    | Array<Record<string, unknown>>
    | undefined;
  const dispatchStatusCounts = (step.metadata as Record<string, unknown> | null)?.dispatch_status_counts as
    | Record<string, number>
    | undefined;
  const sampleDispatchErrors = (step.metadata as Record<string, unknown> | null)?.sample_dispatch_errors as
    | string[]
    | undefined;
  const failureDetails = React.useMemo(
    () => extractFailureDetails(step.error, step.metadata),
    [step.error, step.metadata],
  );

  return (
    <div className="border-b border-[var(--border)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-[var(--muted)]"
      >
        {step.status === "completed" ? (
          <CheckCircle className="h-3 w-3 shrink-0 text-green-500" />
        ) : step.status === "failed" ? (
          <XCircle className="h-3 w-3 shrink-0 text-red-500" />
        ) : step.status === "running" ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--accent)]" />
        ) : (
          <AlertTriangle className="h-3 w-3 shrink-0 text-yellow-500" />
        )}
        <span className="flex-1 truncate text-xs font-medium text-[var(--foreground)]">{label}</span>
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {step.input_row_count} &rarr; {step.output_row_count}
        </span>
        {step.status === "failed" && (
          <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">Failed</span>
        )}
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
        )}
      </button>
      {open && (
        <div className="space-y-1 px-4 pb-2 text-xs text-[var(--muted-foreground)]">
          <p>Status: {step.status}</p>
          <p>
            Input: {step.input_row_count} rows &middot; Output: {step.output_row_count} rows
          </p>
          {failureDetails.length > 0 && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-red-600">
              <p className="font-semibold">Why it failed</p>
              {failureDetails.map((detail, idx) => (
                <p key={`${detail}-${idx}`}>{detail}</p>
              ))}
            </div>
          )}
          {isDryRun && sampleMessages && sampleMessages.length > 0 && (
            <div className="mt-1">
              <p className="font-medium text-[var(--foreground)]">Sample messages:</p>
              {sampleMessages.map((msg, i) => (
                <div key={i} className="mt-0.5 rounded bg-[var(--muted)] p-1.5 text-[11px]">
                  {msg}
                </div>
              ))}
            </div>
          )}
          {captureColumns && captureColumns.length > 0 && (
            <div className="mt-1">
              <p className="font-medium text-[var(--foreground)]">Capture columns:</p>
              <p>{captureColumns.join(", ")}</p>
            </div>
          )}
          {newFields && newFields.length > 0 && (
            <div className="mt-1">
              <p className="font-medium text-[var(--foreground)]">New/updated fields:</p>
              <p>{newFields.join(", ")}</p>
            </div>
          )}
          {dispatchStatusCounts && Object.keys(dispatchStatusCounts).length > 0 && (
            <div className="mt-1">
              <p className="font-medium text-[var(--foreground)]">Delivery outcome:</p>
              <p>
                {Object.entries(dispatchStatusCounts)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" | ")}
              </p>
            </div>
          )}
          {sampleDispatchErrors && sampleDispatchErrors.length > 0 && (
            <div className="mt-1">
              <p className="font-medium text-[var(--foreground)]">Provider errors:</p>
              {sampleDispatchErrors.map((err, i) => (
                <div key={i} className="mt-0.5 rounded bg-[var(--muted)] p-1.5 text-[11px] text-red-600">
                  {err}
                </div>
              ))}
            </div>
          )}
          {sampleCapturedFields && sampleCapturedFields.length > 0 && (
            <div className="mt-1">
              <p className="font-medium text-[var(--foreground)]">Captured samples:</p>
              {sampleCapturedFields.map((row, i) => (
                <div key={i} className="mt-0.5 rounded bg-[var(--muted)] p-1.5 text-[11px]">
                  {Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                </div>
              ))}
            </div>
          )}
          {sampleNewFields && sampleNewFields.length > 0 && (
            <div className="mt-1">
              <p className="font-medium text-[var(--foreground)]">Sample field values:</p>
              {sampleNewFields.map((row, i) => (
                <div key={i} className="mt-0.5 rounded bg-[var(--muted)] p-1.5 text-[11px]">
                  {Object.entries(row).map(([k, v]) => `${k}: ${String(v)}`).join(" | ")}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
