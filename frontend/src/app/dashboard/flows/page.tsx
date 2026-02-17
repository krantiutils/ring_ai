"use client";

import FlowBuilder from "@/components/flows/FlowBuilder";

export default function FlowsPage() {
  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="label-badge">
          <span className="pulse-dot" />
          Flow Builder
        </div>
        <h1 className="font-display mt-4 text-4xl leading-tight text-[var(--foreground)]">Agent Workflow Studio</h1>
        <p className="mt-2 max-w-4xl text-[var(--muted-foreground)]">
          Build n8n-style multi-channel flows for CSV/XLSX imports, validation, conditional routing, time windows, and
          voice/SMS actions. Use templates to launch faster and validate before publish.
        </p>
      </header>

      <FlowBuilder />
    </section>
  );
}
