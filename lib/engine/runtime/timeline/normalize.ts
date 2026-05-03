/**
 * Timeline Normalizer — converts raw run events into readable timeline items.
 *
 * Filters noise (text_delta, cost_updated) and produces a human-scannable
 * execution story from SSE events.
 */

import type { TimelineItem, TimelineItemType, TimelineSeverity } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawEvent = Record<string, any>;

let counter = 0;
function nextId(): string {
  return `tl-${++counter}-${Date.now()}`;
}

function toTs(raw?: string | number): number {
  if (!raw) return Date.now();
  if (typeof raw === "number") return raw;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

interface Mapping {
  type: TimelineItemType;
  severity: TimelineSeverity;
  title: (e: RawEvent) => string;
  description?: (e: RawEvent) => string | undefined;
  extract?: (e: RawEvent) => Partial<TimelineItem>;
}

const MAPPINGS: Record<string, Mapping> = {
  run_started: {
    type: "run_started",
    severity: "info",
    title: () => "Run started",
  },
  run_created: {
    type: "run_started",
    severity: "info",
    title: () => "Run created",
  },
  execution_mode_selected: {
    type: "execution_mode",
    severity: "info",
    title: (e) => `Mode: ${e.mode ?? "unknown"}`,
    description: (e) => (e.reason as string) || undefined,
    extract: (e) => ({ backend: e.backend as string }),
  },
  agent_selected: {
    type: "agent_selected",
    severity: "info",
    title: (e) => `Agent: ${e.agent_name ?? e.agent_id ?? "unknown"}`,
    description: (e) => (e.backend_reason as string) || undefined,
    extract: (e) => ({
      agentId: (e.agent_id ?? e.agent_name) as string,
      backend: e.backend as string,
    }),
  },
  capability_blocked: {
    type: "capability_blocked",
    severity: "warning",
    title: (e) => {
      const providers = (e.requiredProviders as string[]) ?? [];
      return `Blocked — ${providers.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" / ")} required`;
    },
    description: (e) => (e.message as string) || undefined,
    extract: (e) => ({
      provider: ((e.requiredProviders as string[]) ?? [])[0],
    }),
  },
  step_started: {
    type: "step_started",
    severity: "info",
    title: (e) => (e.title as string) || `Step started`,
    extract: (e) => ({ agentId: e.agent as string }),
  },
  step_completed: {
    type: "step_completed",
    severity: "success",
    title: () => `Step completed`,
    extract: (e) => ({ agentId: e.agent as string }),
  },
  step_failed: {
    type: "step_failed",
    severity: "error",
    title: () => "Step failed",
    description: (e) => (e.error as string) || undefined,
  },
  asset_generated: {
    type: "asset_generated",
    severity: "success",
    title: (e) => `Asset: ${(e.name as string) || "untitled"}`,
    extract: (e) => ({
      assetId: e.asset_id as string,
      assetName: e.name as string,
    }),
  },
  run_completed: {
    type: "run_completed",
    severity: "success",
    title: () => "Run completed",
  },
  run_failed: {
    type: "run_failed",
    severity: "error",
    title: () => "Run failed",
    description: (e) => (e.error as string) || undefined,
  },
  orchestrator_log: {
    type: "log",
    severity: "info",
    title: (e) => (e.message as string) || "Log",
  },
  plan_attached: {
    type: "log",
    severity: "info",
    title: (e) => `Plan created (${e.step_count ?? "?"} steps)`,
  },
  tool_call_started: {
    type: "step_started",
    severity: "info",
    title: (e) => `Tool: ${(e.tool as string) || "unknown"}`,
  },
  tool_call_completed: {
    type: "step_completed",
    severity: "success",
    title: (e) => `Tool done: ${(e.tool as string) || "unknown"}`,
  },
  app_connect_required: {
    type: "log",
    severity: "info",
    title: (e) => `Connect required: ${(e.app as string) || "unknown app"}`,
    description: (e) => (e.reason as string) || undefined,
  },
  mission_run_request: {
    type: "log",
    severity: "info",
    title: (e) => `Mission proposée : ${(e.mission_name as string) || "?"}`,
    description: (e) =>
      e.schedule_label
        ? `${e.schedule_label as string} (match ${e.match_kind as string})`
        : `match ${(e.match_kind as string) || "unknown"}`,
  },
  delegate_enqueued: {
    type: "step_started",
    severity: "info",
    title: (e) => `Delegated to ${(e.agent as string) || "agent"}`,
    extract: (e) => ({ agentId: e.agent as string }),
  },
  delegate_completed: {
    type: "step_completed",
    severity: "success",
    title: () => "Delegate completed",
  },
};

const SKIP_TYPES = new Set([
  "text_delta",
  "cost_updated",
  "tool_surface",
  "retrieval_mode_inferred",
  "runtime_warning",
]);

export function normalizeRunEventsToTimeline(input: {
  runId: string;
  events: RawEvent[];
}): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const event of input.events) {
    if (SKIP_TYPES.has(event.type)) continue;

    const mapping = MAPPINGS[event.type];
    if (!mapping) continue;

    const extra = mapping.extract?.(event) ?? {};

    items.push({
      id: nextId(),
      type: mapping.type,
      ts: toTs(event.timestamp),
      title: mapping.title(event),
      description: mapping.description?.(event),
      severity: mapping.severity,
      runId: input.runId,
      ...extra,
    });
  }

  items.sort((a, b) => a.ts - b.ts);
  return items;
}
