import type { StreamEvent } from "@/stores/runtime";
import { getToolCatalogEntry, type ToolKind } from "./tool-catalog";

export interface ToolCallEntry {
  stepId: string;
  tool: string;
  status: "running" | "completed";
  startedAt: number;
  kind: ToolKind;
  /** Provider attribué au tool (ex: "gmail", "slack", "fal_ai"). */
  providerId?: string;
  /** Label lisible du provider (ex: "Gmail"). */
  providerLabel?: string;
  /** Latence wall-clock en ms si disponible (event tool_call_completed). */
  latencyMs?: number;
  /** Coût attribué au tool call en USD si disponible. */
  costUSD?: number;
}

/** Selects only the completed write actions — used by the action-receipt UI. */
export function selectCompletedWrites(
  events: StreamEvent[],
  runId: string | null,
): ToolCallEntry[] {
  return reduceToolEvents(events, runId).filter(
    (e) => e.kind === "write" && e.status === "completed",
  );
}

/**
 * Build the live tool-call list shown above the chat shimmer.
 *
 * `events` is newest-first (the runtime store prepends). We walk oldest-first
 * to preserve start order and dedupe by step_id, so each tool appears once
 * with its latest status (running → completed).
 */
export function reduceToolEvents(
  events: StreamEvent[],
  runId: string | null,
): ToolCallEntry[] {
  if (!runId) return [];
  const byStepId = new Map<string, ToolCallEntry>();

  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.run_id !== runId) continue;

    if (ev.type === "tool_call_started") {
      const stepId = ev.step_id as string;
      const tool = ev.tool as string;
      if (!stepId || !tool) continue;
      if (!byStepId.has(stepId)) {
        byStepId.set(stepId, {
          stepId,
          tool,
          status: "running",
          startedAt: ev.timestamp,
          kind: getToolCatalogEntry(tool).kind,
          providerId: ev.providerId as string | undefined,
          providerLabel: ev.providerLabel as string | undefined,
        });
      }
      continue;
    }

    if (ev.type === "tool_call_completed") {
      const stepId = ev.step_id as string;
      const existing = byStepId.get(stepId);
      if (existing) {
        existing.status = "completed";
        // L'event de complétion porte la provider-info enrichie (latence,
        // coût, providerId si l'orchestrator l'a posé en retard). On
        // n'écrase qu'avec des valeurs définies pour préserver le started.
        if (ev.providerId) existing.providerId = ev.providerId as string;
        if (ev.providerLabel) existing.providerLabel = ev.providerLabel as string;
        if (ev.latencyMs != null) existing.latencyMs = ev.latencyMs as number;
        if (ev.costUSD != null) existing.costUSD = ev.costUSD as number;
      }
    }
  }

  return Array.from(byStepId.values());
}
