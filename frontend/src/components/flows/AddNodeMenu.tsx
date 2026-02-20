"use client";

import { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import type { FlowNodeKind } from "@/features/flows/builderTypes";
import {
  PALETTE_NODES,
  CATEGORY_META,
  NODE_ICON,
  type NodeCategory,
} from "@/features/flows/nodeRegistry";

type AddNodeMenuProps = {
  onAdd: (kind: FlowNodeKind) => void;
};

export default function AddNodeMenu({ onAdd }: AddNodeMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const groups = (Object.keys(CATEGORY_META) as NodeCategory[]).map((cat) => ({
    category: cat,
    label: CATEGORY_META[cat].label,
    nodes: PALETTE_NODES.filter((n) => n.category === cat),
  }));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--foreground)] transition hover:bg-[var(--muted)]"
        title="Add node"
      >
        <Plus className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute left-12 top-0 z-50 w-60 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-xl">
          <p className="px-2 pb-1 text-xs font-bold text-[var(--muted-foreground)]">Add Node</p>
          {groups.map((g) => (
            <div key={g.category}>
              <p className="mt-2 px-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                {g.label}
              </p>
              {g.nodes.map((n) => {
                const Icon = NODE_ICON[n.kind];
                return (
                  <button
                    key={n.kind}
                    type="button"
                    onClick={() => {
                      onAdd(n.kind);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-[var(--muted)]"
                  >
                    {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />}
                    <span className="text-sm text-[var(--foreground)]">{n.label}</span>
                    <span className="ml-auto text-[10px] text-[var(--muted-foreground)]">{n.description}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
