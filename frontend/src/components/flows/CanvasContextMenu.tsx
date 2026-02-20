"use client";

import { useEffect, useRef } from "react";
import {
  Plus,
  Clipboard,
  MousePointer2,
  Maximize2,
  Grid3X3,
  Trash2,
  Copy,
  Unplug,
  Scissors,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ── Types ───────────────────────────────────────────────── */

export type ContextMenuTarget =
  | { type: "pane"; x: number; y: number }
  | { type: "node"; nodeId: string; x: number; y: number }
  | { type: "edge"; edgeId: string; x: number; y: number };

type CanvasContextMenuProps = {
  target: ContextMenuTarget;
  onClose: () => void;
  onAction: (action: string, payload?: unknown) => void;
};

/* ── Menu item definition ────────────────────────────────── */

type MenuItem = {
  action: string;
  label: string;
  icon: LucideIcon;
};

const PANE_ITEMS: MenuItem[] = [
  { action: "add-node", label: "Add Node", icon: Plus },
  { action: "paste", label: "Paste", icon: Clipboard },
  { action: "select-all", label: "Select All", icon: MousePointer2 },
  { action: "fit-view", label: "Fit View", icon: Maximize2 },
  { action: "toggle-grid", label: "Toggle Grid", icon: Grid3X3 },
];

const NODE_ITEMS: MenuItem[] = [
  { action: "delete-node", label: "Delete", icon: Trash2 },
  { action: "duplicate-node", label: "Duplicate", icon: Copy },
  { action: "disconnect-node", label: "Disconnect All", icon: Unplug },
  { action: "copy-node", label: "Copy", icon: Scissors },
];

const EDGE_ITEMS: MenuItem[] = [
  { action: "delete-edge", label: "Delete Edge", icon: Trash2 },
];

/* ── Component ───────────────────────────────────────────── */

export default function CanvasContextMenu({
  target,
  onClose,
  onAction,
}: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside to close
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const items =
    target.type === "pane"
      ? PANE_ITEMS
      : target.type === "node"
        ? NODE_ITEMS
        : EDGE_ITEMS;

  return (
    <div
      ref={ref}
      className="fixed z-50 w-52 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 shadow-xl"
      style={{ left: target.x, top: target.y }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            type="button"
            onClick={() => onAction(item.action)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-[var(--muted)]"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
            <span className="text-sm text-[var(--foreground)]">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
