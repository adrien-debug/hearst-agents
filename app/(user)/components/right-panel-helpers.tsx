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

// Glyph SVG par type d'asset — remplace les unicodes par des pictos cohérents
// avec le langage visuel du panel. Stroke 1.5, currentColor, viewBox 24.
export function AssetGlyphSVG({ type }: { type: string }) {
  const t = type.toLowerCase();

  if (t === "brief") {
    // Document plié en haut à droite
    return (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
    );
  }

  if (t === "report") {
    // Tableau / lignes structurées
    return (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="9" y1="4" x2="9" y2="20" />
      </svg>
    );
  }

  if (t === "synthesis") {
    // Lignes inégales — synthèse / résumé
    return (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="11" x2="14" y2="11" />
        <line x1="4" y1="16" x2="18" y2="16" />
        <line x1="4" y1="20" x2="11" y2="20" />
      </svg>
    );
  }

  if (t === "plan") {
    // Nœuds reliés — plan / roadmap
    return (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="12" cy="18" r="2.5" />
        <line x1="8.5" y1="6" x2="15.5" y2="6" />
        <line x1="7" y1="8" x2="11" y2="15.5" />
        <line x1="17" y1="8" x2="13" y2="15.5" />
      </svg>
    );
  }

  if (t === "message") {
    // Enveloppe
    return (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="13" rx="1" />
        <polyline points="3 7 12 13 21 7" />
      </svg>
    );
  }

  if (t === "document" || t === "doc") {
    // Doc générique
    return (
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="3" width="14" height="18" rx="1" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="9" y1="12" x2="15" y2="12" />
        <line x1="9" y1="16" x2="13" y2="16" />
      </svg>
    );
  }

  // Fallback — point central
  return (
    <svg className="w-full h-full" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
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
