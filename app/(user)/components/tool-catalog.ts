/**
 * Tool catalog — UI metadata for tools that the agent invokes at runtime.
 *
 * Lives outside `ChatToolStream` so the same labels can be reused by other
 * UI surfaces (action receipts, tool-surface chips, run history). Keep this
 * file as the single source of truth for tool icon + FR label + read/write
 * classification.
 */

export type ToolKind = "read" | "write";

export interface ToolCatalogEntry {
  icon: string;
  label: string;
  kind: ToolKind;
  /** Verb shown while the call is still running. */
  runningVerb: string;
  /** Past-tense verb shown once completed. */
  completedVerb: string;
}

const CATALOG: Record<string, ToolCatalogEntry> = {
  // ── Read ops (background data fetching) ────────────────────
  "google.calendar.list_today_events": {
    icon: "📅",
    label: "Calendrier",
    kind: "read",
    runningVerb: "lecture en cours…",
    completedVerb: "ok",
  },
  "google.gmail.list_recent_messages": {
    icon: "📧",
    label: "Gmail",
    kind: "read",
    runningVerb: "lecture en cours…",
    completedVerb: "ok",
  },
  "google.drive.list_recent_files": {
    icon: "📁",
    label: "Drive",
    kind: "read",
    runningVerb: "lecture en cours…",
    completedVerb: "ok",
  },

  // ── Write ops (visible state changes — billed/sent on user behalf) ──
  gmail_send_email: {
    icon: "✉️",
    label: "Envoi d'email",
    kind: "write",
    runningVerb: "envoi…",
    completedVerb: "envoyé",
  },
};

export function getToolCatalogEntry(tool: string): ToolCatalogEntry {
  if (CATALOG[tool]) return CATALOG[tool];

  // Fallback: assume unknown tools are read ops, derive a label from the slug.
  const tail = tool.split(".").pop() ?? tool;
  const isWriteHint = /(send|create|update|delete|post|reply|forward)/i.test(tool);
  return {
    icon: isWriteHint ? "⚡" : "🔧",
    label: tail.replace(/_/g, " "),
    kind: isWriteHint ? "write" : "read",
    runningVerb: isWriteHint ? "exécution…" : "lecture en cours…",
    completedVerb: isWriteHint ? "terminé" : "ok",
  };
}
