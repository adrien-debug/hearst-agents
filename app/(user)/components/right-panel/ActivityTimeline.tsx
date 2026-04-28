"use client";

/**
 * ActivityTimeline — timeline verticale des events SSE.
 *
 * Filtre les types pertinents (asset_generated, step_started, run_*, etc.)
 * Cap visuel à 30 derniers (le store en garde 50). Bouton "Voir 50" qui
 * étend in-place.
 */

import { useState } from "react";
import { useRuntimeStore, type StreamEvent } from "@/stores/runtime";

const RELEVANT_TYPES = new Set([
  "asset_generated",
  "step_started",
  "step_completed",
  "tool_call_completed",
  "approval_requested",
  "approval_decided",
  "run_started",
  "run_completed",
  "run_failed",
  "clarification_requested",
]);

const TYPE_COLOR: Record<string, string> = {
  asset_generated:        "var(--cykan)",
  step_started:           "var(--text-faint)",
  step_completed:         "var(--color-success, #2DC558)",
  tool_call_completed:    "var(--text-muted)",
  approval_requested:     "var(--warn)",
  approval_decided:       "var(--color-success, #2DC558)",
  run_started:            "var(--cykan)",
  run_completed:          "var(--color-success, #2DC558)",
  run_failed:             "var(--danger)",
  clarification_requested:"var(--warn)",
};

function formatHHMM(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function eventLabel(event: StreamEvent): string {
  if (typeof event.title === "string") return event.title;
  if (typeof event.tool === "string") return event.tool;
  if (typeof event.name === "string") return event.name;
  if (typeof event.agent === "string") return event.agent;
  return event.type.replace(/_/g, " ");
}

export function ActivityTimeline() {
  const events = useRuntimeStore((s) => s.events);
  const [expanded, setExpanded] = useState(false);

  const filtered = events.filter((e) => RELEVANT_TYPES.has(e.type));

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-10 gap-4">
        <svg width="64" height="32" viewBox="0 0 64 32" aria-hidden style={{ opacity: 0.3 }}>
          <line x1="8"  y1="8"  x2="56" y2="8"  stroke="var(--text-faint)" strokeWidth="1" />
          <line x1="20" y1="16" x2="56" y2="16" stroke="var(--text-faint)" strokeWidth="1" />
          <line x1="14" y1="24" x2="50" y2="24" stroke="var(--text-faint)" strokeWidth="1" />
        </svg>
        <p className="t-11 text-[var(--text-faint)] text-center">
          Aucun événement récent.
          <br />
          Le panneau écoute.
        </p>
      </div>
    );
  }

  const cap = expanded ? 50 : 30;
  const visible = filtered.slice(0, cap);
  const hasMore = !expanded && filtered.length > cap;

  return (
    <div className="flex flex-col">
      {visible.map((event, idx) => {
        const color = TYPE_COLOR[event.type] || "var(--text-faint)";
        return (
          <div
            key={`${event.timestamp}-${idx}`}
            className="flex items-start gap-3 px-4 py-2 hover:bg-[var(--surface-1)] transition-colors"
          >
            <span className="t-9 font-mono text-[var(--text-faint)] shrink-0 w-10 mt-0.5 tabular-nums">
              {formatHHMM(event.timestamp)}
            </span>
            <span
              className="w-1.5 h-1.5 rounded-pill shrink-0 mt-1.5"
              style={{ background: color, boxShadow: `0 0 6px ${color}` }}
              aria-hidden
            />
            <span className="flex-1 min-w-0">
              <p className="t-11 text-[var(--text-soft)] truncate">{eventLabel(event)}</p>
              <p className="t-9 font-mono uppercase tracking-[0.16em] text-[var(--text-ghost)] mt-0.5">
                {event.type.replace(/_/g, " ")}
              </p>
            </span>
          </div>
        );
      })}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="halo-on-hover mx-4 my-3 t-9 font-mono uppercase tracking-[0.22em] py-2 border-t border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
        >
          Voir {filtered.length - 30} de plus →
        </button>
      )}
    </div>
  );
}
