"use client";

/**
 * Strip d'activité agents — header live au-dessus du chat central.
 *
 * Montre l'activité réelle des agents pendant l'exécution : le flow label
 * courant + les derniers tool calls comme chips. Caché en idle. Vit dans le
 * chat central (zone des interactions), pas dans le right panel — c'est là
 * que l'utilisateur regarde quand quelque chose se passe.
 */

import { useRuntimeStore } from "@/stores/runtime";
import { getToolCatalogEntry } from "./tool-catalog";

const ACTIVITY_TYPES = new Set([
  "tool_call_started",
  "tool_call_completed",
  "step_started",
]);

export function AgentActivityStrip() {
  const coreState = useRuntimeStore((s) => s.coreState);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);
  const events = useRuntimeStore((s) => s.events);

  const isIdle = coreState === "idle";
  if (isIdle) return null;

  const isAwaiting = coreState === "awaiting_approval" || coreState === "awaiting_clarification";
  const isError = coreState === "error";
  const isRunning = !isIdle && !isAwaiting && !isError;

  // Last 3 activity events, most recent first.
  const recentEvents = events
    .filter((e) => ACTIVITY_TYPES.has(e.type))
    .slice(0, 3);

  const accentColor = isAwaiting
    ? "var(--warn)"
    : isError
      ? "var(--danger)"
      : "var(--cykan)";

  const stateLabel = isAwaiting
    ? "Validation"
    : isError
      ? "Erreur"
      : flowLabel || "En cours";

  return (
    <div
      className="flex-shrink-0 border-b border-[var(--border-shell)] px-12 py-2.5 flex items-center gap-3"
      style={{ background: "var(--surface-1)" }}
      role="status"
      aria-live="polite"
    >
      {/* Pulse dot + flow label */}
      <span className="inline-flex items-center gap-2 shrink-0">
        <span
          className="w-1.5 h-1.5 rounded-pill"
          style={{
            background: accentColor,
            boxShadow: isRunning ? `0 0 6px ${accentColor}` : "none",
            animation: isRunning ? "pulse 1.4s ease-in-out infinite" : undefined,
          }}
        />
        <span
          className="t-9 font-mono tracking-section uppercase font-semibold"
          style={{ color: accentColor }}
        >
          {stateLabel}
        </span>
      </span>

      {/* Tool call chips — last 3 */}
      {recentEvents.length > 0 && (
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="t-9 font-mono text-[var(--text-ghost)] shrink-0">›</span>
          <div className="flex items-center gap-1.5 overflow-hidden">
            {recentEvents.map((event, i) => {
              const isToolCall =
                event.type === "tool_call_started" || event.type === "tool_call_completed";
              const isLatest = i === 0;
              const tool = (event.tool as string) ?? "";
              const entry = isToolCall ? getToolCatalogEntry(tool) : null;
              const label = entry
                ? `${entry.label}`
                : ((event.title as string) ?? (event.agent as string) ?? event.type);

              const isCompleted = event.type === "tool_call_completed";
              const isStep = event.type === "step_started";
              const chipBg = isCompleted
                ? "rgba(45, 197, 88, 0.10)"
                : isStep
                  ? "rgba(245, 158, 11, 0.10)"
                  : "var(--cykan-bg-active)";
              const chipColor = isCompleted
                ? "var(--color-success)"
                : isStep
                  ? "var(--warn)"
                  : "var(--cykan)";

              return (
                <span
                  key={`${event.type}-${event.timestamp}-${i}`}
                  className="t-9 font-mono tracking-wide uppercase px-2 py-0.5 rounded-sm shrink-0 truncate"
                  style={{
                    background: chipBg,
                    color: chipColor,
                    opacity: isLatest ? 1 : 0.65,
                    maxWidth: "180px",
                  }}
                  title={label}
                >
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Bouton Stop — uniquement pendant l'exécution active. En awaiting_*,
          l'utilisateur passe par les chips Confirmer/Annuler du chat. */}
      {isRunning && (
        <button
          type="button"
          onClick={() => useRuntimeStore.getState().stopRun()}
          className="halo-on-hover inline-flex items-center gap-1.5 t-9 font-mono uppercase tracking-section px-2 py-0.5 rounded-sm border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--danger)] hover:border-[var(--danger)]/40 transition-all shrink-0 ml-auto"
          title="Arrêter le run"
          aria-label="Arrêter le run en cours"
        >
          <span>Stop</span>
          <span aria-hidden>⏹</span>
        </button>
      )}
    </div>
  );
}
