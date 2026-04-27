import type { StreamEvent } from "@/stores/runtime";
import { getToolCatalogEntry } from "./tool-catalog";

export function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return "—";
  const diff = Date.now() - timestamp;
  if (diff < 0) return "à venir";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `il y a ${weeks}sem`;
  const months = Math.floor(days / 30);
  return `il y a ${months}mo`;
}

export const ACTIVITY_EVENT_TYPES = new Set([
  "tool_call_started",
  "tool_call_completed",
  "step_started",
  "step_completed",
  "orchestrator_log",
]);

export function activityIcon(type: string): string {
  if (type === "tool_call_started") return "⚡";
  if (type === "tool_call_completed") return "✓";
  if (type === "step_started") return "▶";
  if (type === "step_completed") return "□";
  return "·";
}

export function activityLabel(event: StreamEvent): string {
  if (event.type === "tool_call_started" || event.type === "tool_call_completed") {
    const tool = (event.tool as string) ?? "";
    const entry = getToolCatalogEntry(tool);
    const verb = event.type === "tool_call_started" ? entry.runningVerb : entry.completedVerb;
    return `${entry.icon} ${entry.label} — ${verb}`;
  }
  if (event.type === "step_started" || event.type === "step_completed") {
    return (event.title as string) ?? (event.agent as string) ?? event.type;
  }
  if (event.type === "orchestrator_log") {
    const msg = (event.message as string) ?? "";
    return msg.length > 60 ? msg.slice(0, 57) + "…" : msg;
  }
  return event.type;
}

const ASSET_TYPE_GLYPH: Record<string, string> = {
  report: "▦",
  brief: "≡",
  message: "✉",
  document: "▤",
  synthesis: "◇",
  plan: "◈",
};

export function assetGlyph(type: string): string {
  return ASSET_TYPE_GLYPH[type.toLowerCase()] || "·";
}

// Empty-state inline placeholder — keeps the section structurally present
// even when its data slot is empty.
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="t-11 font-mono tracking-[0.2em] text-[var(--text-ghost)] uppercase">
      {children}
    </p>
  );
}
